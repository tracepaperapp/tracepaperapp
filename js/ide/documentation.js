
window.Documentation = {
    subject_index: async function(subject){
        let meta = await fetch('/docs/' + subject + '/index.json');
        try{
            return JSON.parse(await meta.text());
        } catch {
            return [];
        }
    },
    get_html: async function(path){
        let content = await fetch(path);
        content = await content.text();
        return convertMarkdownToHtml(content);
    },
    open: async function(subject,key=""){
        Navigation.execute_open_tab("documentation/" + subject);
        await sleep(100);
        await Documentation.fetch_data(subject,key);
    },
    load: function(file){
        Documentation.fetch_data(file.split("/").at(-1));
    },
    fetch_data: async function(subject,key=""){
        session.type = "documentation";
        tab_state.files = await Documentation.subject_index(subject);
        try{
            tab_state.index = files.map(x => x.path.endsWith(key + ".md")).indexOf(true);
        }catch{
            tab_state.index = tab_state.index <= tab_state.files.length ? tab_state.index : 0;
        }
    }
}