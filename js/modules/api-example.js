document.addEventListener('alpine:init', () => {
    Alpine.data('apiModule', function(){
        return {
            feedbackItems: [],
            showModal: false,
            feedBackCommand: this.$persist({userId: 'T123', screenName: 'j.doe', score: 5, comment: 'Hello World!', oneWord: 'Awesome'}),
            traces: [],
            async init(){
                let api = await API.initialize();
                let data = await api.query("/prepared-statements/fetch-feedback.txt");
                this._prepare_data(data);
                await api.subscription("/prepared-statements/subscribe-notification.txt",{},this.refresh_data.bind(this));
            },
            async refresh_data(event){
                let api = await API.initialize();
                let data = await api.query("/prepared-statements/fetch-feedback.txt",{},true);
                this._prepare_data(data);
            },
            async save_item(){
                let api = await API.initialize();
                let correlationId = await api.mutation("/prepared-statements/insert-feedback.txt",this.feedBackCommand);
                this.showModal = false;
                this.subscriptionId = await api.subscription("/prepared-statements/subscribe-track-and-trace.txt",{correlationId},this._track.bind(this));
            },
            _prepare_data(data){
                this.feedbackItems = data["data"]["Feedback"]["filter"]["resultset"];
            },
            _remove_first_trace(){
                this.traces.shift();
            },
            async _track(data){
                data = data["data"]["onTrace"];
                if (data.status != "success" && data.status != "error"){
                    return;
                }
                this.traces.push({
                    name: data.command ? data.command : data.event,
                    status: data.status,
                    message: data.message
                });
                setTimeout(this._remove_first_trace.bind(this),3000);
                let api = await API.initialize();
                await api.unsubscribe(this.subscriptionId);
            }
        }
    });
});