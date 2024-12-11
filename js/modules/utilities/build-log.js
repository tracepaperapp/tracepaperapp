document.addEventListener('alpine:init', () => {
    Alpine.data('buildLog', function(){
        return {
            logs: [],
            drn: "",
            pipeline: {},
            last_event: 0,
            updated: "",
            status: "",
            async init(){
                const queryString = window.location.search;
                const params = new URLSearchParams(queryString);
                this.drn = params.get('drn');
                await this.refresh_data();
                let api = await API.initialize(true);
                await api.subscription("/prepared-statements/subscribe-notification.txt",{identifier: this.drn, type: "Build"},this.refresh_data.bind(this));
                let data = await api.query("/prepared-statements/fetch-pipeline.txt",{key_begins_with:this.drn.split(':').slice(0, 3).join(':')},true);
                this.pipeline = data.data.Pipeline.filter.resultset.at(0);
                setInterval(this.update_indicator.bind(this),1000);
                setTimeout(this.check_if_started.bind(this),1000);
            },
            update_indicator(){
                if (this.last_event != 0){
                    this.updated = luxon.DateTime.fromMillis(this.last_event).toRelative();
                }
            },
            check_if_started(){
                if (this.logs.length == 0){
                    location.reload();
                }
            },
            async refresh_data(event){
                let api = await API.initialize(true);
                let data = await api.query("/prepared-statements/fetch-build-log.txt",{key:this.drn},true);
                this.logs = Draftsman.sortArrayByKey(data.data.Build.get.logs,"timestamp");
                this.logs.reverse();
                this.status = data.data.Build.get.status;
                this.last_event = Number(data.data.Build.get.lastEvent)*1000;
                this.logs.forEach(log => {
                    log.message = log.message.replace("#link.","<a class='link cursor-pointer' target='_blank' href='").replace(".link#","'>AWS pipeline</a>");
                });
            }
        }
    });
});