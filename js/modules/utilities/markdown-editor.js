document.addEventListener('alpine:init', () => {
    Alpine.data('markdownEditor', function(){
        return {
            content: "",
            html: "",
            path: "",
            repo: null,
            _taskId: "",
            listnerId: "",
            element: null,
            async init(){
                this.element = this.$el;
                this.repo = await GitRepository.open();
                this.converter = new showdown.Converter({
                    strikethrough: true,
                    tables: true,
                    tablesHeaderId: true,
                    tasklists: true,
                    underline: true
                });
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("content",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async read(){
                this.path = this.$el.getAttribute("file").split(".").at(0) + ".md";
                try{
                    this.content = await this.repo.read(this.path);
                } catch {
                    this.content = "documentation";
                }

                this.view_mode();
            },
            edit_mode(){
                let html = `<textarea
                                    x-model="content"
                                    placeholder="markdown"
                                    rows="20"
                                    @focusout="view_mode"
                                    class="textarea textarea-bordered textarea-lg w-full"></textarea>`;
                this.element.innerHTML = html;
                this.element.querySelector('textarea').focus();
            },
            view_mode(){
                let html = this.converter.makeHtml(this.content);
                this.html = this._applyCustomClasses(html);
                if (sessionStorage.privelige == "write"){
                    this.html = `<div class="relative">
                                     <p class="absolute top-2 right-2 z-10 text-right">
                                         <i class="fa-regular fa-pen-to-square cursor-pointer text-primary" @click="edit_mode"></i>
                                     </p>
                                     <!-- Andere content hieronder -->
                                     <div>
                                         ${this.html}
                                     </div>
                                 </div>`;
                }
                this.element.innerHTML = this.html;
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1000);
            },
            async _execute_save(){
                if (this.content == "documentation" || this.content == ""){
                    return;
                }
                await this.repo.write(this.path,this.content);
                let html = this.converter.makeHtml(this.content);
                this.html = this._applyCustomClasses(html);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            },
            _applyCustomClasses(html) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Koppen
                doc.querySelectorAll('h1').forEach(el => el.classList.add('text-3xl', 'font-bold', 'mb-4'));
                doc.querySelectorAll('h2').forEach(el => el.classList.add('text-2xl', 'font-semibold', 'mb-3'));
                doc.querySelectorAll('h3').forEach(el => el.classList.add('text-xl', 'font-semibold', 'mb-2'));
                doc.querySelectorAll('h4').forEach(el => el.classList.add('text-lg', 'font-medium', 'mb-1'));
                doc.querySelectorAll('h5').forEach(el => el.classList.add('text-base', 'font-medium', 'mb-1'));
                doc.querySelectorAll('h6').forEach(el => el.classList.add('text-sm', 'font-medium', 'mb-1'));

                // Paragrafen en tekst
                doc.querySelectorAll('p').forEach(el => el.classList.add('mb-4', 'leading-relaxed'));
                doc.querySelectorAll('strong').forEach(el => el.classList.add('font-bold'));
                doc.querySelectorAll('em').forEach(el => el.classList.add('italic'));
                doc.querySelectorAll('del').forEach(el => el.classList.add('line-through'));
                doc.querySelectorAll('u').forEach(el => el.classList.add('underline'));

                // Lijsten
                doc.querySelectorAll('ul').forEach(el => el.classList.add('list-disc', 'list-inside', 'mb-4', 'ml-6'));
                doc.querySelectorAll('ol').forEach(el => el.classList.add('list-decimal', 'list-inside', 'mb-4', 'ml-6'));
                doc.querySelectorAll('li').forEach(el => el.classList.add('mb-1'));

                // Links
                doc.querySelectorAll('a').forEach(el => {
                    el.setAttribute('target', '_blank');
                    el.setAttribute('rel', 'noopener noreferrer');
                    el.classList.add('text-blue-600', 'hover:underline');
                });

                // Citaties
                doc.querySelectorAll('blockquote').forEach(el => el.classList.add('border-l-4', 'border-gray-300', 'pl-4', 'italic', 'mb-4'));

                // Codeblok en inline code
                doc.querySelectorAll('pre').forEach(el => el.classList.add('bg-gray-100', 'p-4', 'rounded-lg', 'overflow-auto', 'mb-4'));
                doc.querySelectorAll('code').forEach(el => el.classList.add('bg-gray-100', 'px-1', 'py-0.5', 'rounded'));

                // Tabellen
                doc.querySelectorAll('table').forEach(el => el.classList.add('table-auto', 'w-full', 'border-collapse', 'mb-4'));
                doc.querySelectorAll('th').forEach(el => el.classList.add('border', 'border-gray-300', 'p-2', 'bg-gray-100', 'text-left'));
                doc.querySelectorAll('td').forEach(el => el.classList.add('border', 'border-gray-300', 'p-2'));

                // Takenlijstjes
                doc.querySelectorAll('input[type="checkbox"]').forEach(el => el.classList.add('form-checkbox', 'text-blue-600', 'mr-2', 'cursor-pointer'));

                return doc.body.innerHTML;
            }
        }
    });
});