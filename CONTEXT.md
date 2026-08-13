# Survey-plattformen

Formativ bedömningsplattform för gymnasieundervisning: lärare bygger enkäter av frågebanker per kurs och topic, elever svarar, resultaten aggregeras för feedback, ominlärning och uppföljning.

## Language

### Kärnan

**Kurs**:
En undervisningskurs (t.ex. Historia 1b) med egna topics, frågor och elever.

**Topic**:
Ett kunskapsområde inom en kurs som frågor hör till (t.ex. Imperialism, Grundlagarna).
_Avoid_: Moment (momentet är undervisningens tidsenhet; topic är innehållets)

**Moment**:
Undervisningens tidsenhet: en grupp topics som undervisats som en enhet (t.ex. Världskrigen), med period och mål.
_Avoid_: Unit (i svensk text)

**Enkät**:
En utskickad uppsättning frågor som elever besvarar vid ett tillfälle.
_Avoid_: Survey (i svensk text), quiz, prov

**Minneskort**:
Ett FSRS-kort per elev och fråga, härlett ur elevens hela försökshistorik (skarpa quizsvar och övningsförsök). Grunden för all ominlärning.
_Avoid_: Card, flashcard

**Elevkonto**:
En elevs inloggning i **en** kurs. En elev som läser två kurser har två elevkonton, bundna till samma fysiska person av en delad personnyckel (`personKey`). Ominlärningen slår ihop kontona; sessionen gäller ett konto i taget.
_Avoid_: Användare, konto (utan led)

**Kursväxlare**:
Elevens byte mellan sina egna elevkonton utan ny inloggning. Sessionscookien skrivs om till syskonkontot; kursscopade sidor gäller inte efter bytet, så växlingen landar alltid på elevstartsidan.

**Provkonto**:
Lärarens eget elevkonto (`isTest`), till för att se kursen med elevens ögon. Det finns i elevlistan men räknas aldrig i klassens aggregat - kampanjens klasstorlek, resultatsammanställningar, momentrapport och övningsöversikt filtrerar bort det. Individflöden (feedback, enskild elevs progress) filtrerar däremot inte, så provkontot kan användas för att testa hela kedjan.
_Avoid_: Testelev, dummy-konto

**Lärarvy**:
Läraren inne i elevvyn via provkontot, öppnad från adminvyn utan elevlösenord. Adminsessionen ligger kvar parallellt, så vägen tillbaka är en länk. Bara provkonton går att öppna den här vägen - en riktig elevs konto är aldrig åtkomligt för läraren.
_Avoid_: Impersonering, inloggning som elev

### Klasskampanjen

**Kampanj**:
Klassens gemensamma, kursövergripande retrieval-spel. En kampanj per kurs, löper hela kursen och matas av samtliga moments kortstatus.
_Avoid_: Spel, läge, event

**Tema**:
En kampanjs visuella skal (karta, terminologi, estetik). Valbart per kurs och kan bytas utan att kampanjens data påverkas.
_Avoid_: Skin, design

**Fronten**:
Världskrigstemat: klassens ställning visas som en frontlinje på en karta. Fronten är ett tema, inte kampanjmekaniken själv.

**Sektor**:
Ett avsnitt av frontlinjen. Sektorns läge speglar klassens aggregerade minneskortstatus för avsnittets frågor: kort i schema håller linjen, förfallna kort förlorar terräng. Sektor per topic upp till åtta; därutöver grupperas sektorer per moment.

**Dagsrapport**:
Kampanjvyns berättelse vid lektionsstart: all frontrörelse sedan senaste visningen, presenterad per sektor. Fronten flyttas bara i samband med dagsrapporter, aldrig live.
_Avoid_: Realtidsvy, dashboard

**Krigsdimma**:
Tillståndet för en sektor där för få av klassens elever har minneskort i avsnittets frågor (under täckningströskeln). Sektorn står still och visas som okänd i stället för att spegla ett litet urval.
_Avoid_: Otillräcklig data

**Milstolpe**:
Ett narrativt terminsmål för kampanjen som fronten kan nå eller missa. Kampanjen har mål men inget förlusttillstånd.
_Avoid_: Achievement, vinstvillkor

**Motanfall**:
En övningsinsats (övningspass eller quiz) som återtar förlorad terräng i en sektor. Terrängförlust är aldrig permanent; motanfall är alltid möjligt.
