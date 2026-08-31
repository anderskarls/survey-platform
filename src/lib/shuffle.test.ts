import { describe, it, expect } from "vitest";
import { shuffle } from "./shuffle";

/**
 * Det som måste hålla: blandningen tappar inget och hittar inget på. Ett
 * pass som blandas ska innehålla exakt de frågor urvalet valde - annars är
 * det inte längre samma pass.
 */

/** Deterministisk slumpkälla, så testet inte flaxar. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("blandning", () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("behåller exakt samma element", () => {
    const out = shuffle(ids, seeded(7));
    expect([...out].sort((a, b) => a - b)).toEqual(ids);
  });

  it("rör inte indata", () => {
    const original = [...ids];
    shuffle(ids, seeded(7));
    expect(ids).toEqual(original);
  });

  it("ändrar faktiskt ordningen", () => {
    expect(shuffle(ids, seeded(7))).not.toEqual(ids);
  });

  it("klarar tom lista och enstaka element", () => {
    expect(shuffle([], seeded(1))).toEqual([]);
    expect(shuffle([42], seeded(1))).toEqual([42]);
  });

  it("når varje position - inget element är fastlåst", () => {
    // Med en enda fråga i taget skulle en trasig Fisher-Yates (fel
    // intervall) aldrig flytta det första elementet. Kör många varv och
    // kontrollera att id 1 hamnat på varje plats minst en gång.
    const rnd = seeded(3);
    const träffar = new Set<number>();
    for (let i = 0; i < 300; i++) {
      träffar.add(shuffle(ids, rnd).indexOf(1));
    }
    expect(träffar.size).toBe(ids.length);
  });
});
