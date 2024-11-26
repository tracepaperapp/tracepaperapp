var pattern_cache = [];
var selected_pattern = "";

document.addEventListener('alpine:init', () => {
    pattern_cache = Alpine.reactive(pattern_cache);
    selected_pattern = Alpine.reactive(selected_pattern);
    Alpine.data('patternsContainer', function(){
        return {
            patterns: [],
            navigation: "",
            search: this.$persist("").using(sessionStorage).as("patternsSearch"),
            async init(){
                if (pattern_cache.length == 0){
                    await this.reload();
                }
                this.patterns = pattern_cache;
                this.navigation = selected_pattern;
                this.listnerId = Draftsman.registerListener("file-renamed",this.reload.bind(this));
                this.listnerIdTwee = Draftsman.registerListener("force-reload",this.reload.bind(this));
            },
            async reload(){
                let repo = await GitRepository.open();
                pattern_cache = await repo.list(x => x.startsWith("patterns/") && x.endsWith(".xml"));
                this.patterns = pattern_cache;
                if (sessionStorage.prepared_pattern){
                    await Draftsman.sleep(500);
                    this.search = sessionStorage.prepared_pattern;
                    await Draftsman.sleep(500);
                    sessionStorage.removeItem("prepared_pattern");
                }
            },
            async open_diagram(pattern){
                this.navigation = "";
                await Draftsman.sleep(500);
                selected_pattern = pattern;
                this.navigation = pattern;
                if (this.search == ""){
                    this.search = pattern.split("/").at(-1).replace(".xml","");
                }
            },
            async remove_pattern(pattern){
                try{
                    await Modeler.delete_model(pattern);
                } catch(err){
                    console.error(err);
                } finally {
                    pattern_cache = pattern_cache.filter(x => x != pattern);
                    this.patterns = pattern_cache;
                }
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
                Draftsman.deregisterListener(this.listnerIdTwee);
            }
        }
    });
    Alpine.data('patternModel', function(){
        return {
            model: {},
            newName: "",
            duplicateName: false,
            async init(){
                this.model = await Modeler.get_model(this.pattern);
                this.newName = this.model.att_name;
                this.$watch("model",this.save.bind(this));
            },
            check_name(){
                this.duplicateName = pattern_cache.filter(x => x.endsWith(this.newName + ".xml")).length != 0;
            },
            async rename(){
                if(this.pattern_lock){return}
                if (!pascalCaseRegex.test(this.newName)){return}
                let newPath = "patterns/" + this.newName + ".xml";
                this.model.att_name = this.newName;
                await this._execute_save();
                this.pattern_lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.pattern,newPath);
            },
            async save(){
                Draftsman.debounce(this.pattern,this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                if(this.pattern_lock){return}
                await Modeler.save_model(this.pattern,this.model);
            },
        }
    });
});