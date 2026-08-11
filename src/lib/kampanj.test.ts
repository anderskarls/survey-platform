import { describe, expect, it } from "vitest";
import type { AttemptRecord } from "./relearning";
import {
  beraknaFront,
  byggSektorer,
  tidigareLage,
  valjBaslinje,
  MAX_STEG,
  MIN_ELEVER_UTAN_DIMMA,
  type CampaignPayload,
  type SectorDef,
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

function sektor(key: string, over: Partial<SectorDef> = {}): SectorDef {
  return {
    key,
    name: "Testsektorn",
    questionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    topicIds: [],
    unitId: null,
    ...over,
  };
}

/**
 * En klass där varje elev har ett eget kort i sektorn. Antalet måste ligga över
 * MIN_ELEVER_UTAN_DIMMA för att sektorn ska visas i klartext - annars mäter
 * testet dimman i stället för det det tror sig mäta.
 */
function klass(
  antal: number,
  kort: (questionId: number) => AttemptRecord
): Map<number, AttemptRecord[]> {
  return new Map(
    Array.from({ length: antal }, (_, i) => [i + 1, [kort(i + 1)]])
  );
}

describe("byggSektorer", () => {
  it("ger en sektor per topic vid högst 8 topics", () => {
    const topics = [topic(1, 1, [10, 11]), topic(2, 1, [20])];
    const sectors = byggSektorer(topics);
    expect(sectors.map((s) => s.key)).toEqual(["topic-1", "topic-2"]);
    expect(sectors[0].questionIds).toEqual([10, 11]);
    expect(sectors[0].topicIds).toEqual([1]);
    expect(sectors[0].unitId).toBe(1);
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
    expect(sectors[0].topicIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
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

describe("tidigareLage", () => {
  it("hittar sektorn på sin egen nyckel", () => {
    const previous: CampaignPayload = {
      sectors: { "unit-1": { position: 70, iSchema: 5, forfallna: 1 } },
    };
    expect(tidigareLage(previous, sektor("unit-1"))?.position).toBe(70);
  });

  it("bryggar topic-nycklar till momentsektorn när kursen passerar SEKTORGRANS", () => {
    // Fyndet: nyckeln bytte från topic-<id> till unit-<id>, ingen prev hittades
    // och dämpningen hoppades över helt - 62 enheters fall i ett steg.
    const previous: CampaignPayload = {
      sectors: {
        "topic-1": { position: 90, iSchema: 9, forfallna: 1 },
        "topic-2": { position: 50, iSchema: 5, forfallna: 5 },
      },
    };
    const brygga = tidigareLage(
      previous,
      sektor("unit-1", { topicIds: [1, 2], unitId: 1 })
    );
    expect(brygga).toEqual({ position: 70, iSchema: 14, forfallna: 6 });
  });

  it("viktar sammanslagningen efter antal kort", () => {
    const previous: CampaignPayload = {
      sectors: {
        "topic-1": { position: 100, iSchema: 90, forfallna: 0 },
        "topic-2": { position: 0, iSchema: 0, forfallna: 10 },
      },
    };
    // 90 kort på 100 och 10 kort på 0 → 90, inte 50
    expect(
      tidigareLage(previous, sektor("unit-1", { topicIds: [1, 2], unitId: 1 }))
        ?.position
    ).toBe(90);
  });

  it("bryggar åt andra hållet: topicsektor som låg i en momentsektor", () => {
    const previous: CampaignPayload = {
      sectors: { "unit-3": { position: 64, iSchema: 8, forfallna: 4 } },
    };
    expect(
      tidigareLage(previous, sektor("topic-7", { topicIds: [7], unitId: 3 }))
        ?.position
    ).toBe(64);
  });

  it("ger null när sektorn är helt ny", () => {
    expect(tidigareLage(null, sektor("topic-1", { topicIds: [1] }))).toBeNull();
    expect(
      tidigareLage({ sectors: {} }, sektor("topic-1", { topicIds: [1] }))
    ).toBeNull();
  });
});

describe("valjBaslinje", () => {
  const lagrat: CampaignPayload = {
    sectors: { a: { position: 100, iSchema: 10, forfallna: 0 } },
    senaste: { a: { position: 85, iSchema: 8, forfallna: 2 } },
    baslinjeDatum: "2026-07-17",
  };

  it("står still resten av dagen - en omladdning är inte en ny dagsrapport", () => {
    const { baslinje, nyDagsrapport } = valjBaslinje(lagrat, "2026-07-17");
    expect(nyDagsrapport).toBe(false);
    expect(baslinje?.sectors.a.position).toBe(100);
  });

  it("rullar fram gårdagens sista läge vid dygnsskifte", () => {
    const { baslinje, nyDagsrapport } = valjBaslinje(lagrat, "2026-07-18");
    expect(nyDagsrapport).toBe(true);
    expect(baslinje?.sectors.a.position).toBe(85);
  });

  it("läser snapshots skrivna före kadensfixen som ren jämförelsepunkt", () => {
    const gammalt: CampaignPayload = {
      sectors: { a: { position: 70, iSchema: 7, forfallna: 3 } },
    };
    const { baslinje, nyDagsrapport } = valjBaslinje(gammalt, "2026-07-18");
    expect(nyDagsrapport).toBe(true);
    expect(baslinje?.sectors.a.position).toBe(70);
  });

  it("ger ingen jämförelsepunkt första gången kampanjen visas", () => {
    expect(valjBaslinje(null, "2026-07-17")).toEqual({
      baslinje: null,
      nyDagsrapport: true,
    });
  });
});

describe("beraknaFront", () => {
  const sector = sektor("unit-1", { topicIds: [1], unitId: 1 });

  it("ger position 100 när alla kort är i schema och 0 när alla förfallit", () => {
    const front = beraknaFront(klass(6, iSchema), [sector], null, NOW);
    expect(front.sectors[0]).toMatchObject({
      position: 100,
      iSchema: 6,
      forfallna: 0,
      dimma: false,
    });

    expect(
      beraknaFront(klass(6, forfallet), [sector], null, NOW).sectors[0].position
    ).toBe(0);
  });

  it("lägger sektorn i dimma under täckningströskeln och behåller senast kända läge", () => {
    // 9 aktiva elever men bara 3 (33 %) har kort i sektorn
    const attempts = new Map<number, AttemptRecord[]>([
      [1, [iSchema(1)]],
      [2, [iSchema(2)]],
      [3, [iSchema(3)]],
      ...Array.from(
        { length: 6 },
        (_, i) => [i + 4, [iSchema(900 + i)]] as [number, AttemptRecord[]]
      ),
    ]);
    const previous: CampaignPayload = {
      sectors: { "unit-1": { position: 70, iSchema: 5, forfallna: 1 } },
    };
    const front = beraknaFront(attempts, [sector], previous, NOW);
    expect(front.aktivaElever).toBe(9);
    expect(front.sectors[0]).toMatchObject({
      dimma: true,
      position: 70,
      deltaPosition: null,
      deltaForfallna: null,
    });
    // Läget överlever så nästa rapport har jämförelsepunkt
    expect(front.lage["unit-1"].position).toBe(70);
  });

  it("visar dimma utan känt läge som position null", () => {
    const attempts = new Map<number, AttemptRecord[]>([
      [1, [iSchema(1)]],
      [2, [iSchema(999)]],
      [3, [iSchema(998)]],
    ]);
    const front = beraknaFront(attempts, [sector], null, NOW);
    expect(front.sectors[0].position).toBeNull();
    expect(front.lage["unit-1"]).toBeUndefined();
  });

  it("dimmar sektorn under det absoluta elevgolvet trots 100 % täckning", () => {
    // Fyndet: en enda aktiv elev gav täckning 1/1 och sektorn skrevs ut i
    // klartext på projektorn - en publik avläsning av den elevens minnesläge.
    const front = beraknaFront(
      klass(MIN_ELEVER_UTAN_DIMMA - 1, iSchema),
      [sector],
      null,
      NOW
    );
    expect(front.sectors[0].tackning).toBe(1);
    expect(front.sectors[0].dimma).toBe(true);
    expect(front.sectors[0].position).toBeNull();
  });

  it("visar sektorn så snart golvet är nått", () => {
    const front = beraknaFront(
      klass(MIN_ELEVER_UTAN_DIMMA, iSchema),
      [sector],
      null,
      NOW
    );
    expect(front.sectors[0].dimma).toBe(false);
    expect(front.sectors[0].position).toBe(100);
  });

  it("dämpar frontrörelsen till MAX_STEG per dagsrapport", () => {
    // Rått läge 0 (alla förfallna) men senast visade 80 → max ett steg ner
    const previous: CampaignPayload = {
      sectors: { "unit-1": { position: 80, iSchema: 6, forfallna: 0 } },
    };
    const front = beraknaFront(klass(6, forfallet), [sector], previous, NOW);
    expect(front.sectors[0].position).toBe(80 - MAX_STEG);
    expect(front.sectors[0].deltaPosition).toBe(-MAX_STEG);
    expect(front.sectors[0].deltaForfallna).toBe(6);
  });

  it("dämpar även när sektorn bytt nyckelrymd", () => {
    const previous: CampaignPayload = {
      sectors: { "topic-1": { position: 80, iSchema: 6, forfallna: 0 } },
    };
    const front = beraknaFront(klass(6, forfallet), [sector], previous, NOW);
    expect(front.sectors[0].position).toBe(80 - MAX_STEG);
  });

  it("räknar bara elever med försök som aktiva", () => {
    const attempts = new Map<number, AttemptRecord[]>([
      ...klass(6, iSchema),
      [7, []],
      [8, []],
    ]);
    const front = beraknaFront(attempts, [sector], null, NOW);
    expect(front.aktivaElever).toBe(6);
    expect(front.sectors[0].dimma).toBe(false);
  });

  it("är deterministisk: samma input ger samma läge", () => {
    const attempts = new Map<number, AttemptRecord[]>([
      ...klass(5, iSchema),
      [6, [forfallet(60)]],
    ]);
    const a = beraknaFront(attempts, [sector], null, NOW);
    const b = beraknaFront(attempts, [sector], null, NOW);
    expect(a.lage).toEqual(b.lage);
    expect(a.sectors).toEqual(b.sectors);
  });
});
