
window.Notifiers = {
    list: function(){
        let resultset = [];
        Object.keys(model).filter(key => key.startsWith('notifiers/')).forEach(key => {
            resultset.push(Notifiers.get(key));
        });
        return resultset;
    },
    get: function(path){
        let notifier = model[path]["notifier"];
        notifier.trigger = make_sure_is_list(notifier.trigger);
        notifier.trigger.forEach(trigger=> {
            trigger.mapping = make_sure_is_list(trigger.mapping);
        });
        notifier.activity = make_sure_is_list(notifier.activity);
        notifier.activity.forEach(activity=> {
            activity.activity = make_sure_is_list(activity.activity);
        });
        notifier.att_file_path = path;
        return notifier;
    },
    load_navigation: function(){
        let updated = Object.keys(model).filter(key => key.startsWith('notifiers/')).map(key => key.replace("notifiers/","").replace(".xml",""));
        session.notifier_names = updated;
    },
    create_new: blockingDecorator(function(){
            let name = "NewNotifier";
            let path = "notifiers/" + name + ".xml";
            let doc = "notifiers/" + name + ".md";
            let added = Modeler.insert_model(path,{
                "notifier": {
                    "att_name": name
                }
            });
            Modeler.insert_documentation(doc,"~~View model template~~");
            if (added){
                setTimeout(function(){
                    Navigation.execute_open_tab(path);
                },500);
            }
        }),
    load: function(file){
        tab_state.notifier = Notifiers.get(file);
        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);
        tab_state.triggers = tab_state.notifier.trigger;
        session.type = "notifier";
        if(!tab_state.mode){tab_state.mode="flow"};
    },
    remove: blockingDecorator(function(){
            delete model[session.tab];
            delete documentation[session.tab.replace(".xml",".md")];
            Navigation.execute_close_tab(session.tab);
        }),
    rename: blockingDecorator(function(name){
            if (!name.match(pascal_cased)){
                Session.show_exception("Notifier must be PascalCased");
                return;
            }

            let oldPath = session.tab;
            let newPath = "notifiers/" + name + ".xml";

            tab_state.notifier.att_name = name;

            model[newPath] = model[oldPath];
            delete model[oldPath];
            documentation[newPath.replace(".xml",".md")] = documentation[oldPath.replace(".xml",".md")];
            delete documentation[oldPath.replace(".xml",".md")];

            Navigation.execute_close_tab(oldPath);
            Navigation.execute_open_tab(newPath);
            Modeler.render();
        }),
    equalize_trigger_flowvars: function(){
        let flowVars = [];
        let arrays = [];
        tab_state.notifier.trigger.forEach(trigger => {
            trigger.mapping.filter(mapping => mapping.att_value != "#''").forEach(mapping => {
               if (!flowVars.includes(mapping.att_target)){
                flowVars.push(mapping.att_target);
               }
               if ('att_nested' in mapping &&  mapping.att_nested){
                arrays.push(mapping.att_target);
               }
            });
        });
        tab_state.notifier.trigger = tab_state.notifier.trigger.map(trigger => {
            trigger.mapping = flowVars.map(flowVar => {
                let mapping = trigger.mapping.filter(x => x.att_target == flowVar);
                if (mapping.length != 0){
                    return mapping.at(0);
                } else if (arrays.includes(flowVar)) {
                    return {att_target: flowVar, att_value: "#[]"};
                } else {
                    return {att_target: flowVar, att_value: "#''"};
                }
            });
            return trigger;
        });
    },
    update_trigger: blockingDecorator(function(source,update){
        try{
            let event = Events.get(update);
            let mappings = {};
            let trigger = tab_state.notifier.trigger.filter(x => x.att_source == source).at(0);
            trigger.mapping.forEach(x => {
                mappings[x.att_value] = x;
            });
            trigger.mapping = event.field.map(x => {return {att_target: x.att_name, att_value: x.att_name};});
            Object.keys(mappings).filter(x => x.startsWith('#')).forEach(
                x => trigger.mapping.push(mappings[x])
            );
            trigger.att_source = update;
            Notifiers.equalize_trigger_flowvars();
        }catch(err){console.error(err)}
    }),
    add_trigger: blockingDecorator(function(source){
        let trigger = {att_source: source,mapping:[]};
        if (!source.startsWith("@")){
            let event = Events.get(source);
            trigger.mapping = event.field.map(x => {return {att_target: x.att_name, att_value: x.att_name};});
            trigger.mapping = trigger.mapping.concat(event[NESTED].map(x => {return {att_target: x.att_name, att_value: x.att_name, att_nested: true};}));
        }
        tab_state.notifier.trigger.push(trigger);
//        let keys = event.field.filter(x => x.att_name == tab_state.aggregate.root["att_business-key"]);
//        trigger["att_key-field"] = keys.length != 0 ? keys.at(0).att_name : event.field.at(0).att_name;
        Notifiers.equalize_trigger_flowvars();
    }),
    remove_trigger: blockingDecorator(function(source){
        tab_state.notifier.trigger = tab_state.notifier.trigger.filter(x => x.att_source != source);
        Notifiers.equalize_trigger_flowvars();
    }),
    get_flow_variables: function(nested){
        if (!tab_state.notifier){return []}
        let flowVars = [""];
        tab_state.notifier.trigger.forEach(trigger => {
            trigger.mapping.forEach(mapping => {
               if (!flowVars.includes(mapping.att_target)){
                flowVars.push(mapping.att_target);
               }
            });
        });
        function add_variables(activity){
            if (activity.att_type == 'set-variable'){
                flowVars.push(activity.att_name);
            }
            if (activity.att_type == 'code'){
                if ('att_code' in activity){
                    let content = activity.att_code;
                    content.split("|LB|").filter(line => line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)).forEach(line => {
                        let variable = line.replace("flow.","").split("=").at(0).trim();
                        flowVars.push(variable);
                    });
                } else {
                    let content = code[activity.att_file];
                    let method_detected = false;
                    content.split("\n").forEach(line => {
                        if (line.startsWith(`def ${activity.att_handler}(flow):`)){
                            method_detected = true;
                        } else if (line.startsWith("def")){
                            method_detected = false;
                        }
                        if (method_detected && line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)){
                            let variable = line.replace("flow.","").split("=").at(0).trim();
                            flowVars.push(variable);
                        }
                    });
                }
            }
        }
        tab_state.notifier.activity.forEach(activity => {
            add_variables(activity);
        });
        if (nested && Object.keys(nested).length != 0){
            nested.activity.forEach(activity => {
               add_variables(activity);
            })
        }
        return flowVars;
    },
    add_activity: blockingDecorator(function(notifier,type){
        var new_activity = {att_type: type};
        new_activity.att_id = makeid(6);
        notifier.activity.push(new_activity);
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Notifiers.load_navigation();
    setTimeout(Notifiers.load_navigation,1000);
});

document.addEventListener('tracepaper:model:prepare-save', () => {
    if (!("notifiers/InitializeSystemUser.xml" in model)){
        model["notifiers/InitializeSystemUser.xml"] = {
            notifier: {
                att_name: "InitializeSystemUser",
                trigger: {
                    att_source: "@afterDeployment",
                    mapping: {
                        att_target: "dummy",
                        att_value: "#''"
                    }
                },
                activity: {
                    att_type: "iam-create-systemuser",
                    "att_fail-silent": "true",
                    att_id:"vMB9LZ"
                }
            }
        }
    }
});