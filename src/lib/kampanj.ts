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
      });
      continue;
    }
    const existing = byUnit.get(t.unitId);
    if (existing) {
      existing.questionIds.push(...t.questionIds);
    } else {
      const sector: SectorDef = {
        key: `unit-${t.unitId}`,
        name: t.unitTitle ?? t.name,
        questionIds: [...t.questionIds],
      };
      byUnit.set(t.unitId, sector);
      sectors.push(sector);
    }
  }
  return sectors;
}

export interface SectorSnapshot {
  position: number;
  iSchema: number;
  forfallna: number;
}

/** Persisterat frontläge (CampaignSnapshot.payload) - endast sektorer utom dimma */
export interface CampaignPayload {
  sectors: Record<string, SectorSnapshot>;
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
  /** Nästa snapshot att persistera */
  payload: CampaignPayload;
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
  const payload: CampaignPayload = { sectors: {} };

  for (const s of sectors) {
    const a = agg.get(s.key)!;
    const kort = a.iSchema + a.forfallna;
    const tackning = aktivaElever === 0 ? 0 : a.studenter.size / aktivaElever;
    const dimma = tackning < TACKNINGSTROSKEL || kort === 0;
    const prev = previous?.sectors[s.key] ?? null;

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
      if (prev) payload.sectors[s.key] = prev;
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
    payload.sectors[s.key] = {
      position,
      iSchema: a.iSchema,
      forfallna: a.forfallna,
    };
  }

  return { sectors: resultSectors, aktivaElever, payload };
}
