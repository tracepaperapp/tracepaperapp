
var TOOL_TITLE = "Tracepaper by Draftsman";
var TOOL_DESCRIPTION = "A developer productivity tool for creating scallable complex application in the cloud.";
var must_be_signed_in = true;

document.addEventListener('alpine:init', () => {
    try{
        Draftsman.contains_teleports = false;
    } catch {
        //pass
    }
})

// Insert favicon
var element = document.createElement("link");
element.setAttribute("href","/assets/logo.png");
element.setAttribute("rel","icon");
element.setAttribute("type","image/x-icon");
document.head.appendChild(element);

// Add meta tags
var element = document.createElement("meta");
element.setAttribute("charset","utf-8");
document.head.appendChild(element);

var element = document.createElement("meta");
element.setAttribute("name","viewport");
element.setAttribute("content","width=device-width, initial-scale=1, shrink-to-fit=no");
document.head.appendChild(element);

var element = document.createElement("meta");
element.setAttribute("name","description");
element.setAttribute("content",TOOL_DESCRIPTION);
document.head.appendChild(element);

var element = document.createElement("title");
element.textContent = TOOL_TITLE;
document.head.appendChild(element);

// Create virtual filesystem & Github connection
var script = document.createElement("script");
script.setAttribute("src","https://unpkg.com/@isomorphic-git/lightning-fs");
document.head.appendChild(script);

var script = document.createElement("script");
script.setAttribute("src","https://unpkg.com/isomorphic-git");
document.head.appendChild(script);

var script = document.createElement("script");
script.setAttribute("src","https://cdnjs.cloudflare.com/ajax/libs/fast-xml-parser/4.2.5/fxparser.min.js");
document.head.appendChild(script);

var script = document.createElement("script");
script.setAttribute("src","/js/xml-builder.js");
document.head.appendChild(script);

var link = document.createElement("link");
link.setAttribute("href","https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css");
link.setAttribute("rel","stylesheet");
document.head.appendChild(link);

var script = document.createElement("script");
script.setAttribute("defer","true");
script.setAttribute("src","https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js");
document.head.appendChild(script);

var script = document.createElement("script");
script.setAttribute("src","https://cdnjs.cloudflare.com/ajax/libs/showdown/1.9.1/showdown.min.js");
document.head.appendChild(script);

var link = document.createElement("link");
link.setAttribute("href","https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css");
link.setAttribute("rel","stylesheet");
document.head.appendChild(link);

var script = document.createElement("script");
script.setAttribute("async","true");
script.setAttribute("src","https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js");
document.head.appendChild(script);

var script = document.createElement("script");
script.setAttribute("src","https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.min.js");
document.head.appendChild(script);

var script = document.createElement("script");
script.setAttribute("src","https://cdn.jsdelivr.net/npm/@alpinejs/collapse@3.x.x/dist/cdn.min.js");
document.head.appendChild(script);

var link = document.createElement("link");
link.setAttribute("href","/css/ide.css");
link.setAttribute("rel","stylesheet");
document.head.appendChild(link);

function convertMarkdownToHtml(markdown){
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

function sleep(ms) {
    console.trace(`Sleep ${ms} milliseconds`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

function get_lorem_picsum(el){
    return `https://picsum.photos/seed/${el.id}/250`
}