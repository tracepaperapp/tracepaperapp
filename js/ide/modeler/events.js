
window.Events = {
    list: function(){
        let events = Object.keys(model).filter(key => key.includes("/events/")).map(key => model[key]["event"]);
        events = events.concat(Commands.list());
        events = events.concat(make_sure_is_list(model["config.xml"]["draftsman"]["events"]).map(x => {
            let event = x["event"];
            event[NESTED] = make_sure_is_list(event[NESTED]);
            return event;
            }));
        return events;
    },
    get: function(name){
        return Events.list().filter(x => x.att_name == name).at(0);
    }
}