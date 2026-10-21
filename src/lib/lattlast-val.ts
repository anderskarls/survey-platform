"use client";

import { useSyncExternalStore } from "react";

/**
 * Elevens val av Ordinarie eller Lättläst, gemensamt för alla frågor och sidor.
 *
 * Valet följer med mellan sidorna i ett quiz och mellan enkäter, så att eleven
 * inte behöver slå på det igen på varje fråga. Det ligger i webbläsaren
 * (localStorage) och når aldrig servern. Går lagringen inte att använda -
 * privat fönster, blockerad webbplatsdata - lever valet i minnet tills sidan
 * laddas om; växeln fungerar ändå.
 *
 * useSyncExternalStore i stället för useState + useEffect: servern renderar
 * alltid Ordinarie (getServerSnapshot), och klienten byter efter hydreringen
 * utan att React varnar för olika markup.
 */

const NYCKEL = "lattlast";
const lyssnare = new Set<() => void>();
let iMinnet: boolean | null = null;

function las(): boolean {
  if (iMinnet !== null) return iMinnet;
  try {
    return window.localStorage.getItem(NYCKEL) === "1";
  } catch {
    return false;
  }
}

function prenumerera(onChange: () => void): () => void {
  lyssnare.add(onChange);
  // En annan flik som byter läge ska slå igenom här också.
  window.addEventListener("storage", onChange);
  return () => {
    lyssnare.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function sattLattlast(pa: boolean): void {
  iMinnet = pa;
  try {
    window.localStorage.setItem(NYCKEL, pa ? "1" : "0");
  } catch {
    // Lagringen är blockerad - valet gäller i minnet.
  }
  lyssnare.forEach((f) => f());
}

export function useLattlast(): boolean {
  return useSyncExternalStore(prenumerera, las, () => false);
}
