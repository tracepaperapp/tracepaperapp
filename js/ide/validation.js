
window.Validation = {
    must_be_camel_cased: function(path,element,fieldName,key){
        make_sure_is_list(element).forEach(x => {
            if (key){
                x = x[key];
            }
            if (!x.match(camel_cased)){
                Validation.register(path,`${fieldName} ${x} must be camelCased`);
            }
        });
    },
    register: function(file,issue){
        if (!(file in report)){
            report[file] = [];
        }
        report[file].push(issue);
    },
    has_issues: function(){
        session.trigger_build_after_commit = Object.values(report).filter(x => x.length != 0).length == 0;
        return Object.values(report).filter(x => x.length != 0).length != 0;
    }
};