
window.Behavior = {
    get: function(path){
        let flow = model[path]["command"];
        Behavior.repair(flow);
        return flow;
    },
    repair: function(flow){
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
    },
    create_new: blockingDecorator(function(aggregate){
            let name = "NewFlow";
            let path = "domain/" + aggregate.subdomain + "/" + aggregate.root.att_name + "/behavior-flows/" + name + ".xml";
            let doc = "domain/" + aggregate.subdomain + "/" + aggregate.root.att_name + "/behavior-flows/" + name + ".md";
            let added = Modeler.insert_model(path,{
                "command": {
                    "att_name": name
                }
            });
            Modeler.insert_documentation(doc,"~~Behavior flow model template~~");
            if (added){
                setTimeout(function(){
                    Navigation.execute_open_tab(path);
                },500);
            }
        }),
    load: function(file){
        session.type = "behavior";
        tab_state.flow = Behavior.get(file);
        tab_state.triggers = tab_state.flow.trigger;
        tab_state.aggregate = Aggregates.get(file.split("behavior-flows/").at(0) + "root.xml");
        if(!tab_state.view){tab_state.view = "trigger"};
        Modeler.load_documentation(file.replace(".xml",".md"));
    },
    load_testcase: function(file){
        let path = file.split("#");
        Behavior.load(path.at(0));
        session.type = "testcase";
        tab_state.testcase = tab_state.flow[TEST].filter(x => x.att_name == path.at(1)).at(0);

        //Reconvert trigger to inputs
        let event = Events.get(tab_state.testcase['att_trigger-event']);
        tab_state.testcase.input = TestCase.convert_event_to_inputs(tab_state.testcase,event);
    },
    rename: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Behavior flow must be PascalCased");
            return;
        }
        let oldPath = "domain/" + tab_state.aggregate.subdomain + "/" + tab_state.aggregate.root.att_name + "/behavior-flows/" + tab_state.flow.att_name;
        let newPath = "domain/" + tab_state.aggregate.subdomain + "/" + tab_state.aggregate.root.att_name + "/behavior-flows/" + name;
        tab_state.flow.att_name = name;

        model[newPath + ".xml"] = model[oldPath + ".xml"];
        delete model[oldPath + ".xml"];
        documentation[newPath + ".md"] = documentation[oldPath + ".md"];
        delete documentation[oldPath + ".md"];

        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(newPath + ".xml");
        Modeler.render();
    }),
    remove: blockingDecorator(function(){
        let path = "domain/" + tab_state.aggregate.subdomain + "/" + tab_state.aggregate.root.att_name + "/behavior-flows/" + tab_state.flow.att_name;
        delete model[path + ".xml"];
        delete documentation[path + ".md"];
        Navigation.execute_close_tab(session.tab);
    }),
    update_trigger: blockingDecorator(function(source,update){
        try{
            let event = Events.get(update);
            console.log(event);
            let mappings = {};
            let trigger = tab_state.flow.trigger.filter(x => x.att_source == source).at(0);
            trigger.mapping.forEach(x => {
                mappings[x.att_value] = x;
            });
            trigger.mapping = event.field.map(x => {return {att_target: x.att_name, att_value: x.att_name};});
            Object.keys(mappings).filter(x => x.startsWith('#')).forEach(
                x => trigger.mapping.push(mappings[x])
            );
            trigger.att_source = update;
            Behavior.equalize_trigger_flowvars();
        }catch(err){console.error(err)}

    }),
    add_trigger: blockingDecorator(function(source){
        let event = Events.get(source);
        let trigger = {att_source: source};
        trigger.mapping = event.field.map(x => {return {att_target: x.att_name, att_value: x.att_name};});
        trigger.mapping = trigger.mapping.concat(event[NESTED].map(x => {return {att_target: x.att_name, att_value: x.att_name, att_nested: true};}));
        tab_state.flow.trigger.push(trigger);
        let keys = event.field.filter(x => x.att_name == tab_state.aggregate.root["att_business-key"]);
        trigger["att_key-field"] = keys.length != 0 ? keys.at(0).att_name : event.field.at(0).att_name;
        Behavior.equalize_trigger_flowvars();
    }),
    remove_trigger: blockingDecorator(function(source){
        tab_state.flow.trigger = tab_state.flow.trigger.filter(x => x.att_source != source);
        Behavior.equalize_trigger_flowvars();
    }),
    equalize_trigger_flowvars: function(){
        let flowVars = [];
        let arrays = [];
        tab_state.flow.trigger.forEach(trigger => {
            trigger.mapping.filter(mapping => mapping.att_value != "#''").forEach(mapping => {
               if (!flowVars.includes(mapping.att_target)){
                flowVars.push(mapping.att_target);
               }
               if ('att_nested' in mapping &&  mapping.att_nested){
                arrays.push(mapping.att_target);
               }
            });
        });
        tab_state.flow.trigger = tab_state.flow.trigger.map(trigger => {
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
    get_flow_variables: function(){
        if(!tab_state.flow){return []}
        let flowVars = [""];
        tab_state.flow.trigger.forEach(trigger => {
            trigger.mapping.forEach(mapping => {
               if (!flowVars.includes(mapping.att_target)){
                flowVars.push(mapping.att_target);
               }
            });
        });
        tab_state.flow.processor.forEach(processor => {
            if (processor.att_type == 'set-variable'){
                flowVars.push(processor.att_name);
            }
            if (processor.att_type == 'code'){
                if (processor.att_code){
                    let content = processor.att_code;
                    content.split("|LB|").filter(line => line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)).forEach(line => {
                        let variable = line.replace("flow.","").split("=").at(0).trim();
                        flowVars.push(variable);
                    });
                }else{
                    let content = code[processor.att_file].content;
                    let method_detected = false;
                    content.split("\n").forEach(line => {
                        if (line.startsWith(`def ${processor.att_handler}(flow):`)){
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
        });
        return flowVars;
    },
    change_emit_event: blockingDecorator(function(processor,eventName){
        let event = Events.get(eventName);
        processor.att_ref = eventName;
        let flowVars = Behavior.get_flow_variables();
        processor.mapping = event.field.map(x => {
            return {
                att_target: x.att_name,
                att_value: flowVars.includes(x.att_name) ? "#flow." + x.att_name : ''
            };
        });
        processor.mapping = processor.mapping.concat(event["nested-object"].map(x => {
            return {
               att_target: x.att_name,
               att_value: flowVars.includes(x.att_name) ? "#flow." + x.att_name : ''
           };
        }));
    }),
    add_processor: blockingDecorator(function(type){
        var new_processor = {att_type: type};
        new_processor.att_id = makeid(6);
        if (type == "emit-event"){
            new_processor.att_ref = "";
            new_processor.mapping = [];
        } else if (type == "code") {
            new_processor.att_file = "";
            new_processor.att_handler = "";
        } else if (type == "validator") {
            new_processor.att_condition = "1 == 1";
            new_processor.att_exception = "My log message {flow.requestor}";
        } else if (type == "set-variable") {
            new_processor.att_name = "";
            new_processor.att_expression = "flow.identity.lower()";
        }
        tab_state.flow.processor.push(new_processor);
    }),
    add_test_case: blockingDecorator(function(name){
        let eventName = tab_state.flow.trigger.at(0).att_source;
        let event = Events.get(eventName);
        tab_state.flow[TEST].push({
            "att_name": name,
            'att_trigger-event': eventName,
            "input": TestCase.convert_event_to_inputs({input:[]},event),
            "expected": []
        });
        Navigation.execute_open_tab(session.tab + "#" + name);
    })
}

window.TestCase = {
    rename: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Test case name must be PascalCased");
            return;
        }
        if (tab_state.flow[TEST].map(x => x.att_name).includes(name)){
            Session.show_exception(`There is already a test called "${name}" for this behavior flow`);
            return;
        }
        tab_state.testcase.att_name = name;
        let path = session.tab.split("#");
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(path.at(0) + "#" + name);
    }),
    change_trigger: blockingDecorator(function(eventName){
        console.log(eventName);
        let event = Events.get(eventName);
        tab_state.testcase['att_trigger-event'] = eventName;
        tab_state.testcase.input = TestCase.convert_event_to_inputs(tab_state.testcase,event);
    }),
    convert_event_to_inputs: function(testcase,event){
        let inputs = event.field.map(x => {return {att_name: x.att_name, att_value: TestCase.get_input_value(testcase,x.att_name), att_type: x.att_type};});
        inputs = inputs.concat(event["nested-object"].map(x => {return {att_name: x.att_name, "#text": TestCase.get_input_value(testcase,x.att_name,true,event), att_type:"NestedObject"};}))
        return inputs;
    },
    get_input_value: function(testcase,inputName,nested=false,event=null){
        let input = testcase.input.filter(x => x.att_name == inputName);
        if (input.length != 0 && !nested){
            return input.at(0).att_value;
        } else if(input.length != 0 && nested){
            return input.at(0)["#text"];
        } else if (nested){
            let template = [];
            let nested_object = {};
            event["nested-object"].filter(x => x.att_name == inputName).at(0).field.forEach(field => {
                let key = field.att_name;
                let value = TestCase.get_default_value(field.att_type);
                nested_object[key] = value;
            });
            template.push(nested_object);
            return JSON.stringify(template,null,2);
        } else {
            return "";
        }
    },
    get_aggregate_document: function(){
        let document = {};
        tab_state.aggregate.root.field.forEach(field => {
            document[field.att_name] = TestCase.get_default_value(field.att_type);
        });
        tab_state.aggregate.entities.forEach(obj =>{
            document[obj.att_name] = {};
            let nested_object = {};
            let key = "{{business-key}}"
            obj.field.forEach(field => {
                nested_object[field.att_name] = field.att_name == obj["att_business-key"] ? key : TestCase.get_default_value(field.att_type);
            });
            document[obj.att_name][key] = nested_object;
        });
        return JSON.stringify(document,null,2);
    },
    get_default_value: function(type){
            let value = "";
            if (["Int","Float"].includes(type)){
                value = 0
            } else if (type == "Boolean"){
                value = false;
            }
            return value
        },
    update_expected_event: function(expected_event,eventName){
        if (eventName !== "- reload event variables -"){
            expected_event["att_domain-event"] = eventName;
        }
        eventName = expected_event["att_domain-event"];
        let cached_values = {};
        expected_event.field.forEach(x => {
            cached_values[x.att_name] = x.att_value;
        });
        let template = tab_state.aggregate.events.filter(x => x.att_name == eventName).at(0);
        let checks = [];
        template.field.forEach(x => {
            let check = {};
            if (x.att_name in cached_values){
                check.att_value = cached_values[x.att_name];
            } else {
                check.att_value = TestCase.get_default_value(x.att_type);
            }
            check.att_name = x.att_name;
            check.att_type= x.att_type;
            checks.push(check);
        });
        expected_event.field = checks;
        TestCase.deduplicate_expected_events();
        return expected_event;
    },
    deduplicate_expected_events: function(){
        let keys = [];
        let events = [];
        tab_state.testcase.expected.forEach(x => {
            let key = x['att_domain-event'];
            if (!keys.includes(key)){
                keys.push(key);
                events.push(x);
            }
        });
        tab_state.testcase.expected = events;
    },
    insert_event_assertion: blockingDecorator(function(eventName){
        let check = tab_state.testcase.expected.filter(x => x['att_domain-event'] == eventName);
        if (check.length != 0){
            Session.show_exception(`Assertion for ${eventName} already registered`);
            return;
        }
        let expected_event = {"att_domain-event": eventName, "field": []};
        tab_state.testcase.expected.push(expected_event);
        TestCase.update_expected_event(expected_event, eventName);
    }),
    update_expected_state_key: blockingDecorator(function(key){
        if (!('expected-state' in tab_state.testcase)){
            tab_state.testcase['expected-state'] = {};
        }
        if (key == ""){
            delete tab_state.testcase['expected-state'].att_pk;
        } else {
            tab_state.testcase['expected-state'].att_pk = key;
        }
        if (Object.keys(tab_state.testcase['expected-state']).length === 0){
            delete tab_state.testcase['expected-state'];
        }
    }),
    update_state: function(json){
        if (json == "" || json.replaceAll("\n","").replaceAll(" ","") == "{}"){
            delete tab_state.testcase.state;
        } else {
            tab_state.testcase.state = json;
        }
    },
    update_expected_state: function(json){
            if (!('expected-state' in tab_state.testcase)){
                tab_state.testcase['expected-state'] = {};
            }
            if (json == "" || json.replaceAll("\n","").replaceAll(" ","") == "{}"){
                delete tab_state.testcase['expected-state']["#text"];
            } else {
                tab_state.testcase['expected-state']["#text"] = json;
                if (!tab_state.testcase['expected-state']["att_pk"]){
                    tab_state.testcase['expected-state']["att_pk"] = "functional-key";
                }
            }
            if (Object.keys(tab_state.testcase['expected-state']).length === 0){
                delete tab_state.testcase['expected-state'];
            }
        },
    remove: blockingDecorator(function(){
        tab_state.flow[TEST] = tab_state.flow[TEST].filter(x => x.att_name != tab_state.testcase.att_name);
        Navigation.execute_close_tab(session.tab);
    })
}

document.addEventListener('tracepaper:model:prepare-save', () => {
    Aggregates.list().forEach(aggregate => {
        aggregate.flows.forEach(flow => {
            flow[TEST].forEach(testcase => {
                if(!testcase.state){
                    return;
                }
                let state = testcase.state.replaceAll(" ","").replaceAll("\n","");
                if (state == "" || state == "{}"){
                    delete testcase.state;
                }
            });
        });
    });

    //Validation
    Aggregates.list().forEach(aggregate => {
        aggregate.flows.forEach(flow => {
            try{
                let path = aggregate.path.replace("root.xml","behavior-flows/") + flow.att_name + ".xml";
                if (flow.trigger.length == 0){
                    Validation.register(path,`No trigger configured`);
                }
                flow.trigger.forEach(trigger => {
                    let event = Events.get(trigger.att_source);
                    let fields = event.field.map(x => x.att_name);
                    fields = fields.concat(event[NESTED].map(x => x.att_name));
                    trigger.mapping.forEach(mapping => {
                        if (!mapping.att_value.startsWith("#") && !fields.includes(mapping.att_value)){
                            Validation.register(path,`Trigger ${trigger.att_source} maps a non existing command-field '${mapping.att_value}' to flow variable '${mapping.att_target}'`);
                        }
                     });
                     Validation.must_be_camel_cased(path,trigger.mapping,`Flow variable`,"att_target")
                     if (!trigger["att_key-field"].startsWith("#") && !fields.includes(trigger["att_key-field"])){
                         Validation.register(path,`Trigger ${trigger.att_source} uses a non existing command-field as business key`);
                         trigger["att_key-field"] = "";
                     }
                });
                if (flow.processor.length == 0){
                    Validation.register(path,`No processors configured`);
                }
                flow.processor.forEach(processor => {
                    if (processor.att_type == "emit-event"){
                        processor.mapping.filter(x => x.att_value == "#flow.").forEach(mapping => {
                            Validation.register(path,`Emit event [${processor.att_ref}] must map a flow variable to field [${mapping.att_target}]`);
                        });
                        try{
                            let event = Events.get(processor.att_ref);
                        }catch{
                            Validation.register(path,`Emit event references an undefined event [${processor.att_ref}]`);
                            return;
                        }
                        let fields = event.field.map(x => x.att_name);
                        fields = fields.concat(event[NESTED].map(x => x.att_name));
                        processor.mapping = processor.mapping.filter(x => fields.includes(x.att_target));
                        fields.filter(x => !processor.mapping.map(x => x.att_target).includes(x)).forEach(field => {
                            processor.mapping.push({
                                att_target: field,
                                att_value: "#flow."
                            });
                        });
                        if(event.att_source != aggregate.subdomain + "." + aggregate.root.att_name){
                            Validation.register(path,`Emit event references [${processor.att_ref}] which is mapped to an other aggregate [${event.att_source}]`);
                        }
                    } else if (processor.att_type == "code") {
                        if (!processor.att_file && !processor.att_handler && !processor.att_code){
                            Validation.register(path,"Python code processor must refrence a global module & method, or define inline code");
                        }
                    } else if (processor.att_type == "validator") {
                        if (!processor.att_condition || !processor.att_exception){
                            Validation.register(path,"Validation processor must must have a condition and an exception message configured, exception is triggered if the condition is false");
                        }
                    } else if (processor.att_type == "set-variable") {
                        if (!processor.att_name || !processor.att_expression || !processor.att_name.match(camel_cased)){
                            Validation.register(path,"A set variable processor must have a variable name and expression configured");
                        }
                    }
                });
                if (flow[TEST].length == 0){
                    Validation.register(path,`No test cases defined`);
                }
                flow[TEST].forEach(test => {
                    let test_path = path + "#" + test.att_name;
                    let event = Events.get(test["att_trigger-event"]);
                    test.input = TestCase.convert_event_to_inputs(test,event);
                    test.input.filter(x => !x.att_value && !x["#text"]).forEach(input => {
                        Validation.register(test_path,`Input [${input.att_name}] is not set`);
                    });
                    test.expected.forEach(expected_event => {
                        try{
                            let event = Events.get(expected_event["att_domain-event"]);
                            let fields = event.field.map(x => x.att_name);
                            expected_event.field.filter(field => !fields.includes(field.att_name)).forEach(field => {
                                Validation.register(test_path,`Event assertion [${event.att_name}] references an unknown field [${field.att_name}]`);
                            });
                            expected_event.field.filter(x => !x.att_value).forEach(x => {
                                Validation.register(test_path,`No expected value configured for field [${x.att_name}] in event [${event.att_name}]`);
                            });
                        }catch{}
                    });
                });
            }catch{}
        });
    });
});