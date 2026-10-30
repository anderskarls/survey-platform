import { describe, expect, it } from "vitest";
import {
  byggAnrop,
  granskaLedtrad,
  hamtaLedtrad,
  LedtradFel,
  nastaRung,
  REGLER,
  tolkaSvar,
  type LedtradInput,
  type LedtradKlient,
} from "./ledtrad";

const facit =
  "Blev han lottad till rådet var han skyldig att ställa upp, inte bara berättigad. Staden bestämde.";

const input = (over: Partial<LedtradInput> = {}): LedtradInput => ({
  fraga: "Vilken frihet saknade medborgaren - och vem bestämde i stället?",
  facit,
  kalla: "Perikles talar till Aten.",
  utkast: "Kvinnor fick inte rösta.",
  tidigare: [],
  ...over,
});

describe("nastaRung", () => {
  it("börjar på R1 - R0 hoppas över", () => {
    expect(nastaRung([])).toBe(1);
  });
  it("går ett steg upp från det högsta givna", () => {
    expect(nastaRung([{ kind: "LEDTRAD", rung: 0, hint: "a" }, { kind: "LEDTRAD", rung: 1, hint: "b" }])).toBe(2);
  });
  it("räknar inte förklaringar av frågan", () => {
    expect(nastaRung([{ kind: "FORKLARING", rung: null, hint: "a" }])).toBe(1);
  });
  it("tar slut efter R4", () => {
    expect(nastaRung([{ kind: "LEDTRAD", rung: 4, hint: "a" }])).toBeNull();
  });
});

describe("byggAnrop", () => {
  it("lägger reglerna först och cachar både regler och underlag", () => {
    const a = byggAnrop(input(), 0);
    expect(a.system[0].text).toBe(REGLER);
    expect(a.system.every((s) => s.cache_control?.type === "ephemeral")).toBe(true);
    expect(a.system[1].text).toContain(facit);
    expect(a.system[1].text).toContain("Perikles talar");
  });
  it("lägger utkastet inom elevtext och ber om rätt steg", () => {
    const a = byggAnrop(input(), 2);
    expect(a.messages[0].content).toContain("<elevtext>\nKvinnor fick inte rösta.\n</elevtext>");
    expect(a.messages[0].content).toContain("steg R2");
  });
  it("tar med tidigare ledtrådar", () => {
    const a = byggAnrop(input({ tidigare: [{ kind: "LEDTRAD", rung: 0, hint: "Läs frågan igen." }] }), 1);
    expect(a.messages[0].content).toContain("R0: Läs frågan igen.");
  });
  it("markerar tomt utkast", () => {
    expect(byggAnrop(input({ utkast: "  " }), 0).messages[0].content).toContain("(tomt");
  });
  it("håller elevens utkast utanför systemdelen, så cachen inte bryts", () => {
    const a = byggAnrop(input({ utkast: "unik-elevtext" }), 0);
    expect(a.system.some((s) => s.text.includes("unik-elevtext"))).toBe(false);
  });
});

describe("tolkaSvar", () => {
  it("sätter steget från servern", () => {
    const s = tolkaSvar(JSON.stringify({ kind: "LEDTRAD", hint: "Titta på station 1.", diagnosis: "fel person" }), 3);
    expect(s).toEqual({ kind: "LEDTRAD", rung: 3, hint: "Titta på station 1.", diagnosis: "fel person" });
  });
  it("byter tankstreck mot bindestreck", () => {
    const s = tolkaSvar(JSON.stringify({ kind: "LEDTRAD", hint: "Läs frågan – vem är hen?", diagnosis: "y" }), 0);
    expect(s?.hint).toBe("Läs frågan - vem är hen?");
  });
  it("ger förklaringar steget null", () => {
    expect(tolkaSvar(JSON.stringify({ kind: "FORKLARING", hint: "x", diagnosis: "y" }), 2)?.rung).toBeNull();
  });
  it("avvisar trasig JSON, okänd kind och tomma fält", () => {
    expect(tolkaSvar("inte json", 0)).toBeNull();
    expect(tolkaSvar(JSON.stringify({ kind: "SVAR", hint: "x", diagnosis: "y" }), 0)).toBeNull();
    expect(tolkaSvar(JSON.stringify({ kind: "LEDTRAD", hint: " ", diagnosis: "y" }), 0)).toBeNull();
  });
});

describe("granskaLedtrad", () => {
  it("släpper igenom en vanlig ledtråd", () => {
    expect(granskaLedtrad("Frågan handlar om medborgaren själv. Vad fick han inte göra?", facit)).toEqual([]);
  });
  it("blandar inte ihop A-par med betygsnivåer", () => {
    expect(granskaLedtrad("Fråga någon i ditt A-par.", facit)).toEqual([]);
  });
  it("fångar betyg och nivåer, även med å före mellanslag", () => {
    expect(granskaLedtrad("Det här är ett E-svar.", facit)).toContain("betyg");
    expect(granskaLedtrad("Du är på god nivå här.", facit)).toContain("betyg");
    expect(granskaLedtrad("För högre betyg behöver du belägg.", facit)).toContain("betyg");
  });
  it("fångar jämförelser med andra elever", () => {
    expect(granskaLedtrad("Många missar den här.", facit)).toContain("jamforelse");
  });
  it("fångar läckt facit", () => {
    expect(granskaLedtrad("Tänk så här: han var skyldig att ställa upp, inte bara berättigad.", facit)).toContain(
      "facit-lacka"
    );
  });
  it("fångar för långa ledtrådar", () => {
    expect(granskaLedtrad("ord ".repeat(150), facit)).toContain("for-lang");
  });
});

type Svar = Awaited<ReturnType<LedtradKlient["beta"]["messages"]["create"]>>;

function fake(svar: Svar[]): LedtradKlient & { anrop: Record<string, unknown>[] } {
  const anrop: Record<string, unknown>[] = [];
  return {
    anrop,
    beta: {
      messages: {
        async create(params) {
          anrop.push(params);
          const s = svar.shift();
          if (!s) throw new Error("slut på fake-svar");
          return s;
        },
      },
    },
  };
}

const ok = (hint: string, stop = "end_turn"): Svar => ({
  model: "claude-opus-5-5",
  stop_reason: stop,
  content: [{ type: "text", text: JSON.stringify({ kind: "LEDTRAD", hint, diagnosis: "fel person" }) }],
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 800 },
});

describe("hamtaLedtrad", () => {
  it("returnerar ledtråden med rätt steg och summerad användning", async () => {
    const k = fake([ok("Vad fick han själv inte göra?")]);
    const r = await hamtaLedtrad(input({ tidigare: [{ kind: "LEDTRAD", rung: 0, hint: "a" }] }), k);
    expect(r.svar.rung).toBe(1);
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 800, cacheWriteTokens: 0 });
    expect(k.anrop[0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default" });
    expect(k.anrop[0]).not.toHaveProperty("tool_choice");
  });
  it("gör om ett underkänt svar och redovisar flaggorna", async () => {
    const k = fake([ok("Det här är ett E-svar."), ok("Vad fick han själv inte göra?")]);
    const r = await hamtaLedtrad(input(), k);
    expect(r.underkanda).toEqual([["betyg"]]);
    expect(r.usage.inputTokens).toBe(200);
  });
  it("kastar när båda försöken underkänns", async () => {
    const k = fake([ok("Många missar."), ok("Många missar.")]);
    await expect(hamtaLedtrad(input(), k)).rejects.toMatchObject({ orsak: "granskning" });
  });
  it("frågar inte om efter en vägran", async () => {
    const k = fake([{ ...ok("x"), stop_reason: "refusal" }]);
    await expect(hamtaLedtrad(input(), k)).rejects.toBeInstanceOf(LedtradFel);
    expect(k.anrop).toHaveLength(1);
  });
  it("behandlar avklippt svar som fel", async () => {
    const k = fake([ok("x", "max_tokens"), ok("x", "max_tokens")]);
    await expect(hamtaLedtrad(input(), k)).rejects.toMatchObject({ orsak: "max_tokens" });
  });
  it("vägrar när taket är nått, utan att anropa", async () => {
    const k = fake([]);
    await expect(hamtaLedtrad(input({ tidigare: [{ kind: "LEDTRAD", rung: 4, hint: "a" }] }), k)).rejects.toMatchObject({
      orsak: "tak",
    });
    expect(k.anrop).toHaveLength(0);
  });
});
