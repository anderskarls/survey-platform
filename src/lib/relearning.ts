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
/**
 * Max antal ALDRIG MÖTTA frågor som introduceras per kalenderdag.
 *
 * Ankis "new cards/day". Utan tak skulle en öppnad vecka (t.ex. 15 glosor
 * åt båda hållen = 30 kort) landa i elevens knä samma dag och tränga undan
 * repetitionerna, som är det som faktiskt bygger minnet. Repetitioner går
 * alltid före nya kort i passet.
 */
export const DAILY_NEW_CARD_CAP = 10;
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

/**
 * Behåller dagens FÖRSTA försök per kalenderdag och släpper resten.
 *
 * Bara den första framplockningen en given dag är en äkta framplockning -
 * därefter har eleven sett facit, och ett nytt svar mäter igenkänning, inte
 * minne. Omkörningen i passet finns kvar som inlärning (och sparas i
 * databasen), men den kan inte förlänga intervallet eller lyfta en missad
 * fråga till "behärskad". Standardpraxis i spacing-litteraturen och samma
 * princip som gör att skarpa quiz och övningspass samma dag inte kan
 * dubbelräknas mot varandra.
 *
 * Förutsätter kronologiskt sorterad indata.
 */
function firstAttemptPerDay(sorted: AttemptRecord[]): AttemptRecord[] {
  const seenDays = new Set<string>();
  return sorted.filter((a) => {
    const day = dayKey(a.createdAt);
    if (seenDays.has(day)) return false;
    seenDays.add(day);
    return true;
  });
}

/**
 * Har frågan redan ett försök den här kalenderdagen? Då är dagen avräknad -
 * nästa svar samma dag är en omkörning som inte påverkar schemat.
 */
export function hasAttemptOnDay(
  attempts: AttemptRecord[],
  day: Date = new Date()
): boolean {
  const target = dayKey(day);
  return attempts.some((a) => dayKey(a.createdAt) === target);
}

export interface ReplayedCard {
  card: Card;
  lastGrade: Grade;
  /** Tidpunkten för elevens allra första försök på frågan */
  firstAttempt: Date;
}

/** Foldar försökshistoriken (dagens första försök per dag) genom FSRS */
export function replayCard(attempts: AttemptRecord[]): ReplayedCard | null {
  if (attempts.length === 0) return null;
  const sorted = firstAttemptPerDay(sortAttempts(attempts));
  let card = createEmptyCard(sorted[0].createdAt);
  let lastGrade: Grade = Rating.Good;
  for (const a of sorted) {
    const grade = gradeForAttempt(a);
    card = scheduler.next(card, a.createdAt, grade).card;
    lastGrade = grade;
  }
  return { card, lastGrade, firstAttempt: sorted[0].createdAt };
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
  /** Kalenderdag för elevens första försök - dagens tak för nya kort */
  firstSeenDay: string;
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
  const { card, lastGrade, firstAttempt } = replayed;

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
    firstSeenDay: dayKey(firstAttempt),
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
 * Räknar hur många nya frågor eleven redan introducerats för idag, så att
 * dagens tak håller över flera pass. En fråga är ny den dag den möttes
 * första gången - därefter är den en repetition som vilken annan.
 */
export function countIntroducedToday(
  states: Map<number, QuestionPracticeState>,
  now: Date = new Date()
): number {
  const today = dayKey(now);
  let count = 0;
  for (const s of states.values()) if (s.firstSeenDay === today) count++;
  return count;
}

/**
 * Aldrig mötta frågor som får introduceras, i den ordning läraren öppnat
 * dem. Tom lista = kursen kör den ursprungliga modellen, där en fråga når
 * övningen först när eleven mött den i ett quiz.
 */
export interface NewCardIntake {
  /** Kandidater utan försökshistorik, i introduktionsordning */
  candidates: PracticeCandidate[];
  /** Redan introducerade idag - dras av från dagens tak */
  introducedToday: number;
  /** Tak per kalenderdag */
  dailyCap?: number;
}

/**
 * Väljer dagens övningspass: due-frågor, svagast minne först (lägst
 * retrievability), äldst due som tie-break, round-robin över topics för
 * tematisk variation.
 *
 * Finns det nya kort att introducera fylls de på SIST, upp till dagens tak
 * och bara om passet har plats kvar. Ordningen är avsiktlig: en elev med
 * många repetitioner ska beta av dem innan hen får nya ord, annars växer
 * skulden snabbare än den betalas.
 */
export function selectPracticeSet(
  candidates: PracticeCandidate[],
  states: Map<number, QuestionPracticeState>,
  cap: number = PRACTICE_SET_CAP,
  newCards?: NewCardIntake
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

  if (newCards && result.length < cap) {
    const dailyCap = newCards.dailyCap ?? DAILY_NEW_CARD_CAP;
    const room = Math.min(
      cap - result.length,
      Math.max(0, dailyCap - newCards.introducedToday)
    );
    // Frågor med historik är redan hanterade ovan; ta bara de verkligt nya
    let introduced = 0;
    for (const c of newCards.candidates) {
      if (introduced >= room || result.length >= cap) break;
      if (states.has(c.questionId)) continue;
      result.push(c.questionId);
      introduced++;
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
