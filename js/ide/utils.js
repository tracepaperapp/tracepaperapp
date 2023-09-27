
function deduplicate(elements){
    let array = [];
    let check = [];
    elements.forEach(x =>{
        let hash = btoa(JSON.stringify(x,true));
        if (!(check.includes(hash))){
            array.push(x);
            check.push(hash);
        }
    });
    return array;
}

function get_attribute(event,name){
    let value = event.srcElement.getAttribute(name);
    if (!value){
        value = event.srcElement.parentElement.getAttribute(name);
    }
    return value;
}

window.check_pattern = function(value,pattern){
   if (!pattern || value.match(pattern)){
       return true;
   } else {
       return false;
   }
}

window.capitalizeFirstLetter = function(string) {
   return string.charAt(0).toUpperCase() + string.slice(1);
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

var block = false;
window.blockingDecorator = function(wrapped) {
  return function() {
    if(block){return}else{block=true}
    let result = null;
    try{
        result = wrapped.apply(this, arguments);
        Navigation.reload_tab();
    }catch(err){console.error(err)}
    setTimeout(function(){
        block = false;
    },1000);
    return result;
  }
}

window.loadData = function(element){
    setTimeout(function(){
        element.dispatchEvent(new CustomEvent("load"));
    },1);
}

window.convertMarkdownToHtml = function(markdown){
    try{
        var converter = new showdown.Converter();
        var html = converter.makeHtml(markdown);
        html = html.replaceAll('<img','<img style="width:100%;"');
        return html;
    } catch(ex) {
        console.error(ex);
        return markdown;
    }
}

window.arraymove = function(arr, fromIndex, toIndex) {
   var element = arr[fromIndex];
   arr.splice(fromIndex, 1);
   arr.splice(toIndex, 0, element);
}

window.sleep = function(ms) {
    console.trace(`Sleep ${ms} milliseconds`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

window.get_lorem_picsum = function(el){
    return `https://picsum.photos/seed/${el.id}/250`
}