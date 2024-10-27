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
                if (this.lock){return}
                this.lock = true;
                try{
                    this.session.all_links = await Diagram.node_diagram(this.path,"node-diagram","250px");
                    await Draftsman.sleep(60000);
                } finally {
                    this.lock = false;
                }
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});