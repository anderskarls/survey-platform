"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";

interface Student {
  id: number;
  number: number;
  username: string;
  isTest: boolean;
  responseCount: number;
  linkedCourses: string[];
}

// Lärarens provkonto får ett nummer långt ovanför en verklig klasslista
const TEST_STUDENT_NUMBER = 99;

interface CourseOption {
  id: number;
  name: string;
}

interface Credential {
  number: number;
  username: string;
  password: string;
}

export default function StudentsPage() {
  const { courseId } = useParams();
  const { showToast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState("30");
  const [adding, setAdding] = useState(false);
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [otherCourses, setOtherCourses] = useState<CourseOption[]>([]);
  const [linkCourseId, setLinkCourseId] = useState("");
  const [testLinkCourseId, setTestLinkCourseId] = useState("");
  const [addingTest, setAddingTest] = useState(false);

  const loadStudents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/courses/${courseId}/students`);
      if (!res.ok) throw new Error("Fetch failed");
      setStudents(await res.json());
    } catch {
      showToast("Kunde inte ladda elever", "error");
    } finally {
      setLoading(false);
    }
  }, [courseId, showToast]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    async function loadCourses() {
      try {
        const res = await fetch("/api/courses");
        if (!res.ok) return;
        const all: CourseOption[] = await res.json();
        setOtherCourses(all.filter((c) => c.id !== Number(courseId)));
      } catch {
        // Länkvalet är valfritt - tyst fallback till "ingen länkning"
      }
    }
    loadCourses();
  }, [courseId]);

  async function handleAddBulk(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(count);
    if (n < 1 || n > 200) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: n,
          ...(linkCourseId ? { linkCourseId: Number(linkCourseId) } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.credentials?.length > 0) {
          setCredentials(data.credentials);
        }
        if (data.linked > 0) {
          showToast(
            `${data.linked} ${data.linked === 1 ? "elev länkad" : "elever länkade"} mot samma elevnummer i den andra kursen`,
            "success"
          );
        }
        loadStudents();
        setCount("30");
      } else {
        showToast("Kunde inte lägga till elever", "error");
      }
    } catch {
      showToast("Kunde inte lägga till elever", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleAddTestAccount() {
    setAddingTest(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: TEST_STUDENT_NUMBER,
          isTest: true,
          ...(testLinkCourseId ? { linkCourseId: Number(testLinkCourseId) } : {}),
        }),
      });
      if (!res.ok) {
        showToast("Kunde inte skapa provkontot", "error");
        return;
      }
      const data = await res.json();
      if (data.credentials?.length > 0) {
        setCredentials(data.credentials);
      } else {
        showToast(`Elev #${TEST_STUDENT_NUMBER} finns redan i kursen`, "error");
      }
      if (data.linked > 0) {
        showToast("Provkontot länkat - kursväxlaren når nu båda kurserna", "success");
      }
      loadStudents();
    } catch {
      showToast("Kunde inte skapa provkontot", "error");
    } finally {
      setAddingTest(false);
    }
  }

  function handleCopyCredentials() {
    if (!credentials) return;
    const text = credentials
      .map((c) => `Elev ${c.number}\tAnvändarnamn: ${c.username}\tLösenord: ${c.password}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    showToast("Kopierat till urklipp!", "success");
  }

  function handleDownloadCsv() {
    if (!credentials) return;
    const csv = [
      "Elevnummer,Användarnamn,Lösenord",
      ...credentials.map((c) => `${c.number},${c.username},${c.password}`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "elevkonton.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-6 tracking-tight">Elever</h1>

      <div className="card p-4 mb-6">
        <form onSubmit={handleAddBulk} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="student-count" className="block text-sm font-semibold mb-1">Antal elever</label>
            <input
              id="student-count"
              type="number"
              min="1"
              max="200"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="input-field w-24"
            />
          </div>
          {otherCourses.length > 0 && (
            <div>
              <label htmlFor="link-course" className="block text-sm font-semibold mb-1">
                Länka mot kurs (samma elever)
              </label>
              <select
                id="link-course"
                value={linkCourseId}
                onChange={(e) => setLinkCourseId(e.target.value)}
                className="input-field"
              >
                <option value="">Ingen länkning</option>
                {otherCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" disabled={adding} className="btn-primary">
            {adding ? "Lägger till..." : "Lägg till elever (1-N)"}
          </button>
          <span className="text-xs text-muted">
            Skapar elevnummer 1 till {count || "N"} med autogenererade inloggningsuppgifter.
            {linkCourseId && (
              <>
                {" "}Elevnummer som finns i den länkade kursen kopplas ihop som
                samma elev - då blandas övningsfrågor från båda kurserna.
              </>
            )}
          </span>
        </form>
      </div>

      <div className="card p-4 mb-6">
        <h2 className="font-semibold mb-1">Provkonto</h2>
        <p className="text-xs text-muted mb-3 max-w-2xl">
          Ett elevkonto åt dig själv (elev #{TEST_STUDENT_NUMBER}) som du loggar in på
          för att se kursen med elevens ögon. Det räknas inte in i klassens siffror -
          varken i kampanjen, resultatsammanställningarna eller övningsöversikten.
          Länka det mot en kurs där du redan har ett provkonto, så kan du byta kurs
          direkt i elevens sidomeny utan att logga ut.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {otherCourses.length > 0 && (
            <div>
              <label htmlFor="test-link-course" className="block text-sm font-semibold mb-1">
                Länka mot kurs
              </label>
              <select
                id="test-link-course"
                value={testLinkCourseId}
                onChange={(e) => setTestLinkCourseId(e.target.value)}
                className="input-field"
              >
                <option value="">Ingen länkning</option>
                {otherCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={handleAddTestAccount}
            disabled={addingTest}
            className="btn-secondary"
          >
            {addingTest ? "Skapar..." : `Skapa provkonto (elev #${TEST_STUDENT_NUMBER})`}
          </button>
        </div>
      </div>

      {credentials && (
        <div className="bg-warning-light border border-warning/20 rounded-xl p-4 mb-6 animate-scale-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-accent-hover">
              Inloggningsuppgifter (visas bara en gång!)
            </h2>
            <div className="flex gap-2">
              <button onClick={handleCopyCredentials} className="btn-secondary text-xs">
                Kopiera alla
              </button>
              <button onClick={handleDownloadCsv} className="btn-secondary text-xs">
                Ladda ner CSV
              </button>
              <button
                onClick={() => setCredentials(null)}
                className="text-xs text-muted hover:text-foreground px-3 py-1.5 rounded-lg transition-colors"
              >
                Stäng
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warning/20 text-left">
                  <th className="p-2 text-xs uppercase tracking-wider text-muted font-semibold">Elevnummer</th>
                  <th className="p-2 text-xs uppercase tracking-wider text-muted font-semibold">Användarnamn</th>
                  <th className="p-2 text-xs uppercase tracking-wider text-muted font-semibold">Lösenord</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((c) => (
                  <tr key={c.number} className="border-b border-warning/10 last:border-0">
                    <td className="p-2">#{c.number}</td>
                    <td className="p-2 font-mono text-sm">{c.username}</td>
                    <td className="p-2 font-mono text-sm">{c.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted">Laddar...</div>
      ) : students.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted">Inga elever registrerade ännu.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light text-left">
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Elevnummer</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Användarnamn</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Antal enkätsvar</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Länkad till</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-border-light last:border-0 hover:bg-surface-muted/50 transition-colors">
                  <td className="p-4 font-semibold">
                    #{s.number}
                    {s.isTest && (
                      <span className="ml-2 align-middle rounded-full bg-accent-light text-accent-hover border border-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                        Provkonto
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-mono text-muted text-sm">{s.username}</td>
                  <td className="p-4 text-muted">{s.responseCount}</td>
                  <td className="p-4 text-muted text-sm">
                    {s.linkedCourses.length > 0 ? s.linkedCourses.join(", ") : "-"}
                  </td>
                  <td className="p-4">
                    <Link
                      href={`/admin/courses/${courseId}/students/${s.number}`}
                      className="text-primary hover:underline text-sm font-medium"
                    >
                      Visa svar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
