"use client";

import { useState } from "react";

export interface ExemplarView {
  level: "E" | "C" | "A";
  text: string;
  kommentar: string;
}

const LEVEL_LABEL: Record<ExemplarView["level"], string> = {
  E: "Exempelsvar på E-nivå",
  C: "Exempelsvar på C-nivå",
  A: "Exempelsvar på A-nivå",
};

/**
 * Exempelsvar i nivåer (E/C/A), visas EFTER elevens eget försök. Nivåerna
 * gäller exempelsvaren - aldrig elevens svar; poängen är att eleven ska se
 * kvalitetsskillnaden mellan nivåerna på nära håll och kalibrera sig själv.
 * Kommentaren pekar ut vad som gör skillnaden.
 */
export default function ExemplarPanel({
  exemplars,
}: {
  exemplars: ExemplarView[];
}) {
  const [open, setOpen] = useState<number | null>(0);
  const ordered = [...exemplars].sort(
    (a, b) => "ECA".indexOf(a.level) - "ECA".indexOf(b.level)
  );

  return (
    <div className="mt-4">
      <p className="font-semibold text-sm mb-2">
        Jämför med exempelsvaren - vad gör de som ditt svar inte gör (än)?
      </p>
      <div className="flex flex-col gap-2">
        {ordered.map((ex, i) => (
          <div key={ex.level} className="border border-border-light rounded-xl">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between p-3 text-left"
              aria-expanded={open === i}
            >
              <span className="font-semibold text-sm">{LEVEL_LABEL[ex.level]}</span>
              <span className="text-muted text-sm">
                {open === i ? "Dölj" : "Visa"}
              </span>
            </button>
            {open === i && (
              <div className="px-3 pb-3">
                <p className="text-sm whitespace-pre-wrap mb-2">{ex.text}</p>
                {ex.kommentar && (
                  <p className="text-xs text-muted border-t border-border-light pt-2">
                    <span className="font-semibold">Lägg märke till: </span>
                    {ex.kommentar}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
