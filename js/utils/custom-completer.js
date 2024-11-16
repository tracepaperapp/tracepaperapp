try{
    var langTools = ace.require('ace/ext/language_tools');
}catch{}
if (!allCompletions) {
    var allCompletions = []
}


var customCompleter = {
  getCompletions: function(editor, session, pos, prefix, callback) {
        let filteredCompletions = allCompletions.filter(item =>
          item.value.startsWith(prefix)
        );
        callback(null, filteredCompletions);
  }
 }
langTools.addCompleter(customCompleter);