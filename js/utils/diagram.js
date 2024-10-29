
class Diagram {
    static worker = null;
    static callbacks = {};

    static async node_diagram(file,id,height="200px",selection={}, cache_only=false){
        await Diagram._initialize();
        if (localStorage.getItem("diagram_" + file)){
            let raw_data = JSON.parse(localStorage.getItem("diagram_" + file));
            Diagram._execute_draw(file,id,height,selection, raw_data);
            //if (cache_only){return raw_data.all_links;}
        }
        let raw_data = await Diagram._sendMessage({action: "node-diagram", file});
        Diagram._execute_draw(file,id,height,selection,raw_data);
        localStorage.setItem("diagram_" + file,JSON.stringify(raw_data));
        return raw_data.all_links;
    }

    static _execute_draw(file,id,height,selection,raw_data){
        let nodes = Object.values(raw_data.nodes).filter(x => x.id != '');
        let edges = Object.values(raw_data.edges);
        let roots = raw_data.roots;
        if (Object.keys(selection).length != 0){
            nodes = nodes.filter(x => selection[x.type]);
        }
        if (roots.length != 0){
            let eligible_nodes = [];
            edges.filter(x => roots.includes(x.from) || roots.includes(x.to)).forEach(x => {
                eligible_nodes.push(x.from);
                eligible_nodes.push(x.to);
            });
            nodes = nodes.filter(x => eligible_nodes.includes(x.id));
        }

        let type = Modeler.determine_type(file);
        if (["readme","command"].includes(type)){
            // Filter out behaviors
            nodes = nodes.filter(x => x.type != "behavior");
        } else if (
            nodes.filter(x => x.type == "aggregate").length != 0 &&
            nodes.filter(x => x.type == "behavior").length != 0){
            // Filter out aggregate
            nodes = nodes.filter(x => x.type != "aggregate");
        }

        var data = {
          nodes: new vis.DataSet(nodes),
          edges: new vis.DataSet(edges)
        };
        var container = document.getElementById(id);
        let directed_diagram = nodes.length < 20;
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

    static async _initialize(){
        await Draftsman.waitFor(() => sessionStorage.project_url);
        if (!Diagram.worker) {
          Diagram.worker = new Worker('/js/webworkers/modelVisualizerWorker.js');
          Diagram.worker.onmessage = (event) => {
            Diagram.callbacks[event.data.request_id](event);
            delete Diagram.callbacks[event.data.request_id];
          };
        }
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