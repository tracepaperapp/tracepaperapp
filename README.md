# GUI assist: onderzoeks project

- Gebruik python om een dev server te starten.
- Maakt gebruik van bootstrap 5 voor opmaak.
- Gebruikt [alpinejs](https://alpinejs.dev/) data & behavior binding.
- Gebruikt [vimesh-ui](https://github.com/vimeshjs/vimesh-ui) voor het definieren/laden van ui componenten.
- UI componenten staan in de components folder

## Embeded consoles
- [Component showcase](/admin-console)
- [GraphiQL explorer](/admin-console/graphiql)
- [GraphQL Voyager](/admin-console/voyager)

#TODO: How to schrijven
## Tags
Er zijn vier custom tags

### De query tag
De body bevat een GraphQL query die geparameteriseerd mag zijn.
De variabelen kunnen op 3 verschillende manieren gezet worden
1.  Default value in de query definitie 'query MyQuery($key: ID = "2024")' bij het definieren van een
query moet verplicht een default value opgegeven worden.
2.  De default kan overschreven worden m.b.v. code "Draftsman.set_variable('key','2024');". De code kan
gebruikt worden vanuit scripts of init functies (vanuit bijvoorbeeld een andere module).
3.  De waarde die door code is gezet kan weer overschreven worden m.b.v. de query-string in de url
http://localhost:8181/examples/query-parameters/?key=2024

>Limitatie: maar 1 query per draftsman-query container, indien je meerdere queries wilt uitvoeren
dien je deze te verdelen over meerdere containers.

Alle query containers worden gemerged naar 1 query, het alias attribuut
is daarom verplicht om colissions te voorkomen.
Het attribuut 'authenticated' is optioneel en zorgt ervoor dat 
het user access-token gebruikt wordt in plaats van het anonieme token.
Indien er geen token is of wanneer het token verlopen is, vind er een redirect
plaats naar de login pagina.

De data is binnen de AlpineJS context te benaderen via $store.{alias}.{path}.{name}
bv. het verwijzen naar 'tagline' => $store.first.get.tagline

```html
<draftsman-query alias="first" authenticated>
    query MyQuery($key: ID = "2024") {
        Edition {
            get(key: $key) {
                date
                tagline
            }
        }
    }
</draftsman-query>
```

### De on-notification tag
Een notificatie kan vanuit een notifier gestuurd worden, de view-updater in het read domain stuur
automatisch notificaties. Een notificatie bevat drie velden:
1.  identifier
2.  message
3.  type 

De subscriptie hierbeneden filter op twee van deze velden. Indien beide velden overeen komen wordt de @notification
functie uitgevoerd. In dit geval het zetten van de variabele 'key' en het herladen van de pagina data. De notificatie 
hierbeneden is de automatische notificatie van de view updater.
```html
<draftsman-notification message="updated" type="Edition"
    @notification=" 
        console.log('Received message:',$event.detail);
        Draftsman.set_variable('key',$event.detail.identifier);
        Draftsman.reload_data();">
</draftsman-notification>
```
De notificaties worden ook opgeslagen in een array die benaderbaar is vanuit de AlpineJS context door '$store.notifications'.
```html
<ol>
  <template x-for="notification in $store.notifications">
    <li x-text="JSON.stringify(notification);"></li>
  </template>
</ol>
```

### De mutation tag
Voor het formulieer te ondersteunen zetten we op de enclosing tag een data attribuut "InitializeEditionCommand" (naamgeving is vrij te kiezen).
We gebruiken de $persist plugin van AlpineJS om ervoor te zorgen dat ingevulde data niet zomaar verloren gaat.
We ondersteunen 3 type opslag middels 'using':
1. localStorage: Deze optie wordt als default gebruikt, data wordt oneindig bewaard tot het item door user of script
   verwijdert wordt uit de storage.
2. sessionStorage: Data wordt verwijdert wanneer het tabblad gesloten wordt.
3. expiringStorage: Deze custom implementatie gebruikt CacheJS, data wordt bewaard in de localStorage maar met een
   time-to-live default is 1 uur (3600 seconden) dit kan gewijzigd worden door 'expiringStorage.ttl = 900' te zetten.
   De functie Draftsman.clear_cache() & Draftsman.sign_out() verwijdert o.a. deze data.

Het data-attribuut gebruiken we voor de binding tussen formulier en gedrag, hiervoor gebruiken we
standaard AlpineJS functionaliteit x-model attributen op de form inputs.

Op de draftsman-mutation tag moet verplicht een commando attribuut (InitializeEdition) gezet worden, dit is de unieke sleutel om naar deze 
mutatie te kunnen verwijzen. Het attribuut "authenticated" is optioneel en wordt gebruikt om de correcte auth-header mee te sturen in het request.
Welke header verwacht wordt door de API ligt aan de commando authenticatie configuratie in Tracepaper.
De body van deze tag bevat de geparametriseerde mutatie query string. 

Aan de submit button hebben we middels het AlpineJS @click directive de volgende functie gebonden
> $store.mutation.send('InitializeEdition',InitializeEditionCommand);

De eerste variable in de functie verwijst naar het commando gedefinieerd in de mutation-tag.
De tweede variabele is het data-object waarmee de geparameteriseerde-variabelen in de query-string 
vervangen worden. Null values worden er automatisch uitgefilterd.

```html
<section x-data="{InitializeEditionCommand: $persist({}).using(expiringStorage)}">
    <draftsman-mutation command="InitializeEdition" authenticated>
    mutation MyMutation($date: String = "01-01-2009", $tagline: String = "123", $year: String = "2009") {
        Conference {
            initializeEdition(input: {date: $date, year: $year, tagline: $tagline}) {
                correlationId
            }
        }
    }
    </draftsman-mutation>
    <form>
        <input type="text" x-model="InitializeEditionCommand.year"/>
        <input type="text" x-model="InitializeEditionCommand.date"/>
        <textarea x-model="InitializeEditionCommand.tagline"></textarea>
        <button @click="$store.mutation.send('InitializeEdition',InitializeEditionCommand);" type="button">Submit
        </button>
    </form>
</section>
```

### De trace tag
De trace tag wordt gebruikt om na een mutatie te reageren op specfieke trace events, dit ten behoeve van
schermsturing (openen/sluiten van modals, redirects, cleanups etc)
- Het attribuut command is verplicht, hiermee wordt de trace handler gebonden aan een draftsman-mutation tag.
- Het attribuut component is optioneel en verwijst naar gedrag (lambda functie) welke trace-events publiceert,
het kent de volgende naming conventie:
  - Voor aggregate-gedrag: AggregateName.BehaviorFlowName. Het voorbeeld hieronder verwijst dus naar de
  'Initialize' flow binnen de 'RegistrationManager' aggregate.
  - Voor notifiers: Notifier-{NotifierName}
- Het attribuut status is optioneel success/error zijn het nutigste om op te sturen, al kun je technisch gezien
ook schakelen op accepted/requested.
- @trace bevat de code die uitgevoerd wanneer een tracebericht aan de criteria voldoet command/component/status.
In het voorbeeld hieronder voeren we drie acties uit:
  1. Leeg de trace-log
  2. toggle de show-banner boolean, hierdoor wordt een notificatie zichtbaar.
  3. Leeg het formulier met behulp van het data-object.
```html
<draftsman-trace command="InitializeEdition"
      component="RegistrationManager.Initialize"
      status="success"
      @trace="
        Draftsman.empty_track_and_trace_log();
        show_banner = true;
        InitializeEditionCommand={};">
</draftsman-trace>
```

## data-component class
todo

## Reserved key words
Can not be used as alias or command name!
These store's are reserved for internal use.
- trace
- notifications
- forms
- mutations
## Library
De library bevat enkele utility functies
```javascript
Draftsman.fetch_query_parameter("drn");

query_string = `query MyQuery($key: ID = "2024") {
    Edition {
      get(key: $key) {
        date
        tagline
      }
    }
}`;
var data = await Draftsman.query(query_string,{key: "2024"},anonymous=true); 

Draftsman.subscribe(query,callback,variables={},anonymous=true);
Draftsman.clear_cache();
Draftsman.disable_cache_for_page();
Draftsman.sign_in("/"); // Defaults to current location
Draftsman.sign_out(); //Bij het uitloggen wordt ook alle localStorage data verwijdert.
```

<!-- make sure examples are not executed -->
<script>
    Draftsman.set_query_mode("on-demand");
</script>