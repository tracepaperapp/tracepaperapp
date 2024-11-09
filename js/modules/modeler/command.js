document.addEventListener('alpine:init', () => {
    Alpine.data('commandModel', function(){
        return {
            model: Modeler.prepare_model("command",{}),
            _taskId: "",
            listnerId: "",
            newPath: "",
            preparedRename: {},
            lock: false,
            patterns: [],
            get_api_path(){
                return this.model['att_graphql-namespace'] + "." + this.model['att_graphql-name'];
            },
            add_field(){
                this.model.field.push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    att_type: "String"
                });
            },
            add_collection(){
                this.model["nested-object"].push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    field: []
                });
            },
            add_collection_field(){
                let collectionName = this.$el.getAttribute("collection");
                let collection = this.model["nested-object"].filter(x => x.att_name == collectionName).at(0);
                collection.field.push({
                  att_name: Draftsman.generateRandomCamelCaseString(),
                  att_type: "String"
              });
            },
            async prepare_change_name(){
                if (this.newPath == "" || !apiPathRegex.test(this.newPath)){
                    return;
                }
                this.lock = false;
                let elements = Draftsman.splitOnLastDot(this.newPath);
                if (elements[0] == this.model['att_graphql-namespace'] && elements[1] == this.model['att_graphql-name']){
                    return;
                }
                this.preparedRename = {
                    namespace: elements[0],
                    method: elements[1],
                    eventName: Draftsman.capitalizeFirstLetter(elements[1]) + elements[0].replaceAll(".","") + "Requested",
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
                this.lock = true;
                let file = `commands/${this.model['att_graphql-namespace'].replaceAll('.','/')}/${this.model.att_name}.xml`;
                await Modeler.delete_model(file);
            },
            async init(){
                await this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
                let repo = await GitRepository.open();
                let files = await repo.list(x => x.startsWith("patterns/") && x.endsWith(".xml"));
                this.patterns = files.map(x => x.split("/").at(-1).replace(".xml",""));
            },
            async read(){
                await Draftsman.sleep(10);
                if (Modeler.determine_type(this.navigation) == "command"){
                    this.path = this.navigation;
                    this.model = await Modeler.get_model(this.path);
                    this.newPath = this.get_api_path();
                }

            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                if (this.lock){return}
                let hash = Draftsman.generateFingerprint(this.model);
                if (hash == this.hash){return}
                console.log(this.model);
                let model = JSON.parse(JSON.stringify(this.model));
                model.field = model.field.filter(x => !x.deleted);
                model["nested-object"] = model["nested-object"].filter(x => !x.deleted);
                model["nested-object"].forEach(y => {
                    y.field = y.field.filter(x => !x.deleted);
                });
                await Draftsman.sleep(10);
                await Modeler.save_model(this.path,model);
                await Draftsman.sleep(10);
                this.model = model;
                this.hash = Draftsman.generateFingerprint(this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});