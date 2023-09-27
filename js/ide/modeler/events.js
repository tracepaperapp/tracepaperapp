
window.Events = {
    list: function(){
        let events = Object.keys(model).filter(key => key.includes("/events/")).map(key => model[key]["event"]);
        events = events.concat(Commands.list());
        return events;
    },
    get: function(name){
        return Events.list().filter(x => x.att_name == name).at(0);
    }
}