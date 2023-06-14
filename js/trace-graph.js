
function draw_trace_diagram(nodes,edges,id){
    var nodes = new vis.DataSet(nodes);
    var edges = new vis.DataSet(edges);
    var container = document.getElementById(id);
    var data = {
      nodes: nodes,
      edges: edges,
    };
    //https://visjs.github.io/vis-network/docs/network/layout.html
    var options = {
        width: "100%",
        height: "100%",
        layout: {
            hierarchical : {
                enabled: true,
                direction: "UD",
                sortMethod: "directed"
            }
        }
    };
    var network = new vis.Network(container, data, options);
    console.log(network);
    container.scrollIntoView();
}
var draw_requests = [];
setInterval(function(){
    if (draw_requests.length != 0){
        let request = draw_requests.shift();
        draw_trace_diagram(request[0],request[1],request[2]);
    }
},10);
function update_trace_diagram(traces,id){
    var nodes = {"appsync": {id: "appsync", label: "API", size: 10, shape: "dot", color: "#D3D3D3"}};
    var edges = [];
    traces.forEach(trace => {
        console.log(JSON.stringify(trace,null,2));
        if (trace.component == null || trace.previous == null){
            return;
        }

        // Initialize node
        if (trace.component in nodes){
            var node = nodes[trace.component];
        } else {
            var node = { id: trace.component, label: trace.command, size: 10, shape: "dot", status: trace.status};
        }
        if (!["error","success"].includes(node.status)){
            node.status = trace.status;
        }
        if (node.status == "success"){
            node.color = "#7BE141";
        } else if (node.status == "error"){
            node.color = "#FB7E81";
        } else {
            node.color = "#6E6EFD";
        }
        nodes[trace.component] = node;

        var index = edges.findIndex(x => x.from===trace.previous && x.to===trace.component);
        if (index === -1) {
            edges.push({from: trace.previous, to: trace.component, arrows: "to"});
        }
    });

    nodes = Object.keys(nodes).map(function(key){
        return nodes[key];
    });
    var height = window.innerHeight * 0.5;
    $("#" + id).height(height);
    console.log(nodes,edges);
    draw_requests.push([nodes,edges,id]);
}