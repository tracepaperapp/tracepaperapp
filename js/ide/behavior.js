
window.Behavior = {
    prepare: function(flow){
        flow.trigger = make_sure_is_list(flow.trigger);
        flow.trigger.forEach(trigger => {
            trigger.mapping = make_sure_is_list(trigger.mapping);
        });
        flow.processor = make_sure_is_list(flow.processor);
        flow.processor.forEach(processor => {
            processor.mapping = make_sure_is_list(processor.mapping);
            if (!processor.att_id){
                processor.att_id = makeid(5);
            }
        });
        flow[TEST] = make_sure_is_list(flow[TEST]);
        flow[TEST].forEach(test => {
            test.input = make_sure_is_list(test.input);
            test.expected = make_sure_is_list(test.expected);
        });
        return flow;
    },
    add_trigger: async function(model,event){
        let trigger = {};
        model.trigger.push(trigger);
        await Behavior.update_trigger(trigger,event);
    },
    update_trigger: async function(trigger, event){
        let event_model = await Modeler.get_by_name(event,true );
        trigger.att_source = event;
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
        let root = await Behavior.get_root();
        trigger['att_key-field'] = "";
        if ("att_business-key" in root && event_model.field.map(x => x.att_name).includes(root["att_business-key"])){
            trigger['att_key-field'] = root["att_business-key"];
        }
        await sleep(100);
        Behavior.balance_triggers();
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
    get_root: async function(){
        if (!session.tab.includes('/behavior-flows/')){
            return {};
        }
        return await Modeler.get(session.tab.split('behavior-flows/').at(0) + 'root.xml',true);
    },
    get_entities: async function(){
        if (!session.tab.includes('/behavior-flows/')){
            return [];
        }
        return await Aggregate.get_entities(session.tab.split('behavior-flows/').at(0) + 'root.xml');
    },
    get_entity: async function(name){
        if (!session.tab.includes('/behavior-flows/')){
            return {};
        }
        return await Modeler.get(session.tab.split('behavior-flows/').at(0) + 'entities/' + name + ".xml",true);
    },
    get_trigger_expressions: async function(){
        let expressions = await Expression.get_keyfield_expressions();
        return expressions.map(x => `#global.${x.att_name}(${x.att_input.replaceAll(';',', ')})`);
    },
    get_processor_name: function(processor){
        if (processor.att_type == "emit-event"){
            return processor.att_ref;
        } else if (processor.att_type == "validator"){
            return processor.att_exception;
        } else if (processor.att_type == "code" && processor.att_handler){
            return processor.att_handler;
        } else if (processor.att_type == "code"){
            return "- inline -"
        } else if (processor.att_type == 'set-variable'){
            return processor.att_name;
        } else if (processor.att_type == 'update-key'){
            return processor.att_key.replace("#flow.","");
        }
    },
    get_emitable_events: async function(){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.endsWith(".xml") && x.startsWith(session.tab.split("behavior-flows/").at(0) + "events/"))
        .map(x => x.split("/").at(-1).replace(".xml",""));
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
        for (let i =0; i < flow.processor.length; i++) {
            let processor = flow.processor[i];
            if (processor.att_type == 'set-variable'){
                variables.push(processor.att_name);
            }
            if (processor.att_type == 'code'){
                if (processor.att_code){
                    let content = processor.att_code;
                    content.split("|LB|").filter(line => line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)).forEach(line => {
                        let variable = line.replace("flow.","").split("=").at(0).trim();
                        variables.push(variable);
                    });
                }else{
                    let content = await Modeler.get(processor.att_file,true);
                    content = content.content;
                    let method_detected = false;
                    content.split("\n").forEach(line => {
                        if (line.startsWith(`def ${processor.att_handler}(flow):`)){
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
    update_emit_event: async function(processor,event){
        processor.att_ref = event;
        let event_model = await Modeler.get_by_name(event,true);
        let variables = await Behavior.get_flow_variables();
        processor.mapping = event_model.field.map(x => {return{
            att_target: x.att_name,
            att_value: variables.includes(x.att_name) ? '#flow.' + x.att_name : ''
        }});
        event_model["nested-object"].forEach(x => {
            processor.mapping.push({
                 att_target: x.att_name,
                 att_value: variables.includes(x.att_name) ? '#flow.' + x.att_name : ''
             });
        });
    },
    toggle_code: function(processor){
        if (!processor.att_code){
            delete processor.att_file;
            delete processor.att_handler;
            processor.att_code = "flow.variable = [i for i in ranger(5)]";
        } else {
            delete processor.att_code;
            processor.att_file = "";
            processor.att_handler = "";
        }
    },
    initialize_nested: async function(trigger,collection){
        let event_model = await Modeler.get_by_name(trigger,true );
        let nested = {};
        event_model[NESTED].filter(x => x.att_name == collection).forEach(x => {
            x.field.forEach(x => {
                nested[x.att_name] = x.att_type == 'String' ? 'text' : x.att_type == 'Boolean' ? false : 0;
            });
        });
        return nested;
    },
    update_test_trigger: async function(testcase,trigger){
        let event_model = await Modeler.get_by_name(trigger,true);
        testcase.input = [];
        event_model.field.forEach(x => {
            testcase.input.push({
                att_name: x.att_name,
                att_type: x.att_type,
                att_value: x.att_type == 'String' ? 'text' : x.att_type == 'Boolean' ? false : 0
            });
        });
        event_model[NESTED].forEach(x => {
            let nested = {};
            x.field.forEach(x => {
                nested[x.att_name] = x.att_type == 'String' ? 'text' : x.att_type == 'Boolean' ? false : 0;
            });
            testcase.input.push({
                att_name: x.att_name,
                att_type: "NestedObject",
                "#text": JSON.stringify([nested],null,2)
            });
        });
    },
    add_testcase: async function(model,name){
        let testcase = {};
        testcase.att_name = name;
        let trigger = model.trigger.at(0).att_source;
        testcase["att_trigger-event"] = trigger;
        await Behavior.update_test_trigger(testcase,trigger);
        testcase.expected = [];
        return testcase;
    },
    init_expected_event: async function(event){
        let event_model = await Modeler.get_by_name(event['att_domain-event'],true);
        if (!("field" in event)){
            event.field = [];
        }
        if (!('att_id' in event)){
            event.att_id = makeid(6);
        }
        let keys = event.field.map(x => x.att_name);
        event_model.field.filter(x => !keys.includes(x.att_name)).forEach(x => {
            event.field.push({
               att_name:  x.att_name,
               att_type:  x.att_type,
               att_value: x.att_type == 'String' ? 'text' : x.att_type == 'Boolean' ? false : 0
            });
        });
    },
    create: async function(data){
        if (!check_pattern(data.subdomain,pascal_cased) || !check_pattern(data.selected_aggregate,pascal_cased) || !check_pattern(data.name,pascal_cased)){
            Session.show_exception("Invalid configuration, event not created!");
            return;
        }
        let file = "domain/" + data.subdomain + "/" + data.selected_aggregate + "/behavior-flows/" + data.name + ".xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let behavior = {"att_name":data.name};
        behavior = {command:behavior};
        await Modeler.save_model(file,behavior);
        await sleep(1000);
        Navigation.open(file);
    }
}