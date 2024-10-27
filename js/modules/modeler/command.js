document.addEventListener('alpine:init', () => {
    Alpine.data('commandModel', function(){
        return {
            model: null,
            _taskId: "",
            listnerId: "",
            newPath: "",
            preparedRename: {},
            lock: false,
            get_api_path(){
                return this.model['att_graphql-namespace'] + "." + this.model['att_graphql-name'];
            },
            async prepare_change_name(){
                if (this.newPath == "" || !apiPathRegex.test(this.newPath)){
                    return;
                }
                this.lock = false;
                let elements = this.splitOnLastDot(this.newPath);
                if (elements[0] == this.model['att_graphql-namespace'] && elements[1] == this.model['att_graphql-name']){
                    return;
                }
                this.preparedRename = {
                    namespace: elements[0],
                    method: elements[1],
                    eventName: this.capitalizeFirstLetter(elements[1]) + elements[0].replaceAll(".","") + "Requested",
                    oldName: `commands/${this.model['att_graphql-namespace'].replaceAll('.','/')}/${this.model.att_name}.xml`
                };
                let newName = `commands/${this.preparedRename.namespace.replaceAll('.','/')}/${this.preparedRename.eventName}.xml`;
                this.preparedRename.newName = newName;
                let repo = await GitRepository.open();
                let files = await repo.list();
                this.preparedRename.force = files.includes(newName);
                this.preparedRename.init = true;
            },
            cancel_rename(){
                this.preparedRename = {};
                this.newPath = this.get_api_path();
            },
            async rename(){
                console.log(this.lock);
                this.preparedRename.init = false;
                if(this.lock){return}
                this.model['att_graphql-namespace'] = this.preparedRename.namespace;
                this.model['att_graphql-name'] = this.preparedRename.method;
                this.model.att_name = this.preparedRename.eventName;
                await this._execute_save();
                this.lock = true;
                await Modeler.force_rename_model(this.preparedRename.oldName,this.preparedRename.newName);
            },
            async delete_model(){
                let file = `commands/${this.model['att_graphql-namespace'].replaceAll('.','/')}/${this.model.att_name}.xml`;
                await Modeler.delete_model(file);
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
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                if (this.lock){return}
                await Modeler.save_model(this.path,this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});