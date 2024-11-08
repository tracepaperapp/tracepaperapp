var tree_lock = false;
document.addEventListener('alpine:init', () => {
    Alpine.data('treeMap', function(){
        return {
            selection: {"selected": null},
            view_path_cache: {},
            data: {},
            listnerId: "",
            selectedFile: "",
            init(){
                this.listnerId = Draftsman.registerListener("tree-navigation",this.navigate_tree.bind(this));
            },
            navigate_tree(message){
                if (message){
                    this.selection.selected = this.data[message + 1];
                    let selected = this.selection.selected;
                    if (selected.at(1) == "Write Domain"){
                        this.selectedFile =  null;//`domain/${selected.at(0)}`;
                    } else if (selected.at(0).startsWith(":")){
                        this.selectedFile =  `notifiers/${selected.at(0).replace(":","")}.xml`;
                    } else if (selected.at(0).endsWith(" view") || selected.at(0).endsWith(" projection")){
                        this.selectedFile =  this.view_path_cache[selected.at(0)];
                    } else if (!selected.at(0).includes(".")){
                        this.selectedFile =  `domain/${selected.at(1)}/${selected.at(0)}/root.xml`;
                    } else {
                        this.selectedFile =  `domain/${selected.at(0).replaceAll('.','/').replace(`/${selected.at(1)}/`,`/${selected.at(1)}/behavior-flows/`)}.xml`;
                    }
                } else {
                    this.selection.selected = null;
                }
            },
            async render_tree_map(){
                if(tree_lock){return}
                tree_lock = true;
                try{
                this.data = {};
                let repo = await GitRepository.open();
                let cb = [];
                data = [['Concept', 'Parent'],["Domain",null],["Write Domain","Domain"],["Automations","Write Domain"],["Query Domain","Domain"]];
                let files = await repo.list();
                files.filter(x => x.startsWith('domain/') && x.endsWith('.xml') && x.includes('/behavior-flows/')).forEach(x => {
                    let path = x.split("/");
        
                    let sub = path[1];
                    if (!cb.includes(sub)){
                       cb.push(sub);
                       data.push([sub,"Write Domain"]);
                    }
        
                    let agg = path[2];
                    if (!cb.includes(agg)){
                       cb.push(agg);
                       data.push([agg,sub]);
                    }
        
                    let behavior = path[4].replace(".xml","");
                    data.push([sub + "." + agg + "." + behavior,agg]);
                 });
        
                files.filter(x => x.startsWith('notifiers/') && x.endsWith('.xml')).forEach(x => {
                    data.push([":" + x.split("/").at(-1).replace(".xml",""),"Automations"]);
                });
        
                cb = [];
                files.filter(x => x.startsWith('views/') && x.endsWith('.xml')).forEach(x => {
                    let path = x.split("/");
                    path.shift();
                    let viewsub = "Query Domain"
                    path.forEach(p => {
                        if (p.endsWith(".xml")){
                            let v = p.replace(".xml"," view");
                            data.push([v,viewsub]);
                            this.view_path_cache[v] = x;
                        }else{
                            if (!cb.includes(p)){
                               cb.push(p);
                               data.push(["v-" + p,viewsub]);
                            }
                            viewsub = "v-" + p;
                        }
                    });
                 });
        
                files.filter(x => x.startsWith('projections/') && x.endsWith('.xml')).forEach(x => {
                    let path = x.split("/");
                    path.shift();
                    let viewsub = "Query Domain"
                    path.forEach(p => {
                        if (p.endsWith(".xml")){
                            let v = p.replace(".xml"," projection");
                            data.push([v,viewsub]);
                            this.view_path_cache[v] = x;
                        }else{
                            if (!cb.includes(p)){
                               cb.push(p);
                               data.push(["v-" + p,viewsub]);
                            }
                            viewsub = "v-" + p;
                        }
                    });
                 });
                google.charts.load('current', {'packages':['treemap']});
                google.charts.setOnLoadCallback(function(){
                    let dataset = google.visualization.arrayToDataTable(data);
                    let tree = new google.visualization.TreeMap(document.getElementById('treemap'));
                    tree.draw(dataset, {
                      minColor: '#d1dbff',
                      midColor: '#d1dbff',
                      maxColor: '#d1dbff',
                      headerHeight: 15,
                      fontColor: 'black',
                      showScale: false
                    });
        

                    google.visualization.events.addListener(tree, 'drilldown', function(e) {
                        Draftsman.publishMessage("tree-navigation", e.row);
                    });

                    google.visualization.events.addListener(tree, 'rollup', function() {
                        Draftsman.publishMessage("tree-navigation", null);
                    });
                });
                this.data = data;
                } finally{
                    setTimeout(function(){
                        tree_lock = false;
                    },1000);
                }
            },
            can_navigate(){
                return this.selection.selected &&
                       !['Automations','Query Domain','Write Domain'].includes(this.selection.selected.at(0)) &&
                       !this.selection.selected.at(0).startsWith('v-')
                       && this.selectedFile;
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});