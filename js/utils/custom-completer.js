let langTools = ace.require('ace/ext/language_tools');
var customCompleter = {
  getCompletions: function(editor, session, pos, prefix, callback) {
        callback(null, [
        {name: "cp", value: "complete", score: 1, meta: "global"}
        ]);

  }
 }
langTools.addCompleter(customCompleter);