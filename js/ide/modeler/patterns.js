
window.Patterns = {
    list: function(){
        return Object.entries(model).filter(x => x[0].startsWith('patterns/')).map(x => x[1]["pattern"]["att_name"]);
    },
    load: function(){
        tab_state.patterns = Object.entries(model).filter(x => x[0].startsWith('patterns/')).map(x => x[1]["pattern"]);
        Object.keys(model).filter(key => key.startsWith('patterns/')).forEach(key => {
            let doc = key.replace(".xml",".md");
            if (!(doc in documentation)){
                documentation[doc] = {content:""};
            }
        });
        session.type = "patterns";
    },
    remove: blockingDecorator(function(name){
        let path = "patterns/" + name;
        delete model[path + ".xml"];
        delete documentation[path + ".md"];
        Patterns.load();
    }),
    rename: blockingDecorator(function(old_name,new_name){
            if (!new_name.match(pascal_cased)){
                Session.show_exception("Pattern must be PascalCased");
                return;
            }

            let oldPath = "patterns/" + old_name;
            let newPath = "patterns/" + new_name;

            model[newPath + ".xml"] = model[oldPath + ".xml"];
            model[newPath + ".xml"].pattern.att_name = new_name;
            delete model[oldPath + ".xml"];
            documentation[newPath + ".md"] = documentation[oldPath + ".md"];
            delete documentation[oldPath + ".md"];
            Patterns.load();
        }),
    create: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Pattern must be PascalCased");
            return;
        }
        let path = "patterns/" + name + ".xml";
        if (path in model){
            Session.show_exception("There is already a pattern defined with name: "+name);
            return;
        }
        Modeler.insert_model(path,{
            pattern: {
                att_name: name,
                att_regex: '^([A-Z]{1}[a-z]+)+$'
            }
        });
        Patterns.load();
    })
}