
$vui.config = {
    namespace: 'ui'
}
$vui.config.importMap = {
    "*": '/components/${path}${component}.html'
}

var model = {};
var code = {};
var templates = {};
var meta = {};
var documentation = {};
var logs = {};
var label = {};
var context = {};
var report = {};
var tab_state = {};

var session = {
    initialized:false,
    navigation: {},

    tab: '',
    tabs: [],
    tab_history: []
};

document.addEventListener('alpine:init', async () => {
    try{

    Draftsman.contains_teleports = false;
    Draftsman.set_variable('key',JSON.parse(localStorage["_x_username"]));
    Draftsman.disable_cache_for_page();
    session = Alpine.reactive(session);
    model = Alpine.reactive(model);
    code = Alpine.reactive(code);
    tab_state = Alpine.reactive(tab_state);
    documentation = Alpine.reactive(documentation);
    if(!meta.roles){meta.roles = []};
    meta = Alpine.reactive(meta);
    report = Alpine.reactive(report);
    context = Alpine.reactive(context);
    label = Alpine.reactive(label);
    Alpine.data('session', () => ({
        session: session,
        label: label,
        model: model,
        code: code,
        documentation: documentation,
        meta: meta,
        context: context,
        report: report,
        tab_state: tab_state
    }));
    document.dispatchEvent(new CustomEvent('tracepaper:session:initialized'));
    }catch(err){
        console.error(err);
        //location.reload();
    }
});

//console.log = function(){};
console.trace = function(){};
console.debug = function(){};
//console.error = function(){};

function memorySizeOf(obj) {
  var bytes = 0;

  function sizeOf(obj) {
    if (obj !== null && obj !== undefined) {
      switch (typeof obj) {
        case "number":
          bytes += 8;
          break;
        case "string":
          bytes += obj.length * 2;
          break;
        case "boolean":
          bytes += 4;
          break;
        case "object":
          var objClass = Object.prototype.toString.call(obj).slice(8, -1);
          if (objClass === "Object" || objClass === "Array") {
            for (var key in obj) {
              if (!obj.hasOwnProperty(key)) continue;
              sizeOf(obj[key]);
            }
          } else bytes += obj.toString().length * 2;
          break;
      }
    }
    return bytes;
  }

  function formatByteSize(bytes) {
    if (bytes < 1024) return bytes + " bytes";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(3) + " KiB";
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(3) + " MiB";
    else return (bytes / 1073741824).toFixed(3) + " GiB";
  }

  return formatByteSize(sizeOf(obj));
}
