
window.Views = {
    list: function(){
        return Object.keys(model).filter(key => key.startsWith("views/")).map(key => Views.get(key));
    },
    load_navigation: function(){
        let updated = Object.keys(model).filter(key => key.startsWith('views/')).map(key => key.replace("views/","").replace(".xml",""));
        session.view_names = updated;
    },
    create_new: blockingDecorator(function(){
        let name = "NewView";
        let path = "views/" + name + ".xml";
        let doc = "views/" + name + ".md";
        let added = Modeler.insert_model(path,{
            "view": {
                "att_name": "NewView"
            }
        });
        Modeler.insert_documentation(doc,"~~View model template~~");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },500);
        }
    }),
    get: function(path){
        let view = model[path]["view"];
        view.field = make_sure_is_list(view.field);
        view[SNAPSHOT_HANDLER] = make_sure_is_list(view[SNAPSHOT_HANDLER]);
        view[SNAPSHOT_HANDLER].forEach( handler => {
            handler.mapping = make_sure_is_list(handler.mapping);
            handler.delete = make_sure_is_list(handler.delete);
        });
        view[CUSTOM_HANDLER] = make_sure_is_list(view[CUSTOM_HANDLER]);
        view.query = make_sure_is_list(view.query);
        view.query.forEach( query => {
            query[QUERY_FILTER] = make_sure_is_list(query[QUERY_FILTER]);
        });
        return view;
    },
    load: function(file){
        tab_state.view = Views.get(file);
        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);
        session.type = "view";
        if(!tab_state.mode){tab_state.mode="model"};
    },
    remove: blockingDecorator(function(){
        delete model[session.tab];
        delete documentation[session.tab.replace(".xml",".md")];
        Navigation.execute_close_tab(session.tab);
    }),
    rename: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("View must be PascalCased");
            return;
        }

        let oldPath = session.tab;
        let newPath = "views/" + name + ".xml";

        tab_state.view.att_name = name;

        model[newPath] = model[oldPath];
        delete model[oldPath];
        documentation[newPath.replace(".xml",".md")] = documentation[oldPath.replace(".xml",".md")];
        delete documentation[oldPath.replace(".xml",".md")];

        Navigation.execute_close_tab(oldPath);
        Navigation.execute_open_tab(newPath);
        Modeler.render();
    }),
    change_primary_key: blockingDecorator(function(fieldName){
        tab_state.view.field = tab_state.view.field.map(x => {
            if (x.att_name == fieldName){
                x.att_pk = "true";
            } else {
                delete x.att_pk;
            }
            return x;
        });
    }),
    add_field: blockingDecorator(function(){
        tab_state.view.field.push({att_name: 'field-' + makeid(4), att_type: 'String'})
    }),
    get_aggregate_documents: function(){
        let aggregates = Aggregates.list();
        let templates = [];
        aggregates.forEach(aggregate => {
            templates.push(`${aggregate.subdomain}.${aggregate.root.att_name}.root`);
            aggregate.entities.forEach(entity => {
                templates.push(`${aggregate.subdomain}.${aggregate.root.att_name}.${entity.att_name}`);
            });
        });
        return templates;
    },
    copy_aggregate_document_attributes: blockingDecorator(function(documentId){
            let path = documentId.split(".");
            let aggregate = Aggregates.get(`domain/${path[0]}/${path[1]}/root.xml`);
            let registered_attributes = tab_state.view.field.map(x => x.att_name);
            let entity = aggregate.root;
            if (path[2] != "root"){
                entity = aggregate.entities.filter(x => x.att_name == path[2]).at(0);
            }
            entity.field.filter(x => !registered_attributes.includes(x.att_name)).forEach(x => {
                tab_state.view.field.push(x);
            });
        }),
    remove_data_source: blockingDecorator(function(handler){
        tab_state.view["snapshot-handler"] = tab_state.view["snapshot-handler"].filter(x => x != handler);
        tab_state.view["custom-handler"] = tab_state.view["custom-handler"].filter(x => x != handler);
    }),
    update_delete_condition: blockingDecorator(function(handler,delete_condition){
        if (delete_condition && delete_condition != ""){
            handler.delete = [{
                att_condition: delete_condition
            }];
        }else{
            handler.delete = [];
        }
    }),
    change_mapping: blockingDecorator(function(handler,mapping,operand){
        if (operand == "unmapped"){
            handler.mapping = handler.mapping.filter(x => x.att_target != mapping.att_target);
        } else {
            mapping.att_operand = operand;
        }
    }),
    add_mapping: blockingDecorator(function(handler,field,operand,aggregate){
            console.log("--->",handler,field,operand,aggregate)
            let value = aggregate.root.field.filter(x => x.att_name == field.att_name).length != 0 ? field.att_name : aggregate.field.at(0).att_name;
            handler.mapping.push({
                att_target: field.att_name,
                att_operand: operand,
                att_value: value
            });
        }),
    add_convert_item_mapping: blockingDecorator(function(handler,field,operand,aggregate){
        let sources = aggregate.entities.filter(x => x.att_name == field.att_name);
        let collection = sources.length != 0 ? sources.at(0) : aggregate.entities.at(0);
        let values = collection.field.map(x => x.att_name);
        let reference = Views.get('views/' + field.att_ref + '.xml');
        let template = Views.create_new_template(reference,values);
        handler.mapping.push({
            att_target: field.att_name,
            att_operand: operand,
            att_value: collection.att_name ,
            att_template: template
        });
    }),
    update_convert_item_mapping: blockingDecorator(function(handler,field,source,aggregate){
        handler.mapping = handler.mapping.filter(x => x.att_target != field.att_name);

        let sources = aggregate.entities.filter(x => x.att_name == source);
        let collection = sources.length != 0 ? sources.at(0) : aggregate.entities.at(0);
        let values = collection.field.map(x => x.att_name);
        let reference = Views.get('views/' + field.att_ref + '.xml');
        let template = Views.create_new_template(reference,values);
        handler.mapping.push({
            att_target: field.att_name,
            att_operand: "convert_items",
            att_value: collection.att_name ,
            att_template: template
        });
    }),
    create_new_template: function(reference,values){
            console.log(reference);
            let template = "{";
            reference.field.filter(x => field_types.includes(x.att_type)).forEach(ref => {
                let value = 'value["' + (values.includes(ref.att_name) ? ref.att_name : values.at(0)) + '"]';
                template += `"${ref.att_name}": ${value},`;
            });
            if (template.endsWith(",")){
                template = template.substring(0,template.length-1);
            }
            template += '}';
            return template;
        },
    update_template: blockingDecorator(function(mapping,template,target,source){
            let update = "{";
            for (const [key, value] of Object.entries(template)) {
              if (key == target && source != ""){
                update += `"${key}": value["${source}"],`;
              } else if (key != target){
                update += `"${key}": value["${value}"],`;
              }
            }
            if (update.endsWith(",")){
                update = update.substring(0,update.length-1);
            }
            update += '}';
            console.log(update);
            mapping.att_template = update;
        }),
    add_data_source: blockingDecorator(function(aggregate){
        let key = Views.get_key_field(aggregate);

        let mapping = [];
        tab_state.view.field.forEach(field => {
            if (field.att_type == 'ObjectList' && aggregate.entities.filter(x => field.att_name == x.att_name).length != 0 ){
                let collection = aggregate.entities.filter(x => x.att_name == field.att_name).at(0);
                let values = collection.field.map(x => x.att_name);
                let reference = Views.get('views/' + field.att_ref + ".xml");
                let template = Views.create_new_template(reference,values);
                mapping.push({
                    att_target: field.att_name,
                    att_operand: "convert_items",
                    att_value: collection.att_name,
                    att_template: template
                });
            } else if (aggregate.root.field.filter(x => field.att_name == x.att_name).length != 0){
                mapping.push({
                    att_target: field.att_name,
                    att_operand: "set",
                    att_value: field.att_name
                });
            }
        });

        tab_state.view["snapshot-handler"].push({
            "att_id": makeid(6),
            "att_sub-domain": aggregate.subdomain,
            "att_aggregate": aggregate.root.att_name,
            "att_key-mapping": key,
            "att_processor": "item",
            "mapping": mapping,
            "delete": [{
                "att_condition": "#snapshot.isDeleted != ''"
            }]
        });
    }),
    add_code_source: blockingDecorator(function(aggregate){
       let code = Views.get_initial_inline_code(aggregate);
       tab_state.view["custom-handler"].push({
           "att_id": makeid(6),
           "att_sub-domain": aggregate.subdomain,
           "att_aggregate": aggregate.root.att_name,
           "#text": code
       });
   }),
    get_key_field: function(aggregate){
        let pk = tab_state.view.field.filter(x => x.att_pk == "true").map(x => x.att_name);
        let keys = aggregate.root.field.filter(x => pk.includes(x.att_name));
        let key = keys.length != 0 ? keys.at(0).att_name : aggregate.root.field.at(0).att_name;
        return key;
    },
    get_initial_inline_code: function(aggregate){
            let view_key = Views.get_key_field(aggregate);
            let code = "#Your custom logic, you have access to:\n#  The 'event' object\n#  The 'snapshot' object\n#  And the EntityManager\n";
            code += `entity = EntityManager.get(type="${tab_state.view.att_name}", key=snapshot.${view_key})\n`;
            let values = aggregate.root.field.map(x => x.att_name);
            tab_state.view.field.filter(x => values.includes(x.att_name)).forEach(x =>{
                code += `entity.${x.att_name} = snapshot.${x.att_name}\n`;
            });
            code += "if snapshot.isDeleted != '':\n    entity.mark_for_deletion = True";
            return code;
        },
    change_handler_type: blockingDecorator(function(handler,type,aggregate){
            if (type == 'Global Module'){
                if (!('att_python-file' in handler)){
                    handler['att_python-file'] = "";
                    handler['att_method'] = "";
                }
                delete handler["#text"];
            } else {
                delete handler['att_python-file'];
                delete handler['att_method'];
                let code = Views.get_initial_inline_code(aggregate);
                handler["#text"] = code;
            }
        }),
    add_relation: blockingDecorator(function(){
        tab_state.view.field.push({
            att_name: 'field-' + makeid(4),
            att_type: 'ObjectList',
            att_ref: tab_state.view.att_name,
            att_authorization: 'authenticated',
            'att_foreign-key': tab_state.view.field.at(0).att_name
        })
        tab_state.mode = "";
        setTimeout(function(){
            tab_state.mode = "relation";
        },1);
    }),
    add_query: blockingDecorator(function(type){
        let name = type == 'query' ? 'method-' + makeid(4) : type;
        let namespace = tab_state.view.query.length != 0 ? tab_state.view.query.at(0)['att_graphql-namespace'] : tab_state.view.att_name;
        tab_state.view.query.push({
            'att_graphql-namespace' : namespace,
            'att_field-name': name,
            'att_type' : type,
            'filter-clause': [],
            'att_authorization': 'authenticated'
        });
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Views.load_navigation();
    setTimeout(Views.load_navigation,1000);
});