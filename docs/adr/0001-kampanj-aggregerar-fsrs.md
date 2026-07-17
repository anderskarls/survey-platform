# Kampanjen aggregerar FSRS-kortstatus, aldrig enkätaggregat

Appen har en deterministisk FSRS-motor (`src/lib/relearning.ts`, ts-fsrs): varje elev+fråga får ett minneskort som replayas ur hela försökshistoriken. Klasskampanjen (den kollektiva frontvyn) beslutades driva sektorernas lägen direkt ur klassens aggregerade kortstatus per moment - andel kort i schema kontra förfallna - i stället för ur en egen metrik byggd på enkätkorrekthet med egen glömskemodell. Skälet: en parallell glömskemodell vore sämre än den som redan finns och skulle låta fronten och övningsvyn ge motstridiga besked om vad klassen minns.

## Consequences

- Frontens kraft kommer från elevernas individuella övande och quizsvar. Anonymiteten skyddas av två invarianter: vyn visar aldrig per-elev-data, och en sektor utan tillräcklig korttäckning i klassen läggs i krigsdimma i stället för att spegla ett litet urval.
- En första version av denna ADR valde motsatsen (enkätaggregat) - den skrevs mot en föråldrad checkout utan FSRS-motorn och ersattes samma dag. Verifiera mot remoten innan arkitekturbeslut tas på lokal kod.
