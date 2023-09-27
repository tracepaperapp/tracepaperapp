
// Insert framework css, to hide custom tags
var script = document.createElement("link");
script.setAttribute("href","/css/draftsman.css");
script.setAttribute("rel","stylesheet");
document.head.appendChild(script);

// Insert the draftsman framework
var script = document.createElement("script");
script.setAttribute("src","/js/framework.js");
document.head.appendChild(script);

// Insert the cache
var script = document.createElement("script");
script.setAttribute("src","/js/cache.js");
document.head.appendChild(script);

// Insert Vimesh UI (must by synchronous)
// https://github.com/vimeshjs/vimesh-ui
var script = document.createElement("script");
script.setAttribute("src","https://unpkg.com/@vimesh/ui");
script.addEventListener('load', function() {
    // vimesh-ui configuratie
    $vui.config = {
        namespace: 'ui'
    }
    $vui.config.importMap = {
        "*": '/components/${path}${component}.html'
    }
});
document.head.appendChild(script);

// Insert the AlpineJS persist API
var script = document.createElement("script");
script.setAttribute("src","https://cdn.jsdelivr.net/npm/@alpinejs/persist@3.x.x/dist/cdn.min.js");
document.head.appendChild(script);

// Insert the AlpineJS core (defered)
var script = document.createElement("script");
script.setAttribute("src","https://unpkg.com/alpinejs");
script.setAttribute("defer","true");
document.head.appendChild(script);

// Graph library
var script = document.createElement("script");
script.setAttribute("src","https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.min.js");
script.setAttribute("async","true");
document.head.appendChild(script);

//setTimeout(function(){
//    //Make sure Draftsman framework is imported.
//    try {
//        Draftsman.contains_teleports = Draftsman.contains_teleports;
//    } catch (e) {
//        if (e instanceof ReferenceError) {
//            location.reload();
//        }
//    }
//},1000);

var must_be_signed_in = false;