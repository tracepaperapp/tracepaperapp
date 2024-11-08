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
                this.mode = ["readme","command"].includes(type) ? "aggregate" : "behavior";
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
});