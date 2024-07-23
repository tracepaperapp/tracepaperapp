
const colors = {
    "command": "#7BE141",
    "aggregate": "#FB7E81",
    "behavior": "#fca4a6",
    "notifier": "#FFA807",
    "view": "#6E6EFD",
    "query": "#7BE141",
    "projection": "#7BE141",
    "dependency": "#D3D3D3",
    "schedule": "#FFA807"
};

const shapes = {
    "command": "dot",
    "aggregate": "diamond",
    "behavior": "triangle",
    "notifier": "box",
    "view": "triangleDown",
    "query": "square",
    "projection": "box",
    "dependency": "box",
    "schedule": "dot"
};

const domain_colors = [
  "#634C8E",
  "#B1A2D7",
  "#7DA7C4",
  "#A6D9B3",
  "#F18F6D",
  "#E3B78C",
  "#FFD9C4",
  "#5C917A",
  "#8B6699",
  "#FFF17A",
  "#6FCAC4",
  "#B6B6B6"
];
var subdomains = [];
var translations = {};

window.Diagram = {
    nodes: {},
    edges: {},
    draw: async function(file,id,height="300px",selection={}){
        Diagram.nodes = {};
        Diagram.edges = {};
        session.diagram_img = "";
        await Diagram.prepare_translations(file);
        await Diagram.prepare_diagram_data(file);
        let roots = [];
        if (file == "Expressions"){
            let files = await FileSystem.listFiles();
            roots = files.filter(x => x.startsWith("expressions/"));
        } else if (file == "Patterns"){
            let files = await FileSystem.listFiles();
            roots = files.filter(x => x.startsWith("patterns/"));
        } else if (file && file != "README.md"){
            let file_select = file.split(";");
            let files = await FileSystem.listFiles();
            for (let i = 0; i < file_select.length; i++){
                if (file_select[i].endsWith("root.xml")){
                    roots = roots.concat(files.filter(x => x.startsWith(file_select[i].replace("/root.xml","")) && x.endsWith(".xml")));
                } else if (file_select[i].endsWith(".xml") || file_select[i].endsWith(".py")){
                    roots.push(file_select[i]);
                } else {
                    roots = roots.concat(files.filter(x => x.startsWith(file_select[i]) && x.endsWith(".xml")));
                }
            }
            roots = [...new Set(roots)];
        }
        roots = await Promise.all(roots.map(async x => await Diagram.get_name(x)));
        Diagram.execute_draw(id,height,selection,roots);
    },
    get_name: async function(file){
        let model = await Modeler.get(file,true);
        let type = Modeler.determine_type(file);
        if (type == "command"){
            return model.att_name.replace("Requested","");
        } else if (type == "event") {
            return model.att_source;
        } else if (type == "view") {
            return model.att_name;
        } else if (type == "behavior"){
            let path = file.split("/");
            return path[1] + "." + path[2] + "." + model.att_name;
        } else if (type == "notifier"){
            return model.att_name;
        } else if (type == "projection"){
            return model.att_name;
        } else if (type == "pattern"){
            return model.att_name + " (pattern)";
        } else if (type == "expression"){
            return model.att_name + " (expression)";
        } else if (type == "code"){
            return file.split("/").at(1).split(".").at(0) + " (Python)";
        } else {
            return "unknown";
        }
    },
    prepare_translations: async function(file){
        translations = {FileUploaded: ["UploadFile"]};
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.endsWith(".xml"));
        let aggregate = file.split(";").at(0);
        aggregate = !(aggregate.startsWith("domain/") && aggregate.split("/").filter(x => x != '').length > 2);
        for (let i = 0; i < files.length; i++){
            let source = files[i];
            let type = Modeler.determine_type(source);
            if (type == "behavior" && !aggregate){
                let model = await Modeler.get(source,true);
                let path = source.split("/");
                let root = path[1] + "." + path[2];
                let name = root + "." + model.att_name;
                 model.processor.filter(x => x.att_type == 'emit-event').forEach(x => {
                    let event = x.att_ref;
                    Diagram.register_translation(event,name);
                    Diagram.register_translation(root,name);
                });
            } else if (type == "event" && aggregate){
                let model = await Modeler.get(source,true);
                Diagram.register_translation(model.att_name,model.att_source);
                let path = source.split("/");
                let root = path[1] + "." + path[2];
                Diagram.register_translation(root,root);
            }
        }
    },
    prepare_diagram_data: async function(file){
        let files = await FileSystem.listFiles();
        let code = files.filter(x => x.endsWith(".py"));
        for (let i = 0; i < code.length; i++){
            let name = code[i].split("/").at(-1).replace(".py"," (Python)")
            Diagram.add_node(name,"dependency");
            session.all_links[name] = code[i];
        }
        files = files.filter(x => x.endsWith(".xml"));
        let aggregate = file.split(";").at(0);
        aggregate = !(aggregate.startsWith("domain/") && aggregate.split("/").filter(x => x != '').length > 2);
        for (let i = 0; i < files.length; i++){
            let source = files[i];
            try{
            let model = await Modeler.get(source,true);
            let type = Modeler.determine_type(source);
            if (type == "command"){
                let name = model.att_name.replace("Requested","");
                Diagram.register_translation(model.att_name,name);
                Diagram.add_node(name,"command");
                session.all_links[name] = source;
                if (model.att_role && model.att_role.startsWith("#global")){
                    Diagram.add_edge(name,model.att_role.split(".").at(1).split("(").at(0) + " (expression)","",true);
                }
                var patterns = model.field.map(x => x.att_pattern);
                for (var j = 0; j < model[NESTED].length; j++){
                    patterns = patterns.concat(model[NESTED][j].field.map(x => x.att_pattern));
                }
                patterns.forEach(x => {
                    if(!x){return;};
                    var pattern = x.replace("{{","").replace("}}"," (pattern)");
                    Diagram.add_edge(name,pattern,"",true);
                });
            } else if (type == "event" && aggregate){
               Diagram.add_node(model.att_source,"aggregate");
               session.all_links[model.att_source] = source.split("/events/").at(0);
            } else if (type == "view"){
               Diagram.add_node(model.att_name,"view");
               session.all_links[model.att_name] = source;
               model.query.forEach(query => {
                    let name = query["att_graphql-namespace"] + "." + query["att_field-name"];
                    Diagram.add_node(name,"query");
                    session.all_links[name] = source;
                    Diagram.add_edge(name,model.att_name,"",true)
                    if (query.att_role && query.att_role.startsWith("#global")){
                        Diagram.add_edge(name,query.att_role.split(".").at(1).split("(").at(0) + " (expression)","",true);
                    }
               });
               model[SNAPSHOT_HANDLER].forEach(handler => {
                    let name = handler["att_sub-domain"] + "." + handler.att_aggregate;
                    translations[name].forEach(source => {
                        Diagram.add_edge(source,model.att_name);
                    });

               });
               model[CUSTOM_HANDLER].forEach(handler => {
                   let name = handler["att_sub-domain"] + "." + handler.att_aggregate;
                   translations[name].forEach(source => {
                       Diagram.add_edge(source,model.att_name);
                   });
                   if (handler.att_file){
                        let src = handler.att_file.split("/").at(-1).split(".").at(0) + " (Python)";
                        Diagram.add_edge(model.att_name,src,"",true);
                   }
              });
              model.field.filter(x => !view_field_types.includes(x.att_type)).forEach(ref => {
                   Diagram.add_edge(model.att_name,ref.att_ref,ref.att_type,[5,7]);
              });
            } else if (type == "behavior") {
                let name = "";
                let path = source.split("/");
                if (!aggregate){
                    name = path[1] + "." + path[2] + "." + model.att_name;
                    Diagram.add_node(name,"behavior");
                    session.all_links[name] = source;
                } else {
                    name = path[1] + "." + path[2];
                }
                model.trigger.forEach(trigger => {
                    translations[trigger.att_source].forEach(source => {
                        Diagram.add_edge(source,name);
                    });
                    if (trigger["att_key-field"] && trigger["att_key-field"].startsWith("#global")){
                        Diagram.add_edge(name,trigger["att_key-field"].split(".").at(1).split("(").at(0) + " (expression)","",true);
                    }
                });
                model.processor.filter(x => x.att_type == "code").forEach(processor => {
                    if (processor.att_file){
                        let src = processor.att_file.split("/").at(-1).split(".").at(0) + " (Python)";
                        Diagram.add_edge(name,src,"",true);
                   }
                });
            } else if (type == "notifier"){
                model.trigger.forEach(trigger => {
                    Diagram.add_node(model.att_name,"notifier");
                    session.all_links[model.att_name] = source;
                    if (trigger.att_source.startsWith("@")){
                        Diagram.add_node(trigger.att_source,"schedule");
                        Diagram.add_edge(trigger.att_source,model.att_name);
                    } else {
                        translations[trigger.att_source].forEach(source => {
                            Diagram.add_edge(source,model.att_name);
                        });
                    }
                });
                model.activity.filter(x => x.att_type == 'code').forEach(activity => {
                    if (activity["att_python-file"]){
                        let src = activity["att_python-file"].split("/").at(-1).split(".").at(0) + " (Python)";
                        Diagram.add_edge(model.att_name,src,"",true);
                   }
                });
            } else if (type == "projection"){
                Diagram.add_node(model.att_name,"projection");
                session.all_links[model.att_name] = source;
                if (model.att_return){
                    Diagram.add_edge(model.att_name,model.att_return,"return object",[5,7]);
                }
                if (model.att_role && model.att_role.startsWith("#global")){
                    Diagram.add_edge(model.att_name,model.att_role.split(".").at(1).split("(").at(0) + " (expression)","",true);
                }
                let s = model.att_code.replaceAll('"',"'");
                let re = /Query\(\'([A-Z]{1}[a-z]+)+\'\)/g;
                let m;
                do {
                    m = re.exec(s);
                    if (m) {
                        Diagram.add_edge(m[1],model.att_name,"source",[5,7]);
                    }
                } while (m);
                let name = model["att_graphql-namespace"] + "." + model["att_field-name"];
                Diagram.add_node(name,"query");
                Diagram.add_edge(name,model.att_name,"",true)
            } else if (type == "pattern"){
                Diagram.add_node(model.att_name + " (pattern)","dependency");
                session.all_links[model.att_name] = source;
            } else if (type == "expression"){
                Diagram.add_node(model.att_name + " (expression)","dependency");
                session.all_links[model.att_name] = source;
            }

        } catch(err){
            console.log("Could not load diagram data for:",source,err);
        }
        }
    },
    add_node: function(name,type,alpha=1){
        let size =  ["aggregate","projection"].includes(type) ? 15 : 10;
        let node_color;
        if (type == "aggregate" || type == "behavior"){
            let sub = name.split(".").at(0);
            if (!subdomains.includes(sub)){
                subdomains.push(sub);
            }
            node_color = Diagram.hexToRgb(domain_colors[subdomains.indexOf(sub)],alpha);
        } else{
            node_color = Diagram.hexToRgb(colors[type],alpha);
        }
        let font_color = localStorage.theme == 'dark' && shapes[type] != "box"? '#ffffff' : "#343434";
        Diagram.nodes[name] = {
           "id": name,
           "label": name,
           "size": size,
           "shape": shapes[type],
           "color": node_color,
           "type": type,
           "font": {
            "color": font_color
           }
       }
    },
    add_edge: function(from,to,label="",dashes=false){
        var key = from + to;
        Diagram.edges[key] = {
            "from": from,
            "to": to,
            "label": label,
            "dashes" : dashes,
            "font": {
                "size" : 10
            }
        };
        if (dashes == true){
            Diagram.edges[key]["color"] = {"inherit":"to"};
        } else {
            Diagram.edges[key]["arrows"] = "to";
        }
    },
    hexToRgb: function(hex,alpha) {
        // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function(m, r, g, b) {
          return r + r + g + g + b + b;
        });

        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${alpha})`: hex;
    },
    execute_draw: function(id,height="300px",selection={},roots=[]){
        let nodes = Object.values(Diagram.nodes).filter(x => x.id != '');
        let edges = Object.values(Diagram.edges);
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
        var data = {
          nodes: new vis.DataSet(nodes),
          edges: new vis.DataSet(edges)
        };
        var container = document.getElementById(id);
        let directed_diagram = false;//nodes.length < 20;
        var options = {
            width: "100%",
            height: height,
            layout: {
                improvedLayout: true,
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
        network.on("afterDrawing", function (ctx) {
            var dataURL = ctx.canvas.toDataURL();
            session.diagram_img = dataURL;
          });
    },
    export: function(){

    },
    register_translation: function(key,value){
        try{
            translations[key].push(value);
        } catch {
            translations[key] = [value];
        }
    }
}