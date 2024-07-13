
var search_engine = null;

window.SearchEngine = {
    index: async function(force=false){
        if (search_engine && !force){return;}
        console.time("search-index");
        search_engine = new MiniSearch({
          fields: ['name', 'documentation'], // fields to index for full-text search
          storeFields: ['name', 'id','type'] // fields to return with search results
        });
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.endsWith(".md"));
        let documents = [];
        for (let i = 0; i < files.length; i++){
            let documentation = await Modeler.get(files[i],true);
            let model = files[i].replace(".md",".xml");
            let type = Modeler.determine_type(model);
            let name = Navigation.get_name(model);
            documents.push({
                id: files[i] == "README.md" ? "README.md" : model,
                name: name,
                documentation: documentation.content,
                type: type
            });
        }
        search_engine.addAll(documents);
        console.timeEnd("search-index");
    },
    search: function(query){
        let results = search_engine.search(query, { prefix: true, fuzzy: 0.2 });
        return results;
    }
}