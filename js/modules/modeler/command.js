document.addEventListener('alpine:init', () => {
    Alpine.data('commandModel', function(){
        return {
            model: null,
            _taskId: "",
            listnerId: "",
            newPath: "",
            preparedRename: {},
            get_api_path(){
                return this.model['att_graphql-namespace'] + "." + this.model['att_graphql-name'];
            },
            prepare_change_name(){
                if (this.newPath == "" || !apiPathRegex.test(this.newPath)){
                    return;
                }
                let elements = this.splitOnLastDot(this.newPath);
                if (elements[0] == this.model['att_graphql-namespace'] && elements[1] == this.model['att_graphql-name']){
                    return;
                }
                this.preparedRename = {
                    namespace: elements[0],
                    method: elements[1],
                    eventName: this.capitalizeFirstLetter(elements[1]) + elements[0].replaceAll(".","") + "Requested"
                };
            },
            cancel_rename(){
                this.preparedRename = {};
                this.newPath = this.get_api_path();
            },
            async rename(){
                this.model['att_graphql-namespace'] = this.preparedRename.namespace;
                this.model['att_graphql-name'] = this.preparedRename.method;
                this.model.att_name = this.preparedRename.eventName;
                await this._execute_save();
                this.preparedRename = {};
                this.newPath = this.get_api_path();
            },
            capitalizeFirstLetter(str) {
                if (!str) return str; // Controleer op een lege string
                return str.charAt(0).toUpperCase() + str.slice(1);
            },
            splitOnLastDot(str) {
                const lastDotIndex = str.lastIndexOf('.');
                if (lastDotIndex === -1) return [str]; // Geen punt gevonden

                const beforeDot = str.slice(0, lastDotIndex);
                const afterDot = str.slice(lastDotIndex + 1);

                return [beforeDot, afterDot];
            },
            async init(){
                await this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async read(){
                await Draftsman.sleep(10);
                this.path = this.$el.getAttribute("file");
                this.model = await Modeler.get_model(this.path);
                this.newPath = this.get_api_path();
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