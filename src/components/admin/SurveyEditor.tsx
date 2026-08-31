"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { questionTypeLabel } from "@/lib/question-labels";

interface Topic {
  id: number;
  name: string;
}

interface Unit {
  id: number;
  title: string;
  period?: string | null;
}

interface Question {
  id: number;
  text: string;
  type: string;
  topic?: Topic;
}

interface SurveyDetail {
  id: number;
  title: string;
  description: string;
  mode: string;
  lockMode: boolean;
  unitId: number | null;
  lesson: number | null;
  openAt: string | null;
  _count: { responses: number };
  questions: { questionId: number; question: Question }[];
}

interface SurveyEditImpact {
  changedFields: string[];
  addedQuestions: number;
  removedQuestions: number;
  reordered: boolean;
  hiddenAnswers: number;
  responsesMissingNew: number;
}

interface SurveyEditorProps {
  apiBase: string;
  surveyId: number;
  /** Sätts av den kursbundna vyn - moment och lektion finns bara där. */
  courseId?: number;
  allowModeSelection?: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/** Date -> "YYYY-MM-DDTHH:mm" i lokal tid, formatet <input type="datetime-local"> vill ha. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function describeImpact(impact: SurveyEditImpact): string {
  const parts: string[] = [];
  if (impact.addedQuestions > 0) parts.push(`${impact.addedQuestions} tillagda`);
  if (impact.removedQuestions > 0) parts.push(`${impact.removedQuestions} urlyfta`);
  if (impact.reordered) parts.push("ny ordning");
  if (impact.hiddenAnswers > 0)
    parts.push(`${impact.hiddenAnswers} svar döljs i resultaten`);
  if (impact.responsesMissingNew > 0)
    parts.push(
      `${impact.responsesMissingNew} tidigare inlämningar saknar de nya frågorna`
    );
  if (parts.length === 0) return "Enkäten sparad";
  return `Enkäten sparad - ${parts.join(", ")}`;
}

export default function SurveyEditor({
  apiBase,
  surveyId,
  courseId,
  allowModeSelection = false,
  onSaved,
  onError,
  onClose,
}: SurveyEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [responseCount, setResponseCount] = useState(0);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState("SURVEY");
  const [lockMode, setLockMode] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [lesson, setLesson] = useState("");
  const [openAt, setOpenAt] = useState("");

  const [selected, setSelected] = useState<Question[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [filterTopic, setFilterTopic] = useState("");
  const [search, setSearch] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);

  // Laddningen ska ske en gång per enkät. Ligger callbackarna i beroendelistan
  // körs den om vid varje rendering av föräldern - inline-pilfunktioner byter
  // identitet varje gång - och vyn skulle blinka i en oändlig slinga.
  const handlers = useRef({ onError, onClose });
  handlers.current = { onError, onClose };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests: Promise<Response>[] = [
        fetch(`${apiBase}/surveys/${surveyId}`),
        fetch(`${apiBase}/questions`),
        fetch(`${apiBase}/topics`),
      ];
      if (courseId) requests.push(fetch(`${apiBase}/units`));
      const responses = await Promise.all(requests);
      if (responses.some((r) => !r.ok)) throw new Error("Fetch failed");

      const [survey, questions, topicList] = (await Promise.all(
        responses.slice(0, 3).map((r) => r.json())
      )) as [SurveyDetail, Question[], Topic[]];

      setTitle(survey.title);
      setDescription(survey.description ?? "");
      setMode(survey.mode ?? "SURVEY");
      setLockMode(survey.lockMode ?? false);
      setUnitId(survey.unitId ? String(survey.unitId) : "");
      setLesson(survey.lesson ? String(survey.lesson) : "");
      setOpenAt(toLocalInput(survey.openAt));
      setResponseCount(survey._count?.responses ?? 0);
      setSelected(survey.questions.map((sq) => sq.question));
      setAllQuestions(questions);
      setTopics(topicList);
      if (courseId) setUnits((await responses[3].json()) as Unit[]);
    } catch {
      handlers.current.onError("Kunde inte ladda enkäten");
      handlers.current.onClose();
    } finally {
      setLoading(false);
    }
  }, [apiBase, surveyId, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  function move(index: number, delta: number) {
    setSelected((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(id: number) {
    setSelected((prev) => prev.filter((q) => q.id !== id));
  }

  function add(q: Question) {
    setSelected((prev) => (prev.some((s) => s.id === q.id) ? prev : [...prev, q]));
  }

  async function save(confirmRemoval = false) {
    if (!title.trim() || selected.length === 0) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description,
        lockMode,
        questionIds: selected.map((q) => q.id),
        openAt: openAt ? new Date(openAt).toISOString() : null,
        confirmRemoval,
      };
      if (allowModeSelection) body.mode = mode;
      if (courseId) {
        body.unitId = unitId ? Number(unitId) : null;
        body.lesson = lesson ? Number(lesson) : null;
      }

      const res = await fetch(`${apiBase}/surveys/${surveyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.status === 409 && data.requiresConfirmation && !confirmRemoval) {
        setPendingConfirm(data.error as string);
        return;
      }
      if (!res.ok) {
        onError((data.error as string) || "Kunde inte spara enkäten");
        return;
      }

      setPendingConfirm(null);
      onSaved(describeImpact(data.impact as SurveyEditImpact));
      onClose();
    } catch {
      onError("Kunde inte spara enkäten");
    } finally {
      setSaving(false);
    }
  }

  const selectedIds = new Set(selected.map((q) => q.id));
  const candidates = allQuestions
    .filter((q) => !selectedIds.has(q.id))
    .filter((q) => !filterTopic || q.topic?.id === Number(filterTopic))
    .filter((q) => !search || q.text.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return <div className="card p-5 mb-6 text-muted">Laddar enkäten...</div>;
  }

  return (
    <div className="card p-5 mb-6 animate-scale-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold tracking-tight">Redigera enkät #{surveyId}</h3>
        <button onClick={onClose} className="text-sm text-muted hover:underline">
          Stäng
        </button>
      </div>

      {responseCount > 0 && (
        <p className="text-xs text-muted mb-4">
          {responseCount} inlämningar finns. Ändrad titel, läge och ordning påverkar
          bara framtida svar. Elever som har enkäten öppen just nu behöver ladda om
          sidan om du ändrar frågorna.
        </p>
      )}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titel..."
        className="input-field mb-3"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Beskrivning (valfritt)..."
        rows={2}
        className="input-field mb-3"
      />

      {allowModeSelection && (
        <div className="flex gap-4 mb-3">
          {(["SURVEY", "QUIZ"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="edit-mode"
                checked={mode === m}
                onChange={() => setMode(m)}
                className="accent-primary"
              />
              <span className="text-sm">
                {m === "SURVEY" ? "Enkät" : "Quiz (rätt/fel-svar)"}
              </span>
            </label>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={lockMode}
          onChange={(e) => setLockMode(e.target.checked)}
          className="accent-primary"
        />
        <span className="text-sm">🔒 Låst läge</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        {courseId && (
          <>
            <label className="text-sm">
              <span className="block mb-1 font-medium">Moment</span>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="input-field py-1"
              >
                <option value="">Inget moment</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block mb-1 font-medium">Lektion</span>
              <input
                type="number"
                min={1}
                value={lesson}
                onChange={(e) => setLesson(e.target.value)}
                placeholder="-"
                className="input-field py-1"
              />
            </label>
          </>
        )}
        <label className="text-sm">
          <span className="block mb-1 font-medium">Öppnar</span>
          <input
            type="datetime-local"
            value={openAt}
            onChange={(e) => setOpenAt(e.target.value)}
            className="input-field py-1"
          />
          <span className="block text-xs text-muted mt-1">Tomt = öppen direkt</span>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">
              I enkäten ({selected.length})
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto border border-border rounded-lg">
            {selected.length === 0 ? (
              <p className="p-3 text-sm text-muted">
                Inga frågor kvar - välj minst en innan du sparar.
              </p>
            ) : (
              selected.map((q, i) => (
                <div
                  key={q.id}
                  className="flex items-center gap-2 p-2 border-b border-border-light last:border-0"
                >
                  <span className="text-xs text-muted-light font-mono w-6 shrink-0">
                    {i + 1}.
                  </span>
                  <span className="text-sm flex-1 truncate" title={q.text}>
                    {q.text}
                  </span>
                  <span className="badge bg-surface-muted text-muted shrink-0">
                    {questionTypeLabel(q.type)}
                  </span>
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-xs text-muted hover:text-primary disabled:opacity-30 px-1"
                    title="Flytta upp"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === selected.length - 1}
                    className="text-xs text-muted hover:text-primary disabled:opacity-30 px-1"
                    title="Flytta ner"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => remove(q.id)}
                    className="text-xs text-error hover:underline px-1"
                    title="Lyft ur enkäten"
                  >
                    Ta bort
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold shrink-0">Lägg till</span>
            <select
              value={filterTopic}
              onChange={(e) => setFilterTopic(e.target.value)}
              className="input-field w-auto py-1 text-sm"
            >
              <option value="">Alla ämnen</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök..."
              className="input-field py-1 text-sm"
            />
          </div>
          <div className="max-h-72 overflow-y-auto border border-border rounded-lg">
            {candidates.length === 0 ? (
              <p className="p-3 text-sm text-muted">Inga fler frågor att lägga till.</p>
            ) : (
              candidates.map((q) => (
                <button
                  key={q.id}
                  onClick={() => add(q)}
                  className="flex items-center gap-2 w-full text-left p-2 hover:bg-surface-muted/50 border-b border-border-light last:border-0 transition-colors"
                >
                  <span className="text-primary text-sm shrink-0">+</span>
                  <span className="text-sm flex-1 truncate" title={q.text}>
                    {q.text}
                  </span>
                  {q.topic && (
                    <span className="text-xs text-muted shrink-0">{q.topic.name}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {pendingConfirm && (
        <div className="mt-4 p-3 rounded-lg bg-warning-light text-warning text-sm">
          <p className="mb-2">{pendingConfirm}</p>
          <div className="flex gap-3">
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="btn-primary text-sm"
            >
              Spara ändå
            </button>
            <button
              onClick={() => setPendingConfirm(null)}
              className="text-sm hover:underline"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-4">
        <button
          onClick={() => save(false)}
          disabled={saving || !title.trim() || selected.length === 0}
          className="btn-primary"
        >
          {saving ? "Sparar..." : "Spara"}
        </button>
        <button onClick={onClose} className="btn-secondary">
          Avbryt
        </button>
      </div>
    </div>
  );
}
