
var directed_diagram = false;

var colors = {
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

var shapes = {
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


var draw_diagram_block = false;
var draw_inactivity = null;
window.Diagram = {
    isPresent: function(){
        return session.tab == "README.md" ||
        session.tab.startsWith("commands/") ||
        (session.tab.startsWith("domain/") && !session.tab.includes("#")) ||
        session.tab.startsWith("views/") ||
        session.tab.startsWith("projections/") ||
        session.tab.startsWith("notifiers/") ||
        session.tab.startsWith("lib/");
    },
    draw: function(){
        if (draw_diagram_block){return}else{draw_diagram_block=true}
        Diagram.execute_draw();
        draw_diagram_block = false;
    },
    execute_draw: function(){
        try{
        DiagramData.reset();
        if(session.tab == "README.md"){
            Object.keys(model).filter(x => !x.includes("/behavior-flows/")).forEach(x => DiagramData.add_element(x));
        } else if (session.tab.startsWith("domain/") && session.tab.endsWith("/README.md")){
            Object.keys(model)
                .filter(x => x.startsWith(session.tab.replace("README.md","")) && x.endsWith("root.xml"))
                .forEach(x => {
                    try{
                        DiagramData.add_aggregate(x,false);
                    }catch(err){
                        console.error(err);
                    }
                });
            DiagramData.add_view_edges();
        } else {
            DiagramData.add_element(session.tab,true);
        }
        draw_diagram();
        }catch{}
    }
}

var DiagramData = {
    nodes: {},
    edges: {},
    links: [],
    reset: function(){
        DiagramData.nodes = {};
        DiagramData.edges = {};
        DiagramData.links = [];
    },
    add_element: function(path,detailed=false){
        try{
            if (path.startsWith("commands/")){
                DiagramData.add_command(path,true);
            } else if (path.startsWith("domain/") && path.endsWith("/root.xml")){
                DiagramData.add_aggregate(path,detailed)
            } else if (path.startsWith("domain/") && path.includes("/behavior-flows/")){
                DiagramData.add_behavior(path);
            } else if (path.startsWith("views/")){
                DiagramData.add_view(path);
            } else if (path.startsWith("projections/")){
                DiagramData.add_projection(path);
            } else if (path.startsWith("notifiers/")){
                DiagramData.add_notifier(path);
            } else if (path.startsWith("lib/")){
                DiagramData.add_module(path);
            }
        }catch(err){
            console.trace(err);
        }
    },
    add_command: function(path,standalone=false){
        DiagramData.links.push(path)
        let command = Commands.get(path);
        let name = command.att_name.replace("Requested","");
        DiagramData.add_node(name,"command");
        var patterns = command.field.map(x => x.att_pattern);
        for (var i = 0; i < command[NESTED].length; i++){
            patterns = patterns.concat(command[NESTED][i].field.map(x => x.att_pattern));
        }
        patterns.forEach(x => {
            if (!x){
                return;
            }
            var pattern = x.replace("{{","").replace("}}"," (pattern)");
            DiagramData.add_node(pattern,"dependency");
            DiagramData.add_edge(name,pattern,"",true);
            DiagramData.links.push("patterns/" + pattern.replace(" (pattern)","") + ".xml");
        });
        if (standalone){
            DiagramData.add_event_subscribers(name,command.att_name);
        }
    },
    add_aggregate: function(path,detailed=false){
        let aggregate = Aggregates.get(path);
        if (detailed){
            aggregate.flows.forEach(flow => {
                DiagramData.add_node(flow.att_name,"behavior");
                DiagramData.add_behavior_trigger(flow.att_name,flow);
                DiagramData.add_behavior_dependency(flow.att_name,flow);
                DiagramData.add_behavior_subscribers(flow.att_name,flow);
                DiagramData.add_behavior_view_listners(flow.att_name,aggregate.subdomain,aggregate.root.att_name);
            });
        }else{
            DiagramData.links.push(path)
            let reference = aggregate.subdomain + "." + aggregate.root.att_name;
            DiagramData.add_node(reference,"aggregate");
            aggregate.flows.forEach(flow => {
                DiagramData.add_behavior_trigger(reference,flow);
                DiagramData.add_behavior_dependency(reference,flow);
                DiagramData.add_behavior_subscribers(reference,flow);
                DiagramData.add_behavior_view_listners(reference,aggregate.subdomain,aggregate.root.att_name);
            });
        }
        DiagramData.add_view_edges();
    },

    add_behavior: function(path){
        let flow = Behavior.get(path);
        DiagramData.add_node(flow.att_name,"behavior");
        DiagramData.add_behavior_trigger(flow.att_name,flow);
        DiagramData.add_behavior_dependency(flow.att_name,flow);
        DiagramData.add_behavior_subscribers(flow.att_name,flow);
        DiagramData.add_behavior_view_listners(flow.att_name,path.split("/").at(1),path.split("/").at(2));
        DiagramData.add_view_edges();
    },
    add_behavior_trigger: function(reference,flow){
        let events = Events.list();
        flow.trigger.forEach(trigger => {
            if (trigger.att_source.endsWith("Requested")){
                let source = trigger.att_source.replace("Requested","");
                DiagramData.add_node(source,"command");
                DiagramData.add_edge(source,reference,trigger.att_source);
                DiagramData.links.push("commands/" + trigger.att_source + ".xml");
            } else {
                let event = events.filter(x => x.att_name == trigger.att_source).at(0);
                if (!(event.att_source in DiagramData.nodes)){
                    DiagramData.add_node(event.att_source,"aggregate",0.5);
                }
                DiagramData.add_edge(event.att_source,reference,trigger.att_source);
                DiagramData.links.push("domain/" + event.att_source.replace(".","/") + "/root.xml");
            }
        });
    },
    add_behavior_dependency: function(reference,flow){
        flow.processor.filter(x => x.att_type == "code").forEach(x => {
            var module = x.att_file.replace("lib/","").replace(".py"," (Python)");
            DiagramData.add_node(module,"dependency");
            DiagramData.add_edge(reference,module,"",true);
            DiagramData.links.push(x.att_file);
        })
    },
    add_behavior_subscribers: function(reference,flow){
        flow.processor.filter(x => x.att_type == "emit-event").forEach(event => {
                  var eventName = event.att_ref;
                  DiagramData.add_event_subscribers(reference,eventName);
              });
    },
    add_behavior_view_listners: function(reference,subdomain,aggregate){
        Views.list().forEach(view => {
            function add_view(view,handler){
                 if (handler["att_sub-domain"] == subdomain && handler.att_aggregate == aggregate){
                    DiagramData.links.push(`views/${view.att_name}.xml`);
                    DiagramData.add_node(view.att_name,"view");
                    DiagramData.add_edge(reference,view.att_name,"",true);
                }
            }
            view[CUSTOM_HANDLER].forEach(handler => {
               add_view(view,handler);
            });
            view[SNAPSHOT_HANDLER].forEach(handler => {
               add_view(view,handler);
            });
        });
    },
    add_event_subscribers: function(reference,eventName){
        Aggregates.list().forEach(aggregate => {
            aggregate.flows.forEach(flow => {
                flow.trigger.forEach(trigger => {
                   if (trigger.att_source == eventName){
                       let aggregateId = aggregate.subdomain + "." + aggregate.root.att_name;
                       if (!(aggregateId in DiagramData.nodes)){
                           DiagramData.add_node(aggregateId,"aggregate",0.5);
                       }
                       DiagramData.add_edge(reference,aggregateId,eventName);
                       DiagramData.links.push("domain/" + aggregate.subdomain + "/" + aggregate.root.att_name + "/root.xml");
                   }
                });
            });
        });
        Notifiers.list().forEach(notifier => {
            notifier.trigger.forEach(trigger => {
                if (trigger.att_source == eventName){
                    DiagramData.add_node(notifier.att_name,"notifier");
                    DiagramData.add_edge(reference,notifier.att_name,eventName);
                    DiagramData.links.push("notifiers/" + notifier.att_name + ".xml")
                }
            });
        });
    },
    add_view_edges: function(){
        Views.list().forEach(view => {
            view.field.filter(x => !view_field_types.includes(x.att_type)).forEach(ref => {
                DiagramData.add_edge(view.att_name,ref.att_ref,ref.att_type,[5,7]);
            });
        });
    },
    add_view: function(path){
        let view = Views.get(path);
        DiagramData.add_node(view.att_name,"view");
        DiagramData.links.push(path);
        view.field.filter(x => !view_field_types.includes(x.att_type)).forEach(ref => {
            DiagramData.add_node(ref.att_ref,"view");
            DiagramData.add_edge(view.att_name,ref.att_ref,ref.att_type,[5,7]);
            DiagramData.links.push("views/" + ref.att_ref + ".xml");
        });
        Views.list().forEach(ref => {
            ref.field.filter(x => x.att_ref == view.att_name).forEach(field => {
                DiagramData.add_node(ref.att_name,"view");
                DiagramData.add_edge(ref.att_name, view.att_name,field.att_type,[5,7]);
                DiagramData.links.push("views/" + ref.att_name + ".xml");
            });
        });
        view[SNAPSHOT_HANDLER].forEach(handler => {
            let aggregate = handler["att_sub-domain"] + "." + handler.att_aggregate;
            DiagramData.add_node(aggregate,"aggregate");
            DiagramData.add_edge(aggregate,view.att_name);
            DiagramData.links.push("domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml");
        });
        view[CUSTOM_HANDLER].forEach(handler => {
            let aggregate = handler["att_sub-domain"] + "." + handler.att_aggregate;
            DiagramData.add_node(aggregate,"aggregate");
            DiagramData.add_edge(aggregate,view.att_name);
            DiagramData.links.push("domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml");
        });
        view[CUSTOM_HANDLER].filter(x => "att_python-file" in x).forEach(x =>{
            var module = x["att_python-file"].replace("lib/","").replace(".py"," (Python)");
            DiagramData.add_node(module,"dependency");
            DiagramData.add_edge(view.att_name,module,"",true);
            DiagramData.links.push(x["att_python-file"]);
        });
        view.query.forEach(query => {
            let id = `${query["att_graphql-namespace"]}.${query["att_field-name"]}`;
            DiagramData.add_node(id,"query");
            DiagramData.add_edge(id,view.att_name,"",true);
        });
    },
    add_projection: function(path){
        let projection = Projections.get(path);
        DiagramData.add_node(projection.att_name,"projection");
        DiagramData.links.push(path);
        if (projection.att_return){
            DiagramData.add_node(projection.att_return,"view");
            DiagramData.add_edge(projection.att_name,projection.att_return,"return object",[5,7]);
            DiagramData.links.push("views/" + projection.att_return + ".xml");
        }
        let s = projection.att_code;
        let re = /Query\(\'([A-Z]{1}[a-z]+)+\'\)/g;
        let m;
        do {
            m = re.exec(s);
            if (m) {
                DiagramData.add_node(m[1],"view");
                DiagramData.add_edge(m[1],projection.att_name,"source",[5,7]);
                DiagramData.links.push("views/" + m[1] + ".xml");
            }
        } while (m);
    },
    add_notifier: function(path){
        let notifier = Notifiers.get(path);
        DiagramData.add_node(notifier.att_name,"notifier");
        DiagramData.add_notifier_trigger(notifier.att_name,notifier);
        DiagramData.links.push(path);
        notifier.activity.filter(x => x.att_type == "code").forEach(x => {
            var module = x["att_python-file"].replace("lib/","").replace(".py"," (Python)");
            DiagramData.add_node(module,"dependency");
            DiagramData.add_edge(notifier.att_name,module,"",true);
            DiagramData.links.push(x["att_python-file"]);
        });
    },
    add_notifier_trigger: function(reference,flow){
        flow.trigger.forEach(trigger => {
            if (trigger.att_source.startsWith("@")){
                DiagramData.add_node(trigger.att_source,"schedule");
                DiagramData.add_edge(trigger.att_source,reference);
            } else {
                let event = Events.list().filter(x => x.att_name == trigger.att_source).at(0);
                if (event.att_type == "DomainEvent"){
                    DiagramData.add_node(event.att_source,"aggregate");
                    DiagramData.add_edge(event.att_source,reference,trigger.att_source);
                    DiagramData.links.push("domain/" + event.att_source.replace(".","/") + "/root.xml");
                } else if (event.att_type == "ActorEvent"){
                    let command = event.att_name.replace("Requested","");
                    DiagramData.add_node(command,"command");
                    DiagramData.add_edge(command,reference,event.att_name);
                    DiagramData.links.push("commands/" + event.att_name + ".xml");
                }
            }
        });
    },

    add_module: function(path){
        let name = path.replace("lib/","").replace(".py","");
        DiagramData.add_node(name,"dependency");
        DiagramData.links.push(path);

        Aggregates.list().forEach(aggregate => {
            aggregate.flows.forEach(flow => {
                flow.processor.forEach(processor => {
                    if (processor.att_type == "code" && processor.att_file == path){
                        DiagramData.links.push(`domain/${aggregate.subdomain}/${aggregate.root.att_name}/root.xml`);
                        let reference = aggregate.subdomain + "." + aggregate.root.att_name;
                        DiagramData.add_node(reference,"aggregate");
                        DiagramData.add_edge(reference,name,"",true);
                    }
                });
            });
        });

        Notifiers.list().forEach(notifier => {
            notifier.activity.forEach(activity => {
                if (activity.att_type == "code" && activity["att_python-file"] == path){
                    DiagramData.links.push(`notifiers/${notifier.att_name}.xml`);
                    DiagramData.add_node(notifier.att_name,"notifier");
                    DiagramData.add_edge(notifier.att_name,name,"",true);
                }
            });
        });

        Views.list().forEach(view => {
            view[CUSTOM_HANDLER].forEach(handler => {
                if (handler["att_python-file"] == path){
                    DiagramData.links.push(`views/${view.att_name}.xml`);
                    DiagramData.add_node(view.att_name,"view");
                    DiagramData.add_edge(view.att_name,name,"",true);
                }
            });
        });
    },

    add_node: function(name,type,alpha=1){
        let size =  ["aggregate","projection"].includes(type) ? 15 : 10;
        DiagramData.nodes[name] = {
           "id": name,
           "label": name,
           "size": size,
           "shape": shapes[type],
           "color": DiagramData.hexToRgb(colors[type],alpha)
       }
    },
    add_edge: function(from,to,label="",dashes=false){
        var key = from + to;
        DiagramData.edges[key] = {
            "from": from,
            "to": to,
            "label": label,
            "dashes" : dashes,
            "font": {
                "size" : 10
            }
        };
        if (dashes == true){
            DiagramData.edges[key]["color"] = {"inherit":"to"};
        } else {
            DiagramData.edges[key]["arrows"] = "to";
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
    }
}

var diagram_history = "";
window.draw_diagram = function(force=false){
    var data = {
      nodes: new vis.DataSet(Object.values(DiagramData.nodes).filter(x => x.id != '')),
      edges: new vis.DataSet(Object.values(DiagramData.edges))
    };
    let fingerprint = btoa(JSON.stringify(Object.keys(DiagramData.nodes).concat(Object.keys(DiagramData.edges)),true));
    if (!force && fingerprint == diagram_history){
        return;
    } else {
        diagram_history = fingerprint;
    }
    var container = document.getElementById("project-diagram");
    var options = {
        width: "100%",
        height: "300px",
        layout: {
            hierarchical : {
                enabled: directed_diagram,
                direction: "LR",
                parentCentralization: true,
                sortMethod: "directed"
            }
        }
    };
    new vis.Network(container, data, options);
    session.diagram_links = deduplicate(DiagramData.links);
}

window.draw_modal = function(){
    var modal = document.getElementById("project-diagram-modal");
    var data = {
          nodes: new vis.DataSet(Object.values(DiagramData.nodes).filter(x => x.id != '')),
          edges: new vis.DataSet(Object.values(DiagramData.edges))
        };
    var options = {
        width: "100%",
        height: `${window.innerHeight *0.8}px`,
        layout: {
            hierarchical : {
                enabled: false,
                blockShifting: true,
                edgeMinimization: true,
                parentCentralization: true
            }
        }
    };
    var network = new vis.Network(modal, data, options);
    setTimeout(function(){
        network.fit();
    },500)
    session.diagram_links = deduplicate(DiagramData.links);
}

