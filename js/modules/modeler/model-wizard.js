/*
ctrl + m --> open wizard
    c --> add command
ctrl + shift + c --> copy wizard
*/

document.addEventListener('alpine:init', () => {
    Alpine.data('modelWizard', function(){
        return {
            copy_modal: false,
            active: this.$persist(false).using(sessionStorage).as("wizardActive"),
            state: this.$persist(0).using(sessionStorage).as("wizardState"),
            parameters: this.$persist({}).using(sessionStorage).as("wizardParameters"),
            copyCommand: "",
            files: [],
            model: {},
            type: "",
            sources: [],
            search: "",
            ready: false,
            next: false,
            copyEnabled: false,
            previous: false,
            conflicted: this.$persist(false).using(sessionStorage).as("wizardConflicted"),
            dialog_id: this.$persist(0).using(sessionStorage).as("wizardDialog"),
            async init(){
                this.$watch("state",this.update_context.bind(this));
                this.$watch("navigation",this.update_context.bind(this));
                await this.update_context();
            },
            async update_context(){
                switch(this.state){

                    // Command modeler
                    case 10:
                        this.update_action_buttons(true);
                        break;
                    case 11:
                        this.update_action_buttons(true,true);
                        break;
                    case 12:
                        await this.list_sources();
                        this.update_action_buttons(false,true,true);
                        break;

                    // whats next
                    case 20:
                        console.log("todo")
                    default:
                        this.update_action_buttons();
                }
                this.set_context();
            },
            update_action_buttons(next=false,previous=false,ready=false){
                this.next = next;
                this.previous = previous;
                this.ready = ready;
            },
            async insert_model(){
                this.active = false;
                let prepared_model = {};
                switch (this.parameters.type){
                    case "command":
                        Modeler._roots[this.parameters.file] = "event";
                        prepared_model["att_graphql-namespace"] = this.parameters.namespace;
                        prepared_model["att_graphql-name"] = this.parameters.method;
                        prepared_model.att_name = this.parameters.eventName;
                        prepared_model.att_type = "ActorEvent";
                        prepared_model.att_authorization = this.parameters.att_authorization;
                        if (this.parameters.att_role){
                            prepared_model.att_role = this.parameters.att_role;
                        }
                        let attributes = await this.fetch_attributes();
                        let keysWhitelist = ["att_name","att_type","att_pattern","att_default","att_auto-fill"];
                        prepared_model.field = Draftsman.filterKeys(attributes.fields,keysWhitelist);
                        attributes.entities.forEach(e => {
                            e.field = Draftsman.filterKeys(e.field,keysWhitelist);
                        });
                        prepared_model["nested-object"] = Draftsman.filterKeys(attributes.entities,["att_name","field"]);
                        break;
                    default:
                        console.error("Create for type not implemented: ",this.parameters.type);
                }
                let file = this.parameters.file;
                await Modeler.save_model(file,prepared_model);
                this.navigate(file);
                this.close();
            },
            async fetch_attributes(){
                if (!this.parameters.copyFrom){return {}};
                let type = Modeler.determine_type(this.parameters.copyFrom);
                let result = {};
                let content = await Modeler.get_model(this.parameters.copyFrom);
                result.fields = [...content.field];
                result.entities = [...content["nested-object"]];
                if (type == "aggregate"){
                    let entities = this.sources.filter(x => x.startsWith(this.parameters.copyFrom.replace("root.xml","entities/")));
                    for (let i = 0; i < entities.length; i++){
                        let entity = await Modeler.get_model(entities[i]);
                        result.entities.push(entity);
                    }
                }
                return result;
            },
            async copy_attributes(){
                this.copy_modal = false;
                let attributes = await this.fetch_attributes();
                switch (this.type){
                    case "command":
                        let keysWhitelist = ["att_name","att_type","att_pattern","att_default","att_auto-fill"];
                        let fields = Draftsman.filterKeys(attributes.fields,keysWhitelist);
                        attributes.entities.forEach(e => {
                            e.field = Draftsman.filterKeys(e.field,keysWhitelist);
                        });
                        let entities = Draftsman.filterKeys(attributes.entities,["att_name","field"]);
                        let keys = this.model.field.map(x => x.att_name);
                        keys.push(...this.model["nested-object"].map(x => x.att_name));
                        fields.filter(x => !keys.includes(x.att_name)).forEach(f => {
                            this.model.field.push(f);
                            keys.push(f.att_name);
                        });
                        entities.filter(x => !keys.includes(x.att_name)).forEach(e => {
                            this.model["nested-object"].push(e);
                        });
                        break;
                    default:
                       console.error("Create for type not implemented: ",this.type);
                }
                await Modeler.save_model(this.file,this.model);
                this.navigate(this.file);
            },
            async start(){
                this.active = true;
                if (this.state == 0){
                    this.state = 1;
                }
                let repo = await GitRepository.open();
                this.files = await repo.list();
            },
            async set_context(){
                this.file = this.navigation;
                this.model = await Modeler.get_model(this.file);
                this.type = Modeler.determine_type(this.file);
                this.copyEnabled = ["command"].includes(this.type);
            },
            async start_command(){
                if (this.type == "command"){
                    this.parameters.path = this.model["att_graphql-namespace"] + ".methodName";
                } else {
                    this.parameters.path = "Namespace.method"
                }
                if (["command","aggregate","entity"].includes(this.type)){
                    this.parameters.copyFrom = this.file;
                }
                this.parameters.type = "command";
                this.conflicted = true;
                this.state = 10;
            },
            check_command_name_uniqueness(){
                this.conflicted = !apiPathRegex.test(this.parameters.path);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return;
                }
                let elements = Draftsman.splitOnLastDot(this.parameters.path);
                let eventName = Draftsman.capitalizeFirstLetter(elements[1]) + elements[0].replaceAll(".","") + "Requested";
                this.parameters.eventName = eventName;
                this.parameters.commandName = eventName.replace('Requested','');
                this.parameters.namespace = elements[0];
                this.parameters.method = elements[1];
                let newFile = `commands/${elements[0].replaceAll('.','/')}/${eventName}.xml`;
                this.parameters.file = newFile;
                this.conflicted = this.files.includes(newFile);
                console.log(this.conflicted);
                if (this.conflicted){
                    this.dialog_id = 1;
                } else {
                    this.dialog_id = 0;
                }
            },
            close(){
                this.active = false;
                this.state = 0;
                this.conflicted = false;
                this.dialog_id = 0;
                this.parameters = {};
                this.next = false;
                this.previous = false;
                this.ready = false;
            },
            async copy_fields(){
                await this.list_sources();
                this.copy_modal = true;
            },
            async list_sources(){
                let repo = await GitRepository.open();
                this.sources = await repo.list(x => (
                        x.startsWith("commands/") ||
                        (x.startsWith("domain/") && x.includes("/root")) ||
                        (x.startsWith("domain/") && x.includes("/entities/"))
                    )&& x.endsWith(".xml"));
                console.log(this.sources);
            },
            handle_keydown(event) {
                // Check voor Windows (Ctrl + M) of Mac (Cmd + M)
                let type = Modeler.determine_type(this.navigation);
                if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
                    event.preventDefault();
                    this.start();
                } else if (this.state == 1 && event.key === 'c'){
                    event.preventDefault();
                    this.start_command();
                } else if((event.ctrlKey || event.metaKey) && event.key === 'i' && ["command"].includes(type)) {
                   event.preventDefault();
                   // todo
               } else if((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'c' && ["command"].includes(type)) {
                   event.preventDefault();
                   this.copy_fields();
               } else if (event.key === 'Escape' || event.key === 'Esc') {
                   this.active = false;
                   this.copy_modal = false;
               }
            }
        }
    });
});