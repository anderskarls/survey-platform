// Assertionstest för src/lib/relearning.ts - körs med: npx tsx scripts/test-relearning.ts
import {
  buildQuestionState,
  buildRelearningStates,
  selectPracticeSet,
  summarizeStates,
  dayKey,
  AttemptRecord,
} from "../src/lib/relearning";

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
  hour = 12
): AttemptRecord {
  return {
    questionId,
    isCorrect,
    createdAt: new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+02:00`),
  };
}

const NOW = d("2026-06-11");

// 1. Aldrig missad fråga -> inte i poolen
assert(
  "rätt på första försöket ger ingen poolpost",
  buildQuestionState([attempt(1, true, "2026-06-01")], NOW) === null
);

// 2. Inga försök -> null
assert("tom historik ger null", buildQuestionState([], NOW) === null);

// 3. Missad igår -> due idag (gap 1 >= krav 1 vid streak 0)
{
  const s = buildQuestionState([attempt(1, false, "2026-06-10")], NOW);
  assert("miss igår -> due idag", s !== null && s.due && s.streakDays === 0);
}

// 4. Missad idag -> inte due (gap 0 < 1)
{
  const s = buildQuestionState([attempt(1, false, "2026-06-11")], NOW);
  assert("miss idag -> inte due än", s !== null && !s.due && s.daysUntilDue === 1);
}

// 5. KÄRNFALLET: två rätt samma dag = EN session, inte två
{
  const s = buildQuestionState(
    [
      attempt(1, false, "2026-06-08"),
      attempt(1, true, "2026-06-09", 10),
      attempt(1, true, "2026-06-09", 14),
    ],
    NOW
  );
  assert(
    "två rätt samma dag räknas som en session",
    s !== null && s.streakDays === 1 && s.status === "learning"
  );
}

// 6. Dagens utfall = sista försöket: rätt sedan fel samma dag -> miss-dag
{
  const s = buildQuestionState(
    [
      attempt(1, false, "2026-06-05"),
      attempt(1, true, "2026-06-09", 10),
      attempt(1, false, "2026-06-09", 14),
    ],
    NOW
  );
  assert(
    "fel efter rätt samma dag nollställer",
    s !== null && s.streakDays === 0
  );
}

// 7. Gradering: miss + tre korrekta dagssessioner -> graduated
{
  const s = buildQuestionState(
    [
      attempt(1, false, "2026-05-01"),
      attempt(1, true, "2026-05-02"),
      attempt(1, true, "2026-05-04"),
      attempt(1, true, "2026-05-08"),
    ],
    NOW
  );
  assert(
    "tre spacade rätt -> graduated",
    s !== null && s.status === "graduated" && s.streakDays === 3
  );
  assert(
    "graderad fråga får 28-dagarsintervall (due efter 2026-06-05)",
    s !== null && s.due // 2026-05-08 + 28 = 2026-06-05, nu är det 06-11
  );
}

// 8. Graderad men inte due än
{
  const s = buildQuestionState(
    [
      attempt(1, false, "2026-05-20"),
      attempt(1, true, "2026-05-21"),
      attempt(1, true, "2026-05-23"),
      attempt(1, true, "2026-06-01"),
    ],
    NOW
  );
  assert(
    "graderad nyligen -> underhåll inte due",
    s !== null && s.status === "graduated" && !s.due && s.daysUntilDue === 18
  );
}

// 9. Miss nollställer streak även efter gradering
{
  const s = buildQuestionState(
    [
      attempt(1, false, "2026-05-01"),
      attempt(1, true, "2026-05-02"),
      attempt(1, true, "2026-05-04"),
      attempt(1, true, "2026-05-08"),
      attempt(1, false, "2026-06-08"),
    ],
    NOW
  );
  assert(
    "miss efter gradering -> tillbaka till learning streak 0",
    s !== null && s.status === "learning" && s.streakDays === 0 && s.due
  );
}

// 10. "Jag är inte säker" (null) räknas som miss
{
  const s = buildQuestionState([attempt(1, null, "2026-06-09")], NOW);
  assert("osäker räknas som miss -> i poolen och due", s !== null && s.due);
}

// 11. Expanderande intervall: streak 1 -> kräver 2 dagars gap
{
  const s = buildQuestionState(
    [attempt(1, false, "2026-06-08"), attempt(1, true, "2026-06-10")],
    NOW
  );
  assert(
    "streak 1 igår -> inte due (kräver 2 dagar)",
    s !== null && s.streakDays === 1 && !s.due && s.daysUntilDue === 1
  );
}

// 12. Streak 2 -> kräver 4 dagars gap
{
  const s = buildQuestionState(
    [
      attempt(1, false, "2026-06-01"),
      attempt(1, true, "2026-06-05"),
      attempt(1, true, "2026-06-08"),
    ],
    NOW
  );
  assert(
    "streak 2 för 3 dagar sedan -> inte due (kräver 4)",
    s !== null && s.streakDays === 2 && !s.due && s.daysUntilDue === 1
  );
}

// 13. buildRelearningStates filtrerar bort aldrig-missade
{
  const states = buildRelearningStates(
    [
      attempt(1, true, "2026-06-01"),
      attempt(2, false, "2026-06-01"),
      attempt(3, false, "2026-06-09"),
    ],
    NOW
  );
  assert(
    "states innehåller bara missade frågor",
    !states.has(1) && states.has(2) && states.has(3)
  );
}

// 14. selectPracticeSet: lägst streak först, round-robin över topics, cap
{
  const attempts: AttemptRecord[] = [
    // q1 topic A: streak 0, missad för länge sedan (mest försenad)
    attempt(1, false, "2026-06-01"),
    // q2 topic A: streak 0, missad nyligen
    attempt(2, false, "2026-06-09"),
    // q3 topic B: streak 1 (due: rätt för 3 dagar sedan >= 2)
    attempt(3, false, "2026-06-05"),
    attempt(3, true, "2026-06-08"),
    // q4 topic B: inte due (rätt igår, streak 1 kräver 2)
    attempt(4, false, "2026-06-08"),
    attempt(4, true, "2026-06-10"),
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
  assert("streak 0-frågor före streak 1", set.indexOf(1) < set.indexOf(3));
  assert(
    "round-robin: topic B-frågan ligger mellan topic A-frågorna",
    set[1] === 3 || set[0] === 3
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

// 15. summarizeStates
{
  const states = buildRelearningStates(
    [
      attempt(1, false, "2026-06-10"), // learning, due
      attempt(2, false, "2026-05-01"), // graderad 05-08, due (28 d sedan 06-05)
      attempt(2, true, "2026-05-02"),
      attempt(2, true, "2026-05-04"),
      attempt(2, true, "2026-05-08"),
      attempt(3, false, "2026-06-11"), // learning, inte due
    ],
    NOW
  );
  const sum = summarizeStates(states);
  assert(
    "summering: 2 due, 2 learning, 1 graduated",
    sum.due === 2 && sum.learning === 2 && sum.graduated === 1
  );
}

// 16. dayKey ger svensk kalenderdag
assert(
  "dayKey hanterar dygnsgräns: 23:30 UTC 10/6 = 01:30 11/6 svensk tid",
  dayKey(new Date("2026-06-10T23:30:00Z")) === "2026-06-11"
);

console.log(`${passed}/${passed + failed} assertions pass`);
if (failed > 0) process.exit(1);
