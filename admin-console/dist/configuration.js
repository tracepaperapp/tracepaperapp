window.__env = {
    graphqlEndpoint: api_url
}

localStorage["ApiExplorer:HeadersSectionIsOpen"] = false;
localStorage["ApiExplorer:EndpointSectionIsOpen"] = false;
var TOKEN = null;
try{
    TOKEN = cacheJS.get("token");
} catch(e) {
    //
}

function refresh_headers(){
    var headers = [
                     {
                        "key":"content-type",
                        "value":"application/json",
                        "isActive":true,
                        "isNewHeader":false,
                        "isDisabled":true
                     },
                     {
                         "key":"correlation-id",
                         "value":"",
                         "isActive":false,
                         "isNewHeader":false,
                         "isDisabled":false
                     }
                  ];
    if (TOKEN){
        headers.push({
         "key":"Authorization",
         "value":TOKEN,
         "isActive":true,
         "isNewHeader":false,
         "isDisabled":false
      });
    } else {
        headers.push({
         "key":"x-api-key",
         "value":api_key,
         "isActive":true,
         "isNewHeader":false,
         "isDisabled":false
        });
    }
    localStorage.HASURA_CONSOLE_GRAPHIQL_HEADERS = JSON.stringify(headers);
}

refresh_headers();