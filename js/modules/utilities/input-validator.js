const pascalCaseRegex = /^[A-Z][a-zA-Z0-9]*$/;
const viewPathRegex = /^([A-Z][a-zA-Z0-9]*)(\/[A-Z][a-zA-Z0-9]*)*$/;
const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;
const lowercaseRegex = /^[a-z]+$/;
const apiPathRegex = /^([A-Z][a-z]*\.)+[a-z][a-zA-Z]*$/;
const githubAccountRegex = /^[a-zA-Z0-9\-]{1,39}$/;
const repoRegex = /^https:\/\/github.com\/[a-zA-Z0-9\-._]+\/[a-zA-Z0-9\-._]+$/;

document.addEventListener('alpine:init', () => {
    Alpine.data('inputValidator', (pattern=null) => {
        return {
            isValid: true,
            message: null,
            pattern: pattern,
            async init(){
                await Draftsman.sleep(100);
                this.$el.dispatchEvent(new Event('input'));
                this.$el.setAttribute('data-lpignore', 'true');
                this.$el.setAttribute('autocomplete', 'off');
                this.$el.setAttribute('id', Draftsman.uuidv4());
                this.$el.classList.add('input-ghost');
                this.$el.classList.add('modeler-input');
            },
            pascal_cased(){
                const message = "Must be PascalCased!";
                this.validate_regex(pascalCaseRegex,message);
            },
            view_path(){
                const message = "Must be a View/Path!";
                this.validate_regex(viewPathRegex,message);
            },
            camel_cased(){
                const message = "Must be camelCased!";
                this.validate_regex(camelCaseRegex,message);
            },
            lower_cased(){
                const message = "Must be lowerCased!";
                this.validate_regex(lowercaseRegex,message);
            },
            api_path(){
                const message = "Invalid path format: Ensure each section is PascalCased, separated by dots, and ends with a camelCased word!";
                this.validate_regex(apiPathRegex,message);
            },
            github_account(){
                const message = "Must be a valid GitHub username or organisation name!";
                this.validate_regex(githubAccountRegex,message);
            },
            github_repo_url(){
                const message = "Must be a gitHub repo url!";
                this.validate_regex(repoRegex,message);
            },
            custom_pattern(){
                console.log(this.pattern);
                const regex = new RegExp(this.pattern);
                const message = this.$el.getAttribute("message");
                this.validate_regex(regex,message);
            },
            validate_regex(regex,message){
                let value = this.$el.value;
                this.isValid = value == "" || regex.test(value);
                if (!this.isValid && !this.message){
                  this.message = document.createElement('small');
                  this.message.innerText = message;
                  this.message.classList.add('block', 'mt-2', 'text-red-500', 'text-sm');
                  this.$el.insertAdjacentElement('afterend',this.message);
                } else if (this.isValid && this.message){
                    this.message.remove();
                    this.message = null;
                }
                if (this.isValid){
                    this.$el.classList.add('input-ghost');
                    this.$el.classList.remove('input-error');
                }else{
                    this.$el.classList.add('input-error');
                    this.$el.classList.remove('input-ghost');
                }
            }
        }
    });
    Alpine.data("roleSelector",function(){
        return {
            roles: [],
            pattern: "",
            async init(){
                let meta = await Modeler.get_model("meta.json");
                this.roles = meta.roles;
                this.roles.unshift("");
                let repo = await GitRepository.open();
                let files = await repo.list(x => x.startsWith("expressions/") && x.endsWith(".xml"));
                let methods = [];
                for (let i=0; i < files.length; i++){
                    let model = await Modeler.get_model(files[i]);
                    if (model.att_type == "ActorEventRole"){
                        this.roles.push(`#global.${model.att_name}(${model.att_input.replaceAll(';',', ')})`);
                        methods.push(model.att_name);
                    }
                }
                this.pattern = `^#global\\.(${methods.join("|")})\\((.*)\\)$`;
            }
        }
    });
    Alpine.data("triggerFieldSelector", function(){
            return {
                options: [],
                keyOptions: [],
                async init(){
                    let trigger = await Modeler.get_model_by_name(this.trigger.att_source);
                    this.options = trigger.field.map(x => x.att_name);
                    this.options.push(...trigger["nested-object"].map(x => x.att_name));
                    this.options.unshift("");
                    this.options.push("#''");

                    this.keyOptions = trigger.field.filter(x => x.att_type == "String").map(x => x.att_name);
                    this.keyOptions.unshift("");
                    let repo = await GitRepository.open();
                    let files = await repo.list(x => x.startsWith("expressions/") && x.endsWith(".xml"));
                    for (let i=0; i < files.length; i++){
                        let model = await Modeler.get_model(files[i]);
                        if (model.att_type == "TriggerKeyField"){
                            this.keyOptions.push(`#global.${model.att_name}(${model.att_input.replaceAll(';',', ')})`);
                        }
                    }
                },
            }
        });
});