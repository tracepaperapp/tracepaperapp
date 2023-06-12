
function getForm(container,command){

      var forms = Alpine.store("forms");
      if (container.$prop("alias") in forms){
        var elements = JSON.parse(forms[container.$prop("alias")]);
        if (container.$prop('hide')){
            var hide = container.$prop('hide');
            if (typeof hide == "string"){
                hide = JSON.parse(container.$prop("hide").replaceAll("'",'"'));
            }
            hide.forEach(key => {
                let index = elements.findIndex(x => x.name === key);
                if (index !== -1){
                    elements[index]["type"] = "hidden";
                }
            });
        }
        preFillValues(container, elements, command);
        return getSortedForm(container,elements);
      }
      return [];

}

function preFillValues(container, elements, command){
    if (container.$prop('pre-fill')){
        var defaults = container.$prop('pre-fill');
        if (typeof defaults == "string"){
            defaults = JSON.parse(container.$prop("pre-fill").replaceAll("'",'"'));
        }
        Object.entries(defaults).forEach(kv => {
            let index = elements.findIndex(x => x.name === kv[0]);
            if (index !== -1){
                command[kv[0]] = kv[1];
            }
        });
    }
}

function getSortedForm(container,elements){
    var form = [];
    if (container.$prop('sort-keys')){
        var sort_keys = container.$prop("sort-keys");
        if (typeof sort_keys == "string"){
            sort_keys = JSON.parse(container.$prop("sort-keys").replaceAll("'",'"'));
        }
    } else {
        var sort_keys = [];
    }
    sort_keys.forEach(key => {
        let index = elements.findIndex(x => x.name === key);
        if (index !== -1){
            form.push(elements[index]);
        }
    });
    elements = elements.filter(x => form.indexOf(x) === -1);
    form = form.concat(elements);
    return form;
}