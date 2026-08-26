/**
 * Veckoövning - att öva ett helt ämne (en vecka) på begäran.
 *
 * Det dagliga passet (relearning.ts) svarar på frågan "vad behöver jag
 * repetera idag". Veckoövningen svarar på en annan fråga: "jag har prov på
 * vecka 7, låt mig nöta just de orden nu". Båda skriver till samma
 * försökshistorik, så FSRS-schemat påverkas likadant - men urvalet görs av
 * eleven i stället för av kön.
 *
 * Två spärrar bär funktionen:
 *   - Bara ämnen vars enkät redan släppts går att öva. Annars vore
 *     veckoövningen en genväg förbi `Survey.openAt`, och nästa veckas ord
 *     låg framme innan testet.
 *   - Bara kurser i kortform (`Course.flashcardMode`) får listan. I en
 *     vanlig kurs vore samma lista en väg att köra om quizets frågor utanför
 *     provet; glosträningen är hela poängen här.
 */

import type { QuestionPracticeState } from "@/lib/relearning";
import { compareTitles } from "@/lib/survey-release";

/** Ett ämne (en vecka) som eleven kan öva, med elevens läge i det */
export interface WeekPracticeTopic {
  topicId: number;
  name: string;
  /** Antal kort i veckan (flervalsfrågorna i ämnet) */
  total: number;
  /** Kort eleven aldrig mött */
  fresh: number;
  /** Kort som är redo att repeteras nu */
  due: number;
  /** Kort som sitter så bra att nästa repetition ligger minst en vecka bort */
  mastered: number;
}

export interface WeekTopicInput {
  id: number;
  name: string;
  questionIds: number[];
}

/**
 * Slår ihop veckans frågor med elevens FSRS-status till en rad per vecka.
 *
 * Frågor utan status är kort eleven aldrig mött - de räknas som `fresh`, inte
 * som noll. Skillnaden är hela veckolistans poäng: en oövad vecka ska se
 * oövad ut, inte klar.
 */
export function summarizeWeekTopics(
  topics: WeekTopicInput[],
  states: Map<number, QuestionPracticeState>
): WeekPracticeTopic[] {
  return topics
    .map((t) => {
      let fresh = 0;
      let due = 0;
      let mastered = 0;
      for (const id of t.questionIds) {
        const state = states.get(id);
        if (!state) {
          fresh++;
          continue;
        }
        if (state.isDue) due++;
        if (state.mastered) mastered++;
      }
      return {
        topicId: t.id,
        name: t.name,
        total: t.questionIds.length,
        fresh,
        due,
        mastered,
      };
    })
    .sort((a, b) => compareTitles(a.name, b.name));
}

/**
 * Ordningen korten drillas i: det som behöver arbete först.
 *
 * Due före nya före vilande, och inom varje grupp den fråga som legat längst
 * (minst `daysUntilDue`) först. Eleven som avbryter efter halva passet har då
 * ändå tagit den halva som betyder något.
 */
export function orderWeekQuestions(
  questionIds: number[],
  states: Map<number, QuestionPracticeState>
): number[] {
  function rank(id: number): number {
    const state = states.get(id);
    if (!state) return 1; // aldrig mött
    return state.isDue ? 0 : 2; // due först, vilande sist
  }
  return [...questionIds].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const da = states.get(a)?.daysUntilDue ?? 0;
    const db = states.get(b)?.daysUntilDue ?? 0;
    if (da !== db) return da - db;
    return a - b; // stabil ordning: frågornas egen ordning i banken
  });
}

/** Kort sammanfattning av en veckas läge, för elevens ögon */
export function weekStatusLabel(topic: WeekPracticeTopic): string {
  const delar: string[] = [`${topic.total} kort`];
  if (topic.due > 0) delar.push(`${topic.due} att repetera`);
  if (topic.fresh > 0) delar.push(`${topic.fresh} nya`);
  if (topic.due === 0 && topic.fresh === 0) {
    delar.push(
      topic.mastered === topic.total ? "allt sitter" : "inget att repetera nu"
    );
  }
  return delar.join(" · ");
}
