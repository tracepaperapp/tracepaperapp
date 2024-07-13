window.Pattern = {
    list: async function(){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith("patterns/") && x.endsWith(".xml"));
        let patterns = [];
        for(let i =0; i < files.length; i++){
            patterns.push({
                    model: await Modeler.get(files[i]),
                    docs: await Modeler.get(files[i].replace('.xml','.md')),
                    file: files[i]
                });
        }
        return patterns;
    },
    rename: async function(model,file,name){
            let newPath = "patterns/" + name + ".xml"
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
                if (!check_pattern(data.name,pascal_cased)){
                    Session.show_exception("Invalid configuration, pattern not created!");
                    return;
                }
                let file = "patterns/" + data.name + ".xml";
                if (await Modeler.exists(file)){
                    Session.show_exception("File already exists, will not overwrite <br>" + file);
                    return;
                }
                let pattern = {
                    "att_name": data.name,
                    "att_regex": data.regex
                };
                pattern = {pattern:pattern};
                let tab = session.tab;
                session.tab = "";
                await Modeler.save_model(file,pattern);
                if (data.docs && data.docs != 'documentation'){
                    await Modeler.save_model(file.replace('.xml','.md'),{content:data.docs});
                }
                await sleep(3000);
                session.tab = tab;
            }
}