document.addEventListener('alpine:init', () => {
    Alpine.data('domainEvent', function(){
        return {
            model: null,
            _taskId: "",
            listnerId: "",
            hash: "",
            selectedTab: this.$persist({}).using(sessionStorage).as("domainEventTab"),
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
                if (!(this.navigation in this.selectedTab)){
                    this.selectedTab[this.navigation] = 1;
                }
            },
            async read(){
                await Draftsman.sleep(10);
                this.model = await Modeler.get_model(this.navigation);
            },
            add_field(){
                this.model.field.push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    att_type: "String"
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
            add_collection(){
                this.model["nested-object"].push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    field: []
                });
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async delete_model(){
                // TODO soft delete?
            },
            async _execute_save(){
                if(this.lock){return}
                let hash = Draftsman.generateFingerprint(this.model);
                if (hash == this.hash){return}
                this.lock = true;
                try{
                    let model = JSON.parse(JSON.stringify(this.model));
                    model.field = model.field.filter(x => !x.deleted);
                    model["nested-object"] = model["nested-object"].filter(x => !x.deleted);
                    model["nested-object"].forEach(y => {
                        y.field = y.field.filter(x => !x.deleted);
                    });
                    await Modeler.save_model(this.navigation,model);
                    this.model = model;
                    this.hash = Draftsman.generateFingerprint(this.model);
                }finally{
                    await Draftsman.sleep(100);
                    this.lock = false;
                }
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
    Alpine.data("domainEventMapper", function(){
        return {
            root: null,
            mapping: null,
            file: null,
            event: null,
            entities: [],
            _taskId: "",
            listnerId: "",
            type: "",
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("mapping",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async toggle_mapping(){
                if(this.$el.checked){
                    this.mapping.mapping = [];
                    this.mapping["nested-mapping"] = [];
                    this.mapping.att_code = "# comment"
                    this.type = "code";
                } else {
                    delete this.mapping.att_code;
                    this.type = "mapper";
                }
                await this.reload_mapper();
            },
            async render_editor(){
                Draftsman.codeEditor("domain-event-editor",this.mapping.att_code,this._update_code.bind(this));
            },
            _update_code(code){
                this.mapping.att_code = code;
            },
            async read(){
                await Draftsman.sleep(10);
                this.file = this.navigation.replace("/events/","/event-handlers/");
                this.event = await Modeler.get_model(this.navigation);
                this.root = await Modeler.get_model(this.navigation.split("events/").at(0) + "root.xml");

                try{
                    this.mapping = await Modeler.get_model(this.file);
                }catch{}

                let repo = await GitRepository.open();
                let entity_files = await repo.list(x => x.startsWith(this.navigation.split("events/").at(0) + "entities/") && x.endsWith(".xml"));
                this.entities = [];
                for (let i = 0; i < entity_files.length; i++){
                    this.entities.push(await Modeler.get_model(entity_files[i]));
                }

                await this.reload_mapper();
            },
            async reload_mapper(){
                if (!this.mapping){
                    this.type = "none";
                } else if ("att_code" in this.mapping){
                    this.type = "code";
                } else {
                    this.type = "mapper";
                    this.root.field.forEach(field => {
                        let field_mapping = this.mapping.mapping.filter(x => x.att_target == field.att_name);
                        if (field_mapping.length == 0){
                            field.mapping = {
                                att_target: field.att_name,
                                att_value: "",
                                att_operand: "unmapped"
                            };
                            this.mapping.mapping.push(field.mapping);
                        } else {
                            field.mapping = field_mapping.at(0);
                        }
                    });

                    this.entities.forEach(entity => {
                        let mapping = this.mapping["nested-mapping"].filter(x => x.att_target == entity.att_name);
                        if (mapping.length == 0){
                            mapping = {
                                  att_target: entity.att_name,
                                  att_strategy: "unmapped",
                                  mapping: []
                              };
                            this.mapping["nested-mapping"].push(mapping);
                        } else {
                            mapping = mapping.at(0);
                        }
                        let mapped_fields = mapping.mapping.map(x => x.att_target);
                        entity.field.filter(f => !mapped_fields.includes(f.att_name)).forEach(field => {
                            mapping.mapping.push({
                                att_target: field.att_name,
                                att_operand: "unmapped",
                                att_value: "",
                            });
                        });
                    });
                }
            },
            autofill(){
                let fields = this.event.field.map(x => x.att_name);
                this.mapping.mapping.filter(m => m.att_operand == "unmapped" && fields.includes(m.att_target)).forEach(m => {
                    m.att_operand = "set";
                    m.att_value = m.att_target;
                });
                let collections = this.event["nested-object"].map(x => x.att_name);
                this.mapping["nested-mapping"].filter(m => collections.includes(m.att_target)).forEach(m => {
                    if (m.att_strategy == "unmapped"){
                        m.att_strategy = "extend";
                        m.att_source = m.att_target;
                    }
                    let source = this.event["nested-object"].filter(x => x.att_name == m.att_target).at(0);
                    let source_fields = source.field.map(x => x.att_name);
                    let target = this.entities.filter(x => x.att_name == m.att_target).at(0);
                    if (source_fields.includes(target["att_business-key"])){
                        m["att_business-key"] = target["att_business-key"];
                    }
                    m.mapping.filter(m => m.att_operand == "unmapped" && source_fields.includes(m.att_target)).forEach(m => {
                        m.att_operand = "set";
                        m.att_value = m.att_target;
                    });
                });
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                if(this.lock){return}
                this.lock = true;
                try{
                    let model = JSON.parse(JSON.stringify(this.mapping));
                    model.mapping = model.mapping.filter(x => x.att_operand != "unmapped");
                    model["nested-mapping"] = model["nested-mapping"].filter(x => x.att_strategy != "unmapped");
                    model["nested-mapping"].forEach(mapping => {
                        mapping.mapping = mapping.mapping.filter(x => x.att_operand != "unmapped");
                    });
                    await Modeler.save_model(this.file,model);
                }finally{
                    await Draftsman.sleep(100);
                    this.lock = false;
                }
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});