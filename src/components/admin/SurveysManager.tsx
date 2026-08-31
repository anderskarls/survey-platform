"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import TopicComposer from "./TopicComposer";
import SurveyEditor from "./SurveyEditor";
import WeeklyReleaseScheduler from "./WeeklyReleaseScheduler";
import { formatRelease, isManualRelease, isReleased } from "@/lib/survey-release";

interface Topic {
  id: number;
  name: string;
}

interface QuestionOption {
  id: number;
  text: string;
}

interface Question {
  id: number;
  text: string;
  type: string;
  topic: Topic;
  options: QuestionOption[];
}

interface Survey {
  id: number;
  title: string;
  shareCode: string;
  mode?: string;
  lockMode?: boolean;
  openAt?: string | null; // schemalagt släpp; null = öppen direkt
  createdAt: string;
  _count: { questions: number; responses: number };
}

interface SurveysManagerProps {
  apiBase: string;
  allowModeSelection?: boolean;
  resultsBasePath: string;
  /** Kursbunden vy. Moment och lektionsnummer finns bara med kurskontext. */
  courseId?: number;
}

export default function SurveysManager({
  apiBase,
  allowModeSelection = false,
  resultsBasePath,
  courseId,
}: SurveysManagerProps) {
  const { showToast } = useToast();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createMode, setCreateMode] = useState<"none" | "manual" | "compose">("none");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mode, setMode] = useState("SURVEY");
  const [lockMode, setLockMode] = useState(false);
  const [filterTopic, setFilterTopic] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const loadSurveys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/surveys`);
      if (!res.ok) throw new Error("Fetch failed");
      setSurveys(await res.json());
    } catch {
      showToast("Kunde inte ladda enkäter", "error");
    } finally {
      setLoading(false);
    }
  }, [apiBase, showToast]);

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  async function deleteSurvey(id: number) {
    if (!confirm("Är du säker? Alla svar kopplade till denna enkät/quiz raderas också.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${apiBase}/surveys/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Enkät raderad");
        loadSurveys();
      } else {
        showToast("Kunde inte radera enkät", "error");
      }
    } catch {
      showToast("Kunde inte radera enkät", "error");
    } finally {
      setDeletingId(null);
    }
  }

  /**
   * Släpper en schemalagd enkät på en gång - nollställer dess öppningsdatum.
   * Går via enkätens egen route i stället för kursens schemaläggning, så att
   * knappen fungerar även i den kursövergripande vyn, där kurs-id saknas i
   * URL:en och samlingsroutens PATCH inte finns.
   */
  async function releaseNow(id: number) {
    try {
      const res = await fetch(`${apiBase}/surveys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openAt: null }),
      });
      if (!res.ok) throw new Error("Patch failed");
      // Släppet öppnar också veckans övning i kortkurserna - säg det, annars
      // ser läraren en tyst sidoeffekt på övningssidan.
      const data = await res.json().catch(() => null);
      const oppnade = data?.impact?.openedPracticeTopics ?? 0;
      showToast(
        oppnade > 0
          ? `Enkäten är öppen - och veckans övning öppnades`
          : "Enkäten är öppen"
      );
      loadSurveys();
    } catch {
      showToast("Kunde inte öppna enkäten", "error");
    }
  }

  async function loadQuestions() {
    try {
      const [qRes, tRes] = await Promise.all([
        fetch(`${apiBase}/questions`),
        fetch(`${apiBase}/topics`),
      ]);
      if (!qRes.ok || !tRes.ok) throw new Error("Fetch failed");
      setQuestions(await qRes.json());
      setTopics(await tRes.json());
    } catch {
      showToast("Kunde inte ladda frågor", "error");
    }
  }

  function openCreate() {
    setCreateMode("manual");
    loadQuestions();
  }

  function toggleQuestion(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  async function handleCreate() {
    if (!title.trim() || selectedIds.length === 0) return;
    try {
      const body: Record<string, unknown> = {
        title,
        description,
        questionIds: selectedIds,
        lockMode,
      };
      if (allowModeSelection) body.mode = mode;

      const res = await fetch(`${apiBase}/surveys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setTitle("");
        setDescription("");
        setMode("SURVEY");
        setLockMode(false);
        setSelectedIds([]);
        setCreateMode("none");
        loadSurveys();
      } else {
        showToast("Kunde inte skapa enkät", "error");
      }
    } catch {
      showToast("Kunde inte skapa enkät", "error");
    }
  }

  const filteredQuestions = filterTopic
    ? questions.filter((q) => q.topic.id === Number(filterTopic))
    : questions;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Enkäter</h1>
        <div className="flex gap-2">
          {surveys.length > 0 && (
            <button
              onClick={() => setScheduling((v) => !v)}
              className="btn-secondary"
            >
              Schemalägg veckovis
            </button>
          )}
          <button onClick={openCreate} className="btn-primary">
            Skapa enkät
          </button>
          {allowModeSelection && (
            <button
              onClick={() => setCreateMode("compose")}
              className="btn-accent"
            >
              Sätt ihop enkät
            </button>
          )}
        </div>
      </div>

      <WeeklyReleaseScheduler
        apiBase={apiBase}
        surveys={surveys}
        open={scheduling}
        onClose={() => setScheduling(false)}
        onSaved={(m) => {
          showToast(m);
          loadSurveys();
        }}
        onError={(m) => showToast(m, "error")}
      />

      {editingId !== null && (
        <SurveyEditor
          apiBase={apiBase}
          surveyId={editingId}
          courseId={courseId}
          allowModeSelection={allowModeSelection}
          onSaved={(m) => {
            showToast(m);
            loadSurveys();
          }}
          onError={(m) => showToast(m, "error")}
          onClose={() => setEditingId(null)}
        />
      )}

      {createMode === "compose" && (
        <TopicComposer
          apiBase={apiBase}
          allowModeSelection={allowModeSelection}
          onCreated={() => { setCreateMode("none"); loadSurveys(); }}
          onCancel={() => setCreateMode("none")}
        />
      )}

      {createMode === "manual" && (
        <div className="card p-5 mb-6 animate-scale-in">
          <h3 className="font-semibold mb-3 tracking-tight">Ny enkät</h3>
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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="SURVEY"
                  checked={mode === "SURVEY"}
                  onChange={() => setMode("SURVEY")}
                  className="accent-primary"
                />
                <span className="text-sm">Enkät</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="QUIZ"
                  checked={mode === "QUIZ"}
                  onChange={() => setMode("QUIZ")}
                  className="accent-primary"
                />
                <span className="text-sm">Quiz (rätt/fel-svar)</span>
              </label>
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
            <span className="text-xs text-muted">(elever kan inte byta flik under quiz)</span>
          </label>

          <div className="mb-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold">Välj frågor:</span>
              <select
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                className="input-field w-auto py-1"
              >
                <option value="">Alla ämnen</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <span className="text-sm text-muted">{selectedIds.length} valda</span>
            </div>
            <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
              {filteredQuestions.map((q) => (
                <label
                  key={q.id}
                  className="flex items-center gap-2 p-3 hover:bg-surface-muted/50 cursor-pointer border-b border-border-light last:border-0 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(q.id)}
                    onChange={() => toggleQuestion(q.id)}
                    className="accent-primary"
                  />
                  <span className="text-sm flex-1">{q.text}</span>
                  <span
                    className={`badge ${
                      q.type === "MULTIPLE_CHOICE"
                        ? "bg-primary-light text-primary"
                        : "bg-accent-light text-accent"
                    }`}
                  >
                    {q.type === "MULTIPLE_CHOICE" ? "Flerval" : "Fritext"}
                  </span>
                  <span className="text-xs text-muted">{q.topic.name}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={!title.trim() || selectedIds.length === 0}
            className="btn-primary"
          >
            Skapa
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-muted">Laddar...</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light text-left">
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Titel</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Frågor</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Svar</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Öppnar</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Delningslänk</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Skapad</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {surveys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-muted">
                    Inga enkäter skapade ännu.
                  </td>
                </tr>
              ) : (
                surveys.map((s) => (
                  <tr key={s.id} className="border-b border-border-light last:border-0 hover:bg-surface-muted/50 transition-colors">
                    <td className="p-4 font-medium">
                      <div className="flex items-center gap-2">
                        {s.title}
                        <span className="text-xs text-muted-light font-mono">#{s.id}</span>
                      </div>
                      {allowModeSelection && s.mode === "QUIZ" && (
                        <span className="ml-2 badge bg-warning-light text-warning">
                          Quiz
                        </span>
                      )}
                      {s.lockMode && (
                        <span className="ml-2 badge bg-error-light text-error">
                          🔒
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-muted">{s._count.questions}</td>
                    <td className="p-4 text-muted">{s._count.responses}</td>
                    <td className="p-4 whitespace-nowrap">
                      {!s.openAt ? (
                        <span className="text-muted">Öppen</span>
                      ) : isReleased({ openAt: new Date(s.openAt) }) ? (
                        <span className="text-muted">
                          Öppnad {formatRelease(new Date(s.openAt))}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="badge bg-surface-muted text-muted">
                            {isManualRelease({ openAt: new Date(s.openAt) })
                              ? "Du öppnar"
                              : formatRelease(new Date(s.openAt))}
                          </span>
                          <button
                            onClick={() => releaseNow(s.id)}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            Släpp nu
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <code className="bg-surface-muted px-2 py-0.5 rounded-lg text-xs truncate max-w-[200px] font-mono">
                          /s/{s.shareCode}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${window.location.origin}/s/${s.shareCode}`
                            );
                            setCopiedId(s.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="text-xs text-primary hover:underline font-medium whitespace-nowrap"
                          title="Kopiera full URL"
                        >
                          {copiedId === s.id ? "Kopierad!" : "Kopiera länk"}
                        </button>
                      </div>
                    </td>
                    <td className="p-4 text-muted">
                      {new Date(s.createdAt).toLocaleDateString("sv-SE")}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`${resultsBasePath}/${s.id}/results`}
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          Resultat
                        </Link>
                        <button
                          onClick={() =>
                            setEditingId((prev) => (prev === s.id ? null : s.id))
                          }
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          Redigera
                        </button>
                        <button
                          onClick={() => deleteSurvey(s.id)}
                          disabled={deletingId === s.id}
                          className="text-error hover:underline text-sm font-medium disabled:opacity-50"
                        >
                          {deletingId === s.id ? "Raderar..." : "Radera"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
