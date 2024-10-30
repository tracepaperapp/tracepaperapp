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
            focused: this.$persist([]).using(sessionStorage),
            force_focus: "",
            radius: 1,
            mode: true,
            selection: this.$persist({
                command: true,
                behavior: true,
                notifier: true,
                view: true,
                query: true,
                projection: true,
                dependency: false
            }).using(sessionStorage).as("diagram_options"),
            async init(){
                await Draftsman.sleep(10);
                if(sessionStorage.diagramRequest){
                    let request = sessionStorage.diagramRequest.split(";");
                    this.radius = parseInt(request.at(1));
                    this.force_focus = request.at(0);
                    this.focused = [];
                    this.selection = {
                         command: true,
                         behavior: true,
                         notifier: true,
                         view: true,
                         query: true,
                         projection: true,
                         dependency: true
                     }
                }
                await this._execute_draw();
                if (this.focused.length != 0){
                    await this._execute_draw();
                }
                this._taskId = Draftsman.uuidv4();
                this.$watch("selection",this.draw.bind(this));
                this.$watch("radius",this.draw.bind(this));
                this.$watch("mode",this.draw.bind(this));
                sessionStorage.removeItem("diagramRequest");
            },
            focus(){
                this.focused.push(this.session.selected_node);
                this.draw();
            },
            unfocus(){
                let element = this.$el.getAttribute("element");
                this.focused = this.focused.filter(x => x != element);
                this.draw();
            },
            async draw(){
                Draftsman.debounce(this._taskId,this._execute_draw.bind(this),500);
            },
            async _execute_draw(){
                this.selection.aggregate = this.selection.behavior;
                this.selection.schedule = this.selection.notifier
                let height = (window.innerHeight * 77) / 100
                let mode = this.mode ? "aggregate" : "behavior";
                let focus = this.focused.map(x => this.session.all_links[x]);
                if (this.force_focus){
                    focus.push(this.force_focus);
                }
                this.session.all_links = await Diagram.node_diagram(focus,"node-diagram",height + "px",this.selection,mode,this.radius);
            }
        }
    });
});