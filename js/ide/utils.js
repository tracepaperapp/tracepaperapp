var focus_index = 0;

window.get_index = function(){
    focus_index++;
    return focus_index;
}
window.make_sure_is_list = function(elements,deduplicate=true){
    if (Array.isArray(elements)){
        let array = [];
        let check = [];
        if (deduplicate){
            elements.forEach(x =>{
                let hash = btoa(JSON.stringify(x,true));
                if (!(check.includes(hash))){
                    array.push(x);
                    check.push(hash);
                }
            });
        } else {
            array = elements;
        }
        return array;
    } else if (elements){
        return [elements];
    } else {
        return [];
    }
}

window.deduplicate_on_attribute = function(elements,name){
     let array = [];
     let check = [];
     elements.forEach(x =>{
         if (!(check.includes(x[name]))){
             array.push(x);
             check.push(x[name]);
         }
     });
     return array;
}

window.check_pattern = function(value,pattern){
   if (!pattern || value.match(pattern)){
       return true;
   } else {
       return false;
   }
}

window.capitalizeFirstLetter = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
var model_util_cache = {};

window.makeid = function (length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}

window.deepcopy = function(obj){
    return JSON.parse(JSON.stringify(obj));
}

var ace_initialized = false;
window.render_python_editor = async function(id,code){
    await sleep(100);
    if (!ace_initialized){
        ace_initialized = true;
        let langTools = ace.require('ace/ext/language_tools');
//        var customCompleter = {
//          getCompletions: function(editor, session, pos, prefix, callback) {
//                callback(null, [
//                {name: "cp", value: "complete", score: 1, meta: "global"}
//                ]);
//
//          }
//
//         }
//        langTools.addCompleter(customCompleter);
    }
    var editor = ace.edit(id);
    let theme = localStorage.theme == "dark" ? "ace/theme/github_dark" : "ace/theme/github";
    editor.session.setMode('ace/mode/python');
    code = code.replaceAll('|LB|','\n');
    editor.setValue(code,1);
    editor.setTheme(theme);
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: true
    });
    console.log(editor.getOptions());
    return editor;
}

window.arraymove = function(arr, fromIndex, toIndex) {
   var element = arr[fromIndex];
   arr.splice(fromIndex, 1);
   arr.splice(toIndex, 0, element);
}

window.deduplicate = function(elements,key){
    let array = [];
    let check = [];
    elements.forEach(x =>{
        if (!(check.includes(x[key]))){
            array.push(x);
            check.push(x[key]);
        }
    });
    return array;
}
