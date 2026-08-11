// Klasskampanjen ("Fronten"): klassens aggregerade FSRS-kortstatus per sektor
// flyttar en frontlinje. Ren modul utan DB-beroenden, i stil med relearning.ts.
// Kortstatus kommer från replay av försökshistoriken (ADR 0001) - ingen egen
// glömskemodell. Spec: .scratch/klasskampanj/spec.md i vault-repot.

import {
  buildRelearningStates,
  type AttemptRecord,
} from "./relearning";

/** Andel av klassens aktiva elever som måste ha kort i sektorn - under detta: krigsdimma */
export const TACKNINGSTROSKEL = 0.6;
/**
 * Absolut golv: så här många elever måste ha kort i sektorn för att den ska
 * visas i klartext, oavsett andel. Utan golvet räckte det med en enda aktiv
 * elev för att täckningen skulle bli 1/1 = 100 % - och då stod den elevens
 * minnesläge utskrivet på projektorn inför klassen ("aktiva soldater: 1 ·
 * kort i schema: 1 · förfallna: 1"). Det är läget i början av varje termin
 * och i varje nyöppnad sektor. ADR 0001: dimman finns för att en sektor
 * aldrig ska spegla ett litet urval.
 */
export const MIN_ELEVER_UTAN_DIMMA = 5;
/** Topic-sektorer upp till så här många topics i kursen, därefter momentsektorer */
export const SEKTORGRANS = 8;
/** Max frontrörelse (positionsenheter) per dagsrapport - dämpar enskilda dåliga dagar */
export const MAX_STEG = 15;

export interface TopicInfo {
  id: number;
  name: string;
  unitId: number | null;
  unitTitle: string | null;
  questionIds: number[];
}

export interface SectorDef {
  key: string;
  name: string;
  questionIds: number[];
  /** Topics sektorn täcker - brygga när nyckelrymden byter vid SEKTORGRANS */
  topicIds: number[];
  /** Momentet sektorn hör till, om något - samma brygga åt andra hållet */
  unitId: number | null;
}

/**
 * Sektorindelning: en sektor per topic vid <= SEKTORGRANS topics, annars
 * grupperat per moment (unit). Topics utan unit blir egna sektorer.
 * Ordningen följer topics-listan (första förekomst för units).
 */
export function byggSektorer(topics: TopicInfo[]): SectorDef[] {
  if (topics.length <= SEKTORGRANS) {
    return topics.map((t) => ({
      key: `topic-${t.id}`,
      name: t.name,
      questionIds: [...t.questionIds],
      topicIds: [t.id],
      unitId: t.unitId,
    }));
  }

  const sectors: SectorDef[] = [];
  const byUnit = new Map<number, SectorDef>();
  for (const t of topics) {
    if (t.unitId == null) {
      sectors.push({
        key: `topic-${t.id}`,
        name: t.name,
        questionIds: [...t.questionIds],
        topicIds: [t.id],
        unitId: null,
      });
      continue;
    }
    const existing = byUnit.get(t.unitId);
    if (existing) {
      existing.questionIds.push(...t.questionIds);
      existing.topicIds.push(t.id);
    } else {
      const sector: SectorDef = {
        key: `unit-${t.unitId}`,
        name: t.unitTitle ?? t.name,
        questionIds: [...t.questionIds],
        topicIds: [t.id],
        unitId: t.unitId,
      };
      byUnit.set(t.unitId, sector);
      sectors.push(sector);
    }
  }
  return sectors;
}

/**
 * Sektorns läge i föregående snapshot.
 *
 * Nyckelrymden byter form när kursen passerar SEKTORGRANS: samma innehåll
 * heter `topic-<id>` under gränsen och `unit-<unitId>` över den. Snapshoten är
 * nycklad på strängarna, så en direkt uppslagning missar vid omgrupperingen -
 * och utan `prev` hoppas MAX_STEG-dämpningen över helt. Att lägga till ett nytt
 * område mitt i terminen räckte för att fronten skulle falla 62 enheter i ett
 * steg och rapporten säga "etablerar ställningar" som om kampanjen börjat om.
 *
 * Bryggan slår därför upp på sektorns beståndsdelar när nyckeln saknas, och
 * väger ihop dem efter antal kort så att en stor topic väger tyngre.
 */
export function tidigareLage(
  previous: CampaignPayload | null,
  sector: SectorDef
): SectorSnapshot | null {
  if (!previous) return null;

  const direkt = previous.sectors[sector.key];
  if (direkt) return direkt;

  // Momentsektor byggd av topics som tidigare var egna sektorer
  const delar = sector.topicIds
    .map((id) => previous.sectors[`topic-${id}`])
    .filter((s): s is SectorSnapshot => s != null);
  if (delar.length > 0) return vagSamman(delar);

  // Åt andra hållet: topicsektorn ingick tidigare i en momentsektor
  if (sector.unitId != null) {
    return previous.sectors[`unit-${sector.unitId}`] ?? null;
  }
  return null;
}

function vagSamman(delar: SectorSnapshot[]): SectorSnapshot {
  const kort = delar.map((d) => d.iSchema + d.forfallna);
  const totaltKort = kort.reduce((s, k) => s + k, 0);
  const position =
    totaltKort === 0
      ? Math.round(delar.reduce((s, d) => s + d.position, 0) / delar.length)
      : Math.round(
          delar.reduce((s, d, i) => s + d.position * kort[i], 0) / totaltKort
        );
  return {
    position,
    iSchema: delar.reduce((s, d) => s + d.iSchema, 0),
    forfallna: delar.reduce((s, d) => s + d.forfallna, 0),
  };
}

export interface SectorSnapshot {
  position: number;
  iSchema: number;
  forfallna: number;
}

/**
 * Persisterat frontläge (`CampaignSnapshot.payload`) - endast sektorer utom dimma.
 *
 * `sectors` är **dagsrapportens jämförelsepunkt**, inte det aktuella läget. Den
 * står stilla hela dagen så att en omladdning inte flyttar fronten och inte
 * förbrukar rapporten: MAX_STEG ska dämpa per dagsrapport, inte per request.
 * `senaste` är fronten som den faktiskt visades vid senaste anropet och rullas
 * fram till jämförelsepunkt vid dygnsskifte. `baslinjeDatum` är dygnet
 * jämförelsepunkten sattes (Europe/Stockholm).
 *
 * Fälten är valfria för bakåtkompatibilitet med snapshots skrivna före
 * kadensfixen - en payload med bara `sectors` läses som en jämförelsepunkt utan
 * känd dag, vilket ger en ny dagsrapport vid nästa visning.
 */
export interface CampaignPayload {
  sectors: Record<string, SectorSnapshot>;
  senaste?: Record<string, SectorSnapshot>;
  baslinjeDatum?: string;
}

/**
 * Väljer dagsrapportens jämförelsepunkt ur det persisterade snapshotet.
 *
 * Punkten flyttas en gång per dygn: vid dygnsskifte rullas gårdagens sista
 * visade läge (`senaste`) fram till baslinje, resten av dagen står den still.
 * Det är den här regeln som gör MAX_STEG till "per dagsrapport" i stället för
 * "per sidladdning", och som låter läraren öppna vyn på morgonen utan att
 * förbruka rörelsen innan klassen kommer.
 */
export function valjBaslinje(
  lagrat: CampaignPayload | null,
  idag: string
): { baslinje: CampaignPayload | null; nyDagsrapport: boolean } {
  if (!lagrat) return { baslinje: null, nyDagsrapport: true };
  const nyDagsrapport = lagrat.baslinjeDatum !== idag;
  // Snapshots skrivna före kadensfixen saknar `senaste` - då är `sectors` det
  // enda kända läget och duger som jämförelsepunkt.
  const sectors = (nyDagsrapport && lagrat.senaste) || lagrat.sectors;
  return { baslinje: { sectors }, nyDagsrapport };
}

export interface SectorState {
  key: string;
  name: string;
  /** 0-100 efter dämpning; null i dimma utan tidigare känt läge */
  position: number | null;
  /** Kort med due-datum framför sig */
  iSchema: number;
  /** Kort med due-datum passerat */
  forfallna: number;
  /** Andel aktiva elever med minst ett kort i sektorn (0..1) */
  tackning: number;
  dimma: boolean;
  /** Positionsrörelse sedan senast visade läget; null utan jämförelsepunkt */
  deltaPosition: number | null;
  /** Nettoförändring i förfallna kort sedan senast visade läget; null utan jämförelsepunkt */
  deltaForfallna: number | null;
}

export interface FrontReport {
  sectors: SectorState[];
  /** Antal aktiva elever (>= 1 försök) - nämnaren i täckningen */
  aktivaElever: number;
  /**
   * Fronten som den visas nu, per sektornyckel. Blir dagsrapportens
   * jämförelsepunkt först vid nästa dygnsskifte - se `CampaignPayload`.
   */
  lage: Record<string, SectorSnapshot>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Beräknar frontläget: replayar varje elevs kort, aggregerar per sektor och
 * diffar mot senast visade snapshot. Deterministisk för given input.
 *
 * `attemptsByStudent` ska innehålla kursens alla försök grupperade per elev;
 * elever utan försök får gärna utelämnas (de räknas inte som aktiva).
 */
export function beraknaFront(
  attemptsByStudent: Map<number, AttemptRecord[]>,
  sectors: SectorDef[],
  previous: CampaignPayload | null,
  now: Date = new Date()
): FrontReport {
  const active = [...attemptsByStudent.entries()].filter(
    ([, attempts]) => attempts.length > 0
  );
  const aktivaElever = active.length;

  const questionToSector = new Map<number, string>();
  for (const s of sectors)
    for (const q of s.questionIds) questionToSector.set(q, s.key);

  interface Agg {
    iSchema: number;
    forfallna: number;
    studenter: Set<number>;
  }
  const agg = new Map<string, Agg>(
    sectors.map((s) => [s.key, { iSchema: 0, forfallna: 0, studenter: new Set() }])
  );

  for (const [studentId, attempts] of active) {
    const states = buildRelearningStates(attempts, now);
    for (const state of states.values()) {
      const key = questionToSector.get(state.questionId);
      if (!key) continue;
      const a = agg.get(key)!;
      if (state.isDue) a.forfallna++;
      else a.iSchema++;
      a.studenter.add(studentId);
    }
  }

  const resultSectors: SectorState[] = [];
  const lage: Record<string, SectorSnapshot> = {};

  for (const s of sectors) {
    const a = agg.get(s.key)!;
    const kort = a.iSchema + a.forfallna;
    const tackning = aktivaElever === 0 ? 0 : a.studenter.size / aktivaElever;
    const dimma =
      tackning < TACKNINGSTROSKEL ||
      kort === 0 ||
      a.studenter.size < MIN_ELEVER_UTAN_DIMMA;
    const prev = tidigareLage(previous, s);

    if (dimma) {
      // Sektorn står still: behåll senast kända läge, rapportera ingen rörelse
      resultSectors.push({
        key: s.key,
        name: s.name,
        position: prev ? prev.position : null,
        iSchema: a.iSchema,
        forfallna: a.forfallna,
        tackning,
        dimma: true,
        deltaPosition: null,
        deltaForfallna: null,
      });
      if (prev) lage[s.key] = prev;
      continue;
    }

    const ra = Math.round((100 * a.iSchema) / kort);
    const position =
      prev === null
        ? ra
        : clamp(ra, prev.position - MAX_STEG, prev.position + MAX_STEG);

    resultSectors.push({
      key: s.key,
      name: s.name,
      position,
      iSchema: a.iSchema,
      forfallna: a.forfallna,
      tackning,
      dimma: false,
      deltaPosition: prev === null ? null : position - prev.position,
      deltaForfallna: prev === null ? null : a.forfallna - prev.forfallna,
    });
    lage[s.key] = {
      position,
      iSchema: a.iSchema,
      forfallna: a.forfallna,
    };
  }

  return { sectors: resultSectors, aktivaElever, lage };
}
