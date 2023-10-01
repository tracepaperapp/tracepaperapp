
window.Scenarios = {
    load_navigation: function(){
        let scenario_names = [];
        session.scenario_names = scenario_names;
        Object.keys(model).filter(key => key.startsWith('scenarios/')).forEach(key => {
            let name = key.replace("scenarios/","").replace(".xml","");
            scenario_names.push(name);
        });
        session.scenario_names = scenario_names;
    },
    load: function(file){
        tab_state.scenario = model[file]["scenario"];
        tab_state.scenario.activity = make_sure_is_list(tab_state.scenario.activity);
        tab_state.scenario.activity.forEach(activity => {
            activity.input = make_sure_is_list(activity.input);
            activity["expected-trace"] = make_sure_is_list(activity["expected-trace"]);
            activity["expect-value"] = make_sure_is_list(activity["expect-value"]);
            activity["extract-value"] = make_sure_is_list(activity["extract-value"]);
        });

        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);

        let index = {};
        let reverse_index = {};
        Commands.list().forEach(command => {
            let cmd_name = command.att_name.replace("Requested","");
            let cmd_path = command['att_graphql-namespace'] + "." + command['att_graphql-name'];
            index[cmd_name] = cmd_path;
            reverse_index[cmd_path] = cmd_name;
        });
        tab_state.commands = {index:index,reverse_index:reverse_index};

        tab_state.query_index = Scenarios.get_queries();
        session.type = "scenario";
    },
    create: blockingDecorator(function(){
        let path = "scenarios/NewScenario.xml";
        if (path in model){
            Session.show_exception("There is already a scenario defined with name: "+name);
            return;
        }
        Modeler.insert_model(path,{
            scenario: {
                att_name: "NewScenario",
                activity: []
            }
        });
        Navigation.execute_open_tab(path);
    }),
    remove: blockingDecorator(function(){
        let path = session.tab.replace(".xml","");
        delete model[path + ".xml"];
        delete documentation[path + ".md"];
        Navigation.execute_close_tab(session.tab);
    }),
    rename: blockingDecorator(function(new_name){
        if (!new_name.match(pascal_cased)){
            Session.show_exception("Scenario must be PascalCased");
            return;
        }
        let old_name = tab_state.scenario.att_name;
        let oldPath = "scenarios/" + old_name;
        let newPath = "scenarios/" + new_name;

        model[newPath + ".xml"] = model[oldPath + ".xml"];
        model[newPath + ".xml"].scenario.att_name = new_name;
        delete model[oldPath + ".xml"];
        documentation[newPath + ".md"] = documentation[oldPath + ".md"];
        delete documentation[oldPath + ".md"];
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(newPath + ".xml");
    }),
    add_input: blockingDecorator(function(activity){
        activity.input.push({att_name: 'field-' + makeid(4), att_type: 'String', att_value: ''});
    }),
    change_command: blockingDecorator(function(activity,commandName){
        let command = model["commands/" + commandName + "Requested.xml"]["event"];
        activity.att_path = tab_state.commands.index[commandName];
        let inputs = {};
        activity.input.forEach(input => {
            inputs[input.att_name] = input;
        });
        let updated_value = [];

        command.field.filter(x => !("att_auto-fill" in x)).forEach(field => {
            if (field.att_name in inputs){
                updated_value.push(inputs[field.att_name]);
            } else {
                updated_value.push({
                    att_name: field.att_name,
                    att_type: field.att_type
                });
            }
        });

        command["nested-object"].forEach(nested => {
            if (nested.att_name in inputs){
                updated_value.push(inputs[nested.att_name]);
            } else {
                updated_value.push({
                    att_name: nested.att_name,
                    att_type: "Nested"
                });
            }
        });
        activity.input = updated_value;
    }),
    get_flow_variables: function(){
        let flow = [];
        tab_state.scenario.activity.forEach(activity => {
            if (activity.att_type == 'set-variables'){
                activity.input.forEach(input => {
                    flow.push(input.att_name);
                });
            }
            if (activity.att_type == 'query'){
                activity["extract-value"].forEach(extraction => {
                    flow.push(extraction["att_put-key"]);
                });
            }
        });
        flow = flow.concat([
            "user_number",
            "scenario_name",
            "user_name",
            "token",
            "url",
        ]);
        flow = flow.map(x => "#" + x + "#");
        flow.push("");
        return flow;
    },
    get_component_index: function(){
        let flow_index = [];
        Aggregates.list().forEach(aggregate => {
            aggregate.flows.forEach(command => {
                let key = aggregate.subdomain + "." + aggregate.root.att_name + "." + command.att_name;
                flow_index.push(key);
            });
          });
        Notifiers.list().forEach(notifier => {
            let key = notifier.att_name + "-Notifier";
            flow_index.push(key);
        });
        return flow_index;
    },
    append_expectation: blockingDecorator(function(activity){
        let flow_index = Scenarios.get_component_index();
        let traces = activity["expected-trace"].map(x => x.att_command);
        for(let i = 0; i < flow_index.length; i++){
            let trace = flow_index[i];
            if (!traces.includes(trace)){
                activity["expected-trace"].push({
                    att_command: trace,
                    att_status: "success"
                });
                break;
            }
        }
    }),
    get_queries: function(){
        let query_index = {};
        Views.list().forEach(view => {
            view.query.forEach(query => {
                let key = query["att_graphql-namespace"] + "." + query["att_field-name"];
                query_index[key] = view.att_name;
            });
        });
        return query_index;
    },
    change_view: blockingDecorator(function(activity){
        let view = Views.get('views/' + activity.att_view + '.xml');
        let inputs = {};
        activity.input.forEach(input => {
            inputs[input.att_name] = input;
        });
        let updated_value = [];
        activity.input = updated_value;

        let query = view.query.filter(query => query["att_graphql-namespace"] + "." + query["att_field-name"] == activity.att_path).at(0);

        if (query.att_type == "get"){
            updated_value.push({
                att_name: "key",
                att_type: "String"
            });
        }else{
            if ('att_use-canonical-search' in query && query['att_use-canonical-search'] == 'true'){
                updated_value.push({
                    att_name: "key_begins_with",
                    att_type: "String"
                });
            }
            query["filter-clause"].forEach(filter => {
                let name = filter["att_field-name"];
                let type = view.field.filter(x => x.att_name == name).at(0).att_type;
                updated_value.push({
                    att_name: name,
                    att_type: type
                });
            });
        }
        activity.input = updated_value;
    }),
    append_activity: blockingDecorator(function(type){
         tab_state.scenario.activity.push({
            att_type: type,
            att_id: makeid(6),
            input: [],
            "expected-trace": [],
            "expect-value": [],
            "extract-value": []
        });
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Scenarios.load_navigation();
    setTimeout(Scenarios.load_navigation,1000);
});