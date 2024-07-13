
window.Expression = {
    get_role_expressions: async function(){
        let files = await FileSystem.listFiles();
        let expressions = files.filter(x => x.startsWith("expressions/") && x.endsWith(".xml"));
        expressions = await Promise.all(expressions.map(async x => await Modeler.get(x)));
        return expressions.filter(x => x.att_type == 'ActorEventRole');
    },
    get_keyfield_expressions: async function(){
        let files = await FileSystem.listFiles();
        let expressions = files.filter(x => x.startsWith("expressions/") && x.endsWith(".xml"));
        expressions = await Promise.all(expressions.map(async x => await Modeler.get(x)));
        return expressions.filter(x => x.att_type == 'TriggerKeyField');
    },
    list: async function(){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith("expressions/") && x.endsWith(".xml"));
        let expressions = [];
        for(let i =0; i < files.length; i++){
            expressions.push({
                    model: await Modeler.get(files[i]),
                    docs: await Modeler.get(files[i].replace('.xml','.md')),
                    file: files[i]
                });
        }
        return expressions;
    },
    rename: async function(model,file,name){
        let newPath = "expressions/" + name + ".xml"
        if (await Modeler.exists(newPath)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        model.att_name = name;
        try{
            await Modeler.sync_to_disk();
        }catch{}
        await Modeler.rename(file,newPath);
        await Modeler.rename(file.replace('.xml','.md'),newPath.replace('.xml','.md'));
        try{
            await Modeler.sync_to_disk();
        }catch{}
        await sleep(2000);
        location.reload();
    },
    create: async function(data){
        if (!check_pattern(data.name,lower_or_camel_cased)){
            Session.show_exception("Invalid configuration, expression not created!");
            return;
        }
        let file = "expressions/" + data.name + ".xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let expression = {
            "att_name": data.name,
            "att_type": data.type,
            "att_input": data.input,
            "att_expression": data.expression
        };
        expression = {expression:expression};
        let tab = session.tab;
        session.tab = "";
        await Modeler.save_model(file,expression);
        if (data.docs && data.docs != 'documentation'){
            await Modeler.save_model(file.replace('.xml','.md'),{content:data.docs});
        }
        await sleep(1000);
        session.tab = tab;
    }
}