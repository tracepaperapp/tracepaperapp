document.addEventListener('alpine:init', () => {
    Alpine.data('viewModel', function(){
        return {
            model: Modeler.prepare_model("view",{}),
            selectedTab: this.$persist({}).using(sessionStorage).as("viewTab"),
            _taskId: "",
            listnerId: "",
            search: "",
            newName: "",
            newPath: "",
            types: ['String', 'Int', 'Float', 'Boolean','StringList'],
            relation_types: ["ObjectList", "OneToMany", "ManyToOne", "OneToOne", "ManyToMany"],
            duplicateName: false,
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.reload.bind(this));
                if (!(this.navigation in this.selectedTab)){
                    this.selectedTab[this.navigation] = 1;
                }
                const urlParams = new URLSearchParams(window.location.search);
                const tab = urlParams.get('tab');
                console.log(tab)
                if (tab) {
                    this.selectedTab[this.navigation] = Number(tab);
                }
            },
            async reload(){
                this.view_lock = true;
                try {
                    await this.read();
                } finally {
                    await Draftsman.sleep(100);
                    this.view_lock = false;
                }
            },
            async read(){
                await Draftsman.sleep(10);
                this.model = await Modeler.get_model(this.navigation);
                this.newName = this.model.att_name;
                this.newPath = this.navigation.replace("views/","").replace("/" + this.model.att_name + ".xml","");
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async delete_model(){
                await Modeler.delete_model(this.navigation);
            },
            async check_name(){
                let repo = await GitRepository.open();
                if (!viewPathRegex.test(this.newPath)){
                    this.duplicateName = true;
                    return;
                }
                let files = await repo.list(x => x.endsWith("views/" + this.newPath + "/" + this.newName + ".xml"));
                this.duplicateName = files.length > 0;
            },
            async rename(){
                if(this.view_lock){return}
                if (!viewPathRegex.test(this.newPath) || !pascalCaseRegex.test(this.newName)){return}
                // alter name in model
                let newPath = "views/" + this.newPath + "/" + this.newName + ".xml";
                this.model.att_name = this.newName;
                await this._execute_save();
                this.view_lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.navigation,newPath);
            },
            async _execute_save(){
                if(this.view_lock){return}
                await Modeler.save_model(this.navigation,this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
    Alpine.data("viewData", function(){
        return {
            fields: [],
            relations: [],
            views: [],
            fkeys: [],
            async init(){
                this.$watch("model",this.prepare_data.bind(this));
                let repo = await GitRepository.open();
                let views = await repo.list(x => x.startsWith("views/") && x.endsWith(".xml"));
                this.views = views.map(x => x.split("/").at(-1).replace(".xml",""));
            },
            prepare_data(){
                this.fields = this.model.field.filter(x => this.types.includes(x.att_type));
                this.relations = this.model.field.filter(x => this.relation_types.includes(x.att_type));
                this.fkeys = this.fields.filter(x => x.att_type == "String").map(x => x.att_name);
            },
            add_field(){
                this.model.field.push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    att_type: "String"
                });
            },
            add_relation(){
                this.model.field.push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    att_type: "ObjectList"
                });
            }
        }
    });
    Alpine.data("viewDataSources", function(){
        return {
            subdomains: [],
            aggregates: {},
            selectedSource: this.$persist({}).using(sessionStorage).as("viewdatasource"),
            async init(){
                this.$watch("model",this.prepare_data.bind(this));
                let repo = await GitRepository.open();
                let aggregates = await repo.list(x => x.startsWith("domain/") && x.endsWith("/root.xml"));
                aggregates.forEach(agg => {
                    let path = agg.split("/");
                    if (!this.subdomains.includes(path[1])){
                        this.subdomains.push(path[1]);
                    }
                    if (!(path[1] in this.aggregates)){
                        this.aggregates[path[1]] = [];
                    }
                    this.aggregates[path[1]].push(path[2]);
                });
            },
            add_mapping(){
                let id = Draftsman.makeid(6);
                this.model['snapshot-handler'].push({att_id: id,mapping:[],delete:[]});
                this.selectedSource[this.navigation] = id;
            },
            add_custom_mapping(){
                let id = Draftsman.makeid(6);
                this.model['custom-handler'].push({att_id: id, att_code: ""});
                this.selectedSource[this.navigation] = id;
            },
            async prepare_data(){
                if (!(this.navigation in this.selectedSource)){
                    this.selectedSource[this.navigation] = this.model["snapshot-handler"].at(0).att_id;
                }
            }
        }
    });
    Alpine.data("viewQueries",function(){
        return {
            has_get: false,
            has_filter: false,
            init(){
                this.sync();
                this.$watch("model",this.sync.bind(this));
            },
            sync(){
                this.has_get = this.model.query.filter(x => x.att_type == "get").length != 0;
                this.has_filter = this.model.query.filter(x => x.att_type == "filter").length != 0;
                console.log("-->",this.has_get,this.has_filter);
                this.model.query.filter(q => !("att_id" in q)).forEach(q => q.att_id = Draftsman.makeid(6));
            },
            add_get(){
                if(this.has_get){return}
                this.model.query.push({
                    "att_field-name": "get",
                    "att_graphql-namespace": this.navigation.split('/').slice(1, -1).join('.'),
                    att_type: "get",
                    att_authorization: "authenticated"
                });
            },
            add_filter(){
                if(this.has_filter){return}
                this.model.query.push({
                    "att_field-name": "filter",
                    "att_graphql-namespace": this.navigation.split('/').slice(1, -1).join('.'),
                    att_type: "filter",
                    att_authorization: "authenticated",
                    "att_use-canonical-search": "false",
                    "filter-clause": []
                });
            },
            add_query(){
                this.model.query.push({
                    "att_field-name": Draftsman.generateRandomCamelCaseString(),
                    "att_graphql-namespace": this.navigation.split('/').slice(1, -1).join('.'),
                    att_type: "query",
                    att_authorization: "authenticated",
                    "att_use-canonical-search": "false",
                    "filter-clause": []
                });
            }
        }
    });
    Alpine.data("filterClause", function(){
        return {
            operand: "",
            operands: ["","equals","not_equals"],
            async init(){
                let eligible = this.query["filter-clause"].filter(x => x["att_field-name"] == this.field.att_name);
                if (eligible.length != 0){
                    this.operand = eligible.at(0).att_operand;
                }
                if (["Int","Float"].includes(this.field.att_type)){
                    this.operands.push("less_than","greater_than","less_than_equals","greater_than_equals");
                }
            },
            update_filter(){
                if (this.operand == ""){
                    this.query["filter-clause"] = this.query["filter-clause"].filter(x => x["att_field-name"] != this.field.att_name)
                } else {
                    let eligible = this.query["filter-clause"].filter(x => x["att_field-name"] == this.field.att_name);
                    if (eligible.length != 0){
                        eligible.at(0).att_operand = this.operand;
                    } else {
                        this.query["filter-clause"].push({
                            "att_field-name": this.field.att_name,
                            att_operand: this.operand,
                            att_id: Draftsman.makeid(6)
                        });
                    }
                }
            }
        }
    });
    Alpine.data("viewMapping", function(){
        return {
            mapping: {},
            sources: [],
            template: {},
            lock_template: false,
            async init(){
                await this.get_mapping();
                this.$watch("mapping",this.sync.bind(this));
                this.$watch("template",this.sync_template.bind(this));
            },
            async sync(){
                if (this.mapping.att_operand != "unmapped" && this.handler.mapping.filter(x => x.att_target == this.mapping.att_target).length == 0){
                    this.handler.mapping.push(this.mapping);
                } else if (this.mapping.att_operand == "unmapped"){
                    this.handler.mapping = this.handler.mapping.filter(x => x.att_target != this.mapping.att_target);
                }
                //await Draftsman.sleep(500);
                //this.get_mapping();
            },
            sync_template(){
                if (this.lock_template){return}
                let pythonLikeScript = "{\n";

                for (const [key, value] of Object.entries(this.template)) {
                    if (key === "") {
                        pythonLikeScript += `    "${key}": value[""] if "" in value else "",\n`;
                    } else {
                        pythonLikeScript += `    "${key}": value["${value}"] if "${value}" in value else "",\n`;
                    }
                }

                // Verwijder de laatste komma
                pythonLikeScript = pythonLikeScript.replace(/,\n$/, "\n");

                pythonLikeScript += "}";
                this.mapping.att_template = pythonLikeScript;
            },
            async auto_map(){
                if (this.mapping.att_operand == "unmapped" || (this.mapping.att_operand != "unmapped" && !this.mapping.att_value)){
                    if (this.sources.includes(this.mapping.att_target)){
                        if (this.field.att_type != 'ObjectList'){
                            this.mapping.att_operand = "set";
                            this.mapping.att_value = this.mapping.att_target;
                        } else {
                            this.mapping.att_operand = "convert_items";
                            this.mapping.att_value = this.mapping.att_target;
                            let fields = this.collections[this.mapping.att_value].field.map(x => x.att_name);
                            let referencedView = await Modeler.get_model_by_name(this.field.att_ref,"views/");
                            let template = {};
                            referencedView.field.filter(x => !(x.att_name in template)).forEach(x => template[x.att_name] = "");
                            fields.filter(x => x in template).forEach(x => template[x] = x);
                            this.template = template;
                        }

                    }
                }
            },
            async get_mapping(){
                let eligble = this.handler.mapping.filter(m => m.att_target == this.field.att_name);
                if(this.field.att_type == "ObjectList"){
                    this.sources = Object.keys(this.collections);
                } else {
                    this.sources = this.source.field.map(x => x.att_name);
                    this.sources.push("created_at");
                    this.sources.push("updated_at");
                }
                if (eligble.length != 0){
                    this.mapping =  eligble.at(0);
                } else {
                    let mapping = {
                        att_target: this.field.att_name,
                        att_operand: "unmapped"
                    }
                    this.mapping = mapping;
                }
                if(this.field.att_type == "ObjectList" && this.mapping.att_template){
                    let template = this.mapping.att_template;
                    template = template.replace(
                           /value\["([^"]+)"\]\s+if\s+"([^"]+)"\s+in\s+value\s+else\s+""/g,
                           '"$1"'
                       );
                    template = template.replace(
                        /value\[""\]\s+if\s+""\s+in\s+value\s+else\s+""/g,
                        '""'
                    );
                    this.lock_template = true;
                    template = template.replace(/,(\s*})/g, '$1');
                    template = JSON.parse(template);
                    let referencedView = await Modeler.get_model_by_name(this.field.att_ref,"views/",true);
                    referencedView.field.filter(x => !(x.att_name in template)).forEach(x => template[x.att_name] = "");
                    this.template = template;
                    await Draftsman.sleep(500);
                    this.lock_template = false;
                }
            }
        }
    });
    Alpine.data("viewHandler", function(){
        return {
            source: {},
            collections: {},
            rendering: false,
            target_fields: [],
            async init(){
                this.$watch("handler",this.prepare_data.bind(this));
            },
            async prepare_data(){
                if(this.handler){
                    let repo = await GitRepository.open();
                    let agg = "domain/" + this.handler["att_sub-domain"] + "/" + this.handler.att_aggregate + "/";
                    if (this.handler.att_processor == "dictionary"){
                        if (this.handler.att_dictionary){
                            this.source =  await Modeler.get_model(agg + "entities/" + this.handler.att_dictionary + ".xml",true);
                        } else {
                            this.source = {};
                        }
                    } else {
                        this.source =  await Modeler.get_model(agg + "root.xml",true);
                    }
                    let entities = await repo.list(x => x.startsWith(agg + "entities/") && x.endsWith(".xml"));
                    for (const entityPath of entities){
                        let entity = await Modeler.get_model(entityPath,true);
                        this.collections[entity.att_name] = entity;
                    }
                }
                this.target_fields = this.model.field.filter(x => this.types.includes(x.att_type) || x.att_type == "ObjectList");
            },
            render_editor(){
                let completions = new CodeCompletions();
                completions.add_items(this.model.field.filter(x => this.types.includes(x.att_type) || x.att_type == "ObjectList")
                    .map(x => "entity." + x.att_name));
//                completions.add_items(this.root.field.map(x => "self." + x.att_name));
                Draftsman.codeEditor(this.$el,this.handler["#text"],this._update_code.bind(this),completions);
            },
            _update_code(code){
                this.handler["#text"] = code;
            },
            add_delete_statement(){
                this.handler.delete.push({att_id: Draftsman.makeid(6),att_condition: "#snapshot.isDeleted != ''"});
            },
            async generate_code(){
                this.rendering = true;
                let code = "";
                let fields = this.model.field.filter(x => this.types.includes(x.att_type) || x.att_type == "ObjectList")
                    .map(x => x.att_name);
                let pk = this.model.field.filter(x => x.att_pk == "true").at(0).att_name;

                let score = this.source.field.filter(x => fields.includes(x.att_name)).length;
                let target = "root";
                Object.values(this.collections).forEach(entity => {
                    let count = entity.field.filter(x => fields.includes(x.att_name)).length;
                    if (count > score){
                        score = count;
                        target = entity.att_name;
                    }
                });

                if (target == "root"){
                    code += `key = snapshot.${this.source["att_business-key"]}\n`;
                    code += "if not key:\n\treturn\n";
                    code += 'entity = EntityManager.get(type="'+this.model.att_name+'", key=key, create=True)\n\n';

                    this.source.field.filter(x => fields.includes(x.att_name)).forEach(field => {
                        code += "entity." + field.att_name + " = snapshot." + field.att_name +"\n";
                    });

                    let targets = this.model.field.filter(x => x.att_type == "ObjectList" && x.att_name in this.collections);
                    for (const target of targets){
                        let referencedView = await Modeler.get_model_by_name(target.att_ref,"views/");
                        code += `entity.${target.att_name} =  = convert_to_dictionary(\n\t[\n`;
                        code += "\t\t{\n";
                        referencedView.field.filter(x => fields.includes(x.att_name)).forEach(field => {
                            code += `\t\t\t"${field.att_name}": value["${field.att_name}"] if "${field.att_name}" in value else ""\n`;
                        });
                        code += "\t\t}\n";
                        code += `\t\tfor key, value in snapshot.${target.att_name}.items()\n`;
                        code += "\t]\n)\n\n";
                    }
                    code += `entity.${pk} = key\n`;
                } else {
                    let entity = this.collections[target];
                    code += `for item in snapshot.${target}.values():\n`;
                    code += `\tkey = item.${entity['att_business-key']}`;
                    code += `\tif not key:\n\t\tcontinue\n`;
                    code += `\tentity = EntityManager.get(type="${this.model.att_name}", key=key, create=True)\n`;
                    code += `\tif entity is None:\n\t\tcontinue\n`;
                    code += `\tif snapshot.isDeleted != "":\n\t\tentity.mark_for_deletion = True\n\t\tprint(f"Entity [{entity.type}:{entity.key}] is marked for deletion")\n\t\tcontinue\n`;
                    entity.field.filter(x => fields.includes(x.att_name)).forEach(field => {
                        code += `\tentity.${field.att_name} = item.${field.att_name}\n`;
                    });
                    code += `\tentity.${pk} = key\n`;
                }
                this.handler["#text"] = code;
                await Draftsman.sleep(2000);
                this.navigate(this.navigation);
            }
        }
    });
});