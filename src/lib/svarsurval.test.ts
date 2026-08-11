import { describe, it, expect } from "vitest";
import { senasteSvarPerElev } from "./svarsurval";

const svar = (id: number, studentId: number, tid: string) => ({
  id,
  studentId,
  createdAt: new Date(tid),
});

describe("senasteSvarPerElev", () => {
  it("lämnar en inlämning per elev orörd", () => {
    const rader = [svar(1, 1, "2026-08-01"), svar(2, 2, "2026-08-01")];
    expect(senasteSvarPerElev(rader).map((r) => r.id)).toEqual([1, 2]);
  });

  it("behåller senaste inlämningen vid omtag", () => {
    const rader = [
      svar(1, 1, "2026-08-01T10:00:00Z"),
      svar(2, 1, "2026-08-03T10:00:00Z"),
      svar(3, 1, "2026-08-02T10:00:00Z"),
    ];
    const kvar = senasteSvarPerElev(rader);
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
    const kvar = senasteSvarPerElev(rader);
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
    const kvar = senasteSvarPerElev(rader);
    expect(kvar.map((r) => r.id).sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it("klarar tom lista", () => {
    expect(senasteSvarPerElev([])).toEqual([]);
  });
});
