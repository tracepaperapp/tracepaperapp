
window.Commands = {
    load_commands: function(){
        session.command_names = [];
        Object.keys(model).filter(key => key.startsWith('commands/')).forEach(key => {
            let name = key.replace("commands/","").replace("Requested.xml","");
            session.command_names.push(name);
        });
    },
    load: function(file){
        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);
        tab_state.command = Commands.get(file);
        session.type = "command";
        tab_state.document_model = tab_state.command;
        tab_state.nested_documents = tab_state.command[NESTED]
    },
    add_element_collection: blockingDecorator(function(){
        tab_state.command['nested-object'].push({
            "att_name" : "collection-name-" + makeid(4),
            "field": [{
                "att_name" : "fieldname-" + makeid(4),
                "att_type" : "String"
            }]
        });
        Navigation.reload_tab();
    }),
    remove_element_collection: blockingDecorator(function(name){
        tab_state.command[NESTED] = tab_state.command[NESTED].filter(x => x.att_name != name);
        Navigation.reload_tab();
    }),
    list: function(){
        return Object.keys(model).filter(key => key.startsWith("commands/")).map(key => Commands.get(key))
    },
    get: function(path){
        let command = model[path]["event"];
        command['field'] = make_sure_is_list(command['field']);
        command['nested-object'] = make_sure_is_list(command['nested-object']);
        command['nested-object'].forEach(entity => {
            entity.field = make_sure_is_list(entity.field);
        });
        return Alpine.reactive(command);
    },
    create_new: blockingDecorator(function(){
        let name = "NewFunctionRequested";
        let path = "commands/" + name + ".xml";
        let doc = "commands/" + name + ".md";
        let added = Modeler.insert_model(path,{
            "event": {
                "att_graphql-namespace": "Function",
                "att_graphql-name": "new",
                "att_name": "NewFunctionRequested",
                "att_authorization": "authenticated",
                "att_type": "ActorEvent",
                "field": [{
                    "att_name": "myField",
                    "att_type": "String"
                }],
                NESTED: []
            }
        });
        Modeler.insert_documentation(doc,"~~Command model template~~");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },500);
        }
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Commands.load_commands();
});

document.addEventListener('tracepaper:model:prepare-save', () => {
    // Refactor and validate
    Object.keys(model).filter(key => key.startsWith("commands/")).forEach(key => {
        let command = Commands.get(key);
        let path = key;
        let name = key.replace("commands/","").replace(".xml","");
        if (name != command.att_name){
            // Rename files
            delete model[key];
            path = "commands/" + command.att_name + ".xml";
            model[path] = {event:command};
            let doc = key.replace(".xml",".md");
            documentation["commands/" + command.att_name + ".md"] = documentation[doc];
            delete documentation[doc];

            //Switch tab
            FileSystem.remove_from_staging(key,true);
            FileSystem.remove_from_staging(key.replace(".xml",".md"),true);
            Navigation.execute_close_tab(key);
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },1000);
        }

        // Refactor and validate subscribers
        let fields = command.field.map(x => x.att_name);
        fields = fields.concat(command[NESTED].map(x => x.att_name));
        Aggregates.list().forEach(aggregate => {
            aggregate.flows.forEach(flow => {
                flow.trigger.forEach(trigger => {
                    if (name != command.att_name && trigger.att_source == name){
                        trigger.att_source = command.att_name;
                    }
                   if (trigger.att_source == command.att_name){
                       trigger.mapping.forEach(mapping => {
                        if (!mapping.att_value.startsWith("#") && !fields.includes(mapping.att_value)){
                            let path = aggregate.path.replace("root.xml","behavior-flows/") + flow.att_name + ".xml";
                            Validation.register(path,`Trigger ${trigger.att_source} maps a non existing command-field '${mapping.att_value}' to flow variable '${mapping.att_target}'`);
                        }
                       });
                   }
                });
            });
        });
        Notifiers.list().forEach(notifier => {
            notifier.trigger.forEach(trigger => {
                if (name != command.att_name && trigger.att_source == name){
                    trigger.att_source = command.att_name;
                }

                if (trigger.att_source == command.att_name){
                   trigger.mapping.forEach(mapping => {
                    if (!mapping.att_value.startsWith("#") && !fields.includes(mapping.att_value)){
                        Validation.register(notifier.att_file_path,`Trigger ${trigger.att_source} maps a non existing command-field '${mapping.att_value}' to flow variable '${mapping.att_target}'`);
                    }
                   });
               }
            });
        });

        //Validate command
        command.field.filter(f => !f.att_name.match(camel_cased)).forEach(f => {
            Validation.register(path,`Field ${f.att_name} must be camelCased`);
        });
        command[NESTED].filter(e => !e.att_name.match(camel_cased)).forEach(e => {
            Validation.register(path,`Entity ${e.att_name} must be camelCased`);
        });
        command[NESTED].forEach(e => {
            e.field.filter(f => !f.att_name.match(camel_cased)).forEach(f => {
                Validation.register(path,`Field ${f.att_name} in entity ${e.att_name} must be camelCased`);
            });
        });
    });
    Commands.load_commands();
});