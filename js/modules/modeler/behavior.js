document.addEventListener('alpine:init', () => {
    Alpine.data('behaviorFlow', function(){
        return {
            model: Modeler.prepare_model("behavior",{}),
            _taskId: "",
            listnerId: "",
            triggerModal: false,
            availableTriggers: [],
            flowVariables: [],
            entities: {},
            search: "",
            eventModal: false,
            availableEvents: [],
            selectedTab: this.$persist({}).using(sessionStorage).as("behaviorTab"),
            selectedTest: this.$persist({}).using(sessionStorage).as("testTab"),
            update_idempotency(){
                let trigger = this.model.trigger.filter(x => x.att_source == this.$el.getAttribute("trigger")).at(0);
                let key = this.$el.getAttribute("name");
                console.log(key);
                if(this.$el.checked){
                    if (!('att_idempotency-key' in trigger)){
                      trigger['att_idempotency-key'] = '';
                    }
                    trigger['att_idempotency-key'] += ' ' + key;
                }else{
                    trigger['att_idempotency-key'] = trigger['att_idempotency-key'].replace(key,'');
               }
               trigger['att_idempotency-key'] = trigger['att_idempotency-key'].replace('  ',' ').trim()
            },
            async prepare_add_trigger(){
                this.triggerModal = true;
                let repo = await GitRepository.open();
                let triggers = await repo.list(x => x.endsWith(".xml") && (x.startsWith("commands/") || (x.startsWith("domain/") && x.includes("/events/"))));
                this.availableTriggers = triggers.map(x => {
                    return {
                        name: x.split("/").at(-1).replace(".xml",""),
                        file: x,
                        type: Modeler.determine_type(x)
                    };
                });
            },
            async add_trigger(){
                this.triggerModal = false;
                let root = await Modeler.get_model(this.path.split("behavior-flows/").at(0) + "root.xml");
                let event = await Modeler.get_model(this.$el.getAttribute("file"));
                let fields = event.field.map(x => x.att_name);
                let trigger = {att_source: event.att_name, mapping: [], "att_idempotency-key": ""};
                if (fields.includes(root["att_business-key"])){
                    trigger["att_key-field"] = root["att_business-key"];
                } else {
                    trigger["att_key-field"] = "";
                }
                fields.forEach(field => {
                    trigger.mapping.push({att_target: field, att_value: field});
                });
                event["nested-object"].forEach(x => {
                    trigger.mapping.push({att_target: x.att_name, att_value: x.att_name});
                });
                this.model.trigger.push(trigger);
                this.balance_triggers();
            },
            async remove_trigger(){
                let triggers = this.model.trigger.filter(x => this.$el.getAttribute("trigger") != x.att_source);
                this.model.trigger = triggers;
                this.balance_triggers();
                await this._execute_save();
                await Draftsman.sleep(100);
                this.navigate(this.path);
            },
            balance_triggers(){
                let variables = [];
                this.model.trigger.forEach(trigger => {
                    trigger.mapping.filter(m => m.att_value != "#''").forEach(map =>{
                        variables.push(map.att_target);
                    });
                });
                this.model.trigger.forEach(trigger => {
                    let mapping = trigger.mapping.filter(m => m.att_value != "#''");
                    let targets = mapping.map(x => x.att_target);
                    variables.filter(v => !targets.includes(v)).forEach(v => {
                        mapping.push({
                            att_target: v,
                            att_value: "#''"
                        });
                    });
                    trigger.mapping = mapping;
                });
            },
            modules: [],
            add_validator(){
                this.model.processor.push({
                    att_id: Draftsman.makeid(6),
                    att_type: "validator"
                });
            },
            add_variable(){
                this.model.processor.push({
                    att_id: Draftsman.makeid(6),
                    att_type: "set-variable"
                });
            },
            add_code(){
                this.model.processor.push({
                    att_id: Draftsman.makeid(6),
                    att_type: "code"
                });
            },
            add_inline_code(){
                this.model.processor.push({
                    att_id: Draftsman.makeid(6),
                    att_type: "code",
                    att_code: "flow.variable = 'dummy'"
                });
            },
            add_update_key(){
                this.model.processor.push({
                    att_id: Draftsman.makeid(6),
                    att_type: "update-key"
                });
            },
            async add_emit_event(){
                this.eventModal = false;
                let file = this.$el.getAttribute("file");
                let event = await Modeler.get_model(file);
                let processor = {
                    att_id: Draftsman.makeid(6),
                    att_type: "emit-event",
                    att_ref: event.att_name,
                    mapping: []
                };
                processor.mapping.push(...event.field.map(x => {
                    return {att_target: x.att_name, att_value: ""};
                }));
                processor.mapping.push(...event["nested-object"].map(x => {
                    return {att_target: x.att_name, att_value: ""};
                }));
                this.model.processor.push(processor);
            },
            remove_processor(){
                this.model.processor = this.model.processor.filter(x => x.att_id != this.$el.id);
            },
            move_processor_up() {
                let index = parseInt(this.$el.getAttribute("index"), 10);
                if (index > 0 && index < this.model.processor.length) {
                    [this.model.processor[index - 1], this.model.processor[index]] =
                        [this.model.processor[index], this.model.processor[index - 1]];
                }
            },
            move_processor_down() {
                let index = parseInt(this.$el.getAttribute("index"), 10);
                if (index >= 0 && index < this.model.processor.length - 1) {
                    [this.model.processor[index + 1], this.model.processor[index]] =
                        [this.model.processor[index], this.model.processor[index + 1]];
                }
            },
            get_processor_name(){
                let id = this.$el.id;
                let type = this.$el.getAttribute("type");
                switch (type){
                    case "validator":
                    return "Validator";
                    case "emit-event":
                    let processor = this.model.processor.filter(x => x.att_id == id).at(0);
                    return `Emit Domain Event: ${processor.att_ref}`;
                    case "set-variable":
                    return "Set Variable";
                    default:
                    return type;
                }
            },
            async get_methods(file){
                let repo = await GitRepository.open();
                let content = await repo.read(file);
                let filter = "(flow):";
                return content.split("\n")
                    .filter(x => x.startsWith("def ") && x.endsWith(filter))
                    .map(x => x.replace("def ","").replace(filter,""));
            },
            _update_code(code,id){
                let processor = this.model.processor.filter(x => x.att_id == id).at(0);
                processor.att_code = code.replaceAll("\n","|LB|");
            },
            render_editor(){
                let completions = new CodeCompletions();
//                completions.add_items(this.event.field.map(x => "event." + x.att_name));
//                completions.add_items(this.root.field.map(x => "self." + x.att_name));
                let processor = this.model.processor.filter(x => x.att_id == this.$el.id).at(0);
                Draftsman.codeEditor(this.$el,processor.att_code,this._update_code.bind(this),completions);
            },
            async fetch_flow_vars() {
                let variables = [];

                // Verwerk trigger mappings
                for (let trigger of this.model.trigger) {
                    for (let map of trigger.mapping) {
                        if (!variables.includes(map.att_target)) {
                            variables.push(map.att_target);
                        }
                    }
                }

                // Verwerk set-variable processors
                for (let processor of this.model.processor.filter(x => x.att_type === 'set-variable')) {
                    if (!variables.includes(processor.att_name)) {
                        variables.push(processor.att_name);
                    }
                }

                // Verwerk code processors
                for (let processor of this.model.processor.filter(x => x.att_type === 'code')) {
                    if (processor.att_code) {
                        // Verwerk inline code content
                        let content = processor.att_code;
                        content.split("|LB|")
                            .filter(line => line.replaceAll(" ", "").match(/^(flow\.[\w]+)={1}/g))
                            .forEach(line => {
                                let variable = line.replace("flow.", "").split("=").at(0).trim();
                                if (!variables.includes(variable)) {
                                    variables.push(variable);
                                }
                            });
                    } else {
                        // Haal de code op uit een bestand via een async call
                        let content = await Modeler.get_model(processor.att_file);
                        content = content.content;
                        let method_detected = false;

                        content.split("\n").forEach(line => {
                            if (line.startsWith(`def ${processor.att_handler}(flow):`)) {
                                method_detected = true;
                            } else if (line.startsWith("def")) {
                                method_detected = false;
                            }

                            if (method_detected && line.replaceAll(" ", "").match(/^(flow\.[\w]+)={1}/g)) {
                                let variable = line.replace("flow.", "").split("=").at(0).trim();
                                if (!variables.includes(variable)) {
                                    variables.push(variable);
                                }
                            }
                        });
                    }
                }

                this.flowVariables = variables;
            },
            prepare_state_variable_type: function(oldValue, newValue){
                    if (typeof(oldValue) === "number") {
                        return Number(newValue)
                    } else if (typeof(oldValue) === "boolean") {
                        return JSON.parse(newValue.toLowerCase());
                    } else {
                        return newValue;
                    }
                },
            async init(){
                await Draftsman.sleep(10);
                await this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.force_load.bind(this));
                if (!(this.path in this.selectedTab)){
                    this.selectedTab[this.path] = 2;
                }
                if (!(this.path in this.selectedTest)){
                    this.selectedTest[this.path] = this.model["test-case"].at(0).att_name;
                }
            },
            async force_load(){
                this.readlock = false;
                await this.read();
            },
            async read(){
                await Draftsman.sleep(10);
                if (Modeler.determine_type(this.navigation) == "behavior" && !this.readlock){
                    console.log(this.model);
                    this.readlock = true;
                    try{
                    this.path = this.navigation;
                    let model = await Modeler.get_model(this.path);
                    await Draftsman.updateIfChanged(this, 'model', model);
                    await this.fetch_flow_vars();
                    let repo = await GitRepository.open();
                    this.modules = await repo.list(x => x.startsWith("lib/") && x.endsWith(".py"));
                    let availableEvents = await repo.list(x => x.startsWith(this.path.split("behavior-flows/").at(0) + "events/") && x.endsWith(".xml"));
                    await Draftsman.updateIfChanged(this, 'availableEvents', availableEvents);
                    let files = await repo.list(x=> x.startsWith(this.path.split("behavior-flows/").at(0) + "entities/") && x.endsWith(".xml"));
                    let entities = {};
                    for (let file of files){
                        let entity = await Modeler.get_model(file);
                        entities[entity.att_name] = entity;
                    }
                    } finally {
                        this.readlock = false;
                    }
                }
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async delete_model(){
                await Modeler.delete_model(this.path);
            },
            async rename(){
                if(this.lock){return}
                // alter name in model
                await this._execute_save();
                this.lock = true;
                // Move files to new path
                //await Modeler.force_rename_model(oldpath,newpath);
            },
            async _execute_save(){
                if(this.lock){return}
                let hash = Draftsman.generateFingerprint(this.model);
                if (hash == this.hash){return}
                await Modeler.save_model(this.path,this.model);
                this.hash = Draftsman.generateFingerprint(this.model);
                await this.fetch_flow_vars();
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});