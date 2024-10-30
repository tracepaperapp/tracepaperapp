/*
ctrl + m --> open wizard
*/

document.addEventListener('alpine:init', () => {
    Alpine.data('modelWizard', function(){
        return {
            active: false,
            state: 0,
            start(){
                this.active = true;
                this.state = 1;
            },
            close(){
                this.active = false;
                this.state = 0;
            },
            handle_keydown(event) {
                // Check voor Windows (Ctrl + M) of Mac (Cmd + M)
                if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
                    event.preventDefault();
                    this.start();
                }
            }
        }
    });
});