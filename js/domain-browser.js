var hierarchical = true;
var sort_method = "directed";
function sort_free(data){
    hierarchical = false;
    draw_diagram(data);
}
function sort_directed(data){
    hierarchical = true;
    sort_method = "directed";
    draw_diagram(data);
}
function sort_hub(data){
    hierarchical = true;
    sort_method = "hubsize";
    draw_diagram(data);
}
function draw_diagram(data){
    var nodes = new vis.DataSet(JSON.parse(data.nodes));
    var edges = new vis.DataSet(JSON.parse(data.edges));
    var container = document.getElementById("mynetwork");
    var data = {
      nodes: nodes,
      edges: edges,
    };
    var options = {
        width: "100%",
        height: "100%",
        layout: {
            hierarchical : {
                enabled: hierarchical,
                direction: "LR",
                sortMethod: sort_method
            }
        }
    };
    console.log(options);
    var network = new vis.Network(container, data, options);
}
function get_url(item){
    if (item.type == 'command') {
        return '/command?drn=' + item.drn;
    } else if (item.type == 'behavior'){
        return '/aggregate/behavior-flow?drn=' + item.drn;
    } else if (item.type == 'notifier'){
        return '/notifier?drn=' + item.drn;
    } else if (item.type == 'aggregate'){
        return '/aggregate?drn=' + item.drn;
    } else if (item.type == 'view'){
        return '/view?drn=' + item.drn;
    } else if (item.type == 'subdomain'){
        return '/subdomain?drn=' + item.drn;
    } else if (item.type == 'dependency'){
        return '/global?typename=Dependency&drn=' + item.drn;
    } else {
        return '/project?drn=' + item.drn.split(':').slice(0,3).join(':');
    }
}