

window.Shortcut = {
    open: function(name){
        document.dispatchEvent(new CustomEvent('shortcut-' + name));
    },
    execute: function(name){
        Shortcut.open(name);
        parent.postMessage({type:'shortcut',shortcut: name});
    }
}
document.addEventListener('keyup', (e) => {
    if (e.ctrlKey && e.code == "Space"){
        Shortcut.execute("guide");
    } else if (e.shiftKey && e.code == "Enter"){
        Shortcut.execute("model");
    } else if (e.shiftKey && e.code == "Backspace"){
        Shortcut.execute("search");
    } else if (e.ctrlKey && e.code == "Enter"){
        Shortcut.execute("insert");
    }

});