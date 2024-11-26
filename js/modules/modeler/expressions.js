var expression_cache = [];
var selected_expression = "";

document.addEventListener('alpine:init', () => {
    expression_cache = Alpine.reactive(expression_cache);
    selected_expression = Alpine.reactive(selected_expression);
    Alpine.data('expressionsContainer', function(){
        return {
            expressions: [],
            navigation: "",
            search: this.$persist("").using(sessionStorage).as("expressionSearch"),
            async init(){
                if (expression_cache.length == 0){
                    await this.reload();
                }
                this.expressions = expression_cache;
                this.navigation = selected_expression;
                this.listnerId = Draftsman.registerListener("file-renamed",this.reload.bind(this));
                this.listnerIdTwee = Draftsman.registerListener("force-reload",this.reload.bind(this));
            },
            async reload(){
                let repo = await GitRepository.open();
                expression_cache = await repo.list(x => x.startsWith("expressions/") && x.endsWith(".xml"));
                this.expressions = expression_cache;
                if (sessionStorage.prepared_expression){
                    this.search = sessionStorage.prepared_expression;
                    sessionStorage.removeItem("prepared_expression");
                }
            },
            async open_diagram(expression){
                this.navigation = "";
                await Draftsman.sleep(500);
                selected_expression = expression;
                this.navigation = expression;
                if (this.search == ""){
                    this.search = expression.split("/").at(-1).replace(".xml","");
                }
            },
            async remove_expression(expression){
                try{
                    await Modeler.delete_model(expression);
                } catch(err){
                    console.error(err);
                } finally {
                    expression_cache = expression_cache.filter(x => x != expression);
                    this.expressions = expression_cache;
                }
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
                Draftsman.deregisterListener(this.listnerIdTwee);
            }
        }
    });
    Alpine.data('expressionModel', function(){
        return {
            model: {},
            newName: "",
            pattern: /^[a-z]{1,25}(;[a-z]{1,24})*$/g,
            duplicateName: false,
            async init(){
                this.model = await Modeler.get_model(this.expression);
                this.newName = this.model.att_name;
                this.$watch("model",this.save.bind(this));
            },
            check_name(){
                this.duplicateName = expression_cache.filter(x => x.endsWith(this.newName + ".xml")).length != 0;
            },
            async rename(){
                if(this.expression_lock){return}
                if (!camelCaseRegex.test(this.newName)){return}
                let newPath = "expressions/" + this.newName + ".xml";
                this.model.att_name = this.newName;
                await this._execute_save();
                this.expression_lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.expression,newPath);
            },
            async save(){
                Draftsman.debounce(this.expression,this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                if(this.expression_lock){return}
                await Modeler.save_model(this.expression,this.model);
            },
        }
    });
});