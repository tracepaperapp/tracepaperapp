
window.Aggregate = {
    get_entities: async function(root){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith(root.replace("root.xml","entities/")) && x.endsWith(".xml"));
        let entities = [];
        for (let i = 0; i < files.length; i++){
            entities.push(await Modeler.get(files[i],true));
        }
        return entities;
    },
    rename_entity: async function(root,entity,name){
        if (!check_pattern(name,lower_or_camel_cased)){
            Session.show_exception("Invalid name, changes not saved!");
            return;
        }
        let oldPath = root.replace("root.xml","entities/") + entity.att_name + ".xml";
        let newPath = root.replace("root.xml","entities/") + name + ".xml";
        if (oldPath == newPath){
            console.log("Do nothing!");
            return;
        }
        if (await Modeler.exists(newPath)){
            Session.show_exception("File already exists, will not overwrite <br>" + newPath);
            return;
        }
        Modeler.auto_save = false;
        entity.att_name = name;
        await Modeler.sync_to_disk();
        await Modeler.rename(oldPath, newPath);
        try{
            await Modeler.sync_to_disk();
        }catch{}
        Navigation.reload(root);
    },
    creat_collection: async function(root,name){
        let newPath = root.replace("root.xml","entities/") + name + ".xml";
        if (await Modeler.exists(newPath)){
            Session.show_exception("File already exists, will not overwrite <br>" + newPath);
            return;
        }
        await Modeler.save_model(newPath,{
            "nested-object": {
                att_name: name,
                field: {}
            }
        });
        Navigation.reload(root);
    },
    delete_entity: async function(root,entity){
        let path = root.replace("root.xml","entities/") + entity.att_name + ".xml";
        await Modeler.delete(path);
    },
    delete: async function(root){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith(root.replace("root.xml","")));
        for (let i = 0; i < files.length; i++){
            await FileSystem.delete(files[i]);
        }
    },
    create: async function(data){
        if (!check_pattern(data.subdomain,pascal_cased) || !check_pattern(data.aggregate,pascal_cased) || !check_pattern(data.key,lower_or_camel_cased)){
            Session.show_exception("Invalid configuration, aggregate not created!");
            return;
        }
        let file = "domain/" + data.subdomain + "/" + data.aggregate + "/root.xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let aggregate = {};
        aggregate.att_name = data.aggregate;
        aggregate.field = [];
        aggregate["att_business-key"] = data.key;
        aggregate["att_event-ttl"] = -1;
        aggregate["att_snapshot-interval"] = 100;
        aggregate["att_backup-interval-days"] = 0;
        aggregate["att_backup-ttl-days"] = 0;
        if (data.copy && data.source){
            let source = await Modeler.get(data.source,true);
            if (data.source.startsWith("command")){
                aggregate.field = deepcopy(source.field);
                for (let i = 0; i < source["nested-object"].length; i++){
                    let entity = "domain/" + data.subdomain + "/" + data.aggregate + "/entities/" + source["nested-object"][i].att_name + ".xml";
                    await Modeler.save_model(entity,{"nested-object":source["nested-object"][i]});
                }
            }
            if (data.source.includes("/entities/")){
                aggregate.field = deepcopy(source.field);
            }
            if (data.source.endsWith("root.xml")){
                aggregate.field = deepcopy(source.field);
                let files = await FileSystem.listFiles();
                files = files.filter(x => x.startsWith(data.source.replace("root.xml","entities/")) && x.endsWith(".xml"));
                for (let i = 0; i < files.length; i++){
                    let source = await Modeler.get(files[i],true);
                    let entity = "domain/" + data.subdomain + "/" + data.aggregate + "/entities/" + source.att_name + ".xml";
                    await Modeler.save_model(entity,{"nested-object":source});
                }
            }
        }
        let key_field = {
            att_name: data.key,
            att_type: "String"
        }
        if (!aggregate.field.includes(key_field)){
            aggregate.field.unshift(key_field);
        }
        aggregate = {aggregate:aggregate};
        await Modeler.save_model(file,aggregate);
        await sleep(1000);
        Navigation.open(file);
    },
    isMapped: function(field,mapping){
        try{
            return mapping.mapping.filter(x => x.att_target == field.att_name).length != 0 ||
                mapping['nested-mapping'].filter(x => x.att_target == field.att_name).length != 0;
        }catch{
            return false;
        }
    },
    get_event_handler_mapping: function(field,mapping){
        let map = mapping.mapping.filter(x => x.att_target == field.att_name).at(0)
        if (!map){
            map = mapping['nested-mapping'].filter(x => x.att_target == field.att_name).at(0);
        }
        if (!map){
            map = {};
        }
        return map;
    },
    create_event: async function(data){
            if (!check_pattern(data.subdomain,pascal_cased) || !check_pattern(data.selected_aggregate,pascal_cased) || !check_pattern(data.event,pascal_cased)){
                Session.show_exception("Invalid configuration, event not created!");
                return;
            }
            let file = "domain/" + data.subdomain + "/" + data.selected_aggregate + "/events/" + data.event + ".xml";
            let check = await Modeler.event_exists(data.event);
            if (check){
                Session.show_exception("Event with name: "+ data.event +" already exists");
                return;
            }
            let event = {};
            event.att_name = data.event;
            event.att_source = data.subdomain + "." + data.selected_aggregate;
            let root = "domain/" + data.subdomain + "/" + data.selected_aggregate + "/root.xml";
            let source = await Modeler.get(root,true);
            event.field = deepcopy(source.field);
            event["nested-object"] = [];
            let files = await FileSystem.listFiles();
            files = files.filter(x => x.startsWith(root.replace("root.xml","entities/")) && x.endsWith(".xml"));
            for (let i = 0; i < files.length; i++){
                let source = await Modeler.get(files[i],true);
                delete source["att_business-key"];
                event["nested-object"].push(source);
            }
            event = {"event":event};
            await Modeler.save_model(file,event);
            await sleep(1000);
            Navigation.open(file);
        },
    create_event_handler: async function(file,model){
        let handler = {};
        handler.att_on = model.att_name;
        handler.mapping = [];
        handler["nested-mapping"] = [];
        let root = file.split("events/").at(0) + "root.xml";
        let document = await Modeler.get(root,true);
        let root_fields = model.field.map(x => x.att_name);
        document.field.filter(x => root_fields.includes(x.att_name) ).forEach(x => {
            handler.mapping.push({
                att_target: x.att_name,
                att_value: x.att_name,
                att_operand: "set"
            });
        });
        for (let i = 0; i < model["nested-object"].length; i++){
            let source = root.replace("root.xml","entities/") + model["nested-object"][i].att_name + ".xml";
            source = await Modeler.get(source,true);
            let nested = {};
            nested.att_source = model["nested-object"][i].att_name;
            nested.att_target = model["nested-object"][i].att_name;
            nested.mapping = [];
            let fields = model["nested-object"][i].field.map(x => x.att_name);
            source.field.filter(x => fields.includes(x.att_name)).forEach(x => {
                nested.mapping.push({
                    att_target: x.att_name,
                    att_value: x.att_name,
                    att_operand: "set"
                });
            });
            if (fields.includes(source["att_business-key"])){
                nested["att_business-key"] = source["att_business-key"];
            }
            if (nested.mapping.length != 0){
                handler["nested-mapping"].push(nested);
            }
        }
        handler = {"event-handler": handler};
        await Modeler.save_model(file.replace("/events/","/event-handlers/"),handler);
        Navigation.reload(file);
    },
    delete_event: async function(event){
        await FileSystem.delete(event);
        await FileSystem.delete(event.replace(".xml",".md"));
        await FileSystem.delete(event.replace("/events/","/event-handlers/"));
    },
    list_subdomains: async function(){
        let files = await FileSystem.listFiles();
        let domain = [];
        files.filter(x => x.startsWith("domain/") && x.endsWith("root.xml")).forEach(x => {
            let sub = x.split("/").at(1);
            if (!domain.includes(sub)){
                domain.push(sub);
            }
        });
        return domain;
    },
    list_aggregates: async function(sub){
        let files = await FileSystem.listFiles();
        let aggregates = [];
        files.filter(x => x.startsWith("domain/" + sub + "/") && x.endsWith("root.xml")).forEach(x => {
            let aggregate = x.split("/").at(2);
            if (!aggregates.includes(aggregate)){
                aggregates.push(aggregate);
            }
        });
        return aggregates;
    }
}