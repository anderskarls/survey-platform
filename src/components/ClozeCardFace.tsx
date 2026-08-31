"use client";

import { splitAtGap } from "@/lib/cloze";

/**
 * Luckmeningskortets ansikte - samma mening på båda sidorna.
 *
 * Framsidan visar meningen med en tom rad där ordet ska stå; baksidan samma
 * mening med ordet på plats och framhävt. Att sidorna delar komponent är
 * poängen: meningen får inte hoppa till när kortet vänds, för det är
 * skillnaden mellan sidorna eleven ska läsa av, inte layouten.
 *
 * Används både i enkäter (QuestionRenderer) och i övningspasset
 * (PracticeRunner), som hämtar sina baksidor från olika håll men visar dem
 * likadant.
 */
export default function ClozeCardFace({
  text,
  answer,
  hint,
}: {
  text: string;
  /** Ordet som fyller luckan. Utelämnat = framsidan. */
  answer?: string | null;
  /** Svensk ledtråd, om frågan har en. Visas bara på framsidan. */
  hint?: string;
}) {
  const { before, after } = splitAtGap(text);

  return (
    <div>
      <p className="text-center text-xl font-semibold tracking-tight px-2 leading-relaxed">
        <span>{before}</span>
        {answer ? (
          <span className="text-primary font-bold underline decoration-2 decoration-primary/40 underline-offset-4">
            {answer}
          </span>
        ) : (
          // Luckan som en tom rad. Skärmläsaren får ordet "lucka" i stället
          // för tre understreck, som läses upp tecken för tecken.
          <span className="inline-block align-baseline min-w-[5rem] mx-1 border-b-2 border-primary">
            <span className="sr-only">lucka</span>
          </span>
        )}
        <span>{after}</span>
      </p>

      {!answer && hint && (
        <p className="text-center text-sm text-muted mt-3">
          Ledtråd: <span className="font-medium">{hint}</span>
        </p>
      )}
    </div>
  );
}
