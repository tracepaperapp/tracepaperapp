
window.Aggregates = {
    list: function(){
        let resultset = [];
        Object.keys(model).filter(key => key.startsWith('domain/') && key.endsWith("/root.xml")).forEach(key => {
            resultset.push(Aggregates.get(key));
        });
        return resultset;
    },
    get: function(path){
        let root = model[path]["aggregate"];
        root.field = make_sure_is_list(root.field);

        let events = Modeler.get_child_models(path.replace("root.xml","events/"),"event",function(event){
            event.field = make_sure_is_list(event.field);
            event[NESTED] = make_sure_is_list(event[NESTED]);
            event[NESTED].forEach(nested => {
                nested.field = make_sure_is_list(nested.field);
            });
        });

        let flows = Modeler.get_child_models(path.replace("root.xml","behavior-flows/"),"command",Behavior.repair);

        let entities = Modeler.get_child_models(path.replace("root.xml","entities/"),NESTED,function(entity){
            entity.field = make_sure_is_list(entity.field);
        });

        let handlers = Modeler.get_child_models(path.replace("root.xml","event-handlers/"),HANDLER,function(handler){
            handler.mapping = make_sure_is_list(handler.mapping);
            handler[NESTED_MAPPING] = make_sure_is_list(handler[NESTED_MAPPING]);
            handler[NESTED_MAPPING].forEach(nested => {
                nested.mapping = make_sure_is_list(nested.mapping);
            });
        });

        if (!root["att_event-ttl"]){root["att_event-ttl"] = -1};
        if (!root["att_snapshot-interval"]){root["att_snapshot-interval"] = 100};
        if (!root["att_backup-interval-days"]){root["att_backup-interval-days"] = 0};
        if(!root["att_backup-ttl-days"]){root["att_backup-ttl-days"] = 0};
        return Alpine.reactive({
            root: root,
            events: events,
            flows: flows,
            entities: entities,
            handlers: handlers,
            subdomain: path.split('/')[1],
            name: path.split('/')[2],
            path: path
        });
    },
    load_navigation: function(){
        session.aggregates = {};
        Aggregates.list().forEach(aggregate => {
            if (aggregate.subdomain in session.aggregates){
                session.aggregates[aggregate.subdomain].push(aggregate);
            } else {
                session.aggregates[aggregate.subdomain] = [aggregate];
            }
        });
    },
    load: function(file){
        session.type = "aggregate";
        tab_state.aggregate = Aggregates.get(file);
        Modeler.load_documentation(file.replace(".xml",".md"));
        if(!tab_state.handler_mode){tab_state.handler_mode = 'table'};
        if(!tab_state.view){tab_state.view = "document"};
        if(!tab_state.handler_selected_entity){tab_state.handler_selected_entity = 'root'};
        if(tab_state.handler_selected_entity == 'root'){tab_state.handler_entity = tab_state.aggregate};
        if(!tab_state.handler_selected_source){tab_state.handler_selected_source = 'root'};
        try{
            Aggregates.load_document_model(tab_state.view);
        }catch{}
        try{
            Aggregates.select_event(tab_state.event);
        }catch(err){console.error("--->",err)}
    },
    load_document_model: function(view, selected_event=""){
        let model = ""
        if (tab_state.document_model){
            model = tab_state.document_model.att_name;
        }

        if (view == "document"){
            tab_state.document_model = tab_state.aggregate.root;
            tab_state.nested_documents = tab_state.aggregate.entities;
        } else {
            tab_state.document_model = tab_state.aggregate.events.filter(x => x.att_name == selected_event).at(0);
            tab_state.nested_documents = tab_state.document_model[NESTED];
        }
        if (model != tab_state.document_model.att_name){
            tab_state.document_selected_entity = "root";
        }
    },
    create_new: blockingDecorator(function(subdomain){
        let name = "NewAggregate";
        let path = "domain/" +subdomain + "/" + name + "/root.xml";
        let doc = "domain/" +subdomain + "/" + name + "/root.md";
        let added = Modeler.insert_model(path,{
            "aggregate": {
                "att_name": name,
                "att_business-key": "fieldName",
                "field": [{
                    "att_name": "fieldName",
                    "att_type": "String"
                }]
            }
        });
        Modeler.insert_documentation(doc,"~~Aggregate model template~~");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },500);
        }
    }),
    remove: blockingDecorator(function(){
        if (!session.tab.startsWith("domain/") && !session.tab.endsWith("/root.xml")){
            Session.show_exception("Could not remove aggregate: " + session.tab);
            return
        }
        let path = session.tab.replace("","");
        Object.keys(model).filter(key => key.startsWith(path)).forEach(key => {delete model[key]});
        Object.keys(documentation).filter(key => key.startsWith(path)).forEach(key => {delete documentation[key]});
        Navigation.execute_close_tab(session.tab);
        Modeler.render();
    }),
    rename:blockingDecorator(function(name){
        if (!session.tab.startsWith("domain/") && !session.tab.endsWith("/root.xml")){
            Session.show_exception("Could not rename aggregate: " + session.tab);
            return
        }
        if (!name.match(pascal_cased)){
            Session.show_exception("Aggregate name must be PascalCased");
            return;
        }
        let oldPath = "domain/" + tab_state.aggregate.subdomain + "/" + tab_state.aggregate.root.att_name + "/";
        let newPath = "domain/" + tab_state.aggregate.subdomain + "/" + name + "/";
        tab_state.aggregate.root.att_name = name;
        tab_state.aggregate.name = name;
        Object.keys(model).filter(key => key.startsWith(oldPath)).forEach(key => {
            model[key.replace(oldPath,newPath)] = model[key];
            delete model[key];
        });
        Object.keys(documentation).filter(key => key.startsWith(oldPath)).forEach(key => {
            documentation[key.replace(oldPath,newPath)] = documentation[key];
            delete documentation[key];
        });
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(newPath + "root.xml");
        Modeler.render();
    }),
    add_element_collection: blockingDecorator(function(){
        let path = session.tab.replace("root.xml","entities/newEntity.xml");
        model[path] = {
            "nested-object": {
                att_name: "newEntity",
                "att_business-key" : "newField",
                field: [{
                    att_name: "newField",
                    att_type: "String"
                }]
            }
        };
        Navigation.reload_tab();
    }),
    remove_element_collection: blockingDecorator(function(name){
        let path = `domain/${tab_state.aggregate.subdomain}/${tab_state.aggregate.root.att_name}/entities/${name}.xml`;
        let doc  = `domain/${tab_state.aggregate.subdomain}/${tab_state.aggregate.root.att_name}/entities/${name}.md`;
        delete model[path];
        delete documentation[path];
        Navigation.reload_tab();
    }),
    rename_collection: blockingDecorator(function(oldName,newName){
        setTimeout(function(){
            let root = session.tab.replace("root.xml","entities/");
            let oldPath = root + oldName;
            let newPath = root + newName;
            console.log(oldPath,newPath);
            model[newPath + ".xml"] = model[oldPath + ".xml"];
            delete model[oldPath + ".xml"];
            documentation[newPath + ".md"] = documentation[oldPath + ".md"];
            delete documentation[oldPath + ".md"];
            Aggregates.load(session.tab);
        },1000);
    }),
    add_collection_to_event: blockingDecorator(function(){
        if (tab_state.nested_documents.filter(x => x.att_name == "newEntity").length != 0){
            return;
        }
        tab_state.nested_documents.push({
            att_name: "newEntity",
            field: [{
                att_name: "newField",
                att_type: "String"
            }]
        });
        Navigation.reload_tab();
    }),
    remove_collection_from_event: blockingDecorator(function(name){
        tab_state.nested_documents = tab_state.nested_documents.filter(x => x.att_name != name);
        tab_state.document_model[NESTED] = tab_state.nested_documents;
        setTimeout(Navigation.reload_tab,100);
    }),
    change_view: blockingDecorator(function(view){
        tab_state.view = "";
        setTimeout(function(){tab_state.view = view},100);
    }),
    select_event: blockingDecorator(function(event){
        if (tab_state.aggregate.events.filter(x => x.att_name == event.att_name).length == 0){
            event = null;
        }
        if (event){
            tab_state.selected_event = event.att_name;
            tab_state.event = event;
        }else{
            tab_state.event = tab_state.aggregate.events.at(0);
            tab_state.selected_event = tab_state.event.att_name;
        }
        let handlers = tab_state.aggregate.handlers.filter(x => x.att_on == tab_state.selected_event);
        if (handlers.length != 0){
            tab_state.handler = handlers.at(0);
        }else{
            let handler = {
                att_on: tab_state.selected_event,
                mapping: [],
                "nested-mapping": []
            };
            let path = tab_state.aggregate.path.replace("root.xml",`event-handlers/${event.att_name}.xml`);
            model[path] = {};
            model[path][HANDLER] = handler;
            tab_state.handler = model[path][HANDLER];
        }
        if(!tab_state.handler_selected_entity){
            tab_state.handler_selected_entity = "root";
            tab_state.handler_entity = tab_state.aggregate.root;
        }
    }),
    sync_handler: function(){
        let path = tab_state.aggregate.path.replace("root.xml",`event-handlers/${tab_state.event.att_name}.xml`);
        if (!(path in model)){
            model[path] = {};
        }
        model[path][HANDLER] = tab_state.handler;
    },
    switch_handler_type: blockingDecorator(function(){
        if ('att_code' in tab_state.handler){
          delete tab_state.handler.att_code;
        }else{
          tab_state.handler.att_code = '';
          tab_state.handler.mapping = [];
          tab_state.handler[NESTED_MAPPING] = [];
          delete tab_state.handler['att_business-key'];
        };
        tab_state.aggregate.handlers = tab_state.aggregate.handlers.map(x => {
            if (x.att_on == tab_state.handler.att_on){
                return tab_state.handler;
            } else {
                return x;
            }
        });
    }),
    create_new_event: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Domain event name must be PascalCased");
            return;
        }
        let events = Events.list().map(x => x.att_name);
        if(events.includes(name)){
            Session.show_exception("This domain already contains an event with the name: " + name);
            return;
        }
        let aggregate = tab_state.aggregate;
        let path = aggregate.path.replace("root.xml",`events/${name}.xml`);
        let event = {
          att_name: name,
          att_source: `${aggregate.subdomain}.${aggregate.root.att_name}`,
          att_type: "DomainEvent",
          field:[{
            att_name: "newField",
            att_type: "String"
          }],
          "nested-object": []
        }
        model[path] = {event:event};
        Navigation.fresh_reload(aggregate.path);
        tab_state.view = 'events';
        tab_state.selected_event = event.att_name;
        tab_state.event = event;
        tab_state.handler = {
            att_on: name,
            mapping: [],
            "nested-mapping": []
        };
        path = aggregate.path.replace("root.xml",`event-handlers/${name}.xml`);
        model[path] = {};
        model[path][HANDLER] = tab_state.handler;
    }),
    delete_event: blockingDecorator(function(){
        let name = tab_state.selected_event;
        let aggregate = tab_state.aggregate;
        let event_path = aggregate.path.replace("root.xml",`events/${name}.xml`);
        let handler_path = aggregate.path.replace("root.xml",`event-handlers/${name}.xml`);
        delete model[event_path];
        delete model[handler_path];
        Navigation.fresh_reload(aggregate.path);
        tab_state.view = 'events';
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Aggregates.load_navigation();
});

document.addEventListener('tracepaper:model:prepare-save', () => {
    Aggregates.list().forEach(aggregate => {
        aggregate.root.att_name = aggregate.name;
        if (aggregate.root['att_backup-interval-days'] == 0){
            aggregate.root['att_backup-ttl-days'] = 0;
        }
        aggregate.root.field.forEach(field => {
            delete field.att_pk;
        });
        aggregate.entities.forEach(entity => {
            entity.field.forEach(field => {
                delete field.att_pk;
            });
        });
        aggregate.handlers.forEach(handler => {
            try{
            let path = aggregate.path.replace("root.xml",`event-handlers/${handler.att_on}.xml`);
            let check = make_sure_is_list(handler[NESTED_MAPPING]).length;
            handler[NESTED_MAPPING] = make_sure_is_list(handler[NESTED_MAPPING]).filter(x => x.mapping.length != 0);
            if (!handler.att_code && handler[NESTED_MAPPING].length == 0 && handler.mapping.length == 0){
                FileSystem.hardDelete(path);
            } else if (check != make_sure_is_list(handler[NESTED_MAPPING]).length){
                let obj = {};
                obj[HANDLER] = handler;
                FileSystem.hardWrite(path, obj);
            }
            }catch(err){console.error(err)}
        });
    });
});