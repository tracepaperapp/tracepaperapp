document.addEventListener('alpine:init', () => {
    Alpine.data('modelFile', function(){
        return {
            model: {},
            _taskId: "",
            listnerId: "",
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async read(){
                await Draftsman.sleep(10);
                this.path = this.$el.getAttribute("file");
                this.model = await Modeler.get_model(this.path);
                await Diagram.node_diagram(this.path,"node-diagram");
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                await Modeler.save_model(this.path,this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});