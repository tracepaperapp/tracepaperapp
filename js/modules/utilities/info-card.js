document.addEventListener('alpine:init', () => {
    Alpine.data('infoCard', function(){
        return {
            summary: {},
            github_navigation_lock: false,
            async open_github(){
                if (this.github_navigation_lock){return}
                this.github_navigation_lock = true;
                let file = this.$el.getAttribute("file");
                window.open(sessionStorage.project_url + '/blob/' + sessionStorage.branch + '/' + file, '_blank').focus();
                await Draftsman.sleep(1000);
                this.github_navigation_lock = false;
            },
            get_path(){
                let file = this.$el.getAttribute("file");
                return file.split('.').at(0).replaceAll('/',' / ');
            },
            async render_summary(){
                let summary = {};
                let repo = await GitRepository.open();
                let files = await repo.list();
                summary["commands"] = files.filter(x => x.startsWith('commands/') && x.endsWith('.xml')).length;
                summary["aggregates"] = files.filter(x => x.startsWith('domain/') && x.endsWith('root.xml')).length;
                summary["subdomains"] = files.filter(x => x.startsWith('domain/') && x.endsWith('root.xml')).map(x => x.split("/").at(1));
                summary["subdomains"] = summary["subdomains"].filter(function(item, pos) {return summary["subdomains"].indexOf(item) == pos;}).length;
                summary["domainEvents"] = files.filter(x => x.startsWith('domain/') && x.endsWith('.xml') && x.includes("/events/")).length;
                summary["notifiers"] = files.filter(x => x.startsWith('notifiers/') && x.endsWith('.xml')).length;
                summary["views"] = files.filter(x => x.startsWith('views/') && x.endsWith('.xml')).length;
                summary["projections"] = files.filter(x => x.startsWith('projections/') && x.endsWith('.xml')).length;
                this.summary = summary;
            }
        }
    });
});