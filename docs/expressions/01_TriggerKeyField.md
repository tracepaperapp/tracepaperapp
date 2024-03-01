# Trigger key expression

The key expressions is usable in all identity based triggers:

- Aggregate behavior flows
- View data sources

It is used to convert an event-attribute into a functional key. The name of the expression e.g. **truncateArn**
is used to access this expression from a behavior or data-source model.

You can model input for the expression e.g. `arn;length`

And the expression itself is pure Python e.g.

`
':'.join(arn.split(':')[:int(length)])
`

You can access it by configuring a method call inside the key field of behavior or data-source. The input parameters
will reference a trigger attribute. You can use literals, but they can only be strings. In our case the expression will
evaluate the string to an integer.
<pre>
#global.truncateArn(childArn, '2')
</pre>

Let's say that the trigger contains an attribute `childArn=draftsmanid:workspace:project` then te resulting key for the
flow will be `daftsmanid:workspace`.

