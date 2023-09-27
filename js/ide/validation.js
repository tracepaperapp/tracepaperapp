
window.Validation = {
    register: function(file,issue){
        if (!(file in report)){
            report[file] = [];
        }
        report[file].push(issue);
    },
    has_issues: function(){
        return Object.values(report).filter(x => x.length != 0).length != 0;
    }
};