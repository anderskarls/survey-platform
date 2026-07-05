// Anki-lik övning via FSRS-6 (ts-fsrs, long-term-schemaläggaren): varje mött
// flervalsfråga får ett minneskort som replayas ur hela försökshistoriken
// (skarpa quiz-svar + övningsförsök) - ingen persisterad kortstatus.
// Ren modul utan DB-beroenden - se docs/ovning/02-fsrs.md.

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";

export interface AttemptRecord {
  questionId: number;
  isCorrect: boolean | null; // null = "Jag är inte säker" (räknas som miss)
  /** FSRS-betyg 1-4 (Rating). null/undefined = härled ur isCorrect */
  grade?: number | null;
  createdAt: Date;
  /** Tie-break vid identisk tidsstämpel: quiz-svar före övningsförsök */
  source?: "answer" | "practice";
}

/** Max antal frågor per övningspass */
export const PRACTICE_SET_CAP = 20;
/** "Behärskad" = schemalagt intervall minst så här många dagar */
export const MASTERED_INTERVAL_DAYS = 7;

export const FSRS_PARAMS = generatorParameters({
  request_retention: 0.9, // 90 % målretention (Ankis rekommendation)
  maximum_interval: 120, // läsårshorisont: aldrig mer än ~4 månader
  enable_fuzz: false, // determinism: replay + tester måste vara reproducerbara
  enable_short_term: false, // dagsgranularitet: alla intervall >= 1 dag,
  // samma-dag-repetition sköts av klientens passkö
});

const scheduler = fsrs(FSRS_PARAMS);

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

/** FSRS-betyg för ett försök: explicit kolumn om satt, annars härlett */
export function gradeForAttempt(a: AttemptRecord): Grade {
  if (a.grade != null && a.grade >= 1 && a.grade <= 4) return a.grade as Grade;
  return a.isCorrect === true ? Rating.Good : Rating.Again;
}

/** Kronologisk ordning; vid samma tidsstämpel quiz-svar före övningsförsök */
function sortAttempts(attempts: AttemptRecord[]): AttemptRecord[] {
  return attempts
    .map((a, index) => ({ a, index }))
    .sort((x, y) => {
      const t = x.a.createdAt.getTime() - y.a.createdAt.getTime();
      if (t !== 0) return t;
      const sx = x.a.source === "practice" ? 1 : 0;
      const sy = y.a.source === "practice" ? 1 : 0;
      if (sx !== sy) return sx - sy;
      return x.index - y.index;
    })
    .map((x) => x.a);
}

export interface ReplayedCard {
  card: Card;
  lastGrade: Grade;
}

/** Foldar hela försökshistoriken genom FSRS till dagens kortstatus */
export function replayCard(attempts: AttemptRecord[]): ReplayedCard | null {
  if (attempts.length === 0) return null;
  const sorted = sortAttempts(attempts);
  let card = createEmptyCard(sorted[0].createdAt);
  let lastGrade: Grade = Rating.Good;
  for (const a of sorted) {
    const grade = gradeForAttempt(a);
    card = scheduler.next(card, a.createdAt, grade).card;
    lastGrade = grade;
  }
  return { card, lastGrade };
}

export interface QuestionPracticeState {
  questionId: number;
  /** Exakt FSRS-due (med klockslag) */
  due: Date;
  /** dayKey(due) */
  dueDay: string;
  /** Due i dagstermer: dueDay <= idag (Europe/Stockholm) */
  isDue: boolean;
  /** Hela dagar kvar tills frågan är due (0 = due nu) */
  daysUntilDue: number;
  stability: number;
  difficulty: number;
  /** Sannolikhet att minnet sitter just nu (0..1) */
  retrievability: number;
  /** Schemalagt intervall i dagar */
  scheduledDays: number;
  lastReview: Date;
  lapses: number;
  reps: number;
  /** Intervall >= MASTERED_INTERVAL_DAYS och senaste betyg inte "Om igen" */
  mastered: boolean;
}

/**
 * Beräknar FSRS-status för en fråga ur den samlade försökshistoriken.
 * Poolen = ALLA frågor eleven mött (minst ett försök); null bara vid tom
 * historik. Rätt på första försöket ger långt startintervall i stället för
 * att som förr aldrig schemaläggas.
 */
export function buildQuestionState(
  attempts: AttemptRecord[],
  now: Date = new Date()
): QuestionPracticeState | null {
  const replayed = replayCard(attempts);
  if (!replayed) return null;
  const { card, lastGrade } = replayed;

  const dueDay = dayKey(card.due);
  const daysUntilDue = Math.max(0, dayDiff(dayKey(now), dueDay));

  return {
    questionId: attempts[0].questionId,
    due: card.due,
    dueDay,
    isDue: daysUntilDue === 0,
    daysUntilDue,
    stability: card.stability,
    difficulty: card.difficulty,
    retrievability: scheduler.get_retrievability(card, now, false),
    scheduledDays: card.scheduled_days,
    lastReview: card.last_review ?? attempts[0].createdAt,
    lapses: card.lapses,
    reps: card.reps,
    mastered:
      card.scheduled_days >= MASTERED_INTERVAL_DAYS &&
      lastGrade !== Rating.Again,
  };
}

/** Beräknar status för alla frågor med minst ett försök */
export function buildRelearningStates(
  attempts: AttemptRecord[],
  now: Date = new Date()
): Map<number, QuestionPracticeState> {
  const byQuestion = new Map<number, AttemptRecord[]>();
  for (const a of attempts) {
    const list = byQuestion.get(a.questionId);
    if (list) list.push(a);
    else byQuestion.set(a.questionId, [a]);
  }

  const states = new Map<number, QuestionPracticeState>();
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
 * Väljer dagens övningspass: due-frågor, svagast minne först (lägst
 * retrievability), äldst due som tie-break, round-robin över topics för
 * tematisk variation.
 */
export function selectPracticeSet(
  candidates: PracticeCandidate[],
  states: Map<number, QuestionPracticeState>,
  cap: number = PRACTICE_SET_CAP
): number[] {
  const due = candidates
    .map((c) => ({ ...c, state: states.get(c.questionId) }))
    .filter(
      (c): c is PracticeCandidate & { state: QuestionPracticeState } =>
        c.state !== undefined && c.state.isDue
    )
    .sort((a, b) => {
      if (a.state.retrievability !== b.state.retrievability)
        return a.state.retrievability - b.state.retrievability;
      return a.state.dueDay.localeCompare(b.state.dueDay);
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

export interface PracticeIntervals {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

/**
 * Förhandsvisar nästa intervall (hela dagar) per betygsknapp, som Ankis
 * svarsknappar. Replayar historiken och frågar schemaläggaren om alla
 * fyra utfall vid `now`.
 */
export function previewIntervals(
  attempts: AttemptRecord[],
  now: Date = new Date()
): PracticeIntervals {
  const replayed = replayCard(attempts);
  const card = replayed ? replayed.card : createEmptyCard(now);
  const preview = scheduler.repeat(card, now);
  const days = (grade: Grade) =>
    Math.max(1, dayDiff(dayKey(now), dayKey(preview[grade].card.due)));
  return {
    again: days(Rating.Again),
    hard: days(Rating.Hard),
    good: days(Rating.Good),
    easy: days(Rating.Easy),
  };
}

export interface RelearningSummary {
  due: number;
  learning: number;
  graduated: number; // behärskade (intervall >= MASTERED_INTERVAL_DAYS)
}

export function summarizeStates(
  states: Map<number, QuestionPracticeState>
): RelearningSummary {
  let due = 0;
  let learning = 0;
  let graduated = 0;
  for (const s of states.values()) {
    if (s.isDue) due++;
    if (s.mastered) graduated++;
    else learning++;
  }
  return { due, learning, graduated };
}
