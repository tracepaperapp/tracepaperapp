document.addEventListener('alpine:init', () => {
    Alpine.data('inputValidator', function(){
        return {
            isValid: true,
            message: null,
            async init(){
                await Draftsman.sleep(100);
                this.$el.dispatchEvent(new Event('input'));
                this.$el.setAttribute('data-lpignore', 'true');
                this.$el.setAttribute('autocomplete', 'off');
            },
            pascal_cased(){
                const pascalCaseRegex = /^[A-Z][a-zA-Z0-9]*$/;
                const message = "Must be PascalCased!";
                this.validate_regex(pascalCaseRegex,message);
            },
            camel_cased(){
                const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;
                const message = "Must be camelCased!";
                this.validate_regex(camelCaseRegex,message);
            },
            lower_cased(){
                const lowercaseRegex = /^[a-z]+$/;
                const message = "Must be lowerCased!";
                this.validate_regex(lowercaseRegex,message);
            },
            github_account(){
                const githubAccount = /^[a-zA-Z0-9\-]{1,39}$/;
                const message = "Must be a valid GitHub username or organisation name!";
                this.validate_regex(githubAccount,message);
            },
            github_repo_url(){
                const repoRegex = /^https:\/\/github.com\/[a-zA-Z0-9\-._]+\/[a-zA-Z0-9\-._]+$/;
                const message = "Must be a gitHub repo url!";
                this.validate_regex(repoRegex,message);
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
});