import { describe, expect, it } from "vitest";
import type { AttemptRecord } from "./relearning";
import {
  beraknaFront,
  byggSektorer,
  MAX_STEG,
  type CampaignPayload,
  type TopicInfo,
} from "./kampanj";

const NOW = new Date("2026-07-17T10:00:00.000Z");

function attempt(
  questionId: number,
  daysAgo: number,
  isCorrect = true
): AttemptRecord {
  return {
    questionId,
    isCorrect,
    createdAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000),
    source: "answer",
  };
}

/** Ett kort som är i schema: rätt svar idag ger due imorgon eller senare */
const iSchema = (questionId: number) => attempt(questionId, 0);
/** Ett förfallet kort: enda försöket för 60 dagar sedan - due sedan länge passerat */
const forfallet = (questionId: number) => attempt(questionId, 60);

function topic(
  id: number,
  unitId: number | null,
  questionIds: number[]
): TopicInfo {
  return {
    id,
    name: `Topic ${id}`,
    unitId,
    unitTitle: unitId == null ? null : `Moment ${unitId}`,
    questionIds,
  };
}

describe("byggSektorer", () => {
  it("ger en sektor per topic vid högst 8 topics", () => {
    const topics = [topic(1, 1, [10, 11]), topic(2, 1, [20])];
    const sectors = byggSektorer(topics);
    expect(sectors.map((s) => s.key)).toEqual(["topic-1", "topic-2"]);
    expect(sectors[0].questionIds).toEqual([10, 11]);
  });

  it("grupperar per moment över 8 topics och samlar frågorna", () => {
    const topics = [
      ...Array.from({ length: 9 }, (_, i) => topic(i + 1, 1, [100 + i])),
    ];
    const sectors = byggSektorer(topics);
    expect(sectors).toHaveLength(1);
    expect(sectors[0].key).toBe("unit-1");
    expect(sectors[0].name).toBe("Moment 1");
    expect(sectors[0].questionIds).toHaveLength(9);
  });

  it("gör topics utan unit till egna sektorer i momentläge", () => {
    const topics = [
      ...Array.from({ length: 8 }, (_, i) => topic(i + 1, 1, [100 + i])),
      topic(99, null, [999]),
    ];
    const sectors = byggSektorer(topics);
    expect(sectors.map((s) => s.key)).toEqual(["unit-1", "topic-99"]);
  });
});

describe("beraknaFront", () => {
  const sector = { key: "unit-1", name: "Testsektorn", questionIds: [1, 2, 3, 4] };

  it("ger position 100 när alla kort är i schema och 0 när alla förfallit", () => {
    const alla = new Map([
      [1, [iSchema(1), iSchema(2)]],
      [2, [iSchema(3), iSchema(4)]],
    ]);
    const front = beraknaFront(alla, [sector], null, NOW);
    expect(front.sectors[0]).toMatchObject({
      position: 100,
      iSchema: 4,
      forfallna: 0,
      dimma: false,
    });

    const forfallna = new Map([
      [1, [forfallet(1), forfallet(2)]],
      [2, [forfallet(3), forfallet(4)]],
    ]);
    expect(beraknaFront(forfallna, [sector], null, NOW).sectors[0].position).toBe(0);
  });

  it("lägger sektorn i dimma under täckningströskeln och behåller senast kända läge", () => {
    // 3 aktiva elever men bara 1 (33 %) har kort i sektorn
    const attempts = new Map([
      [1, [iSchema(1)]],
      [2, [iSchema(999)]],
      [3, [iSchema(998)]],
    ]);
    const previous: CampaignPayload = {
      sectors: { "unit-1": { position: 70, iSchema: 5, forfallna: 1 } },
    };
    const front = beraknaFront(attempts, [sector], previous, NOW);
    expect(front.aktivaElever).toBe(3);
    expect(front.sectors[0]).toMatchObject({
      dimma: true,
      position: 70,
      deltaPosition: null,
      deltaForfallna: null,
    });
    // Läget överlever i payload så nästa rapport har jämförelsepunkt
    expect(front.payload.sectors["unit-1"].position).toBe(70);
  });

  it("visar dimma utan känt läge som position null", () => {
    const attempts = new Map([
      [1, [iSchema(1)]],
      [2, [iSchema(999)]],
      [3, [iSchema(998)]],
    ]);
    const front = beraknaFront(attempts, [sector], null, NOW);
    expect(front.sectors[0].position).toBeNull();
    expect(front.payload.sectors["unit-1"]).toBeUndefined();
  });

  it("dämpar frontrörelsen till MAX_STEG per dagsrapport", () => {
    // Rått läge 0 (alla förfallna) men senast visade 80 → max ett steg ner
    const attempts = new Map([[1, [forfallet(1), forfallet(2)]]]);
    const previous: CampaignPayload = {
      sectors: { "unit-1": { position: 80, iSchema: 2, forfallna: 0 } },
    };
    const front = beraknaFront(attempts, [sector], previous, NOW);
    expect(front.sectors[0].position).toBe(80 - MAX_STEG);
    expect(front.sectors[0].deltaPosition).toBe(-MAX_STEG);
    expect(front.sectors[0].deltaForfallna).toBe(2);
  });

  it("räknar bara elever med försök som aktiva", () => {
    const attempts = new Map<number, AttemptRecord[]>([
      [1, [iSchema(1)]],
      [2, []],
      [3, []],
    ]);
    const front = beraknaFront(attempts, [sector], null, NOW);
    expect(front.aktivaElever).toBe(1);
    // 1 av 1 aktiva har kort → full täckning, ingen dimma
    expect(front.sectors[0].dimma).toBe(false);
  });

  it("är deterministisk: samma input ger samma payload", () => {
    const attempts = new Map([
      [1, [iSchema(1), forfallet(2)]],
      [2, [iSchema(3)]],
    ]);
    const a = beraknaFront(attempts, [sector], null, NOW);
    const b = beraknaFront(attempts, [sector], null, NOW);
    expect(a.payload).toEqual(b.payload);
    expect(a.sectors).toEqual(b.sectors);
  });
});
