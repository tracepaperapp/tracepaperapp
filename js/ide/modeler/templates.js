
window.Templates = {
    list: function(){
        return Object.keys(templates).map(x => x.replace("templates/",""));
    }
}