document.addEventListener('alpine:init', () => {
    Alpine.data('scenarioModel', function(){
        return {
            model: Modeler.prepare_model("scenario",{}),
            path: "",
            repo: null,
            _taskId: "",
            listnerId: "",
            newName: "",
            scenarios: [],
            duplicateName: false,
            initialized: false,
            active: "",
            insertActivityModal: false,
            add_dependency(){
                if(this.$el.value && !this.model.att_extends.includes(this.$el.value)){
                    let dependencies = this.model.att_extends.split(";");
                    dependencies.push(this.$el.value);
                    this.model.att_extends = dependencies.join(";");
                }
                this.$el.value = "";
            },
            onScroll() {
                const scrollContainer = this.$el;
                const tables = scrollContainer.querySelectorAll('table');
                const containerRect = scrollContainer.getBoundingClientRect();
                const threshold = containerRect.top + (containerRect.height * 0.2);

                let active = "";
                for (const table of tables) {
                    const rect = table.getBoundingClientRect();
                    if (
                        rect.top < threshold && // Bovenkant van de tabel is boven de drempel
                        rect.bottom > containerRect.top // Onderkant van de tabel is onder de bovenkant van de container
                    ) {
                        active = table.getAttribute("x-activity-id");
                    }
                }

                // Update de actieve tabel
                this.active = active;
                this.scrollContainer = scrollContainer;
            },
            scrollToTable(id) {
                this.active = id;
                const table = this.scrollContainer.querySelector(`table[x-activity-id="${id}"]`);

                if (table) {
                    table.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                        inline: 'nearest'
                    });
                } else {
                    console.error(`Table with activity.att_id "${id}" not found.`);
                }
            },
            async move_activity_up() {
                let index = parseInt(this.$el.getAttribute("index"), 10);
                if (index > 0 && index < this.model.activity.length) {
                    [this.model.activity[index - 1], this.model.activity[index]] =
                        [this.model.activity[index], this.model.activity[index - 1]];
                }
            },
            move_activity_down(){
                let index = parseInt(this.$el.getAttribute("index"), 10);
                if (index >= 0 && index < this.model.activity.length - 1) {
                    [this.model.activity[index + 1], this.model.activity[index]] =
                        [this.model.activity[index], this.model.activity[index + 1]];
                }
            },
            remove_activity(){
                this.model.activity = this.model.activity.filter(x => x.att_id != this.$el.getAttribute("id"));
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
//                let type = this.$el.getAttribute("activity-type");
//                let activity = {};
//
//                switch(type){
//                    case "loop":
//                        activity.activity = [];
//                        break;
//                }
//
//                activity.att_type = type;
//                activity.att_id = Draftsman.makeid(6);
//                switch(this.insert_mode){
//                    case "after":
//                        this.activity_array.splice(this.reference_index + 1, 0, activity);
//                        break;
//                    case "before":
//                        this.activity_array.splice(this.reference_index, 0, activity);
//                        break;
//                }
            },
            async init(){
                this.repo = await GitRepository.open();
                this.path = this.$el.getAttribute("file");
                this.newName = this.path.split("/").at(1).split(".").at(0);
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async check_name(){
                let files = await this.repo.list(x => x == "scenarios/" + this.newName + ".xml");
                this.duplicateName = files.length != 0;
            },
            _update_code(code){
                this.content = code;
            },
            async read(){
                this.initialized = false;
                this.model = await Modeler.get_model(this.path);
                let scenarios = await this.repo.list(x => x.startsWith("scenarios/") && x.endsWith(".xml"));
                scenarios = scenarios.map(x => x.split("/").at(-1).replace(".xml",""));
                this.scenarios = scenarios.filter(x => x != this.model.att_name && !this.model.att_extends.includes(x));
                this.initialized = true;
                if (this.active == ""){
                    this.active = this.model.activity.at(0).att_id;
                }
            },
            async rename(){
                if(this.lock){return}
                this.model.att_name = this.newName;
                await this._execute_save();
                this.lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.path,"scenarios/" + this.newName + ".xml");
            },
            async delete_model(){
                await Modeler.delete_model(this.path);
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                if(this.lock){return}
                await Modeler.save_model(this.path,this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
    Alpine.data('scenarioActivity',function(){
        return {
            type: "",
            init(){
                switch(this.activity.att_type){
                    case "mutation":
                        this.type = "Command";
                        break;
                    default:
                        this.type = Draftsman.capitalizeFirstLetter(this.activity.att_type.replace("-"," "));
                }
            },
            add_input(){
                this.activity.input.push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    att_type: "String",
                    att_value: ""
                });
            }
        }
    });
});