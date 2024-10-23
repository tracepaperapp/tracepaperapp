
window.Command = {
    prepare: function(command){
        command['field'] = make_sure_is_list(command['field']);
        command['nested-object'] = make_sure_is_list(command['nested-object']);
        command['nested-object'].forEach(entity => {
            entity.field = make_sure_is_list(entity.field);
        });
        return command;
    },
    refactor_field_name: async function(command,oldName,newName){
        if (oldName == newName){return}
        command.field.filter(x => x.att_name == oldName).forEach(x => x.att_name = newName);
        let files = await FileSystem.listFiles();
        files.filter(x => x.includes('/behavior-flows/') || x.startsWith("notifiers/")).filter(x => x.endsWith(".xml")).forEach(async x => {
            let model = await Modeler.get(x);
            model.trigger.forEach(trigger => {
                if (trigger.att_source == command.att_name){
                    trigger.mapping.filter(x => x.att_value == oldName).forEach(x => {
                        x.att_value = newName;
                    })
                }
            });
        });
    },
    rename: async function(command,name,namespace){
        if (!check_pattern(namespace,graphql_namespace) || !check_pattern(name,lower_or_camel_cased)){
            Session.show_exception("Invalid API path, changes not saved!");
            return;
        }
        let oldPath = "commands/" + command['att_graphql-namespace'].replaceAll('.','/') + "/" + command.att_name;
        let eventName = capitalizeFirstLetter(name) + namespace.replaceAll('.','') + "Requested";
        let oldEvent = command.att_name;
        let newPath = "commands/" + namespace.replaceAll('.','/') + "/" + eventName;
        if (oldPath == newPath){
            console.log("Do nothing!");
            return;
        }
        if (await Modeler.exists(newPath + ".xml")){
            Session.show_exception("File already exists, will not overwrite <br>" + newPath + ".xml");
            return;
        }
        Modeler.auto_save = false;
        command['att_graphql-namespace'] = namespace;
        command['att_graphql-name'] = name;
        command.att_name = eventName;
        await Modeler.sync_to_disk();
        await Modeler.rename(oldPath + ".xml", newPath + ".xml");
        await Modeler.rename(oldPath + ".md", newPath + ".md");
        let files = await FileSystem.listFiles();
        files.filter(x => x.includes('/behavior-flows/') || x.startsWith("notifiers/")).filter(x => x.endsWith(".xml")).forEach(async x => {
            let model = await Modeler.get(x);
            model.trigger.forEach(trigger => {
                if (trigger.att_source == oldEvent){
                    trigger.att_source = eventName;
                }
            });
        });
        await sleep(100);
        await Modeler.sync_to_disk();
        Navigation.rename(oldPath + ".xml", newPath + ".xml");
    },
    create: async function(data){
        if (!check_pattern(data.namespace,graphql_namespace) || !check_pattern(data.name,lower_or_camel_cased)){
            Session.show_exception("Invalid API path, command not created!");
            return;
        }
        let eventName = capitalizeFirstLetter(data.name) + data.namespace.replaceAll('.','') + "Requested";
        let file = "commands/" + data.namespace.replaceAll('.','/') + "/" + eventName + ".xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file + ".xml");
            return;
        }
        let command = {};
        command['att_graphql-namespace'] = data.namespace;
        command['att_graphql-name'] = data.name;
        command.att_name = eventName;
        command = Command.prepare(command);
        if (data.copy && data.source){
            let source = await Modeler.get(data.source,true);
            if (data.source.startsWith("command")){
                command.field = deepcopy(source.field);
                command["nested-object"] = deepcopy(source["nested-object"]);
            }
            if (data.source.includes("/entities/")){
                command.field = deepcopy(source.field);
                let root = data.source.split("entities/").at(0) + "root.xml";
                source = await Modeler.get(root,true);
                command.field.unshift({
                    att_name: source["att_business-key"],
                    att_type: "String"
                });
            }
            if (data.source.endsWith("root.xml")){
                command.field = deepcopy(source.field);
                let files = await FileSystem.listFiles();
                files = files.filter(x => x.startsWith(data.source.replace("root.xml","entities/")) && x.endsWith(".xml"));
                for (let i = 0; i < files.length; i++){
                    let source = await Modeler.get(files[i],true);
                    command["nested-object"].push(source);
                }
            }
        }
        command = {event:command};
        await Modeler.save_model(file,command);
        Navigation.open(file);
    }
}