document.addEventListener('alpine:init', () => {
    Alpine.data('notifierModel', function(){
        return {
            model: Modeler.prepare_model("notifier",{}),
            selectedTab: this.$persist({}).using(sessionStorage).as("notifierTab"),
            _taskId: "",
            listnerId: "",
            triggerModal: false,
            search: "",
            newName: "",
            availableTriggers: [],
            flowVariables: [],
            templates: [],
            modules: [],
            async fetch_flow_vars() {
                try{
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
                    for (let activity of this.model.activity) {
                        if (['set-variable','retrieve-email-from-iam','render-template','fetch-property','call-internal-api','HTTP'].includes(activity.att_type)){
                            variables.push(activity.att_name);
                        }
                        if (['get-token','get-systemuser-token'].includes(activity.att_type)){
                            variables.push("token");
                        }
                        if (activity.att_type == 'code'){
                            if ("att_code" in activity) {
                                // Verwerk inline code content
                                let content = activity.att_code;
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
                                let content = await Modeler.get_model(activity["att_python-file"]);
                                content = content.content;
                                let method_detected = false;

                                content.split("\n").forEach(line => {
                                    if (line.startsWith(`def ${activity.att_handler}(flow):`)) {
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
                    }
                    this.flowVariables = Draftsman.deduplicateArray(variables);
                } catch(err){
                    console.error(err);
                }
            },
            async remove_trigger(){
                let triggers = this.model.trigger.filter(x => this.$el.getAttribute("trigger") != x.att_source);
                this.model.trigger = triggers;
                this.balance_triggers();
                await this._execute_save();
                await Draftsman.sleep(100);
                this.navigate(this.path);
            },
            async sync_to_disk(){
                await this._execute_save();
                this.navigate(this.navigation);
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
                this.availableTriggers.push(...[
                    {name: "@afterDeployment", file: "@afterDeployment", type: "Scheduled"},
                    {name: "@cron(0 0 * * ? *)", file: "@cron(0 0 * * ? *)", type: "Scheduled"},
                    {name: "@rate(1 minute)", file: "@rate(1 minute)", type: "Scheduled"}
                ]);
            },
            async add_trigger(){
                this.triggerModal = false;
                let event = await Modeler.get_model(this.$el.getAttribute("file"));
                let fields = event.field.map(x => x.att_name);
                let trigger = {att_source: event.att_name, mapping: [], "att_idempotency-key": ""};
                fields.forEach(field => {
                    trigger.mapping.push({att_target: field, att_value: field});
                });
                event["nested-object"].forEach(x => {
                    trigger.mapping.push({att_target: x.att_name, att_value: x.att_name});
                });
                this.model.trigger.push(trigger);
                this.balance_triggers();
            },
            update_idempotency(){
                let trigger = this.model.trigger.filter(x => x.att_source == this.$el.getAttribute("trigger")).at(0);
                let key = this.$el.getAttribute("name");
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
            async get_methods(file){
                let repo = await GitRepository.open();
                let content = await repo.read(file);
                let filter = "(flow):";
                return content.split("\n")
                    .filter(x => x.startsWith("def ") && x.endsWith(filter))
                    .map(x => x.replace("def ","").replace(filter,""));
            },
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.reload.bind(this));
                if (!(this.navigation in this.selectedTab)){
                    this.selectedTab[this.navigation] = 2;
                }
                const urlParams = new URLSearchParams(window.location.search);
                const tab = urlParams.get('tab');
                console.log(tab)
                if (tab) {
                    this.selectedTab[this.navigation] = Number(tab);
                }
            },
            async reload(){
                this.notifier_lock = true;
                try {
                    await this.read();
                } finally {
                    await Draftsman.sleep(100);
                    this.notifier_lock = false;
                }
            },
            async read(){
                await Draftsman.sleep(10);
                this.model = await Modeler.get_model(this.navigation);
                this.newName = this.model.att_name;
                await this.fetch_flow_vars();
                let repo = await GitRepository.open();
                let templates = await repo.list(x => x.startsWith("templates/"));
                this.modules = await repo.list(x => x.startsWith("lib/") && x.endsWith(".py"));
                await Draftsman.updateIfChanged(this, 'templates', templates);
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async delete_model(){
                await Modeler.delete_model(this.navigation);
            },
            async check_name(){
                let repo = await GitRepository.open();
                let files = await repo.list(x => x.endsWith(this.navigation.replace(this.model.att_name + ".xml", this.newName + ".xml")));
                this.duplicateName = files.length > 0;
            },
            async rename(){
                if(this.notifier_lock){return}
                // alter name in model
                let newPath = this.navigation.replace(this.model.att_name + ".xml", this.newName + ".xml");
                this.model.att_name = this.newName;
                await this._execute_save();
                this.notifier_lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.navigation,newPath);
            },
            async _execute_save(){
                if(this.notifier_lock){return}
                await Modeler.save_model(this.navigation,this.model);
                await this.fetch_flow_vars();
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
    Alpine.data('notifierInlineQuery', function(){
        return {
            async render_editor(){
                Draftsman.debounce(this.$el.id,this.execute_render_editor.bind(this),1000);
            },
            async execute_render_editor(){
                await Draftsman.sleep(500);
                let completions = new CodeCompletions();
                completions.add_items(this.flowVariables.map(x => "flow." + x ));
                Draftsman.codeEditor(this.$el,this.activity.att_query,this.save.bind(this),completions);
            },
            save(code,id){
                this.activity.att_query = code.replaceAll('\n','|LB|');
            }
        }
    });
    Alpine.data('notifierInlineCode', function(){
        return {
            async render_editor(){
                Draftsman.debounce(this.$el.id,this.execute_render_editor.bind(this),1000);
            },
            async execute_render_editor(){
                await Draftsman.sleep(500);
                let completions = new CodeCompletions();
                completions.add_items(this.flowVariables.map(x => "flow." + x ));
                Draftsman.codeEditor(this.$el,this.activity.att_code,this.save.bind(this),completions);
            },
            save(code,id){
                this.activity.att_code = code.replaceAll('\n','|LB|');
            }
        }
    });
    Alpine.data('notifierInlineHttp', function(){
        return {
            async render_editor(){
                Draftsman.debounce(this.$el.id,this.execute_render_editor.bind(this),1000);
            },
            async execute_render_editor(){
                await Draftsman.sleep(500);
                let completions = new CodeCompletions();
                completions.add_items(this.flowVariables.map(x => "flow." + x ));
                Draftsman.codeEditor(this.$el,this.activity.att_body,this.save.bind(this),completions);
            },
            save(code,id){
                this.activity.att_body = code.replaceAll('\n','|LB|');
            }
        }
    });
    Alpine.data('notifierFlowControl', function(){
        return {
            activity_array: [],
            target: "",
            array_lock: false,
            insertActivityModal: false,
            search: this.$persist("").using(sessionStorage).as("activity-search"),
            flowControlInitialized: false,
            async init(){
                this.$watch("model",this.reload.bind(this));
                this.$watch("activity",this.reload.bind(this));
                this.$watch("activity_array",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.reload.bind(this));
                this.flowControlInitialized = true;
                await this.reload();
            },
            async reload(){
                if (this.array_lock){return}
                await Draftsman.sleep(100);
                if(this.activity){
                    this.target = "activity";
                    this.activity_array = Alpine.reactive(this.activity.activity);
                } else {
                    this.target = "model";
                    this.activity_array = Alpine.reactive(this.model.activity);
                }
            },
            get_types(){
               return this.activity_types;
            },
            set_nested(){
               this.activity_types = this.activity_types.filter(x => x != "loop");
            },
            save(){
                if (this.target == "model"){
                    this.model.activity = this.activity_array;
                } else if(this.target == "activity"){
                    let activity = this.model.activity.filter(x => x.att_id == this.activity.att_id).at(0);
                    activity.activity = this.activity_array;
                }
            },
            async remove_activity(){
                if (this.array_lock){return}
                this.array_lock = true;
                this.activity_array = this.activity_array.filter(x => x.att_id != this.$el.id);
                await Draftsman.sleep(1000);
                this.array_lock = false;
            },
            async move_activity_up() {
                let index = parseInt(this.$el.getAttribute("index"), 10);
                if (index > 0 && index < this.activity_array.length) {
                    if (this.array_lock){return}
                    this.array_lock = true;
                    [this.activity_array[index - 1], this.activity_array[index]] =
                        [this.activity_array[index], this.activity_array[index - 1]];
                    await Draftsman.sleep(1000);
                    this.array_lock = false;
                }
            },
            async move_activity_down() {
                let index = parseInt(this.$el.getAttribute("index"), 10);
                if (index >= 0 && index < this.activity_array.length - 1) {
                    if (this.array_lock){return}
                    this.array_lock = true;
                    [this.activity_array[index + 1], this.activity_array[index]] =
                        [this.activity_array[index], this.activity_array[index + 1]];
                    await Draftsman.sleep(1000);
                    this.array_lock = false;
                }
            },
            prepare_insert_after(){
                this.insert_mode = "after";
                this.reference_index = parseInt(this.$el.getAttribute("index"), 10);
                this.insertActivityModal = true;
            },
            prepare_insert_before(){
                this.insert_mode = "before";
                this.reference_index = parseInt(this.$el.getAttribute("index"), 10);
                this.insertActivityModal = true;
            },
            insert(){
                this.insertActivityModal = false;
                let type = this.$el.getAttribute("activity-type");
                let activity = {};

                switch(type){
                    case "loop":
                        activity.activity = [];
                        break;
                }

                activity.att_type = type;
                activity.att_id = Draftsman.makeid(6);
                switch(this.insert_mode){
                    case "after":
                        this.activity_array.splice(this.reference_index + 1, 0, activity);
                        break;
                    case "before":
                        this.activity_array.splice(this.reference_index, 0, activity);
                        break;
                }
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            },
            activity_types: [
                  "create-iam-group",
                  "delete-iam-group",
                  "add-user-to-iam-group",
                  "remove-user-from-iam-group",
                  "retrieve-email-from-iam",
                  "render-template",
                  "send-email",
                  "send-graphql-notification",
                  "write-file",
                  "fetch-property",
                  "get-token",
                  "get-systemuser-token",
                  "iam-create-systemuser",
                  "iam-create-user",
                  "iam-delete-user",
                  "set-variable",
                  "call-internal-api",
                  "code",
            //      "dmn",
                  "HTTP",
            //      "scheduled-event",
                  "invalidate-cdn",
                  "loop"
            ]
        }
    });
});