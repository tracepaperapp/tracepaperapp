
window.Projections = {
    load_projections: function(){
        session.projection_names = [];
        Object.keys(model).filter(key => key.startsWith('projections/')).forEach(key => {
            let name = key.replace("projections/","").replace(".xml","");
            session.projection_names.push(name);
        });
    },
    load: function(file){
        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);
        tab_state.projection = Projections.get(file);
        session.type = "projection";
    },
    list: function(){
        return Object.keys(model).filter(key => key.startsWith("projections/")).map(key => Projections.get(key))
    },
    get: function(path){
        let projection = model[path]["projection"];
        projection['input'] = make_sure_is_list(projection['input']);
        return Alpine.reactive(projection);
    },
    create_new: blockingDecorator(function(){
        let name = "NewProjection";
        let path = "projections/" + name + ".xml";
        let doc = "projections/" + name + ".md";
        let added = Modeler.insert_model(path,{
            "projection": {
                "att_graphql-namespace": "Projection",
                "att_field-name": "new",
                "att_authorization": "authenticated",
                "att_return": "NewFunctionRequested",
                "att_name": "NewProjection",
                "att_code": projection_code_template,
                input: []
            }
        });
        Modeler.insert_documentation(doc,"~~Projection model template~~");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },500);
        }
    }),
    remove: blockingDecorator(function(){
        delete model[session.tab];
        delete documentation[session.tab.replace(".xml",".md")];
        Navigation.execute_close_tab(session.tab);
    }),
    rename: blockingDecorator(function(name){
        if(name == tab_state.projection.att_name){return}
        let oldPath = session.tab;
        let newPath = "projections/" + name + ".xml";

        tab_state.projection.att_name = name;

        model[newPath] = model[oldPath];
        delete model[oldPath];
        documentation[newPath.replace(".xml",".md")] = documentation[oldPath.replace(".xml",".md")];
        delete documentation[oldPath.replace(".xml",".md")];

        Navigation.execute_close_tab(oldPath);
        Navigation.execute_open_tab(newPath);
        Modeler.render();
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Projections.load_projections();
    setTimeout(Projections.load_projections,1000);
});
