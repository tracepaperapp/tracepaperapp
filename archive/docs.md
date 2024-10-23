<!-- This file is managed by Tracepaper -->
# Generated GUI assist framework

## The framework
We made some choices for you:

1. We use the [alpinejs](https://alpinejs.dev/) javascript framework for data & behavior binding.
2. We use the [vimesh-ui](https://github.com/vimeshjs/vimesh-ui) extension to this framework for building UI components.
    - We created some example components in the component folder (e.g. the navigation bar injected into this page), but feel free to customize them as needed.
    - The generated [admin console](/admin-console) is build with these concepts, use them as examples or modify where needed/possible.
3. We added the Draftsman framework, intended to bind [alpinejs](https://alpinejs.dev/) to your applications GraphQL API. More on this later.
4. **Optional**: At the moment we use [Bootstrap 5](https://opencollective.com/graphql-voyager) as frontend toolkit. But feel free to inject your own choice.
5. **Sugestion**: To get you started, you could host this project using [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#limits-on-use-of-github-pages) if needed in combination with a [CloudFlare proxy](https://www.cloudflare.com/plans/) in front of it.
6. **Sugestion**: If you need more serious hosting you could implement a setup in AWS using [S3](https://aws.amazon.com/s3/) as storage and [Cloudfront](https://aws.amazon.com/cloudfront/) as content delivery network.

<small>Configuring a custom domain for your webapp is beyond the scope of this manual.</small>

## Embeded consoles

We generated some pages for you to get you started.

- [Admin Console](/admin-console), this page is intended to be used by administrators of your application. We generated a default page with an overview of the components that encapsulate the API. But feel free to customize as needed.
- [GraphiQL explorer](/admin-console/graphiql), a GUI made by [Hasura](https://github.com/hasura/graphiql-online) to explore and use the GraphQL API. This is tool helps you to compose prepared statements. More on that in the section *The Draftsman Framework*.
- [GraphQL Voyager](/admin-console/voyager), a tool created by [Ivan Goncharov](https://github.com/graphql-kit/graphql-voyager) to visualize the API as a graph.
- [configuration](/configuration), just a simple page containing 1 button to toggle if the browser is configured to use the staging or production API.

# The Draftsman framework

The Draftsman portion of the framework contains **4 custom tags**, **1 class**, and **10 method calls**.

## Tags

### The query tag
The query tag is a method for binding a View query to frontend components. Here is an example: 
<code class="html" x-include="/admin-console/components/views/Build/get.html"></code>
The source of the above example is located at: /admin-console/components/views/Build/get.html 

#### Basic concept
```html
<draftsman-query alias="Buildget" x-include="/prepared-statements/views/Build/get.txt">
</draftsman-query>
```
Binds a prepared statement (/prepared-statements/views/Build/get.txt) to an Alpine data object (Buildget).
The body of the tag is imported by *vimesh-ui*.

The prepared statement may be parameterized, the variables can be set by 3 methods:

1. A non optional default value hardcoded in the prepared statement e.g. 'query MyQuery($key: ID = "1234")'.
2. A javascript method can be used to override this default e.g. 'Draftsman.set_variable('key','5678');'
3. Lastly the override all method is using a query-string e.g. 'http://localhost:8181?key=0112'
4. There is one other way in case the query-mode is set to 'on-demand'. In this case toy trigger the query from your own script (no request merging here), **Draftsman.reload_data({alias},{key: '1235'},force=true);**

The body of the query lists the attributes we are interested in, this may travel one-to-one, one-to-many, many-to-one, and many-to-many relationships.

*Limitation: a draftsman-query tag may only include 1 toplevel query (in the example 'Build'). However, 
queries spread over multiple draftsman-query tags are merged into a single request by the draftsman framework. 
Unless the query-mode is set to 'on-demand'.*

The **alias** *attribute*, this attribute defines a key where under the retrieved data is stored. Data is retrievable by using 
the [Alpine Store method](https://alpinejs.dev/magics/store) '$store.{alias}.{path}.{name}' e.g. '$store.Buildget.get.key'. The alias attribute is mandatory to prevent collisions
in the data store.

The **authenticated** *attribute* is optional and directs the framework to use an identity token instead of the default *anonymous API key*.
When a identity token is not present or is expired, a redirect to the sign-in page will be triggered. 

#### The form definition
We also generated a form definition, this is a simple json document describing the query parameters and there type.
This description can be used to render a form so users can alter these before executing the query, this functionality is
showcased on the [Admin Console](/admin-console). We use [vimesh-ui's](https://github.com/vimeshjs/vimesh-ui) x-include 
functionality to load it into the page, the element is hidden and accessible via the id. Note that this ID must be equal to
the alias.
```html
<div style="display:none;" id="Buildget" x-include="/form-definitions/Build/get.json"></div>
```

#### The query-form component
We provided a template for rendering the form (tag: ui-query-form with the same alias), this component will 
use document.getElementById({alias}) to fetch the provided json, hence it is very important to keep the alias 
and id of the previous component identical.

We use bootstrap 5 for styling, but feel free to customize to your liking.

The current template is located at: admin-console/components/query-form.html

### The on-notification tag

A notification can be sent from a notifier, the view-updater in the read domain automatically sends notifications. 
A notification contains three fields:

1. identifier
2. message
3. type

The subscription below filters on two of these fields. If both fields match, the @notification function is executed. 
In this case, setting the 'key' variable and reloading the page data. The notification below is the automatic notification 
from the view updater indicating that view 'Build' has been updated. It does not filter on identity, so this may be 
triggered frequently depending on the number of instances of the view and the accumulated updates (create/update/delete). 
When we are interested in one specific instance of the view, we can add an additional attribute to the 
tag *:identifier=$store.build.get.key*. The ':' tells AlpineJS that the value should be set using a JavaScript statement, 
the statement '$store.build.get.key' refers to previously retrieved data using a query tag.
```html
<draftsman-notification message="updated" type="Build"
    @notification=" 
        console.log('Received message:',$event.detail);
        Draftsman.set_variable('key',$event.detail.identifier);
        Draftsman.reload_data();">
</draftsman-notification>
```
The notifications are also stored in an array accessible from the AlpineJS context through '$store.notifications'.

```html
<ol>
  <template x-for="notification in $store.notifications">
    <li x-text="JSON.stringify(notification);"></li>
  </template>
</ol>
```

### The mutation tag

The mutation tag is intended to make GraphQL mutations available within the AlpineJS context.
<code class="html" x-include="/admin-console/components/commands/AuthorizeUserWorkspace.html"></code>

#### The basic concept
```html
<draftsman-mutation command="AuthorizeUserWorkspace" x-include="/prepared-statements/commands/AuthorizeUserWorkspace.txt">
</draftsman-mutation>
```
Registers a prepared statement (/prepared-statements/commands/AuthorizeUserWorkspace.txt) as a command (AuthorizeUserWorkspace) in the Draftsman framework. 
The body of the tag is imported by vimesh-ui.

#### The form definition
We also generated a form definition, this is a simple json document describing the command parameters and there type.
This description can be used to render a form so users can compose a command before executing it, this functionality is
showcased on the [Admin Console](/admin-console). We use [vimesh-ui's](https://github.com/vimeshjs/vimesh-ui) x-include 
functionality to load it into the page, the element is hidden and accessible via the id. Note that this ID must be equal to
the command.
```html
<div style="display:none;" id="AuthorizeUserWorkspace" x-include="/form-definitions/AuthorizeUserWorkspace.json"></div>
```

#### The trace table
The **ui-trace-table** tag is a component we provided that visualizes traces received in a table format.
Note that it automatically appears when traces are available ($store.trace.length != 0) it does not discriminate 
between commands in case multiple commands are present on the page.

#### The basic-form component
We provided a template for rendering a form to compose the command (tag: ui-basic-form with an alias), this component will 
use document.getElementById({alias}) to fetch the provided json, hence it is very important to keep the alias 
and id of the previous component identical, both should point to the command name.

The submit button will execute the following statement:
```javascript
$store.mutation.send('AuthorizeUserWorkspace',{all-form-data});
```
The will execute the registered command against the GraphQL API.
We use bootstrap 5 for styling, but feel free to customize to your liking.

<small>Note that null-values will be filtered out by the framework before executing the API call.</small>

### The trace tag
The trace tag is used to react to specific trace events after a mutation, for the purpose of screen control 
(such as opening/closing modals, redirects, cleanups, etc).

- The command attribute is mandatory; it binds the trace handler to a draftsman-mutation tag.
- The component attribute is optional and refers to behavior (lambda function) which publishes trace events, following these naming conventions:
    - For aggregate behavior: AggregateName.BehaviorFlowName. So, the example below refers to the 'Initialize' flow within the 'RegistrationManager' aggregate.
    - For notifiers: Notifier-{NotifierName}
- The status attribute is optional; success/error are the most useful to send, although technically, you can also switch on accepted/requested.
- @trace contains the code executed when a trace message meets the criteria of command/component/status. In the example below, we perform two actions:
    1. Clear the trace log.
    2. Clear the form by dispatching a setdata event specific for our command and with an empty data object.

```html
<draftsman-trace command="AuthorizeUserWorkspace" 
                 status="success" 
                 @trace="
                    Draftsman.empty_track_and_trace_log();
                    $dispatch('setdata', { command: 'AuthorizeUserWorkspace', data: {} });">
</draftsman-trace>
```

### Reserved key words
The following words can not be used as alias or command name!
Both concepts are backed by [Alpine Stores](https://alpinejs.dev/globals/alpine-store),
 and the following stores are reserved for internal use.
- trace
- notifications
- forms
- mutations

## The data-element class
The data-element class tell's the Draftsman framework that this html element is dependant on data retrieved using a 
query tag. When the query is succesfully executed the @refresh statement will be executed. Why or whom triggerd the query 
is unknown in this context.  
```html
<div class="data-element" 
     x-data="{data: my_get_data_function()}"
     @refresh="data = my_get_data_function()">
...
</div>
```

## Library
The library contains some utility functions:

### Fetch query parameter
```javascript
let variable = Draftsman.fetch_query_parameter(variable_name)
```
This method can be used to fetch a query parameter from the current browser location.


### GraphQL Query
```javascript
var data = await Draftsman.query(query_string,variables={},true); 
```
A method for executing a GraphQL query, it accepts a string, an object and a 
boolean (true means the call is made anonymous, the default is false meaning a user token will be used)
This call can be used for queries & mutations

### Subscribe
```javascript
Draftsman.subscribe(subscribe_query,callback,variables={},anonymous=true);
```
A method to start a subscription, meaning a websocket will be opened 
to receive data from the backend (backend pushes to frontend in this case).
The subscribe needs a:
- Query string (onNotification or onTrace)
- callback method, the method is invoked on any message matching the query. The message is propagated to the callback-method.
- optional: An object containing variables, in case the query-string is parameterised.
- optional: A boolean instructing that the subscription should be anonymous (default is using a user-token).

### Empty track & trace log
```javascript
Draftsman.empty_track_and_trace_log();
```
As mentioned in the section "the trace table" all received traces are stored in an array ($store.trace) and UI components 
may become visible when the array is not empty. With this method you can purge the trace array.

### Disable cache
```javascript
Draftsman.disable_cache_for_page();
```
By default Draftsman will cache query-results for 1 hour in the localStorage of the browser. This prevents 
subsequent API calls in case the page is refreshed or when a user toggles between pages. The cache can be 
disabled with this call. It should be executed right after AlpineJS is initialized, you can do this by uncommenting
line 6 in the /js/utils.js file.

<small>Note: to calculate a cache key we use the query-string and the variable object. So when the variables change, the cache will be ignored.</small>

### Clear cache
```javascript
Draftsman.clear_cache();
```
Disabling the cache altogether is not always needed. Sometimes we just know that if we perform "action-x" the data should be invalidated.
The clear_cache method supports this usecase.

<small>Note: this will invalidate the local-cache entirely, not just the current page.</small>

### Set query mode
```javascript
Draftsman.set_query_mode('automatic|on-demand');
```
We have two modes for handling the query call's:
1. automatic <small><b>[default]</b></small>
2. on-demand

When using the **automatic** mode, draftsman will aggregate all query-tags into a single request (also a single cache entry) 
and execute after a page load.

When using the **on-demand** mode, draftsman will only fetch the data when is instructed explicitly.
This brings us to the next method.

### Reload data
```javascript
Draftsman.reload_data('alias',filter={},force=false);
```
The reload data method is pretty well named, it re-executes a query call.
- **Alias** is a string and references a *draftsman-query* tag.
- **Filter** is an object containing the variables in case the query string is parameterized.
- **Force** if true, Draftsman will ignore the cache.

When you use the *on-demand* query-mode you will probably rely on this method for the bulk of the data-fetching.

<small>Note: even when the query-mode <i>automatic</i> is used (using call-aggregation) in combination with 
caching enabled. With this method you could force fetch a specific *draftsman-query* tag on demand.</small>

### Force reload data
```javascript
Draftsman.force_reload_data();
```
This method will ignore the cache, and aggregate all **draftsman-query** tags on the page to a single request.

### Sign in
```javascript
Draftsman.sign_in("/"); 
```
This method will redirect the user to the sign in page. The parameter dictates where the user should be redirected
after a successful authentication. If no parameter is provided it will default to the current page.

Optionally we can instruct the draftsman framework that a sign in is always required for a certain page by adding the script:

```javascript
var must_be_signed_in = true;
```

Add this script to your *head* section before the /js/framework.js script is imported. See the admin-console index
for an example.

### Sign out
```javascript
Draftsman.sign_out();
```
This method clears the localStorage, effectively removing all data clearing the cache including the cached user tokens.
After this cleanup is ready the user is redirected to the root page.

<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<!-- make sure examples are not executed -->
<script>
    Draftsman.set_query_mode("on-demand");
</script>