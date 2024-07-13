
window.View = {
    prepare: function(view){
        view.field = make_sure_is_list(view.field);
        view[SNAPSHOT_HANDLER] = make_sure_is_list(view[SNAPSHOT_HANDLER]);
        view[SNAPSHOT_HANDLER].forEach( handler => {
            handler.mapping = make_sure_is_list(handler.mapping);
            handler.delete = make_sure_is_list(handler.delete);
            handler.delete.forEach(d => {
                if (!d.att_id){
                    d.att_id = makeid(6);
                }
            });
            if (!handler.att_id){
                handler.att_id = makeid(6);
            }
        });
        view[CUSTOM_HANDLER] = make_sure_is_list(view[CUSTOM_HANDLER]);
        view[CUSTOM_HANDLER].forEach( handler => {
            if (!handler.att_id){
                handler.att_id = makeid(6);
            }
        });
        view.query = make_sure_is_list(view.query);
        view.query.forEach( query => {
            query[QUERY_FILTER] = make_sure_is_list(query[QUERY_FILTER]);
            query[QUERY_FILTER].forEach(x => {
                if (!x.att_id){
                    x.att_id = makeid(6);
                }
            });
        });
        if (!view["att_data-retention-days"]){view["att_data-retention-days"] = -1}
        if (!view["att_exclude-notification"]){view["att_exclude-notification"] = "false"}
        return view;
    },
    list: async function(){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.startsWith("views/") && x.endsWith(".xml")).map(x => x.split('/').at(-1).replace('.xml',''));
    },
    get_eligible_key_fields: async function(handler){
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let model = null;
        if (handler.att_processor == "item"){
            model = await Modeler.get(file,true);
        } else {
            let entities = await Aggregate.get_entities(file);
            model = entities.filter(x => x.att_name == handler.att_dictionary).at(0);
        }
        return model.field.filter(x => x.att_type == "String").map(x => x.att_name);
    },
    get_collections: async function(handler,force=true){
        if (force || handler.att_processor == "dictionary"){
            let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
            let entities = await Aggregate.get_entities(file);
            return entities.map(x => x.att_name);
        }
    },
    get_mapping: function(handler,field){
        let mappings = handler.mapping.filter(x => x.att_target == field.att_name);
        if (mappings.length != 0){
            return mappings.at(0);
        }
        return {};
    },
    get_aggregate_fields: async function(handler){
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let model = null;
        if (handler.att_processor == "item"){
            model = await Modeler.get(file,true);
        } else {
            let entities = await Aggregate.get_entities(file);
            model = entities.filter(x => x.att_name == handler.att_dictionary).at(0);
        }
        return model.field.map(x => x.att_name);
    },
    get_aggregate_entity_fields: async function(handler,mapping){
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let entities = await Aggregate.get_entities(file);
        let model = entities.filter(x => x.att_name == mapping.att_value).at(0);
        return model.field.map(x => x.att_name);
    },
    add_field: function(model,fieldName){
        if (model.field.filter(x => x.att_name == fieldName).length != 0){
            Session.show_exception("Field with name <i>" + fieldName + "</i> already present as field or relation");
            return;
        }
        model.field.push({att_name: fieldName, att_type: "String"});
    },
    add_relation: function(model,fieldName){
          if (model.field.filter(x => x.att_name == fieldName).length != 0){
              Session.show_exception("Field with name <i>" + fieldName + "</i> already present as field or relation");
              return;
          }
          model.field.push({att_name: fieldName, att_type: "ObjectList", att_ref: model.att_name});
      },
    get_default_mapping: async function(model,handler){
        handler.mapping = [];
        let fields = model.field.filter(x => view_field_types.includes(x.att_type) ||x.att_type == "ObjectList" ).map(x => x.att_name);
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let aggregate = await Modeler.get(file,true);
        aggregate.field.filter(x => fields.includes(x.att_name)).forEach(x => {
            handler.mapping.push({
                att_target: x.att_name,
                att_value: x.att_name,
                att_operand: "set"
            });
        });
        let entities = await Aggregate.get_entities(file);
        entities = entities.filter(x => fields.includes(x.att_name));
        for (let i = 0; i < entities.length;  i++) {
            let x = entities[i];
            let mapping = {
                att_target: x.att_name,
                att_value: x.att_name,
                att_operand: "convert_items"
            }
            let template = await View.read_template(model,handler,mapping,{});
            View.save_template(mapping,template);
            handler.mapping.push(mapping);
        }
    },
    read_template: async function(model,handler,mapping,template){
        if (template_read_block){
            return template;
        }
        template_read_block = true;
        try{
            if(mapping.att_template && Object.keys(template).length == 0){
                    mapping.att_template.replace('{','').replace('}','').replaceAll(" ","").replaceAll("\n","").replaceAll('&quot;','').replaceAll('"',"").replaceAll("'","").split(',').forEach(x => {
                        template[x.split(':').at(0)] = x.split(':').at(1).replace("value[","").replace("]","");
                      });
                }
            else {
                    let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
                    let entities = await Aggregate.get_entities(file);
                    let fields = entities.filter(x => x.att_name == mapping.att_value).at(0).field.map(x => x.att_name);
                    let view = model.field.filter(x => x.att_name == mapping.att_target).at(0).att_ref;
                    view = await Modeler.get_view_by_name(view);
                    view.field.forEach(x => {
                        if (!Object.keys(template).includes(x.att_name)){
                            template[x.att_name] = fields.includes(x.att_name) ? x.att_name : '';
                        }
                    });
                }
        } finally {
            template_read_block = false;
        }
        return template;
    },
    save_template: function(mapping,template){
        let mapping_template = '{\n';
        Object.keys(template).forEach( k => {
            mapping_template += `"${k}": value["${template[k]}"],\n`;
        });
        mapping_template += '}';
        mapping.att_template = mapping_template;
    },
    get_initial_inline_code: async function(model,handler){
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let aggregate = await Modeler.get(file,true);
        let view_key = aggregate["att_business-key"];
        let code = "#Your custom logic, you have access to:\n#  The 'event' object\n#  The 'snapshot' object\n#  And the EntityManager\n";
        code += `entity = EntityManager.get(type="${model.att_name}", key=snapshot.${view_key})\n`;
        let values = aggregate.field.map(x => x.att_name);
        model.field.filter(x => values.includes(x.att_name)).forEach(x =>{
            code += `entity.${x.att_name} = snapshot.${x.att_name}\n`;
        });

        let fields = model.field.filter(x => x.att_type == "ObjectList" );
        let entities = await Aggregate.get_entities(file);
        for (let i = 0; i < fields.length;  i++) {
            if (!entities.map(x => x.att_name).includes(fields[i].att_name)){continue}
            let entity = entities.filter(x => x.att_name == fields[i].att_name).at(0);
            code += `entity.${entity.att_name} = [{`;

            let view = await Modeler.get_view_by_name(fields[i].att_ref);
            view.field.filter(x => entity.field.map(x => x.att_name).includes(x.att_name)).forEach(x => {
                code += `\n\t\t"${x.att_name}": value["${x.att_name}"],`;
            });
            code = code.slice(0,-1);
            code += `\n\t}\n\tfor value in snapshot.${entity.att_name}.values()]\n`
        }

        code += "if snapshot.isDeleted != '':\n    entity.mark_for_deletion = True";
        return code;
    },
    rename: async function(file,oldNamespace,newNamespace){
        if (oldNamespace == newNamespace){return}
        let newPath = file.replace("views/" + oldNamespace.replaceAll(".","/"), "views/" + newNamespace.replaceAll(".","/"));
        await Modeler.rename(file,newPath);
        await Modeler.rename(file.replace('.xml','.md'),newPath.replace('.xml','.md'));
        try{
            await Modeler.sync_to_disk();
        }catch{}
        Navigation.rename(file,newPath);
    },
    add_query: async function(file,model,type,name){
        let namespace = file.replace('views/','').split('/').filter(x => !x.includes('.xml')).join('.');
        let path = namespace + "." + name;
        let views = await View.list();
        let paths = [];
        model.query.forEach( q => {
            paths.push(q['att_graphql-namespace'] + "." + q["att_field-name"]);
        });
        if (paths.includes(path)){
            Session.show_exception("Method " + name + " already registered in namespace " + namespace);
            return;
        }
        for(let i = 0; i < views.length; i++){
            let view = await Modeler.get_view_by_name(views[i],true);
            view.query.forEach( q => {
                paths.push(q['att_graphql-namespace'] + "." + q["att_field-name"]);
            });
            if (paths.includes(path)){
                Session.show_exception("Method " + name + " already registered in namespace " + namespace);
                return;
            }
        }
        model.query.push({
          "att_graphql-namespace": namespace,
          "att_field-name": name,
          "att_type": type,
          "att_authorization": "authenticated",
          "att_use-canonical-search": "false",
          "filter-clause": []
        });
    },
    create: async function(data){
        if (!check_pattern(data.namespace,graphql_namespace) || !check_pattern(data.name,pascal_cased)){
            Session.show_exception("Invalid configuration, view not created!");
            return;
        }
        let file = "views/" + data.namespace.replaceAll(".","/") + "/" + data.name + ".xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let view = {
            "att_name":data.name,
            "att_data-retention-days" : -1,
            "att_exclude-notification": "false"
        };
        view = {view:view};
        await Modeler.save_model(file,view);
        await sleep(1000);
        Navigation.open(file);
    },
    copy_attributes: async function(model,file){
        let source = await Modeler.get(file,true);
        let fields = model.field.map(x => x.att_name);
        source.field.filter(x => !fields.includes(x.att_name)).forEach(x => {
            model.field.push({
                att_name: x.att_name,
                att_type: x.att_type
            });
        });
    }
}

var template_read_block = false;