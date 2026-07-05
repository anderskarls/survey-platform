// Assertionstest för src/lib/relearning.ts (FSRS) - körs med: npx tsx scripts/test-relearning.ts
// Testar egenskaper (monotoni, ordning, trösklar), inte exakta dagantal -
// robust mot ts-fsrs-uppgraderingar.
import {
  buildQuestionState,
  buildRelearningStates,
  selectPracticeSet,
  summarizeStates,
  previewIntervals,
  gradeForAttempt,
  dayKey,
  AttemptRecord,
  MASTERED_INTERVAL_DAYS,
  FSRS_PARAMS,
} from "../src/lib/relearning";
import { Rating } from "ts-fsrs";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
  }
}

// Hjälpare: skapa Date kl 12:00 svensk tid (undviker dygnsgränsproblem i test)
function d(isoDay: string): Date {
  return new Date(`${isoDay}T12:00:00+02:00`);
}

function attempt(
  questionId: number,
  isCorrect: boolean | null,
  day: string,
  hour = 12,
  grade: number | null = null
): AttemptRecord {
  return {
    questionId,
    isCorrect,
    grade,
    createdAt: new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+02:00`),
  };
}

const NOW = d("2026-07-05");

// 1. Tom historik -> null
assert("tom historik ger null", buildQuestionState([], NOW) === null);

// 2. POOLÄNDRING: rätt på första försöket ger numera en poolpost
{
  const s = buildQuestionState([attempt(1, true, "2026-07-01")], NOW);
  assert("rätt på första försöket -> i poolen", s !== null);
  assert(
    "en enda rätt -> inte behärskad än",
    s !== null && s.mastered === false
  );
}

// 3. Ett fel -> i poolen, aldrig due samma dag (long-term: intervall >= 1 dag)
{
  const s = buildQuestionState([attempt(1, false, "2026-07-05")], NOW);
  assert(
    "fel idag -> due tidigast imorgon",
    s !== null && !s.isDue && s.daysUntilDue >= 1
  );
  const t = buildQuestionState([attempt(1, false, "2026-07-01")], NOW);
  assert("fel för fyra dagar sedan -> due nu", t !== null && t.isDue);
}

// 4. Osäker (null) beter sig exakt som fel
{
  const wrong = buildQuestionState([attempt(1, false, "2026-07-01")], NOW);
  const unsure = buildQuestionState([attempt(1, null, "2026-07-01")], NOW);
  assert(
    "osäker == fel (identisk due)",
    wrong !== null &&
      unsure !== null &&
      wrong.due.getTime() === unsure.due.getTime()
  );
}

// 5. Grade-kolumnen respekteras: Lätt ger längre intervall än Bra
{
  const base = [attempt(1, false, "2026-06-20")];
  const good = buildQuestionState(
    [...base, attempt(1, true, "2026-06-22", 12, Rating.Good)],
    NOW
  );
  const easy = buildQuestionState(
    [...base, attempt(1, true, "2026-06-22", 12, Rating.Easy)],
    NOW
  );
  assert(
    "Lätt ger senare due än Bra",
    good !== null && easy !== null && easy.due.getTime() > good.due.getTime()
  );
}

// 6. Legacy-härledning: grade null + rätt === explicit Bra
{
  const legacy = buildQuestionState(
    [attempt(1, false, "2026-06-20"), attempt(1, true, "2026-06-22")],
    NOW
  );
  const explicit = buildQuestionState(
    [
      attempt(1, false, "2026-06-20"),
      attempt(1, true, "2026-06-22", 12, Rating.Good),
    ],
    NOW
  );
  assert(
    "legacy rätt utan grade == explicit Bra",
    legacy !== null &&
      explicit !== null &&
      legacy.due.getTime() === explicit.due.getTime()
  );
}

// 7. Samma-dag-omkörning: fel 10:00, rätt 10:05 -> aldrig due samma dag
{
  const s = buildQuestionState(
    [attempt(1, false, "2026-07-05", 10), attempt(1, true, "2026-07-05", 10)],
    NOW
  );
  assert(
    "fel + rätt samma dag -> due tidigast imorgon",
    s !== null && !s.isDue && s.daysUntilDue >= 1
  );
}

// 8. Förhandsvisningens monotoni: again >= 1 och hard < good < easy
{
  const p = previewIntervals(
    [attempt(1, false, "2026-06-28"), attempt(1, true, "2026-07-01")],
    NOW
  );
  assert("preview: again >= 1 dag", p.again >= 1);
  assert(
    "preview: hard < good < easy",
    p.hard < p.good && p.good < p.easy
  );
  const empty = previewIntervals([], NOW);
  assert(
    "preview på ny fråga: hard < good < easy",
    empty.hard < empty.good && empty.good < empty.easy
  );
}

// 9. Intervalltillväxt + behärskad-tröskel
{
  const attempts = [
    attempt(1, false, "2026-05-01"),
    attempt(1, true, "2026-05-02"),
    attempt(1, true, "2026-05-05"),
    attempt(1, true, "2026-05-12"),
    attempt(1, true, "2026-05-26"),
  ];
  const s2 = buildQuestionState(attempts.slice(0, 3), NOW);
  const s4 = buildQuestionState(attempts, NOW);
  assert(
    "intervallet växer med fler rätt",
    s2 !== null && s4 !== null && s4.scheduledDays > s2.scheduledDays
  );
  assert(
    `behärskad när intervallet >= ${MASTERED_INTERVAL_DAYS} dagar`,
    s4 !== null && s4.scheduledDays >= MASTERED_INTERVAL_DAYS && s4.mastered
  );
}

// 10. Lapse: behärskad fråga + fel -> inte längre behärskad, due inom kort
{
  const s = buildQuestionState(
    [
      attempt(1, false, "2026-05-01"),
      attempt(1, true, "2026-05-02"),
      attempt(1, true, "2026-05-05"),
      attempt(1, true, "2026-05-12"),
      attempt(1, true, "2026-05-26"),
      attempt(1, false, "2026-07-04"),
    ],
    NOW
  );
  assert(
    "fel efter behärskad -> inte behärskad, lapse räknad",
    s !== null && !s.mastered && s.lapses >= 1
  );
  assert(
    "fel efter behärskad -> due inom ett par dagar",
    s !== null && s.daysUntilDue <= 2
  );
}

// 11. maximum_interval respekteras (många Lätt över lång tid)
{
  const attempts: AttemptRecord[] = [];
  const days = [
    "2025-01-10",
    "2025-01-20",
    "2025-02-10",
    "2025-03-20",
    "2025-06-01",
    "2025-10-01",
    "2026-03-01",
  ];
  for (const day of days) attempts.push(attempt(1, true, day, 12, Rating.Easy));
  const s = buildQuestionState(attempts, NOW);
  // ts-fsrs long-term-schemaläggare kräver hard < good < easy EFTER cappning,
  // så easy kan hamna upp till 2 dagar över maximum_interval. Känt beteende.
  assert(
    `intervallet cappas vid maximum_interval (${FSRS_PARAMS.maximum_interval}, +2 för monotoniregeln)`,
    s !== null && s.scheduledDays <= FSRS_PARAMS.maximum_interval + 2
  );
}

// 12. Determinism: två oberoende replays ger identisk due
{
  const history = [
    attempt(1, false, "2026-06-01"),
    attempt(1, true, "2026-06-03"),
    attempt(1, null, "2026-06-10"),
    attempt(1, true, "2026-06-12", 12, Rating.Hard),
  ];
  const a = buildQuestionState(history, NOW);
  const b = buildQuestionState(
    history.map((h) => ({ ...h })),
    NOW
  );
  assert(
    "replay är deterministisk",
    a !== null && b !== null && a.due.getTime() === b.due.getTime()
  );
}

// 13. selectPracticeSet: bara due, svagast retrievability först, round-robin, cap
{
  const attempts: AttemptRecord[] = [
    // q1 topic A: fel för länge sedan (mycket låg retrievability, due)
    attempt(1, false, "2026-06-01"),
    // q2 topic A: fel nyligen (högre retrievability, due)
    attempt(2, false, "2026-07-01"),
    // q3 topic B: fel för en vecka sedan (due)
    attempt(3, false, "2026-06-28"),
    // q4 topic B: fel idag (inte due - intervall >= 1 dag)
    attempt(4, false, "2026-07-05"),
  ];
  const states = buildRelearningStates(attempts, NOW);
  const set = selectPracticeSet(
    [
      { questionId: 1, topicId: 100 },
      { questionId: 2, topicId: 100 },
      { questionId: 3, topicId: 200 },
      { questionId: 4, topicId: 200 },
    ],
    states
  );
  assert("ej due-frågor utesluts ur passet", !set.includes(4));
  assert("alla due-frågor med i passet", set.length === 3);
  assert(
    "svagast minne först inom sin topic",
    set.indexOf(1) < set.indexOf(2)
  );
  assert(
    "round-robin: topic B-frågan ligger inte sist",
    set.indexOf(3) <= 1
  );

  const capped = selectPracticeSet(
    [
      { questionId: 1, topicId: 100 },
      { questionId: 2, topicId: 100 },
      { questionId: 3, topicId: 200 },
    ],
    states,
    2
  );
  assert("cap respekteras", capped.length === 2);
}

// 14. summarizeStates på blandad fixtur
{
  const states = buildRelearningStates(
    [
      // q1: fel för tre dagar sedan -> due, inte behärskad
      attempt(1, false, "2026-07-02"),
      // q2: behärskad (långt intervall efter fyra spacade rätt), inte due
      attempt(2, false, "2026-05-01"),
      attempt(2, true, "2026-05-02"),
      attempt(2, true, "2026-05-05"),
      attempt(2, true, "2026-05-12"),
      attempt(2, true, "2026-07-01"),
      // q3: fel idag -> inte due, inte behärskad
      attempt(3, false, "2026-07-05"),
    ],
    NOW
  );
  const sum = summarizeStates(states);
  const q2 = states.get(2);
  assert(
    "summering: 1 due, 2 under inlärning, 1 behärskad",
    sum.due === 1 &&
      sum.learning === 2 &&
      sum.graduated === 1 &&
      q2 !== undefined &&
      q2.mastered
  );
}

// 15. dayKey ger svensk kalenderdag
assert(
  "dayKey hanterar dygnsgräns: 23:30 UTC 4/7 = 01:30 5/7 svensk tid",
  dayKey(new Date("2026-07-04T23:30:00Z")) === "2026-07-05"
);

// 16. gradeForAttempt: passthrough och härledning
{
  assert(
    "explicit grade 2 vinner över isCorrect",
    gradeForAttempt(attempt(1, true, "2026-07-01", 12, 2)) === Rating.Hard
  );
  assert(
    "rätt utan grade -> Bra",
    gradeForAttempt(attempt(1, true, "2026-07-01")) === Rating.Good
  );
  assert(
    "fel utan grade -> Om igen",
    gradeForAttempt(attempt(1, false, "2026-07-01")) === Rating.Again
  );
  assert(
    "osäker utan grade -> Om igen",
    gradeForAttempt(attempt(1, null, "2026-07-01")) === Rating.Again
  );
  assert(
    "ogiltig grade (0) -> härledning ur isCorrect",
    gradeForAttempt(attempt(1, true, "2026-07-01", 12, 0)) === Rating.Good
  );
}

console.log(`${passed}/${passed + failed} assertions pass`);
if (failed > 0) process.exit(1);
