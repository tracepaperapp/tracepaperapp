
// Insert framework css, to hide custom tags
var script = document.createElement("link");
script.setAttribute("href","/css/draftsman.css");
script.setAttribute("rel","stylesheet");
document.head.appendChild(script);

// Insert the draftsman framework
var script = document.createElement("script");
script.setAttribute("src","/js/framework.js");
document.head.appendChild(script);

// Insert the cache (async)
var script = document.createElement("script");
script.setAttribute("src","/js/cache.js");
script.setAttribute("async","true");
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

// Insert the AlpineJS persist API (async)
var script = document.createElement("script");
script.setAttribute("src","https://cdn.jsdelivr.net/npm/@alpinejs/persist@3.x.x/dist/cdn.min.js");
script.setAttribute("async","true");
document.head.appendChild(script);

// Insert the AlpineJS core (defered)
var script = document.createElement("script");
script.setAttribute("src","https://unpkg.com/alpinejs");
script.setAttribute("defer","true");
document.head.appendChild(script);