var session = {
  selected_node: "",
  all_links: []
}

document.addEventListener('alpine:init', () => {
    session = Alpine.reactive(session);
    Alpine.data('nodeDiagram', function(){
        return {
            _taskId: "",
            session: session,
            path: "",
            selection: this.$persist({
                command: true,
                behavior: true,
                notifier: true,
                view: true,
                query: true,
                projection: true,
                dependency: true
            }).using(sessionStorage).as("diagram_options"),
            async init(){
                await Draftsman.sleep(10);
                this.path = this.$el.getAttribute("file");
                this._execute_draw();
                this._taskId = Draftsman.uuidv4();
                this.$watch("selection",this.draw.bind(this));
            },
            focus(){
                this.path = this.session.all_links[this.session.selected_node];
                this.draw();
            },
            zoom_out(){
                let path = this.path.substring(0,this.path.lastIndexOf('/'));
                if(!path.includes('/')){
                    path = 'README.md'
                };
                path = path.replace('/behavior-flows',''); // skip this view, because it is the same as the parent
                this.path = path;
                this.draw();
            },
            async draw(){
                Draftsman.debounce(this._taskId,this._execute_draw.bind(this),500);
            },
            async _execute_draw(){
                this.selection.aggregate = this.selection.behavior;
                this.selection.schedule = this.selection.notifier
                let height = (window.innerHeight * 77) / 100
                this.session.all_links = await Diagram.node_diagram(this.path,"node-diagram",height + "px",this.selection);
            }
        }
    });
});