
class Diagram {
    static worker = null;
    static callbacks = {};
    static prepared = false;

    static generate_key(file,radius) {
       const jsonString = JSON.stringify({file,radius});
       return btoa(jsonString);
   }

    static async node_diagram(file,id,height="200px",selection={}, mode="aggregate",radius=1){
        let key = Diagram.generate_key(file,radius);

        while(!Diagram.prepared){
            await Draftsman.sleep(10);
        }
        if (Array.isArray(file)){
            file = [...file];
        } else {
            file = [file];
        }
        let raw_data = await Diagram._sendMessage({action: "node-diagram", file, radius});
        let nodes = Object.values(raw_data.nodes);
        session.commands = nodes.filter(x => x.type == "command").length;
        session.behaviors = nodes.filter(x => x.type == mode).length;
        session.notifiers = nodes.filter(x => x.type == "notifier").length;
        session.views = nodes.filter(x => x.type == "view").length;
        session.queries = nodes.filter(x => x.type == "query").length;
        session.projections = nodes.filter(x => x.type == "projection").length;
        session.dependencies = nodes.filter(x => x.type == "dependency").length;
        Diagram._execute_draw(file,id,height,selection,raw_data,mode);
        return raw_data.all_links;
    }

    static _execute_draw(file,id,height,selection,raw_data,mode){
        let nodes = Object.values(raw_data.nodes).filter(x => x.id != '');
        let edges = Object.values(raw_data.edges);
        if (Object.keys(selection).length != 0){
            nodes = nodes.filter(x => selection[x.type]);
        }

        if (mode == "aggregate"){
            nodes = nodes.filter(x => x.type != "behavior");
        } else if (nodes.filter(x => x.type == "behavior").length != 0){
            nodes = nodes.filter(x => x.type != "aggregate");
        }

        var data = {
          nodes: new vis.DataSet(nodes),
          edges: new vis.DataSet(edges)
        };
        var container = document.getElementById(id);
        let directed_diagram = nodes.length < 11;
        var options = {
            width: "100%",
            height: height,
            layout: {
                improvedLayout: nodes.length < 50,
                hierarchical : {
                    enabled: directed_diagram,
                    direction: "LR",
                    parentCentralization: true,
                    sortMethod: "directed",
                }
            }
        };
        let network = new vis.Network(container, data, options);
        session.selected_node = "";
        network.on("click", function (params) {
            session.selected_node = params.nodes.at(0);
        });
    }

    static async initialize(){
        await Draftsman.waitFor(() => sessionStorage.project_url);
        if (!Diagram.worker) {
          Diagram.worker = new Worker('/js/webworkers/modelVisualizerWorker.js');
          Diagram.worker.onmessage = (event) => {
            try {
                Diagram.callbacks[event.data.request_id](event);
                delete Diagram.callbacks[event.data.request_id];
            } catch {
            }
          };
        }
    }

    static async prepare_data(){
        await Diagram.initialize();
        await Diagram._sendMessage({action: "initialize"});
        Diagram.prepared = true;
    }
    
    static _sendMessage(message) {
        message.request_id = Draftsman.uuidv4();
        message.repoUrl = sessionStorage.project_url;
        return new Promise((resolve, reject) => {
          Diagram.callbacks[message.request_id] = function(event){
            if (event.data && event.data.result) {
              resolve(event.data.result);
            } else if (event.data.error) {
              reject(new Error(event.data.error));
            }
          };
          Diagram.worker.postMessage(message);
        });
      }
}