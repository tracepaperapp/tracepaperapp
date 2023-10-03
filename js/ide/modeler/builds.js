
const builds_query = `
query GetBuilds($key_begins_with: String = "") {
  Build {
    filter(key_begins_with: $key_begins_with) {
      resultset {
        drn
        lastEvent
        status
      }
    }
  }
}
`

window.Builds = {
    load: function(){
        session.type = "build";
        session.tabs.map(x=> x.split("#").at(0)).filter(x=> x.startsWith("build/") && x != session.tab).forEach(tab=> {
            try{
                console.log("auto close tab:",tab);
                Navigation.execute_close_tab(tab);
            }catch{}
        });
    },
    fetch_builds: async function(){
        let data = await Draftsman.query(builds_query,{key_begins_with:localStorage.project});
        let builds = data.Build.filter.resultset;
        builds.sort((a,b) => b.lastEvent-a.lastEvent);
        return builds;
    },
    open_build: blockingDecorator(function(drn){
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab("build/" + drn);
    })
}