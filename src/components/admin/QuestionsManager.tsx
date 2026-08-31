"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/Toast";
import { questionTypeLabel } from "@/lib/question-labels";

interface Topic {
  id: number;
  name: string;
  _count: { questions: number };
}

interface QuestionOption {
  id: number;
  text: string;
  isCorrect?: boolean;
}

interface Question {
  id: number;
  text: string;
  type: string;
  topic: { id: number; name: string };
  options: QuestionOption[];
  _count?: { answers: number; practiceAttempts: number };
}

interface EditDraft {
  text: string;
  type: string;
  topicId: string;
  options: { id?: number; text: string; isCorrect: boolean }[];
}

interface EditImpact {
  migratedAnswers: number;
  migratedAttempts: number;
  orphanedAnswers: number;
  regradedAnswers: number;
  regradedAttempts: number;
}

/** Antal svar och övningsförsök som hänger på frågan. */
function historyCount(q: Question): number {
  return (q._count?.answers ?? 0) + (q._count?.practiceAttempts ?? 0);
}

function countPhrase(answers: number, attempts: number): string {
  const parts: string[] = [];
  if (answers > 0) parts.push(`${answers} elevsvar`);
  if (attempts > 0) parts.push(`${attempts} övningsförsök`);
  return parts.join(" och ");
}

function describeImpact(impact?: EditImpact): string {
  if (!impact) return "Frågan sparad";
  const parts: string[] = [];
  const migrated = impact.migratedAnswers + impact.migratedAttempts;
  const regraded = impact.regradedAnswers + impact.regradedAttempts;
  if (migrated > 0) parts.push(`${migrated} tidigare svar följde med textändringen`);
  if (regraded > 0) parts.push(`${regraded} svar rättades om`);
  if (impact.orphanedAnswers > 0)
    parts.push(`${impact.orphanedAnswers} svar saknar nu alternativ`);
  return parts.length > 0 ? `Frågan sparad - ${parts.join(", ")}` : "Frågan sparad";
}

interface QuestionsManagerProps {
  apiBase: string;
  showCorrectAnswers?: boolean;
}

export default function QuestionsManager({ apiBase, showCorrectAnswers = false }: QuestionsManagerProps) {
  const { showToast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filterTopic, setFilterTopic] = useState("");
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [csvContent, setCsvContent] = useState("");
  const [importing, setImporting] = useState(false);
  const [importCourseId, setImportCourseId] = useState("");
  const [courses, setCourses] = useState<{ id: number; name: string }[]>([]);
  const needsCourseSelect = apiBase === "/api";
  const [showAdd, setShowAdd] = useState(false);
  const [newQ, setNewQ] = useState({
    text: "",
    type: "MULTIPLE_CHOICE",
    topicId: "",
    options: ["", ""],
    correctOptionIndex: 0,
  });
  const [newTopicName, setNewTopicName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQ, setEditQ] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = filterTopic ? `?topicId=${filterTopic}` : "";
      const fetches: Promise<Response>[] = [
        fetch(`${apiBase}/questions${params}`),
        fetch(`${apiBase}/topics`),
      ];
      if (needsCourseSelect) fetches.push(fetch("/api/courses"));
      const [qRes, tRes, cRes] = await Promise.all(fetches);
      if (!qRes.ok || !tRes.ok) throw new Error("Fetch failed");
      setQuestions(await qRes.json());
      setTopics(await tRes.json());
      if (cRes?.ok) setCourses(await cRes.json());
    } catch {
      showToast("Kunde inte ladda data", "error");
    } finally {
      setLoading(false);
    }
  }, [apiBase, filterTopic, showToast, needsCourseSelect]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleImport() {
    if (!csvContent.trim()) return;
    if (needsCourseSelect && !importCourseId) {
      showToast("Välj en kurs att importera till", "error");
      return;
    }
    setImporting(true);
    try {
      const body: Record<string, unknown> = { csvContent };
      if (needsCourseSelect) body.courseId = Number(importCourseId);
      const res = await fetch(`${apiBase}/questions/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${data.imported} frågor importerade!`);
        setCsvContent("");
        setShowImport(false);
        loadData();
      } else {
        showToast(data.error || "Import misslyckades", "error");
      }
    } catch {
      showToast("Import misslyckades", "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvContent(text);
  }

  async function handleAddTopic() {
    if (!newTopicName.trim()) return;
    try {
      const res = await fetch(`${apiBase}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTopicName.trim() }),
      });
      if (res.ok) {
        setNewTopicName("");
        loadData();
      } else {
        showToast("Kunde inte skapa ämne", "error");
      }
    } catch {
      showToast("Kunde inte skapa ämne", "error");
    }
  }

  async function handleAddQuestion() {
    if (!newQ.text.trim() || !newQ.topicId) return;
    const options =
      newQ.type === "MULTIPLE_CHOICE"
        ? newQ.options.filter((o) => o.trim())
        : [];
    try {
      const res = await fetch(`${apiBase}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newQ,
          topicId: Number(newQ.topicId),
          options,
        }),
      });
      if (res.ok) {
        setNewQ({ text: "", type: "MULTIPLE_CHOICE", topicId: "", options: ["", ""], correctOptionIndex: 0 });
        setShowAdd(false);
        loadData();
      } else {
        showToast("Kunde inte spara fråga", "error");
      }
    } catch {
      showToast("Kunde inte spara fråga", "error");
    }
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setEditQ({
      text: q.text,
      type: q.type,
      topicId: String(q.topic.id),
      options:
        q.options.length > 0
          ? q.options.map((o) => ({
              id: o.id,
              text: o.text,
              isCorrect: o.isCorrect === true,
            }))
          : [
              { text: "", isCorrect: true },
              { text: "", isCorrect: false },
            ],
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditQ(null);
  }

  async function saveEdit(q: Question, confirmRegrade = false) {
    if (!editQ) return;
    if (!editQ.text.trim() || !editQ.topicId) {
      showToast("Frågetext och ämne krävs", "error");
      return;
    }
    const payload: Record<string, unknown> = {
      text: editQ.text.trim(),
      type: editQ.type,
      topicId: Number(editQ.topicId),
      confirmRegrade,
    };
    if (editQ.type === "MULTIPLE_CHOICE") {
      payload.options = editQ.options
        .filter((o) => o.text.trim())
        .map((o) => ({
          ...(o.id !== undefined ? { id: o.id } : {}),
          text: o.text.trim(),
          isCorrect: o.isCorrect,
        }));
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`${apiBase}/questions/${q.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      // Servern kräver kvittering innan tidigare elevsvar rättas om.
      if (res.status === 409 && data.requiresConfirmation && !confirmRegrade) {
        setSavingEdit(false);
        if (confirm(`${data.error}\n\nVill du fortsätta?`)) {
          await saveEdit(q, true);
        }
        return;
      }

      if (!res.ok) {
        showToast(
          typeof data.error === "string" ? data.error : "Kunde inte spara frågan",
          "error"
        );
        return;
      }

      showToast(describeImpact(data.impact as EditImpact | undefined));
      cancelEdit();
      loadData();
    } catch (err) {
      console.error("Update question error:", err);
      showToast("Kunde inte spara frågan - nätverksfel", "error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteQuestion(q: Question) {
    const id = q.id;
    const history = countPhrase(
      q._count?.answers ?? 0,
      q._count?.practiceAttempts ?? 0
    );
    const warning = history
      ? `Radera frågan? ${history} raderas samtidigt och går inte att återskapa.`
      : "Radera frågan? Den försvinner ur alla enkäter den ingår i.";
    if (!confirm(warning)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${apiBase}/questions/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Fråga raderad");
        loadData();
      } else {
        let msg = "Kunde inte radera fråga";
        try {
          const data = await res.json();
          if (data.error) msg = data.error;
        } catch {
          msg = `Serverfel (${res.status})`;
        }
        showToast(msg, "error");
      }
    } catch (err) {
      console.error("Delete question error:", err);
      showToast("Kunde inte radera fråga — nätverksfel", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const selected = questions.filter((q) => selectedIds.has(q.id));
    const answers = selected.reduce((sum, q) => sum + (q._count?.answers ?? 0), 0);
    const attempts = selected.reduce(
      (sum, q) => sum + (q._count?.practiceAttempts ?? 0),
      0
    );
    const history = countPhrase(answers, attempts);
    const warning = history
      ? `Radera ${selectedIds.size} frågor? ${history} raderas samtidigt och går inte att återskapa.`
      : `Radera ${selectedIds.size} frågor? De försvinner ur alla enkäter de ingår i.`;
    if (!confirm(warning)) return;
    setBulkDeleting(true);
    let deleted = 0;
    let failed = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(`${apiBase}/questions/${id}`, { method: "DELETE" });
        if (res.ok) deleted++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (deleted > 0) showToast(`${deleted} frågor raderade`);
    if (failed > 0) showToast(`${failed} frågor kunde inte raderas`, "error");
    loadData();
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)));
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Frågebank</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
            Lägg till fråga
          </button>
          <button onClick={() => setShowImport(!showImport)} className="btn-accent">
            Importera CSV
          </button>
        </div>
      </div>

      {showImport && (
        <div className="card p-5 mb-6 animate-scale-in">
          <h3 className="font-semibold mb-2 tracking-tight">Importera frågor från CSV</h3>
          <p className="text-sm text-muted mb-3">
            Format: topic, type, text, option1, option2, option3, option4.
            Förmågeövningar: kolumnerna subskill, config (JSON) och exemplars
            (JSON) för typerna SORTING och FREE_TEXT.
          </p>
          {needsCourseSelect && (
            <select
              value={importCourseId}
              onChange={(e) => setImportCourseId(e.target.value)}
              className="input-field mb-3 w-auto"
            >
              <option value="">Välj kurs...</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            rows={6}
            placeholder={"topic,type,text,option1,option2,option3,option4,correctAnswer\nMatematik,MULTIPLE_CHOICE,Vad är 2+2?,3,4,5,6,4"}
            className="input-field font-mono mb-3"
          />
          <p className="text-xs text-muted mb-2">Eller ladda upp en CSV-fil:</p>
          <input type="file" accept=".csv" onChange={handleFileUpload} className="mb-3 block text-sm" />
          <button
            onClick={handleImport}
            disabled={importing || !csvContent.trim()}
            className="btn-accent"
          >
            {importing ? "Importerar..." : "Importera"}
          </button>
        </div>
      )}

      {showAdd && (
        <div className="card p-5 mb-6 animate-scale-in">
          <h3 className="font-semibold mb-3 tracking-tight">Ny fråga</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select
              value={newQ.topicId}
              onChange={(e) => setNewQ({ ...newQ, topicId: e.target.value })}
              className="input-field"
            >
              <option value="">Välj ämne...</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                placeholder="Nytt ämne..."
                className="input-field flex-1"
              />
              <button onClick={handleAddTopic} className="btn-secondary px-3">
                +
              </button>
            </div>
          </div>
          <select
            value={newQ.type}
            onChange={(e) => setNewQ({ ...newQ, type: e.target.value })}
            className="input-field mb-3 w-auto"
          >
            <option value="MULTIPLE_CHOICE">Flerval</option>
            <option value="FREE_TEXT">Fritext</option>
            <option value="REFLECTION">Reflektion</option>
          </select>
          <input
            value={newQ.text}
            onChange={(e) => setNewQ({ ...newQ, text: e.target.value })}
            placeholder="Frågetext..."
            className="input-field mb-3"
          />
          {newQ.type === "MULTIPLE_CHOICE" && (
            <div className="mb-3">
              {showCorrectAnswers && (
                <label className="block text-xs text-muted mb-1">Markera rätt svar med radioknappen</label>
              )}
              {newQ.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                  {showCorrectAnswers && (
                    <input
                      type="radio"
                      name="correctOption"
                      checked={newQ.correctOptionIndex === i}
                      onChange={() => setNewQ({ ...newQ, correctOptionIndex: i })}
                      title="Rätt svar"
                      className="accent-primary"
                    />
                  )}
                  <input
                    value={opt}
                    onChange={(e) => {
                      const opts = [...newQ.options];
                      opts[i] = e.target.value;
                      setNewQ({ ...newQ, options: opts });
                    }}
                    placeholder={`Alternativ ${i + 1}`}
                    className="input-field flex-1"
                  />
                </div>
              ))}
              <button
                onClick={() => setNewQ({ ...newQ, options: [...newQ.options, ""] })}
                className="text-primary text-sm mt-1 font-medium hover:underline"
              >
                + Lägg till alternativ
              </button>
            </div>
          )}
          <button onClick={handleAddQuestion} className="btn-primary">
            Spara fråga
          </button>
        </div>
      )}

      <div className="mb-4">
        <select
          value={filterTopic}
          onChange={(e) => setFilterTopic(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">Alla ämnen</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t._count.questions})
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-muted">Laddar...</div>
      ) : (
        <div className="card overflow-x-auto">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-error-light/50 border-b border-error-light">
              <span className="text-sm text-error font-semibold">
                {selectedIds.size} frågor markerade
              </span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="bg-error text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-error/90 disabled:opacity-50 transition-colors"
              >
                {bulkDeleting ? "Raderar..." : "Radera markerade"}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-muted hover:text-foreground"
              >
                Avmarkera alla
              </button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light text-left">
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    checked={questions.length > 0 && selectedIds.size === questions.length}
                    onChange={toggleSelectAll}
                    title="Markera alla"
                    className="accent-primary"
                  />
                </th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Fråga</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Typ</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Ämne</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Alternativ</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {questions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-muted">
                    Inga frågor. Importera via CSV eller lägg till manuellt.
                  </td>
                </tr>
              ) : (
                questions.map((q) => (
                  <Fragment key={q.id}>
                  <tr className={`border-b border-border-light last:border-0 hover:bg-surface-muted/50 transition-colors ${selectedIds.has(q.id) ? "bg-primary-light/50" : ""}`}>
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(q.id)}
                        onChange={() => toggleSelected(q.id)}
                        className="accent-primary"
                      />
                    </td>
                    <td className="p-4">{q.text}</td>
                    <td className="p-4">
                      <span
                        className={`badge ${
                          q.type === "MULTIPLE_CHOICE"
                            ? "bg-primary-light text-primary"
                            : "bg-accent-light text-accent"
                        }`}
                      >
                        {questionTypeLabel(q.type)}
                      </span>
                    </td>
                    <td className="p-4 text-muted">{q.topic.name}</td>
                    <td className="p-4 text-muted">
                      {q.options.length > 0
                        ? showCorrectAnswers
                          ? q.options
                              .map((o, i) => (
                                <span key={o.id ?? i} className={o.isCorrect ? "font-bold text-success" : ""}>
                                  {o.text}
                                  {o.isCorrect ? " \u2713" : ""}
                                </span>
                              ))
                              .reduce(
                                (prev, curr, i) =>
                                  i === 0 ? [curr] : [...prev, ", ", curr],
                                [] as React.ReactNode[]
                              )
                          : q.options.map((o) => o.text).join(", ")
                        : "\u2014"}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <button
                        onClick={() => (editingId === q.id ? cancelEdit() : startEdit(q))}
                        className="text-primary hover:underline text-sm font-medium mr-3"
                      >
                        {editingId === q.id ? "Stäng" : "Redigera"}
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(q)}
                        disabled={deletingId === q.id}
                        className="text-error hover:underline text-sm font-medium disabled:opacity-50"
                      >
                        {deletingId === q.id ? "Raderar..." : "Radera"}
                      </button>
                    </td>
                  </tr>
                  {editingId === q.id && editQ && (
                    <tr className="border-b border-border-light bg-surface-muted/40">
                      <td colSpan={6} className="p-4">
                        <div className="animate-scale-in">
                          <h4 className="font-semibold mb-3 tracking-tight">Redigera fråga</h4>
                          {historyCount(q) > 0 && (
                            <div className="bg-warning-light border border-warning/20 rounded-xl p-3 mb-3 text-sm">
                              Frågan har{" "}
                              {countPhrase(
                                q._count?.answers ?? 0,
                                q._count?.practiceAttempts ?? 0
                              )}
                              . Ändrad text på ett alternativ skrivs om även i tidigare
                              svar. Flyttar du rätt svar rättas alla tidigare svar om -
                              repetitionsschemat i övningen påverkas inte.
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <select
                              value={editQ.topicId}
                              onChange={(e) => setEditQ({ ...editQ, topicId: e.target.value })}
                              className="input-field"
                            >
                              {topics.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            {q.type === "SORTING" ? (
                              <p className="text-sm text-muted self-center">
                                Sorteringsfråga - kategorier och kort redigeras via
                                CSV-import.
                              </p>
                            ) : (
                              <select
                                value={editQ.type}
                                onChange={(e) => setEditQ({ ...editQ, type: e.target.value })}
                                className="input-field"
                              >
                                <option value="MULTIPLE_CHOICE">Flerval</option>
                                <option value="FREE_TEXT">Fritext</option>
                                <option value="REFLECTION">Reflektion</option>
                              </select>
                            )}
                          </div>
                          <textarea
                            value={editQ.text}
                            onChange={(e) => setEditQ({ ...editQ, text: e.target.value })}
                            rows={2}
                            placeholder="Frågetext..."
                            className="input-field mb-3"
                          />
                          {editQ.type === "MULTIPLE_CHOICE" && (
                            <div className="mb-3">
                              <label className="block text-xs text-muted mb-1">
                                Markera rätt svar med radioknappen
                              </label>
                              {editQ.options.map((opt, i) => (
                                <div key={opt.id ?? `ny-${i}`} className="flex items-center gap-2 mb-1">
                                  <input
                                    type="radio"
                                    name={`edit-correct-${q.id}`}
                                    checked={opt.isCorrect}
                                    onChange={() =>
                                      setEditQ({
                                        ...editQ,
                                        options: editQ.options.map((o, j) => ({
                                          ...o,
                                          isCorrect: j === i,
                                        })),
                                      })
                                    }
                                    title="Rätt svar"
                                    className="accent-primary"
                                  />
                                  <input
                                    value={opt.text}
                                    onChange={(e) =>
                                      setEditQ({
                                        ...editQ,
                                        options: editQ.options.map((o, j) =>
                                          j === i ? { ...o, text: e.target.value } : o
                                        ),
                                      })
                                    }
                                    placeholder={`Alternativ ${i + 1}`}
                                    className="input-field flex-1"
                                  />
                                  <button
                                    onClick={() =>
                                      setEditQ({
                                        ...editQ,
                                        options: editQ.options.filter((_, j) => j !== i),
                                      })
                                    }
                                    className="text-error text-sm font-medium px-2 hover:underline"
                                  >
                                    Ta bort
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() =>
                                  setEditQ({
                                    ...editQ,
                                    options: [...editQ.options, { text: "", isCorrect: false }],
                                  })
                                }
                                className="text-primary text-sm mt-1 font-medium hover:underline"
                              >
                                + Lägg till alternativ
                              </button>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(q)}
                              disabled={savingEdit}
                              className="btn-primary"
                            >
                              {savingEdit ? "Sparar..." : "Spara ändringar"}
                            </button>
                            <button onClick={cancelEdit} className="btn-secondary">
                              Avbryt
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
