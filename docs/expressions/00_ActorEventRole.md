# API authorization expression

The authorization expression is usable in all components that are exposed in the API.

- Commands
- View queries

It is used to convert an input parameter (command field or query filter field e.g. key, key_begins_with or a custom
filter attribute) to a technical role the API resolver will validate if the requester has the specific role. This is
usable for providing role based access in a multi tenant system.

The expression has a **name** e.g. extractRoleFromArn that is used to access the expression from command models or view
models.

You model inputs for this function separted with a **;** e.g.
<code>
arn;role
</code>

And then uses velocity template syntax with basic javascript to model the logic:

`
${arn.split(':')[0]}:${arn.split(':')[1]}:role
`

In a command or view.query you can use this expression in the role field when you selected role based access.
<pre>
#global.extractRoleFromArn(key, 'viewer')
</pre>

When you execute for example a query where this is implemented this will evaluate to:
<pre>
#foreach($group in $context.identity.claims.get("cognito:groups"))
    #if($group == "${ctx.args.key.split(':')[0]}:${ctx.args.key.split(':')[1]}:viewer")
        #set($inCognitoGroup = true)
    #end
#end
#if($inCognitoGroup){
    "version": "2018-05-29",
    "operation": "GetItem",
    "key": {
        "type": $util.dynamodb.toDynamoDBJson("ViewName"),
        "key": $util.dynamodb.toDynamoDBJson($ctx.args.key)
       }
    }
#else
$utils.unauthorized()
#end

</pre>
