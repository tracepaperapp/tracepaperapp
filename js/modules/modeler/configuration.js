
document.addEventListener('alpine:init', () => {
    expression_cache = Alpine.reactive(expression_cache);
    selected_expression = Alpine.reactive(selected_expression);
    Alpine.data('configurationContainer', function(){
        return {
            model: {},
            search: this.$persist("").using(sessionStorage).as("dependencySearch"),
            async init(){
                await this.reload();
                this.listnerId = Draftsman.registerListener("force-reload",this.reload.bind(this));
                this.$watch("model",this.save.bind(this));
            },
            search_package(){
                // TODO package search via projection
            },
            async reload(){
                this.model = await Modeler.get_model("config.xml");
            },
            async save(){
                Draftsman.debounce("config",this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                await Modeler.save_model("config.xml",this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
    Alpine.data('metaContainer', function(){
        return {
            model: {roles: []},
            async init(){
                await this.reload();
                this.listnerId = Draftsman.registerListener("force-reload",this.reload.bind(this));
                this.$watch("model",this.save.bind(this));
            },
            add_role(){
                let role = this.$el.value;
                if (role && camelCaseRegex.test(role)){
                    this.model.roles.push(role);
                    this.$el.value = "";
                }
            },
            async reload(){
                this.model = await Modeler.get_model("meta.json");
            },
            async save(){
                Draftsman.debounce("meta",this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                await Modeler.save_model("meta.json",this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});