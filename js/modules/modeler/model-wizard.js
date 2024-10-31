/*
ctrl + m --> open wizard
*/

document.addEventListener('alpine:init', () => {
    Alpine.data('modelWizard', function(){
        return {
            active: false,
            state: 0,
            path: "",
            files: [],
            conflicted: false,
            dialog_id: 0,
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
                    this.path = this.model["att_graphql-namespace"] + ".methodName";
                }
                this.state = 2;
            },
            check_command_name_uniqueness(){
                console.log(!apiPathRegex.test(this.path),this.path);
                this.conflicted = !apiPathRegex.test(this.path);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return;
                }
                let elements = Draftsman.splitOnLastDot(this.path);
                let eventName = Draftsman.capitalizeFirstLetter(elements[1]) + elements[0].replaceAll(".","") + "Requested";
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