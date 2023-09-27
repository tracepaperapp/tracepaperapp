
window.Code = {
    list_modules: function(){
        return Object.keys(code).map(key => key.replace("lib/","").replace(".py",""));
    },
    get_methods: function(module,filter="(flow):"){
        return code[module].content.split("\n").filter(x => x.startsWith("def ") && x.endsWith(filter))
            .map(x => x.replace("def ","").replace(filter,""));
    },
    create_new: blockingDecorator(function(){
        let path = "lib/NewModule.py";
        if (Object.keys(code).includes(path)){
            Session.show_exception("Module with name 'NewModule' already exists");
            return;
        }
        code[path] = {content:code_template}
        Navigation.execute_open_tab(path);
    }),
    load: function(file){
        tab_state.code = code[file];
        let doc = file.replace('.py','.md')
        Modeler.load_documentation(doc);
        session.type = "code";
    },
    remove: blockingDecorator(function(){
        delete code[session.tab];
        delete documentation[session.tab.replace(".py",".md")];
        Navigation.execute_close_tab(session.tab);
    }),
    rename: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Python module must be PascalCased");
            return;
        }

        let oldPath = session.tab;
        let newPath = "lib/" + name + ".py";

        code[newPath] = code[oldPath];
        delete code[oldPath];
        documentation[newPath.replace(".py",".md")] = documentation[oldPath.replace(".py",".md")];
        delete documentation[oldPath.replace(".py",".md")];

        Navigation.execute_close_tab(oldPath);
        Navigation.execute_open_tab(newPath);
        Modeler.render();
    })
}