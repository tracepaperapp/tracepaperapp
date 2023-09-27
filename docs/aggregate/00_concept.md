# The Aggregate Concept

Een aggregate weerspiegeld een domein concept, een verzameling van data (state) en gedrag om de data te manipuleren. 
De data is intern afgeschermd, dus de enige manier om een state change teweeg te brengen is door het aanroepen 
van gedrag.

Het modeleren van een aggregate bevat twee activiteiten:
1. Het modeleren van het data model.
2. Het modeleren van gedrag op het model.

----


> Een concept uit DDD geopinieerd om cognitieve load te optimaliseren, nadenken over de concepten niet de onderliggende techniek. 
> Het abstraheerd het Command/Compute gedeelte van onze CQRS architectuur.
