
const options = {
    ignoreAttributes : false,
    format: true,
    attributeNamePrefix : "att_"
};

var parser = new XMLParser(options);
var builder = new XMLBuilder(options);
var model_cache = {};

window.Modeler = {
    exists: async function(file){
        let files = await FileSystem.listFiles();
        return files.filter(x => x == file).length == 1;
    },
    event_exists: async function(eventName){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.endsWith(eventName + ".xml")).length > 0;
    },
    list_events: async function(){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.endsWith(".xml"))
            .filter(x => x.startsWith("commands/") || x.includes("/events/"))
            .map(x => x.split("/").at(-1).replace('.xml','')).sort();
    },
    list_python_modules: async function(){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.startsWith('lib/') && x.endsWith(".py")).sort();
    },
    get_methods: async function(module,type){
        let model = await Modeler.get(module,true);
        if (type == "behavior" || type == "notifier"){
            let filter = "(flow):";
            return model.content.split("\n")
                .filter(x => x.startsWith("def ") && x.endsWith(filter))
                .map(x => x.replace("def ","").replace(filter,""));
        } else {
            return [];
        }
        model.content
    },
    list_templates: async function(){
            let files = await FileSystem.listFiles();
            return files.filter(x => x.startsWith('templates/')).sort();
        },
    determine_type: function(file){
        if (file == "README.md"){
            return "readme";
        } else if (file == "config.xml"){
            return "config";
        } else if (file.startsWith("commands/")){
            return "command";
        } else if (file.startsWith("domain/") && file.endsWith("root.xml")){
            return "aggregate";
        } else if (file.startsWith("domain/") && file.includes("/behavior-flows/")){
            return "behavior";
        } else if (file.startsWith("domain/") && file.includes("/events/")){
            return "event";
        } else if (file.startsWith("views/")){
            return "view";
        } else if (file.startsWith("projections/")){
            return "projection";
        } else if (file.startsWith("notifiers/")){
            return "notifier";
        } else if (file.startsWith("lib/")){
            return "code";
        } else if (file.startsWith("expressions/")){
            return "expression";
        } else if (file.startsWith("patterns")){
            return "pattern";
        } else if (file.startsWith("scenarios/")){
            return "scenario";
        } else if (file == "Patterns"){
            return "patterns";
        } else if (file == "Expressions"){
            return "expressions";
        } else if (file == "Roles"){
            return "roles";
        } else if (file == "Dependencies"){
            return "dependencies";
        } else {
            return "unknown";
        }
    },
    force_sync_to_cache: function(file,model){
        let content = Alpine.reactive(model);
        model_cache[file] = content;
    },
    get: async function(file,readonly=false){
        if (!sessionStorage.checkout){
            return null;
        }
        let content;
        if (file in model_cache && !readonly){
            content = model_cache[file];
        } else {
            content = await FileSystem.read(file);
            if (file.endsWith(".xml")){
                content = parser.parse(content);
            } else if (file.endsWith(".json")){
                content = JSON.parse(content);
                if (file == "meta.json"){
                    content.roles = make_sure_is_list(content.roles);
                }
            } else {
                content = {content:content};
            }
            if (!readonly){
                content = Alpine.reactive(content);
                model_cache[file] = content;
            }
        }
        if (file.endsWith(".xml")){
            let root = Object.keys(content).at(0);
            content = content[root];
            let type = Modeler.determine_type(file);
            content = Modeler.prepare_model(type,content);
        }
        return content;
    },
    get_by_name: async function(name,readonly=false){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.endsWith(name + ".xml"));
        files = files.filter(x => !x.includes("/event-handlers/"))
        if (files.lenght == 0){
            throw new Error('Model not found');
        }
        if (files.length > 1){
            console.log(files);
            throw new Error('Ambiguous name');
        }
        return await Modeler.get(files.at(0),readonly);
    },
    get_view_by_name: async function(name,readonly=false){
            let files = await FileSystem.listFiles();
            files = files.filter(x => x.startsWith("views/") && x.endsWith(name + ".xml"));
            if (files.lenght == 0){
                throw new Error('Model not found');
            }
            if (files.length > 1){
                console.log(files);
                throw new Error('Ambiguous name');
            }
            return await Modeler.get(files.at(0),readonly);
        },
    delete: async function(file,reload=true){
        Modeler.auto_save = false;
        let type = Modeler.determine_type(file);
        if (type == "aggregate"){
            Aggregate.delete(file);
        } else if (type == "event"){
            Aggregate.delete_event(file);
        } else {
            await FileSystem.delete(file);
            await FileSystem.delete(file.replace(".xml",".md"));
        }
        if (reload){
            await sleep(1000);
            parent.postMessage({type:'deleted',file:file});
        }
    },
    prepare_model: function(type,model){
        if (type == "view"){
            return View.prepare(model);
        } else if (type == "behavior"){
            return Behavior.prepare(model);
        } else if (type == "notifier"){
            return Notifier.prepare(model);
        } else if (type == "projection"){
            return Projection.prepare(model);
        } else if (type == "command"){
            return Command.prepare(model);
        } else if (type == "config"){
            if (!model.global || model.global == ''){
                model.global = {};
            }
            model.global.dependency = make_sure_is_list(model.global.dependency);
            return model;
       } else if(type == "scenario"){
            return Scenario.prepare(model);
        } else {
            model.field = make_sure_is_list(model.field);
            model["nested-object"] = make_sure_is_list(model["nested-object"]);
            model["nested-object"].forEach(x => {x.field = make_sure_is_list(x.field)});
            model.mapping = make_sure_is_list(model.mapping);
            model['nested-mapping']  = make_sure_is_list(model['nested-mapping']);
            model["nested-mapping"].forEach(x => {x.mapping = make_sure_is_list(x.mapping)});
            return model;
        }
    },
    convertMarkdownToHtml: function(markdown){
        try{
            var converter = new showdown.Converter();
            var html = converter.makeHtml(markdown);
            html = html.replaceAll('<img','<img style="width:100%;"');
            return html;
        } catch(ex) {
            console.error(ex);
            return markdown;
        }
    },
    get_summary: async function(){
        let summary = {};
        let files = await FileSystem.listFiles();
        summary["commands"] = files.filter(x => x.startsWith('commands/') && x.endsWith('.xml')).length;
        summary["aggregates"] = files.filter(x => x.startsWith('domain/') && x.endsWith('root.xml')).length;
        summary["subdomains"] = files.filter(x => x.startsWith('domain/') && x.endsWith('root.xml')).map(x => x.split("/").at(1));
        summary["subdomains"] = summary["subdomains"].filter(function(item, pos) {return summary["subdomains"].indexOf(item) == pos;}).length;
        summary["domainEvents"] = files.filter(x => x.startsWith('domain/') && x.endsWith('.xml') && x.includes("/events/")).length;
        summary["notifiers"] = files.filter(x => x.startsWith('notifiers/') && x.endsWith('.xml')).length;
        summary["views"] = files.filter(x => x.startsWith('views/') && x.endsWith('.xml')).length;
        summary["projections"] = files.filter(x => x.startsWith('projections/') && x.endsWith('.xml')).length;
        return summary;
    },
    rename: async function(oldPath,newPath){
        model_cache[newPath] = model_cache[oldPath];
        delete model_cache[oldPath];
        await FileSystem.rename(oldPath, newPath);
    },
    save_model: async function(file,content){
        if (file.endsWith(".xml")){
            let placeholder = "placeholder-6a3eacfc-85ff-4414-938d-511785c46536";
            let json = JSON.stringify(content);
            json = json.replaceAll('"true"','"' + placeholder + '"');
            json = JSON.parse(json);
            let xml = builder.build(json);
            xml = xml.replaceAll(placeholder,"true");
            await FileSystem.write(file,xml);
        } else if (file.endsWith(".json")){
            content = JSON.stringify(content,null,2);
            await FileSystem.write(file,content);
        } else {
            content = content["content"];
            await FileSystem.write(file,content);
        }
    },
    sync_to_disk: async function(){
        let keys =  Object.keys(model_cache);
        for(let i = 0; i < keys.length; i++) {
            let file = keys[i];
            let content = model_cache[file];
            let type = Modeler.determine_type(file);
            try{
                if (type == "scenario"){
                    content[type].activity.forEach(activity => {
                        activity.input = deduplicate(activity.input,'att_name');
                    });
                }
            }catch{}
            await Modeler.save_model(file,content);
        }
    },
    auto_save: true,
    get_roles: async function(){
        let roles = [""];
        let meta = await Modeler.get("meta.json",true);
        roles = roles.concat(meta.roles);
        let expressions = await Expression.get_role_expressions();
        roles = roles.concat(expressions.map(x => `#global.${x.att_name}(${x.att_input.replaceAll(';',', ')})`));
        return roles;
    },
    create_module: async function(data){
        if (!check_pattern(data.name,pascal_cased)){
            Session.show_exception("Invalid name, module not created!");
            return;
        }
        let file = "lib/" + data.name + ".py";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let code = {
            "content": code_template
        };
        await Modeler.save_model(file,code);
        await sleep(1000);
        Navigation.open(file);
    },
    prepare_wizard: async function(){
        let data = {};
        let model = await Modeler.get(session.tab,true);
        let type = Modeler.determine_type(session.tab);
        if (type == "command" || type == "projection"){
            data.namespace = model["att_graphql-namespace"];
            let path = data.namespace.split(".");
            data.subdomain = path[0];
            if (path.length > 1){
                data.aggregate = path[1];
                data.selected_aggregate = path[1];
            }
            data.key = "arn";
        } else if (type == "aggregate" || type == "event" || type == "behavior"){
            let path = session.tab.split("/");
            data.namespace = path[1] + "." + path[2];
            data.selected_aggregate = path[2];
            data.subdomain = path[1];
            data.key = model["att_business-key"];
        } else if (type == "view"){
            data.namespace = session.tab.replace('views/','').split('/').filter(x => !x.includes('.xml')).join('.');
        }
        return data;
    }
}

var sync_lock = false;
setInterval(async function(){
    if (localStorage.project_drn && Modeler.auto_save && !sync_lock && sessionStorage.checkout == localStorage.project_drn){
        sync_lock = true;
        await Modeler.sync_to_disk();
        sync_lock = false;
    }
},1000);