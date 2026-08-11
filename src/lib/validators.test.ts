import { describe, it, expect } from "vitest";
import { draftSchema, respondSchema, SVARSTAK } from "./validators";

const NUL = "\u0000";

describe("draftSchema", () => {
  it("delar svarstak med inlämningen", () => {
    // Fyndet: utkastet hade ingen validering alls (8 MB gick rakt in), medan
    // inlämningen kapade vid SVARSTAK. Eleven fick "Valideringsfel" först vid
    // inlämning, utan besked om vilket svar som var för långt.
    const forLangt = { answers: { "16": "x".repeat(SVARSTAK + 1) } };
    expect(draftSchema.safeParse(forLangt).success).toBe(false);
    expect(
      respondSchema.safeParse({
        answers: [{ questionId: 16, value: "x".repeat(SVARSTAK + 1) }],
      }).success
    ).toBe(false);

    const precis = { answers: { "16": "x".repeat(SVARSTAK) } };
    expect(draftSchema.safeParse(precis).success).toBe(true);
  });

  it("tillåter tomma svar - eleven har rensat fältet", () => {
    expect(draftSchema.safeParse({ answers: { "16": "" } }).success).toBe(true);
    // Inlämningen tillåter också tomt sedan blank-answer.ts: formuläret
    // skickar varje visad fråga så att servern kan rätta det tomma som fel
    // i ett prov. Vad som sparas avgörs där, inte i schemat.
    expect(
      respondSchema.safeParse({ answers: [{ questionId: 16, value: "" }] })
        .success
    ).toBe(true);
  });

  it("kräver numeriska fråge-id som nycklar", () => {
    expect(draftSchema.safeParse({ answers: { abc: "x" } }).success).toBe(false);
    expect(draftSchema.safeParse({ answers: { "16": "x" } }).success).toBe(true);
  });

  it("avvisar fel form på answers", () => {
    expect(draftSchema.safeParse({ answers: "nej" }).success).toBe(false);
    expect(draftSchema.safeParse({ answers: ["a"] }).success).toBe(false);
    expect(draftSchema.safeParse({}).success).toBe(false);
  });

  it("strippar NUL som inlämningen gör", () => {
    const parsed = draftSchema.parse({ answers: { "16": `Ång${NUL}maskinen` } });
    expect(parsed.answers["16"]).toBe("Ångmaskinen");
  });

  it("bevarar svenska tecken", () => {
    const parsed = draftSchema.parse({
      answers: { "16": "Förändringen påverkade även Öresund" },
    });
    expect(parsed.answers["16"]).toBe("Förändringen påverkade även Öresund");
  });
});

describe("respondSchema", () => {
  it("strippar NUL i stället för att avvisa svaret", () => {
    const parsed = respondSchema.parse({
      answers: [{ questionId: 1, value: `Ång${NUL}maskinen` }],
    });
    expect(parsed.answers[0].value).toBe("Ångmaskinen");
  });

  it("kräver minst ett svar", () => {
    expect(respondSchema.safeParse({ answers: [] }).success).toBe(false);
  });
});
