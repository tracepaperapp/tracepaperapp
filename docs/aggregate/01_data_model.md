# Aggregate Data Model

Het datamodel bestaat uit twee delen, het feitelijke deel de **events** en de projectie het **document**.

## Het Document
Het document betreft een projectie van de data, een mentaal model van de state zodat we in het gedrag 
validaties kunnen implementeren om de integriteit van de data te kunnen garanderen. Omdat het een projectie 
betreft kan dit model over tijd evolueren zonder de onderliggende data te manipuleren.
Gebeurtenissen in het verleden zijn per definitie immutable.

Het document is dus enerzijds een mentaal model voor ons zelf hoe we over state willen nadenken. 
Anderzijds is het de manier om te modeleren hoe we data aan de viewstore aanbieden. Het is het data contract 
tussen de aggregate en de viewstore.

## De Events
De domain events zijn de vastlegging van feiten. Het weerspiegeld een bundel van data die de delta tussen twee
states omvat. De state is dus niet vastgelegd in de database, louter een log van delta's die in een tijdlijn 
naast elkaar leven. Dit noemen we de event-log.

### Event Handling
Om ons mentale model te vullen, de projectie, hebben we vent handlers nodig. Deze modeleren de mapping tussen  
de event-log en het document.

----

## Side notes over views
Views komen later aan bod, maar m.b.t het contract. De viewstore modeleert in principe het externe contract, de GraphQL API.
Dus hoewel het document een data contract is, blijft dit contract binnen het domein.
De viewstore kan verschillende dingen met de data doen:

### Opslaan as is
In feite het cachen van een snapshot van de aggregate-state. In dit geval wordt het interne model publiek inzichtelijk.
Zij het querybaar en read optimized.

### Verrijken en opslaan
Verijken kan verschillende vormen hebben, het combineren van data van verschillende aggregates tot 1 document.
Of het bewerken van data voor opslag m.a.w. het bepalen van afgeleide data en deze cachen in de viewstore.

### Verrijken tijdens het lezen van data
Het bewerken van de api response voordat het naar de client gestuurd wordt. Het uitvoeren van logica
op de combinatie van request data en gecachte data. In feite gaat het hier om een on-the-fly projectie
het view model is virtueel. De logica heeft toegang tot de request-data en een fluent api naar de view-store
middels python scripting kan van deze combinatie een response object gemaakt worden.
