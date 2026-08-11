"use client";

import type { SortingItemResult } from "@/lib/formaga";

/**
 * Sorteringsuppgiftens elevvy: ett item i taget, kategorierna som knappar.
 *
 * Delad mellan förmågeträningen och enkätflödet. Enkätflödet hade tidigare
 * ingen rendering alls för SORTING och föll igenom till en textarea - eleven
 * möttes av en tom ruta där själva orden som skulle sorteras var osynliga.
 * Två renderingar av samma frågetyp är just hur den luckan uppstod.
 */
export default function SortingBoard({
  items,
  categories,
  placements,
  onPlace,
  perItem,
  disabled = false,
}: {
  items: string[];
  categories: string[];
  /** itemtext -> vald kategori */
  placements: Record<string, string>;
  onPlace: (item: string, category: string) => void;
  /** Rättning per item; satt först efter elevens svar */
  perItem?: SortingItemResult[] | null;
  disabled?: boolean;
}) {
  const visarFacit = !!perItem;

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const itemResult = perItem?.find((r) => r.text === item);
        return (
          <div
            key={item}
            className={`p-3 border rounded-xl ${
              itemResult
                ? itemResult.isCorrect
                  ? "border-success bg-success-light"
                  : "border-error bg-error-light"
                : "border-border-light"
            }`}
          >
            <p className="text-base mb-2">{item}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={item}>
              {categories.map((cat) => {
                const chosen = placements[item] === cat;
                const isCorrectCat = itemResult?.correct === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    disabled={disabled || visarFacit}
                    onClick={() => onPlace(item, cat)}
                    aria-pressed={chosen}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-all duration-150 ${
                      visarFacit && isCorrectCat
                        ? "border-success bg-success-light font-semibold"
                        : chosen
                          ? visarFacit
                            ? "border-error bg-error-light"
                            : "border-primary bg-primary-light font-semibold"
                          : "border-border-light hover:border-border"
                    } ${visarFacit ? "cursor-default" : "cursor-pointer"}`}
                  >
                    {cat}
                    {visarFacit && isCorrectCat && " ✓"}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
