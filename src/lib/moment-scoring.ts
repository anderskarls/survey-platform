// Small display helpers for the moment views (Fas 6 polish):
// turn a graded response into "8/8" and a saved draft into "11/14".
// Pure - the page fetches the data and passes it in.

// Score a single response's answers. Only multiple-choice answers are graded
// (isCorrect is a boolean); free-text answers have isCorrect === null and are
// skipped. Returns "correct/gradeable" or null when nothing is gradeable
// (e.g. a pure free-text reflection).
export function quizResult(answers: { isCorrect: boolean | null }[]): string | null {
  const gradeable = answers.filter((a) => a.isCorrect !== null);
  if (gradeable.length === 0) return null;
  const correct = gradeable.filter((a) => a.isCorrect === true).length;
  return `${correct}/${gradeable.length}`;
}

// How far into a saved draft the student has come. answersJson is the
// DraftResponse.answers string (JSON: Record<questionId, value>). Returns
// "answered/total" or null when there is nothing answered yet.
export function draftProgress(
  answersJson: string | null | undefined,
  total: number
): string | null {
  if (!answersJson || total <= 0) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(answersJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const answered = Object.values(parsed).filter(
    (v) => v != null && String(v).trim() !== ""
  ).length;
  if (answered === 0) return null;
  return `${Math.min(answered, total)}/${total}`;
}
