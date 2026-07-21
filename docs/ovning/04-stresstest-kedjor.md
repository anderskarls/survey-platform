# Syntetisk stresstestning av CLI-feedbackflödet - kedjor (2026-07-21)

Steg 3 i sommarbyggordningen ([Förmågeträningens utvecklingsplan 2026-07](../../../..)). Testade om payloaden från `GET /api/practice/feedback` (regler + kvalitetssprång + kriterier) räcker som promptunderlag för att en blind LLM-generator ska producera rätt feedback. Modell-blindtestet utgick i och med CLI-beslutet 2026-07-19; det som testas är **kriterierna och reglerna**.

## Upplägg

- **52 syntetiska elevsvar** (26 per riktning: orsakskedja Versailles→1933, konsekvenskedja nederlaget→1930-talet), genererade per facit-etikett: rena N1/N2/N3-svar + de fyra typiska svagheterna (kronologi, jättekliv, cirkelslut, kedja utan prosa) + kantfall.
- Seedade i en tydligt markerad testkurs (`STRESSTEST-FT`) i produktionsdatabasen; **allt raderat efter testet**.
- **Blindprincip:** feedbackgeneratorerna fick endast det pending-payloaden bär - aldrig facit. Oberoende domare bedömde sedan varje feedback mot facit (sträng bedömning: rätt språng eller miss).
- Hela kedjan kördes genom det skarpa flödet: seed → `practice get-pending-feedback --course-id` → blind generering → `practice submit-feedback` → verifiering.

## Resultat

| Kontroll | Utfall |
|---|---|
| Substantial-filtret | 50/52 pending - `?` och `..` korrekt bortfiltrerade |
| Formatdisciplin (Styrka:/Nästa steg:, EN förbättring, inga nivåord) | **50/50** |
| Längd | median 42 ord, max 58 (mål ~15 s läsning) |
| Rätt riktat "Nästa steg" | **46/48 träff (96 %)** + 2 kantfall |
| Styrkans specificitet | 47 specifika, 2 generiska, 1 felaktig |
| `submit-feedback` skrivväg | 50/50 sparade, pending 0 efteråt |

Per kategori: N1 10/10, N2 10/10, N3 8/8 (ingen regression - inga falska "mekanism saknas" på toppsvar), kronologi 6/6, jättekliv 6/6, kedja-utan-prosa 4/4, cirkelslut 2/4.

## Fynd

1. **De två cirkelslut-"missarna" är regelkonform prioritering, inte fel.** Båda svaren saknade *också* mekanismer, och regeln "rikta mot den TIDIGASTE svagheten" placerar mekanismbrist (svaghet 1) före cirkelslut (svaghet 3). Generatorn gjorde rätt; testets facit var naivt för svar med flera svagheter. Pedagogiskt är prioriteringen dessutom rimlig: mekanismerna är det tidigaste otagna språnget. Rena cirkelslut (med mekanismer intakta) träffades korrekt. **Ingen åtgärd behövs.**

2. **Regellucka: icke-svar tvingar fram fabricerad styrka.** "vet inte, vi hann inte gå igenom detta"-svar passerar substantial-filtret (rimligt), men formatkravet `Styrka: ...` fick en av två generatorer att berömma något som inte fanns i svaret. Förslag: lägg till en sjunde regel i `FEEDBACK_REGLER`, t.ex. *"Om svaret inte innehåller något resonemang: fabricera ingen styrka - ge i stället en konkret väg in i uppgiften (startpunkt + slutpunkt + ett mellanled att fylla i)."* Den andra generatorn hanterade samma situation exemplariskt utan regelstöd, så beteendet är inom räckhåll med en rad.

3. **Payloaden är självbärande.** Generatorerna behövde ingen kontext utöver pending-svaret - kriterier, svagheter och regler räckte för 96 % träff och perfekt formatdisciplin. Designbeslutet att payloaden bär hela promptunderlaget håller.

## Rekommenderad åtgärd

Endast fynd 2: en regelrad i `FEEDBACK_REGLER` (`src/lib/formaga.ts`). Allt annat validerades.
