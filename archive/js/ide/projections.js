
window.Projection = {
    prepare: function(projection){
        projection['input'] = make_sure_is_list(projection['input']);
        return projection;
    },
    rename: async function(model,name,namespace){
        if(!name){name = model.att_name};
        if(!namespace){namespace = model['att_graphql-namespace']};
        if (!check_pattern(name,pascal_cased) || !check_pattern(namespace,graphql_namespace)){
            Session.show_exception("Invalid name!");
            return;
        }
        let file = "projections/" + namespace.replaceAll(".","/") + "/" + name + ".xml";
        if(file == session.tab){return}
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        model.att_name = name;
        model['att_graphql-namespace'] = namespace;
        await sleep(1);
        await Modeler.sync_to_disk();
        await Modeler.rename(session.tab,file);
        await Modeler.rename(session.tab.replace('.xml','.md'),file.replace('.xml','.md'));
        try{
            await Modeler.sync_to_disk();
        }catch{}
        Navigation.rename(session.tab,file);
    },
    create: async function(data){
            if (!check_pattern(data.namespace,graphql_namespace) || !check_pattern(data.name,pascal_cased)){
                Session.show_exception("Invalid configuration, projection not created!");
                return;
            }
            let file = "projections/" + data.namespace.replaceAll(".","/") + "/" + data.name + ".xml";
            if (await Modeler.exists(file)){
                Session.show_exception("File already exists, will not overwrite <br>" + file);
                return;
            }
            let projection = {
                "att_name": data.name,
                "att_graphql-namespace": data.namespace,
                "att_field-name": data.name.charAt(0).toLowerCase() + data.name.slice(1),
                "att_authorization": "authenticated",
                "att_code": projection_code_template
            };
            projection = {projection:projection};
            await Modeler.save_model(file,projection);
            await sleep(1000);
            Navigation.open(file);
        }
}