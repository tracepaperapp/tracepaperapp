importScripts('/js/tp/isomorphic-git.js');
importScripts('/js/tp/lightning-fs.js');
importScripts('/js/utils/helper.js');
importScripts('/js/utils/modeler.js');
importScripts('/js/tp/fast-xml-parser.js')

const field_types = ['String', 'Int', 'Float', 'Boolean'];
const view_field_types = field_types.concat(["StringList"]);

const options = {
    ignoreAttributes : false,
    format: true,
    attributeNamePrefix : "att_"
};
var parser = new XMLParser(options);

const isogit = self.git;
var fs = null;
var repo = "";
const dir = '/';
let files = [];
let raw_data = {};

self.onmessage = async function (event) {
    const { action, repoUrl, request_id, file} = event.data;
    try {
        switch (action) {
          case "initialize":
            if (!fs || repo != repoUrl){
                fs = new LightningFS(repoUrl.replace("https://github.com/", ""));
                repo = repoUrl;
            }
            raw_data = await refresh_data();
            postMessage({ result: raw_data, request_id,action });
          case 'node-diagram':
            postMessage({ result: raw_data, request_id,action });
            break;
          default:
            postMessage({ error: 'Unknown action', request_id,action });
        }
      } catch (error) {
        console.error(error);
        postMessage({ error: error.message, request_id,action });
      }
}

async function refresh_data(){
    files = await isogit.listFiles({ fs, dir: dir, ref: 'HEAD' });
    return await Diagram.draw();
}

async function get_model(file){
    let content = await fs.promises.readFile(dir + "/" + file, "utf8");
    if (file.endsWith(".xml")){
        content = parser.parse(content);
        content = Object.values(content)[0];
        let type = Modeler.determine_type(file);
        content = Modeler.prepare_model(type,content);
    } else if (file.endsWith(".json")){
        content = JSON.parse(content);
        if (file == "meta.json"){
            content.roles = make_sure_is_list(content.roles);
        }
    } else {
        content = {content:content};
    }
    return content;
}

async function get_by_name(name){
    let targets = [...files];
    targets = targets.filter(x => x.endsWith("/" + name + ".xml"));
    targets = targets.filter(x => !x.includes("/event-handlers/"))
    if (targets.lenght == 0){
        throw new Error('Model not found');
    }
    if (targets.length > 1){
        throw new Error('Ambiguous name');
    }
    return await get_model(targets.at(0));
}


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

Diagram = {
    nodes: {},
    edges: {},
    all_links: {},
    translations: {},
    draw: async function(){
        Diagram.nodes = {};
        Diagram.edges = {};
        Diagram.all_links = {};
        let model_files = files.filter(x => x.endsWith(".xml") || x.endsWith(".py"));

        // Prepare command nodes
        let commands = model_files.filter(x => x.startsWith("commands/"));
        commands.forEach(p => {
            let eventName = p.split("/").at(-1).replace(".xml","");
            let name = eventName.replace("Requested","")
            this.add_node(name,"command");
            this.translations[eventName] = [name];
            this.all_links[name] = p;
        });

        // Prepare event translations
        let events = model_files.filter(x => x.startsWith("domain/") && x.includes("/events/"));
        events.forEach(p => {
            let sub = p.split("/").at(1);
            let aggregate = p.split("/").at(2);
            let eventName = p.split("/").at(-1).replace(".xml","");
            this.translations[eventName] = [sub + "." + aggregate];
        });

        // Prepare aggregate nodes
        let aggregates = model_files.filter(x => x.startsWith("domain/") && x.endsWith("/root.xml"));
        aggregates.forEach(p => {
            let sub = p.split("/").at(1);
            let aggregate = p.split("/").at(2);
            let name = sub + "." + aggregate;
            let node = this.add_node(name,"aggregate");
            node.sub = sub;
            this.all_links[name] = p;
            this.translations[name] = [name];
        });

        // Prepare behavior nodes + event/source translations
        let behaviors = model_files.filter(x => x.startsWith("domain/") && x.includes("/behavior-flows/"));
        await Diagram.process_files(behaviors, (p,model) => {
            let sub = p.split("/").at(1);
            let aggregate = p.split("/").at(2);
            let behavior = p.split("/").at(-1).replace(".xml","");
            let name = sub + "." + aggregate + "." + behavior;
            let node = this.add_node(name,"behavior");
            node.sub = sub;
            node.aggregate = aggregate;
            this.all_links[name] = p;
            this.translations[sub + "." + aggregate].push(name);
            model.processor.filter(p => p.att_type == "emit-event").forEach(p => {
                this.translations[p.att_ref].push(name);
            });
        });

        // Prepare notifier nodes
        let notifiers = model_files.filter(x => x.startsWith("notifiers/"));
        notifiers.forEach(p => {
            let name = p.split("/").at(-1).replace(".xml","");
            let node = this.add_node(name,"notifier");
            node.sub = "automations";
            this.all_links[name] = p;
        });

        // Prepare view nodes
        let views = model_files.filter(x => x.startsWith("views/"));
        views.forEach(p => {
            let name = p.split("/").at(-1).replace(".xml","");
            let node = this.add_node(name,"view");
            this.all_links[name] = p;
        });

        // Prepare projection nodes
        let projections = model_files.filter(x => x.startsWith("projections/"));
        projections.forEach(p => {
            let name = p.split("/").at(-1).replace(".xml","");
            let node = this.add_node(name,"projection");
            this.all_links[name] = p;
        });

        // prepare expression nodes
        let expressions = model_files.filter(x => x.startsWith("expressions/"));
        expressions.forEach(p => {
            let name = p.split("/").at(-1).replace(".xml","");
            let label = name + " (expression)"
            let node = this.add_node(label,"dependency");
            this.translations[name] = label;
            this.all_links[name] = p;
        });

        // prepare pattern nodes
        let patterns = model_files.filter(x => x.startsWith("patterns/"));
        patterns.forEach(p => {
            let name = p.split("/").at(-1).replace(".xml","");
            let label = name + " (pattern)"
            let node = this.add_node(label,"dependency");
            this.translations[name] = label;
            this.all_links[name] = p;
        });

        // prepare code nodes
        let code = model_files.filter(x => x.startsWith("lib/"));
        code.forEach(p => {
            let name = p.split("/").at(-1).replace(".py","");
            let label = name + " (Python module)"
            let node = this.add_node(label,"dependency");
            this.translations[name] = label;
            this.all_links[name] = p;
        });

        ///// Edges + (embedded nodes e.g. queries or cron triggers)

        // Command edges
        await Diagram.process_files(commands, (p,model) => {
            let eventName = p.split("/").at(-1).replace(".xml","");
            let name = eventName.replace("Requested","");
            if (model.att_role && model.att_role.startsWith("#global")){
                let target = model.att_role.split(".").at(1).split("(").at(0);
                target = this.translations[target];
                this.add_edge(name,target,"",true);
            }
            model.field.forEach(f => {
                if (f.att_pattern){
                    let target = f.att_pattern.replaceAll("{","").replaceAll("}","");
                    target = this.translations[target];
                    this.add_edge(name,target,"",true);
                }
            });
        });

        // Behavior edges
        await Diagram.process_files(behaviors, (p,model) => {
            let sub = p.split("/").at(1);
            let aggregate = p.split("/").at(2);
            let behavior = p.split("/").at(-1).replace(".xml","");
            let name = sub + "." + aggregate + "." + behavior;
            model.trigger.forEach(t => {
                this.translations[t.att_source].forEach(source => {
                    this.add_edge(source,name);
                    this.add_edge(source,sub + "." + aggregate);
                });
            });
            model.processor.filter(p => p.att_type == "code" && p.att_file).forEach(p => {
                let target = p.att_file.split("/").at(-1).replace(".py","");
                target = this.translations[target];
                this.add_edge(name,target,"",true);
            });
        });

        // Notifier edges
        await Diagram.process_files(notifiers, (p,model) => {
            let name = p.split("/").at(-1).replace(".xml","");
            model.trigger.forEach(t => {
                if (t.att_source.startsWith("@")){
                    this.add_node(t.att_source,"schedule");
                    this.add_edge(t.att_source,name);
                } else {
                    this.translations[t.att_source].forEach(source => {
                        this.add_edge(source,name);
                    });
                }
            });
            model.activity.filter(a => a.att_type == "code" && a["att_python-file"]).forEach(a => {
                let target = a["att_python-file"].split("/").at(-1).replace(".py","");
                target = this.translations[target];
                this.add_edge(name,target);
            });
        });

        // View edges
        await Diagram.process_files(views, (p,model) => {
            let name = p.split("/").at(-1).replace(".xml","");

            // Relations
            model.field.filter(f => !["String","Int","Float","Boolean","StringList"].includes(f.att_type)).forEach(f => {
                this.add_edge(name,f.att_ref,f.att_type,[5,7]);
            });

            // Queries
            model.query.forEach(query => {
                let qn = query["att_graphql-namespace"] + "." + query["att_field-name"];
                this.add_node(qn,"query");
                this.all_links[qn] = p;
                this.add_edge(qn,name,"",true)
                if (query.att_role && query.att_role.startsWith("#global")){
                    let target = query.att_role.split(".").at(1).split("(").at(0);
                    target = this.translations[target];
                    this.add_edge(qn, target,"",true);
                }
           });

            // Data sources
            function add_data_source(handler){
                let source = handler["att_sub-domain"] + "." + handler.att_aggregate;
                Diagram.translations[source].forEach(source => {
                    Diagram.add_edge(source,name,"feed");
                });
            }
            model["snapshot-handler"].forEach(add_data_source);
            model["custom-handler"].forEach(add_data_source);
        });

        // Projection edges
        await Diagram.process_files(projections, (p,model) => {
            // Return object
            if (model.att_return){
                this.add_edge(model.att_name,model.att_return,"return object",[5,7]);
            }

            // Role expression
            if (model.att_role && model.att_role.startsWith("#global")){
                let target = model.att_role.split(".").at(1).split("(").at(0);
                target = this.translations[target];
                this.add_edge(model.att_name, target,"",true);
            }

            // Graphql method
            let qn = model["att_graphql-namespace"] + "." + model["att_field-name"];
            this.add_node(qn,"query");
            this.add_edge(qn,model.att_name,"",true)

            // Data sources (views)
            let s = model.att_code.replaceAll('"',"'");
            let re = /Query\(\'([A-Z]{1}[a-z]+)+\'\)/g;
            let m = null;
            do {
                m = re.exec(s);
                if (m) {
                    this.add_edge(m[1],model.att_name,"source",[5,7]);
                }
            } while (m);
        });

        await Diagram.process_files(patterns, (p,model) => {
            let name = p.split("/").at(-1).replace(".xml","");
            let dependencies = extractPlaceholders(model.att_regex);
            dependencies.forEach(d => {
                this.add_edge(
                    this.translations[name],
                    this.translations[d],
                    "extends",
                    [1,5]
                );
            });
        });

        return {
            nodes: Diagram.nodes,
            edges: Diagram.edges,
            all_links: Diagram.all_links
        }
    },
    process_files: async function(model_files,callback){
        for (let i=0; i < model_files.length; i++){
            try{
                let file = model_files[i];
                let model = await get_model(file,true);
                await callback(file,model);
            }catch (err){
                console.log(err)
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
        let font_color = "#343434";
        let node = {
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
        Diagram.nodes[name] = node;
        return node;
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
    }
}

function extractPlaceholders(str) {
    const regex = /{{(.*?)}}/g; // RegEx om te matchen tussen dubbele accolades
    let matches = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
        matches.push(match[1]); // Voeg de inhoud tussen {{ en }} toe aan de array
    }
    return matches;
}