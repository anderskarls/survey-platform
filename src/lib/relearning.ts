// Successiv ominlärning (Rawson & Dunlosky 2022): en missad fråga övas tills
// eleven svarat rätt vid tre separata dagssessioner, därefter glesas den ut.
// Ren modul utan DB-beroenden - se docs/ovning/01-successiv-ominlarning.md.

export interface AttemptRecord {
  questionId: number;
  isCorrect: boolean | null; // null = "Jag är inte säker" (räknas som miss)
  createdAt: Date;
}

export type RelearningStatus = "learning" | "graduated";

export interface QuestionRelearningState {
  questionId: number;
  status: RelearningStatus;
  /** Sammanhängande dagssessioner med rätt svar sedan senaste missen (0-3) */
  streakDays: number;
  /** Kalenderdag (Europe/Stockholm) för senaste försöket */
  lastAttemptDay: string;
  /** Hela dagar kvar tills frågan är due (0 = due nu) */
  daysUntilDue: number;
  due: boolean;
}

/** Rätt vid 3 spacade sessioner -> graderad ("tre rätt före glesning") */
export const GRADUATION_STREAK = 3;
/** Expanderande intervall (dagar) per streaknivå 0/1/2 */
export const REVIEW_GAPS_DAYS = [1, 2, 4];
/** Underhållsintervall efter gradering (10-procentsregeln mot läsårsretention) */
export const MAINTENANCE_GAP_DAYS = 28;
/** Max antal frågor per övningspass */
export const PRACTICE_SET_CAP = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Kalenderdag i Europe/Stockholm som "YYYY-MM-DD" */
export function dayKey(date: Date): string {
  return dayFormatter.format(date);
}

function dayDiff(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(toDay) - Date.parse(fromDay)) / DAY_MS);
}

/**
 * Beräknar ominlärningsstatus för en fråga ur den samlade försökshistoriken
 * (skarpa quiz-svar + övningsförsök). Returnerar null om frågan inte hör
 * hemma i övningspoolen (aldrig missad, eller inga försök alls).
 *
 * Sessionslogik: en session = en kalenderdag. Dagens utfall = sista försöket
 * den dagen. Streak = antal sammanhängande korrekta dagssessioner räknat
 * bakifrån; en miss-dag nollställer.
 */
export function buildQuestionState(
  attempts: AttemptRecord[],
  now: Date = new Date()
): QuestionRelearningState | null {
  if (attempts.length === 0) return null;

  const sorted = [...attempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  // Frågan ingår i poolen bara om den någon gång missats (fel eller osäker)
  if (!sorted.some((a) => a.isCorrect !== true)) return null;

  // Gruppera per dagssession; dagens utfall = sista försöket den dagen
  const outcomeByDay = new Map<string, boolean>();
  for (const a of sorted) {
    outcomeByDay.set(dayKey(a.createdAt), a.isCorrect === true);
  }

  const days = Array.from(outcomeByDay.keys()); // insättningsordning = kronologisk
  let streakDays = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (outcomeByDay.get(days[i])) streakDays++;
    else break;
  }

  const status: RelearningStatus =
    streakDays >= GRADUATION_STREAK ? "graduated" : "learning";
  const lastAttemptDay = days[days.length - 1];

  const requiredGap =
    status === "graduated"
      ? MAINTENANCE_GAP_DAYS
      : REVIEW_GAPS_DAYS[Math.min(streakDays, REVIEW_GAPS_DAYS.length - 1)];

  const gap = dayDiff(lastAttemptDay, dayKey(now));
  const daysUntilDue = Math.max(0, requiredGap - gap);

  return {
    questionId: sorted[0].questionId,
    status,
    streakDays: Math.min(streakDays, GRADUATION_STREAK),
    lastAttemptDay,
    daysUntilDue,
    due: daysUntilDue === 0,
  };
}

/** Beräknar status för alla frågor med försök; poolen = någon gång missade */
export function buildRelearningStates(
  attempts: AttemptRecord[],
  now: Date = new Date()
): Map<number, QuestionRelearningState> {
  const byQuestion = new Map<number, AttemptRecord[]>();
  for (const a of attempts) {
    const list = byQuestion.get(a.questionId);
    if (list) list.push(a);
    else byQuestion.set(a.questionId, [a]);
  }

  const states = new Map<number, QuestionRelearningState>();
  for (const [questionId, list] of byQuestion) {
    const state = buildQuestionState(list, now);
    if (state) states.set(questionId, state);
  }
  return states;
}

export interface PracticeCandidate {
  questionId: number;
  topicId: number;
}

/**
 * Väljer dagens övningspass: due-frågor, lägst streak först, mest försenade
 * först inom samma streak, round-robin över topics för tematisk variation.
 */
export function selectPracticeSet(
  candidates: PracticeCandidate[],
  states: Map<number, QuestionRelearningState>,
  cap: number = PRACTICE_SET_CAP
): number[] {
  const due = candidates
    .map((c) => ({ ...c, state: states.get(c.questionId) }))
    .filter(
      (c): c is PracticeCandidate & { state: QuestionRelearningState } =>
        c.state !== undefined && c.state.due
    )
    .sort((a, b) => {
      if (a.state.streakDays !== b.state.streakDays)
        return a.state.streakDays - b.state.streakDays;
      return a.state.lastAttemptDay.localeCompare(b.state.lastAttemptDay);
    });

  // Round-robin över topics så passet inte blir en lång rad ur samma quiz
  const byTopic = new Map<number, typeof due>();
  for (const c of due) {
    const list = byTopic.get(c.topicId);
    if (list) list.push(c);
    else byTopic.set(c.topicId, [c]);
  }

  const result: number[] = [];
  const queues = Array.from(byTopic.values());
  let added = true;
  while (result.length < cap && added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        result.push(next.questionId);
        added = true;
        if (result.length >= cap) break;
      }
    }
  }
  return result;
}

export interface RelearningSummary {
  due: number;
  learning: number;
  graduated: number;
}

export function summarizeStates(
  states: Map<number, QuestionRelearningState>
): RelearningSummary {
  let due = 0;
  let learning = 0;
  let graduated = 0;
  for (const s of states.values()) {
    if (s.due) due++;
    if (s.status === "graduated") graduated++;
    else learning++;
  }
  return { due, learning, graduated };
}
