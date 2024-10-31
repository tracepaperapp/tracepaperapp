/*
ctrl + m --> open wizard
*/

document.addEventListener('alpine:init', () => {
    Alpine.data('modelWizard', function(){
        return {
            active: this.$persist(false).using(sessionStorage).as("wizardActive"),
            state: this.$persist(0).using(sessionStorage).as("wizardState"),
            parameters: this.$persist({}).using(sessionStorage).as("wizardParameters"),
            files: [],
            conflicted: this.$persist(false).using(sessionStorage).as("wizardConflicted"),
            dialog_id: this.$persist(0).using(sessionStorage).as("wizardDialog"),
            init(){
                //this.$watch("path",this.save.bind(this));
            },
            async start(){
                this.active = true;
                this.state = 1;
                let repo = await GitRepository.open();
                this.files = await repo.list();
            },
            async set_context(){
                this.file = this.$el.getAttribute("file");
                this.model = await Modeler.get_model(this.file);
                this.type = Modeler.determine_type(this.file);
                console.log(this.type,this.model);
            },
            async start_command(){
                if (this.type == "command"){
                    this.parameters.path = this.model["att_graphql-namespace"] + ".methodName";
                }
                this.state = 2;
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
                this.parameters.commandName = eventName.replace('Requested','')
                let newFile = `commands/${elements[0].replaceAll('.','/')}/${eventName}.xml`;
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
            },
            handle_keydown(event) {
                // Check voor Windows (Ctrl + M) of Mac (Cmd + M)
                if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
                    event.preventDefault();
                    this.start();
                } else if (this.state == 1 && event.key === 'c'){
                    event.preventDefault();
                    this.start_command();
                }
            }
        }
    });
});