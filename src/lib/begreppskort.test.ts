import { describe, expect, it } from "vitest";
import {
  MAX_EXPLANATION,
  conceptTopicName,
  normalizeTerm,
  parseBegreppsrader,
  parseConceptConfig,
} from "./begreppskort";

// Regeln som testas: läraren skriver en rad per begrepp i stunden, och varje
// rad blir antingen ett kort eller ett synligt fel - aldrig tyst borttappad.

describe("begreppsrutan", () => {
  it("delar raden vid bindestreck med mellanslag runt", () => {
    const { rader, fel } = parseBegreppsrader(
      "Legitimitet - folkets acceptans av makten\nPolis - självstyrande grekisk stadsstat"
    );
    expect(fel).toEqual([]);
    expect(rader).toEqual([
      { term: "Legitimitet", explanation: "folkets acceptans av makten" },
      { term: "Polis", explanation: "självstyrande grekisk stadsstat" },
    ]);
  });

  it("delar inte ord med bindestreck i sig", () => {
    const { rader } = parseBegreppsrader(
      "Västromerska riket - rikets västra halva efter 395\n1900-talet - seklet 1901-2000"
    );
    expect(rader[0].term).toBe("Västromerska riket");
    expect(rader[1]).toEqual({ term: "1900-talet", explanation: "seklet 1901-2000" });
  });

  it("delar bara vid första skiljetecknet - förklaringen får innehålla fler", () => {
    const { rader } = parseBegreppsrader("Metoik - fri invånare - men utan medborgarskap");
    expect(rader[0]).toEqual({
      term: "Metoik",
      explanation: "fri invånare - men utan medborgarskap",
    });
  });

  it("tar tankstreck från inklistrad text och kolon", () => {
    const { rader, fel } = parseBegreppsrader("Demos – folket\nAgora — torget\nOligarki: fåtalsvälde");
    expect(fel).toEqual([]);
    expect(rader.map((r) => r.term)).toEqual(["Demos", "Agora", "Oligarki"]);
  });

  it("hoppar över tomma rader men behåller radnumret för felen", () => {
    const { rader, fel } = parseBegreppsrader("\nPolis - stadsstat\n\nDemos folket\n");
    expect(rader).toHaveLength(1);
    expect(fel).toEqual([
      expect.objectContaining({ rad: 4, text: "Demos folket" }),
    ]);
  });

  it("rapporterar rad utan förklaring i stället för att tappa den", () => {
    const { rader, fel } = parseBegreppsrader("Polis - ");
    expect(rader).toEqual([]);
    expect(fel).toHaveLength(1);
  });

  it("rapporterar för lång förklaring", () => {
    const { fel } = parseBegreppsrader(`Polis - ${"x".repeat(MAX_EXPLANATION + 1)}`);
    expect(fel[0].orsak).toMatch(/längre än/);
  });

  it("gör samma begrepp två gånger till ett kort med sista förklaringen", () => {
    const { rader } = parseBegreppsrader("Polis - stad\npolis  - självstyrande stadsstat");
    expect(rader).toEqual([{ term: "Polis", explanation: "självstyrande stadsstat" }]);
  });
});

describe("begreppskortets config", () => {
  it("läser förklaringen", () => {
    expect(parseConceptConfig({ explanation: " stadsstat " })).toEqual({
      explanation: "stadsstat",
    });
  });

  it("är null när förklaringen saknas eller är tom", () => {
    expect(parseConceptConfig(null)).toBeNull();
    expect(parseConceptConfig({ explanation: "  " })).toBeNull();
    expect(parseConceptConfig({ answer: "influence" })).toBeNull();
  });
});

describe("momentets begreppsämne", () => {
  it("namnges efter momentet", () => {
    expect(conceptTopicName("Antiken - framsteg för vem?")).toBe(
      "Antiken - framsteg för vem? - Begrepp"
    );
  });

  it("jämför begrepp utan hänsyn till versaler och blanksteg", () => {
    expect(normalizeTerm("  Polis ")).toBe(normalizeTerm("polis"));
    expect(normalizeTerm("Attiska  sjöförbundet")).toBe("attiska sjöförbundet");
  });
});
