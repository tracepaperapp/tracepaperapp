
const summary_cache = {};

window.Modeler = {
    initialize: function(){
        session.projectName = model["config.xml"]["draftsman"]["att_project-name"];
    },
    get_summary: function(){
            let summary = {};

            summary["commands"] = session.command_names.length;
            summary["subdomains"] = session.subdomain_names.length;
            let aggregates = Aggregates.list();
            summary["aggregates"] = aggregates.length;
            let domain_events = 0;
            aggregates.forEach(aggregate => {
                domain_events += aggregate.events.length;
            });
            summary["domainEvents"] = domain_events;
            summary["views"] = session.view_names.length;
            summary["notifiers"] =  session.notifier_names.length;
            return summary;
        },
    open_readme: function(){
        tab_state.summary = Modeler.get_summary();
        Modeler.load_documentation("README.md");
        session.type = "readme";
    },
    load_documentation: function(doc){
        if (!(doc in documentation)) {
            documentation[doc] = {content:""};
        }
        session.documentation = documentation[doc];
    },
    get_json_schema: function(element){

        try{
            var schema = {
                type: 'object',
                title: element.att_name,
                properties: {}
            };
            element.field.forEach(field => {
                        schema.properties[field.att_name] = {
                            type: field.att_type
                        };
                        if (element["att_business-key"] == field.att_name){
                            schema.properties[field.att_name]["description"] = "This attribute is used as business-key";
                        }
                    });

                    element[NESTED] = make_sure_is_list(element["nested-object"]);
                    element[NESTED].forEach(entity => {
                        var entity_schema = {
                            type: 'object',
                            title: entity.att_name,
                            description: 'A collection within the object.',
                            properties: {
                                "{{entity_key}}": {
                                    type: 'object',
                                    properties: {}
                                }
                            }
                        };
                        make_sure_is_list(entity.field).forEach(field => {
                            entity_schema.properties["{{entity_key}}"].properties[field.att_name] = {
                                type: field.att_type
                            };
                            if (entity["att_business-key"] == field.att_name){
                                entity_schema.properties["{{entity_key}}"].properties[field.att_name]["description"] = "This attribute is used as business-key";
                            }
                        });
                        schema.properties[entity.att_name] = entity_schema;
                    });

                    return schema;
        }catch(err){
            console.error(err);
            return {};
        }

    },
    get_document_entity: function(document_model,nested_documents,selected_entity){
        try{
            if (nested_documents.filter(x => x.att_name == selected_entity).length != 0){
                return nested_documents.filter(x => x.att_name == selected_entity).at(0);
            }
        }catch{}
        if (document_model){
            return document_model;
        }
        return {};
    },
    summary: function(path){
        if (path in summary_cache){
            return summary_cache[path];
        }
        var summary = "";
        if (path in documentation){
            summary = documentation[path].content;
        }
        summary = summary.split("\n").filter(x => !x.startsWith('#')).join("\n");
        if (summary.length > 300){
            summary = summary.substr(0, 300) + "...";
        }
        summary_cache[path] = summary;
        return summary;
    },
    get_child_models: function(path,root,initializer=null){
        return Object.keys(model)
            .filter(key => key.startsWith(path))
            .map(key => {
                let element = model[key][root];
                if (initializer){
                    initializer(element);
                }
                if ("att_name" in model[key][root]){
                    model[key][root]["att_name"] = key.split("/").at(-1).replace(".xml","");
                }
                return element;
            });
    },
    insert_model: function(path,element){
        if (path in model){
            session.exception = "Could not initialize file [" + path + "] because it already exist.";
            return false;
        }
        model[path] = element;
        document.dispatchEvent(new CustomEvent('tracepaper:model:loaded'));
        return true;
    },
    insert_documentation: function(path,content){
        if (path in documentation){
            session.exception = "Could not initialize file [" + path + "] because it already exist.";
            return false;
        }
        documentation[path] = {content:content};
        document.dispatchEvent(new CustomEvent('tracepaper:model:loaded'));
        return true;
    },
    render: function(){
        setTimeout(function(){
            document.dispatchEvent(new CustomEvent('tracepaper:model:loaded'));
        },1000);
    },
    register_role: blockingDecorator(function(name){
            if (!name.match(camel_cased)){
               let message = "Role name must be camel cased";
               Session.show_exception(message);
               return
            }
            if (!('roles' in meta)){
                meta.roles = [];
            }
            if (!(name in meta.roles)){
                meta.roles.push(name);
            }
        })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    try{
        Modeler.initialize();
    }catch{}
});