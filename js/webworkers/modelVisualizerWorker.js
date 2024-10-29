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
    console.log(event);
    const { action, repoUrl, request_id, file} = event.data;
    try {
        switch (action) {
          case "initialize":
            if (!fs || repo != repoUrl){
                            fs = new LightningFS(repoUrl.replace("https://github.com/", ""));
                            repo = repoUrl;
                        }
            raw_data = await refresh_data();
            postMessage({ result: raw_data, request_id });
          case 'node-diagram':
            postMessage({ result: raw_data, request_id });
            break;
          default:
            postMessage({ error: 'Unknown action', request_id });
        }
      } catch (error) {
        console.error(error);
        postMessage({ error: error.message, request_id });
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
    draw: async function(){
        Diagram.nodes = {};
        Diagram.edges = {};
        Diagram.all_links = {};
        let model_files = files.filter(x => x.endsWith(".xml"));
        let commands = files.filter(x => x.startsWith("commands/"));
        await Diagram.process_files("command",commands, (type,model) => {
            console.log(type,model);
        });
        return {
            nodes: Diagram.nodes,
            edges: Diagram.edges,
            all_links: Diagram.all_links
        }
    },
    process_files: async function(node_type,model_files,callback){
        for (let i=0; i < model_files.length; i++){
            let file = model_files[i];
            let type = Modeler.determine_type(file);
            let model = await get_model(file,true);
            await callback(type,model);
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
    }
}