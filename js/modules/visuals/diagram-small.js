document.addEventListener('alpine:init', () => {
    Alpine.data('smallNodeDiagram', function(){
        return {
            listnerId: "",
            session: session,
            path: "",
            mode: "",
            radius: 1,
            async init(){
                await Draftsman.sleep(10);
                let type = Modeler.determine_type(this.navigation);
                this.mode = ["view","projection"].includes(type) ? "aggregate" : "behavior";
                this.draw();
                this.listnerId = Draftsman.registerListener("force-reload",this.draw.bind(this));
            },
            async toggle_mode(){
                this.mode = this.mode == "aggregate" ? "behavior" : "aggregate";
                await this.draw();
            },
            async change_radius(){
                if (this.radius < 3){
                    this.radius += 1;
                } else {
                    this.radius = 1;
                }
                await this.draw();
            },
            async draw(){
                this.session.all_links = await Diagram.node_diagram(this.navigation,"node-diagram","250px",{},this.mode,this.radius);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
    Alpine.data('gateDiagram', function(){
            return {
                listnerId: "",
                session: session,
                path: "",
                draw_lock: false,
                async init(){
                    await this.draw();
                    await Draftsman.sleep(10);
                    this.listnerId = Draftsman.registerListener("force-reload",this.draw.bind(this));
                },
                async draw(){
                    if (this.draw_lock){return}
                    this.draw_lock = true;
                    try{
                        console.log(this.navigation);
                        let repo = await GitRepository.open();
                        let files = await repo.list(x => x.startsWith("scenarios/") && x.endsWith(".xml"));
                        console.log(files);
                        let scenarios = [];
                        let stops = [];
                        let links = {};
                        for (let i = 0; i < files.length; i++){
                            let scenario = await Modeler.get_model(files[i],true);
                            scenarios.push(scenario);
                            stops.push(scenario.att_name);
                            links[scenario.att_name] = files[i];
                        }
                        session.all_links = links;
                        let nodes = [{id: 'START',shape:'dot',color:"#82B366",size: 10,label: "Start"},{id: 'STOP',shape:'dot',color:"#B85450",size: 10,label: "End"}];
                        let edges = [];
                        scenarios.forEach(s => {
                            nodes.push({
                                id: s.att_name,
                                label: s.att_name,
                                shape: "box",
                                color: this.navigation.includes(s.att_name) ? "#FFA807" : "#6E6EFD"
                            });
                            if (s.att_extends){
                                s.att_extends.split(";").forEach(r => {
                                    edges.push({ from: r, to: s.att_name, color: { inherit: "both" }, arrows: "to" });
                                    stops = stops.filter(x => x != r);
                                });
                            } else {
                                edges.push({ from: "START", to: s.att_name, color: { inherit: "both" }, arrows: "to" });
                            }
                        });
                        stops.forEach(s => {
                            edges.push({ from: s, to: "STOP", color: { inherit: "both" }, arrows: "to" });
                        });
                        console.log(stops);
                        var container = document.getElementById("gate-diagram");
                        var data = {
                          nodes: new vis.DataSet(nodes),
                          edges: new vis.DataSet(edges)
                        };
                        console.log(data);
                        var options = {
                            width: "100%",
                            height: "250px"
                        };
                        var network = new vis.Network(container, data, options);
                        network.focus(this.navigation.split("/").at(0).replace(".xml",""), {
                            scale: 1.5, // Zoomniveau (hoe groter, hoe verder uitgezoomd)
                            animation: {
                                duration: 1000, // Animatieduur in milliseconden
                                easingFunction: 'easeInOutQuad', // Animatietype
                            },
                        });
                        session.selected_node = "";
                        network.on("click", function (params) {
                            session.selected_node = params.nodes.at(0);
                            network.focus(session.selected_node, {
                                scale: 1.5, // Zoomniveau (hoe groter, hoe verder uitgezoomd)
                                animation: {
                                    duration: 1000, // Animatieduur in milliseconden
                                    easingFunction: 'easeInOutQuad', // Animatietype
                                },
                            });
                        });
                    } finally{
                        await Draftsman.sleep(100);
                        this.draw_lock = false;
                    }
                },
                destroy(){
                    Draftsman.deregisterListener(this.listnerId);
                }
            }
        });
});