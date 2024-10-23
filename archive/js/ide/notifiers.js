
window.Notifier = {
    prepare: function(notifier){
        notifier.trigger = make_sure_is_list(notifier.trigger);
        notifier.trigger.forEach(trigger=> {
            trigger.mapping = make_sure_is_list(trigger.mapping);
        });
        notifier.activity = make_sure_is_list(notifier.activity);
        notifier.activity.forEach(activity=> {
            activity.activity = make_sure_is_list(activity.activity);
            if(!activity.att_id){
                activity.att_id = makeid(6);
            }
        });
        return notifier;
    },
    add_trigger: async function(model,event){
            let trigger = {mapping: []};
            model.trigger.push(trigger);
            await Notifier.update_trigger(trigger,event);
        },
    update_trigger: async function(trigger, event){
        trigger.att_source = event;
        if (event.startsWith("@")){
           if (trigger.mapping.length == 0){
            trigger.mapping.push({
                att_target: "dummy",
                att_value: "#'dummy value'"
            });
           }
        } else {
            let event_model = await Modeler.get_by_name(event,true );
            trigger.mapping = event_model.field.map(x => {return{
                att_target: x.att_name,
                att_value: x.att_name
            }});
            event_model["nested-object"].forEach(x => {
                trigger.mapping.push({
                     att_target: x.att_name,
                     att_value: x.att_name
                 });
            });
        }
        await sleep(100);
        Notifier.balance_triggers();
    },
    balance_triggers: async function(){
        let flow = await Modeler.get(session.tab);
        let fields = [];
        flow.trigger.forEach(trigger => {
                trigger.mapping.forEach(mapping => {
                    if (!fields.includes(mapping.att_target) && mapping.att_value != "#''"){
                        fields.push(mapping.att_target);
                    }
                });
            });
        flow.trigger.forEach(trigger => {
                trigger.mapping = trigger.mapping.filter(x => x.att_value != "#''");
                let mappings = trigger.mapping.map(x => x.att_target);
                fields.filter(x => !mappings.includes(x)).forEach(field => {
                    trigger.mapping.push({
                        att_target: field,
                        att_value: "#''"
                    });
                });
            });
    },
    toggle_code: function(activity){
           console.log(activity);
            if (!activity.att_code){
                delete activity["att_python-file"];
                delete activity.att_handler;
                activity.att_code = "flow.variable = [i for i in ranger(5)]";
            } else {
                delete activity.att_code;
                activity["att_python-file"] = "";
                activity.att_handler = "";
            }
            console.log(activity);
        },
    toggle_query: function(activity){
        if (!activity.att_query){
            delete activity["att_template-file"];
            activity.att_query = `query MyQuery {
    Object {
      method(key: "") {
        value
      }
    }
  }`;
        } else {
            delete activity.att_query;
            activity["att_template-file"] = "";
        }
    },
    toggle_body: function(activity){
            if (!activity.att_query){
                delete activity["att_template-file"];
                activity.att_body = "{}";
            } else {
                delete activity.att_body;
                activity["att_template-file"] = "";
            }
        },
    get_flow_variables: async function(flow=null){
                if (!flow){
                    flow = await Modeler.get(session.tab,true);
                }
                let variables = [];
                flow.trigger.forEach(trigger => {
                    trigger.mapping.forEach(mapping => {
                        if (!variables.includes(mapping.att_target)){
                            variables.push(mapping.att_target);
                        }
                    });
                });
                for (let i =0; i < flow.activity.length; i++) {
                    let activity = flow.activity[i];
                    if (['set-variable','retrieve-email-from-iam','render-template','fetch-property','call-internal-api','HTTP'].includes(activity.att_type)){
                        variables.push(activity.att_name);
                    }
                    if (['get-token','get-systemuser-token'].includes(activity.att_type)){
                        variables.push("token");
                    }
                    if (activity.att_type == 'code'){
                        if (activity.att_code){
                            let content = activity.att_code;
                            content.split("|LB|").filter(line => line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)).forEach(line => {
                                let variable = line.replace("flow.","").split("=").at(0).trim();
                                variables.push(variable);
                            });
                        }else{
                            let content = await Modeler.get(activity["att_python-file"],true);
                            content = content.content;
                            let method_detected = false;
                            content.split("\n").forEach(line => {
                                if (line.startsWith(`def ${activity.att_handler}(flow):`)){
                                    method_detected = true;
                                } else if (line.startsWith("def")){
                                    method_detected = false;
                                }
                                if (method_detected && line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)){
                                    let variable = line.replace("flow.","").split("=").at(0).trim();
                                    variables.push(variable);
                                }
                            });
                        }
                    }
                }
                return variables;
            },
    create: async function(data){
            if (!check_pattern(data.name,pascal_cased)){
                Session.show_exception("Invalid configuration, notifier not created!");
                return;
            }
            let file = "notifiers/" + data.name + ".xml";
            if (await Modeler.exists(file)){
                Session.show_exception("File already exists, will not overwrite <br>" + file);
                return;
            }
            let notifier = {"att_name":data.name};
            notifier = {notifier:notifier};
            await Modeler.save_model(file,notifier);
            await sleep(1000);
            Navigation.open(file);
        }
}