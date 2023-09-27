
window.Subdomains = {
    list: function(){
        let resultset = [];
        Object.keys(documentation).filter(key => key.startsWith('domain/') && key.endsWith("/README.md")).forEach(key => {
           resultset.push(key.split('/').at(1));
        });
        return resultset;
    },
    create_new: blockingDecorator(function(){
        let doc = "domain/NewSubdomain/README.md";
        let added = Modeler.insert_documentation(doc,"New Subdomain");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(doc);
            },500);
        }
    }),
    load: function(file){
        if (!(file in documentation)) {
            documentation[file] = {content:""};
        }
        session.documentation = documentation[file];
        session.type = "subdomain";
    },
    remove: blockingDecorator(function(){
        if (!session.tab.startsWith("domain/") && !session.tab.endsWith("/readme.md")){
            Session.show_exception("Could not remove subdomain: " + session.tab);
            return
        }
        let path = session.tab.replace("README.md","");
        Object.keys(model).filter(key => key.startsWith(path)).forEach(key => {delete model[key]});
        Object.keys(documentation).filter(key => key.startsWith(path)).forEach(key => {delete documentation[key]});
        Navigation.execute_close_tab(session.tab);
        Modeler.render();
    }),
    rename: blockingDecorator(function(name){
        if (!session.tab.startsWith("domain/") && !session.tab.endsWith("/readme.md")){
            Session.show_exception("Could not rename subdomain: " + session.tab);
            return
        }
        if (!name.match(pascal_cased)){
            Session.show_exception("Subdomain name must be PascalCased");
            return;
        }
        let oldPath = session.tab.replace("README.md","");
        let newPath = "domain/" + name + "/";
        Object.keys(model).filter(key => key.startsWith(oldPath)).forEach(key => {
            model[key.replace(oldPath,newPath)] = model[key];
            delete model[key];
        });
        Object.keys(documentation).filter(key => key.startsWith(oldPath)).forEach(key => {
            documentation[key.replace(oldPath,newPath)] = documentation[key];
            delete documentation[key];
        });
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(newPath + "README.md");
        session.subdomain_names = Subdomains.list();
        })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    session.subdomain_names = Subdomains.list();
});