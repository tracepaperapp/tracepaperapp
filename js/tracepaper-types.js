const NESTED = "nested-object";
const TEST = "test-case";
const HANDLER = "event-handler";
const NESTED_MAPPING = "nested-mapping";
const CUSTOM_HANDLER = "custom-handler";
const SNAPSHOT_HANDLER = "snapshot-handler";
const QUERY_FILTER = "filter-clause";

const github_url = /^(https:\/\/github.com)+(\/{1}[a-zA-Z0-9\-\.\_]+){2}$/g;
const lower_or_camel_cased = /^[a-z]{1,25}([A-Z][a-z]{1,24})*$/g;
const camel_cased = /^[a-z]+([A-Z]{1}[a-z]+)*$/g;
const pascal_cased = /^([A-Z]{1}[a-z]+)+$/g;
const numeric_input = /^[0-9]*$/g;
const graphql_namespace = /^([A-Z]{1}[a-z]+)+(\.([A-Z]{1}[a-z]+)+)*$/g;
const field_types = ['String', 'Int', 'Float', 'Boolean'];
const view_field_types = field_types.concat(["StringList"]);
const boolean_text = ['true','false'];
const view_relations = ["ObjectList", "OneToMany", "ManyToOne", "OneToOne", "ManyToMany"];
const view_filter_types = ["equals","not_equals","less_than","greater_than","less_than_equals","greater_than_equals"];
const auto_fill_modes = ['','username','uuid'];
const auth_types = ['authenticated','role','user','anonymous'];
const mapper_operands = ["unmapped","set","add","subtract"];
const behavior_processor_types = ["emit-event","code","validator","set-variable"]; // TODO: ["dmn","create-text-patch","update-key"]
const editor_options = {
   mode: {
       name: "python",
       version: 3,
       singleLineStringErrors: false
   },
   lineNumbers: true,
   indentUnit: 4,
   matchBrackets: true
};

const qa_variable_types = ["String","Numeric","Boolean","Nested"];
const qa_activity_types = [
    "mutation",
    "query",
    "refresh-token",
//    "switch-user",
    "wait",
//    "view-store-update",
    "set-variables",
//    "grant-role",
//    "refresh-view-store"
]

const notifier_activity_types = [
      "create-iam-group",
//      "delete-iam-group",
      "add-user-to-iam-group",
//      "remove-user-from-iam-group",
//      "retrieve-email-from-iam",
//      "render-template",
//      "send-email",
//      "send-graphql-notification",
//      "write-file",
//      "fetch-property",
//      "get-token",
//      "get-systemuser-token",
      "iam-create-systemuser",
//      "iam-create-user",
//      "iam-delete-user",
      "set-variable",
//      "call-internal-api",
//      "code",
//      "dmn",
//      "HTTP",
//      "scheduled-event",
//      "invalidate-cdn",
      "loop"
]

const code_template = `
def behavior_or_notifier_function(flow):
    pass

def view_updater_function(entity_manager,snapshot,event):
    pass
`;

const projection_code_template = `
from draftsman.ViewStoreApi import Query


def transform(arguments, username):
    # You have access to the username of the requestor and the arguments.
    print(f"Handle graph request [{arguments}/{username}]")

    # You have acces to a fluent api to access materialized views
    # Here are some examples

    # You can access a specific object, this is the most efficient method cost wise
    data = Query('ViewName').get_item("key").run()

    # Or get a list of all objects of a specific type
    data = Query('ViewName').get_items().run()

    # Filter a list of objects based on type and key, part of the canonical key concept.
    data = Query('ViewName').get_items("key_starts_with_this_value").run()

    # Or filtering on content for a specific type(performs a scan on all views of type 'ViewName')
    data = Query('ViewName').get_items().equals('key','value').between('key',0,100).run()

    # Or combining the two filter methods, so you can filter within a subset
    data = Query('ViewName').get_items("key_starts_with_this_value").equals('key','value').between('key',0,100).run()

    # You can program data transformations with the aid of Python programming
    return {"field_name": "value"}
`;