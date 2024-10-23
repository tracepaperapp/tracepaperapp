
var search_engine = null;

window.SearchEngine = {
    index: async function(force=false){
        if (search_engine && !force){return;}
        console.time("search-index");
        search_engine = new MiniSearch({
          fields: ['name', 'documentation', 'model'], // fields to index for full-text search
          storeFields: ['name', 'id','type'] // fields to return with search results
        });
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.endsWith(".xml") && !x.includes("/event-handlers/"));
        let documents = [];
        for (let i = 0; i < files.length; i++){
            let documentation = await Modeler.get(files[i].replace(".xml",".md"),true);
            let model = files[i];
            let type = Modeler.determine_type(model);
            let name = Navigation.get_name(model);
            let modelContent = await FileSystem.read(files[i]);
            if (type == "config"){
                documentation.content += " pipeline qg qa quality gate deployment coverage DB database IAM testing";
            }
            documents.push({
                id: type == "pattern" ? "Patterns#" + model : type == "config" ? "settings" : model,
                name: name,
                documentation: documentation.content,
                type: type,
                model: modelContent
            });
        }
        search_engine.addAll(documents);
        console.timeEnd("search-index");
    },
    search: function(query){
        let results = search_engine.search(query, {
            prefix: true,
            fuzzy: 0.2,
            boost: {
                name: 4,
                documentation: 3,
                model: 1
            }
        });
        return results;
    }
}