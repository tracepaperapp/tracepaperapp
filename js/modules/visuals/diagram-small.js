document.addEventListener('alpine:init', () => {
    Alpine.data('smallNodeDiagram', function(){
        return {
            listnerId: "",
            session: session,
            path: "",
            async init(){
                await Draftsman.sleep(10);
                this.path = this.$el.getAttribute("file");
                this.draw();
                this.listnerId = Draftsman.registerListener("force-reload",this.draw.bind(this));
            },
            async draw(){
                console.log("draw");
                this.session.all_links = await Diagram.node_diagram(this.path,"node-diagram","250px");
                console.log("draw finished");
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});