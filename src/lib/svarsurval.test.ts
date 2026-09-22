import { describe, it, expect } from "vitest";
import { gallandeSvarPerElev } from "./svarsurval";

/** En inlämning med `antalSvar` svarsrader. */
const svar = (id: number, studentId: number, tid: string, antalSvar = 1) => ({
  id,
  studentId,
  createdAt: new Date(tid),
  answers: Array.from({ length: antalSvar }, (_, i) => ({ id: i })),
});

const ENKAT = { quiz: false };
const PROV = { quiz: true };

describe("gallandeSvarPerElev", () => {
  it("lämnar en inlämning per elev orörd", () => {
    const rader = [svar(1, 1, "2026-08-01"), svar(2, 2, "2026-08-01")];
    expect(gallandeSvarPerElev(rader, ENKAT).map((r) => r.id)).toEqual([1, 2]);
  });

  it("behåller senaste inlämningen vid omtag", () => {
    const rader = [
      svar(1, 1, "2026-08-01T10:00:00Z"),
      svar(2, 1, "2026-08-03T10:00:00Z"),
      svar(3, 1, "2026-08-02T10:00:00Z"),
    ];
    const kvar = gallandeSvarPerElev(rader, ENKAT);
    expect(kvar).toHaveLength(1);
    expect(kvar[0].id).toBe(2);
  });

  it("avgör på högsta id när tidsstämpeln är identisk", () => {
    // Tre samtidiga inlämningar från ett dubbelklick landar inom samma ms
    const rader = [
      svar(14, 8, "2026-08-11T12:00:00.000Z"),
      svar(16, 8, "2026-08-11T12:00:00.000Z"),
      svar(15, 8, "2026-08-11T12:00:00.000Z"),
    ];
    const kvar = gallandeSvarPerElev(rader, ENKAT);
    expect(kvar).toHaveLength(1);
    expect(kvar[0].id).toBe(16);
  });

  it("håller isär elever", () => {
    const rader = [
      svar(1, 1, "2026-08-01"),
      svar(2, 1, "2026-08-05"),
      svar(3, 2, "2026-08-02"),
      svar(4, 3, "2026-08-03"),
    ];
    const kvar = gallandeSvarPerElev(rader, ENKAT);
    expect(kvar.map((r) => r.id).sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it("klarar tom lista", () => {
    expect(gallandeSvarPerElev([], ENKAT)).toEqual([]);
  });

  it("väljer i prov det fullständiga provet framför det stympade omtaget", () => {
    // Elev 21 gjorde 9 rätt av 10 och gick tillbaka för den tionde. Det gamla
    // filtret gav då en inlämning med en enda fråga - som stod som 100 %.
    const rader = [
      svar(1, 21, "2026-08-31T10:00:00Z", 10),
      svar(2, 21, "2026-09-07T10:00:00Z", 1),
    ];
    const kvar = gallandeSvarPerElev(rader, PROV);
    expect(kvar).toHaveLength(1);
    expect(kvar[0].id).toBe(1);
  });

  it("låter i prov senaste gälla när omtaget är lika fullständigt", () => {
    // Läget efter 2026-09-22: omtaget ger hela testet, så tiden avgör igen
    const rader = [
      svar(1, 21, "2026-08-31T10:00:00Z", 10),
      svar(2, 21, "2026-09-07T10:00:00Z", 10),
    ];
    const kvar = gallandeSvarPerElev(rader, PROV);
    expect(kvar[0].id).toBe(2);
  });

  it("låter i enkät senaste gälla även när den har färre svar", () => {
    // Obesvarade frågor kastas i enkätläge, så färre svar betyder att eleven
    // hoppade över något - inte att inlämningen är ett stympat omtag
    const rader = [
      svar(1, 5, "2026-08-31T10:00:00Z", 8),
      svar(2, 5, "2026-09-07T10:00:00Z", 3),
    ];
    const kvar = gallandeSvarPerElev(rader, ENKAT);
    expect(kvar[0].id).toBe(2);
  });

  it("väljer i prov det största omtaget oavsett i vilken ordning raderna kommer", () => {
    const rader = [
      svar(3, 7, "2026-09-07T10:00:00Z", 2),
      svar(1, 7, "2026-08-31T10:00:00Z", 15),
      svar(2, 7, "2026-09-01T10:00:00Z", 4),
    ];
    const kvar = gallandeSvarPerElev(rader, PROV);
    expect(kvar[0].id).toBe(1);
  });
});
