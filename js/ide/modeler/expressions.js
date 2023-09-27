
window.Expressions = {
    list: function(){
        return Object.entries(model).filter(x => x[0].startsWith('expressions/')).map(x => x[1]["expression"]);
    },
    load: function(){
        tab_state.expressions = Expressions.list();
        Object.keys(model).filter(key => key.startsWith('expressions/')).forEach(key => {
            let doc = key.replace(".xml",".md");
            if (!(doc in documentation)){
                documentation[doc] = {content:""};
            }
        });
        session.type = "expressions";
    },
    remove: blockingDecorator(function(name){
            let path = "expressions/" + name;
            delete model[path + ".xml"];
            delete documentation[path + ".md"];
            Expressions.load();
        }),
    rename: blockingDecorator(function(old_name,new_name){
        if (!new_name.match(camel_cased)){
            Session.show_exception("Expression reference must be camelCased");
            return;
        }

        let oldPath = "expressions/" + old_name;
        let newPath = "expressions/" + new_name;

        model[newPath + ".xml"] = model[oldPath + ".xml"];
        model[newPath + ".xml"].expression.att_name = new_name;
        delete model[oldPath + ".xml"];
        documentation[newPath + ".md"] = documentation[oldPath + ".md"];
        delete documentation[oldPath + ".md"];
        Expressions.load();
    }),
    create: blockingDecorator(function(name){
        if (!name.match(camel_cased)){
            Session.show_exception("Expression reference must be camelCased");
            return;
        }
        let path = "expressions/" + name + ".xml";
        if (path in model){
            Session.show_exception("There is already a expression defined with name: "+name);
            return;
        }
        Modeler.insert_model(path,{
            expression: {
                att_name: name,
                att_type: "ActorEventRole",
                att_input: "input",
                att_expression: ""
            }
        });
        Expressions.load();
    })
}