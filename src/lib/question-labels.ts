/**
 * Frågetypernas namn i lärarvyerna.
 *
 * Låg det förut som nästlade ternärer i QuestionsManager och som en egen
 * tabell i SurveyEditor, vilket gjorde att luckfrågor visades som "Fritext" i
 * frågebanken - de föll igenom till sista grenen. En ny typ ska bara behöva
 * läggas till på ett ställe.
 */
export const QUESTION_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "Flerval",
  FREE_TEXT: "Fritext",
  REFLECTION: "Reflektion",
  SORTING: "Sortering",
  CLOZE: "Lucka",
  CLOZE_CARD: "Luckkort",
};

/** Etiketten för en typ, eller typens råa namn om den är okänd. */
export function questionTypeLabel(type: string): string {
  return QUESTION_TYPE_LABELS[type] ?? type;
}
