let scenario_cache = {};
window.Scenario = {
    prepare: function(scenario){
        scenario.activity = make_sure_is_list(scenario.activity);
        scenario.activity = scenario.activity.map(activity => Scenario.prepare_activity(activity));
        return scenario;
    },
    prepare_activity: function(activity){
        activity.input = make_sure_is_list(activity.input);
        activity['expected-trace'] = make_sure_is_list(activity['expected-trace']);
        activity["extract-value"] = make_sure_is_list(activity["extract-value"]);
        activity["expect-value"] = make_sure_is_list(activity["expect-value"]);
        return activity;
    },
    get_components: async function(){
        let files = await FileSystem.listFiles();
        let components = [];
        files.filter(x => x.includes("/behavior-flows/") && x.endsWith(".xml")).forEach(x => {
            let path = x.split("/");
            components.push(`${path[1]}.${path[2]}.${path[4].replace('.xml','')}`);
        });
        files.filter(x => x.startsWith("notifiers/") && x.endsWith(".xml")).forEach(x => {
            components.push(`${x.replace("notifiers/","").replace(".xml","")}-Notifier`)
        });
        return components;
    },
    get_commands: async function(){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith("commands/") && x.endsWith(".xml"));
        let commands = [];
        for (let i = 0; i < files.length; i++){
            let command = await Modeler.get(files[i],true);
            let key = `${command["att_graphql-namespace"]}.${command["att_graphql-name"]}`;
            commands.push(key);
            scenario_cache[key] = command;
        }
        return commands;
    },
    get_queries: async function(){
        let files = await FileSystem.listFiles();
        files = files.filter(x => (x.startsWith("views/") || x.startsWith('projections/')) && x.endsWith(".xml"));
        let queries = {};
        for (let i = 0; i < files.length; i++){
            let model = await Modeler.get(files[i],true);
            let type = Modeler.determine_type(files[i]);
            if (type == "view"){
                model.query.forEach(x => {
                    queries[`${x["att_graphql-namespace"]}.${x["att_field-name"]}`] = {name:model.att_name,type:'View'};
                });
            }
            if (type == "projection"){
                queries[`${model["att_graphql-namespace"]}.${model["att_field-name"]}`] = {name:model.att_return,type:'Projection'};
            }
        }
        return queries;
    },
    get_flowvars: function(scenario,index){
        let flow_vars = [];
        scenario.activity.forEach((activity,i) => {
            if ( i < index){
                if (activity.att_type == "set-variables"){
                    activity.input.forEach(input => {
                        flow_vars.push(`#${input.att_name}#`);
                    });
                }
                activity["extract-value"].forEach(value => {
                    flow_vars.push(`#${value['att_put-key']}#`);
                });
            }
        });
        flow_vars.push("#user_name#");
        flow_vars.push("#user_number#");
        return flow_vars;
    },
    prepare_nested_input: async function(activity,collection){
        let elements = activity.att_path.split(".");
        let commandName = elements.pop();
        commandName = commandName.charAt(0).toUpperCase() + commandName.slice(1);
        commandName += elements.join("");
        commandName += "Requested";
        let command = await Modeler.get_by_name(commandName,true);
        let retval = {};
        command["nested-object"].filter(x => x.att_name == collection).at(0).field.forEach(x => {
            retval[x.att_name] = x.att_type == "String" ? "string" : x.att_type == "Boolean" ? true : 0;
        });
        return retval;
    },
    last_type: "",
    determine_type: async function(activity,expectation){
        let view = activity.att_view;
        view = await Modeler.get_view_by_name(view,true);
        if (expectation.att_name){
            let path = expectation.att_name.split(".");
            let type = "";
            for (let i = 0; i < path.length; i++){
                let key = path[i];
                if (Number.isInteger(key)){
                    continue;
                }
                let field = view.field.filter( x => x.att_name == key).at(0);
                if (field && field.att_type){
                    type = field.att_type;
                }
            }
            return type;
        } else {
            return ""
        }
    },
    query_path_helper: async function(activity,expectation){
        let view = activity.att_view;
        view = await Modeler.get_view_by_name(view,true);
        if (expectation.att_name){
            let path = expectation.att_name.split(".");
            for (let i = 0; i < path.length; i++){
                let key = path[i];
                if (Number.isInteger(key)){
                    continue;
                }
                let field = view.field.filter( x => x.att_name == key).at(0);
                if (field && field.att_type){
                    Scenario.last_type = field.att_type;
                }
                if (field && field.att_ref){
                    view = await Modeler.get_view_by_name(field.att_ref,true);
                }
            }
            let references = [];
            view.field.forEach(x => {
                references.push({
                    name: x.att_name,
                    type: x.att_type
                });
            });
            return references;
        }
    },
    update_path: function(expectation,field){
        let path = "";
        if (expectation.att_name.includes(".")) {
            path = expectation.att_name;
        }
        if (field_types.includes(Scenario.last_type)){
            let tmp = path.split(".");
            tmp.pop();
            path = tmp.join(".");
        } else if (Scenario.last_type == "StringList"){
            let tmp = path.split(".");
            if (Number.isInteger(tmp.at(-1))){
                tmp.pop();
            }
            tmp.pop();
            path = tmp.join(".");
        }
        if (!path.endsWith(".") && path != ""){
            path += "."
        }
        path += field.name;
        if (["ObjectList", "OneToMany", "ManyToMany"].includes(field.type)){
            path += ".0.";
        }
        if (["StringList"].includes(field.type)){
            path += ".0";
        }
        if (["ManyToOne", "OneToOne"].includes(field.type)){
            path += ".";
        }
        return [path,field.type];
    },
    initialize_expectation: async function(activity){
        let view = activity.att_view;
        view = await Modeler.get_view_by_name(view,true);
        return {
            att_name: view.field.at(0).att_name,
            att_type: view.field.at(0).att_type,
            att_value: "#"
        };
    },
    update_command: function(activity,command){
        activity.att_path = command;
        activity.input = scenario_cache[command]
            .field.filter(x => !x['att_auto-fill'])
            .map(x => {return{att_name: x.att_name, att_type: x.att_type, att_value: ''}});
        scenario_cache[command]["nested-object"].forEach(collection => {
            let obj = {};
            collection.field.forEach(field => {
                obj[field.att_name] = field.att_type == "String" ? "string" : field.att_type == "Boolean" ? true : 0;
            });
            activity.input.push({
                att_name: collection.att_name,
                att_type: "Nested",
                att_value: JSON.stringify([obj])
            });
        });
    },
    update_query: async function(activity,queries,query){
        activity.att_path = query;
        activity.att_view = queries[query].name;
        let view = activity.att_view;
        view = await Modeler.get_view_by_name(view,true);
        let filters = [];
        view.query.filter(x => `${x["att_graphql-namespace"]}.${x["att_field-name"]}` == activity.att_path).forEach(q => {
            console.log(q);
            if (q.att_type == "get"){
                filters.push({
                    att_name: "key",
                    att_type: "String",
                    att_value: "#"
                });
            } else if (q["att_use-canonical-search"] && q["att_use-canonical-search"] == "true"){
                filters.push({
                    att_name: "key_begins_with",
                    att_type: "String",
                    att_value: "#"
                });
            }
            q["filter-clause"].forEach(f => {
                let name = f["att_field-name"];
                filters.push({
                    att_name: name,
                    att_type: view.field.filter(x => x.att_name == name).at(0).att_type,
                    att_value: "#"
                });
            });
        });
        activity.input = filters;
    },
    create: async function(data){
        if (!check_pattern(data.name,pascal_cased)){
            Session.show_exception("Invalid configuration, scenario not created!");
            return;
        }
        let file = "scenarios/" + data.name + ".xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let scenario = Scenario.prepare({});
        scenario.att_name = data.name;
        scenario = {scenario:scenario};
        await Modeler.save_model(file,scenario);
        if (data.docs && data.docs != 'documentation'){
            await Modeler.save_model(file.replace('.xml','.md'),{content:data.docs});
        }
        await sleep(1000);
        Navigation.open(file);
    }
}