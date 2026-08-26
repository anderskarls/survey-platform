"use client";

import { useState } from "react";
import Link from "next/link";
import BaseSidebar from "@/components/BaseSidebar";

interface CourseOption {
  courseId: number;
  courseName: string;
}

interface StudentSidebarProps {
  courseName: string;
  studentNumber?: number;
  unreadFeedback: number;
  practiceDue?: number;
  currentCourseId?: number;
  /** Elevens alla kurser (samma personKey). Växlaren visas först vid fler än en. */
  courses?: CourseOption[];
  /** Förmågeträning visas bara i kurser som har övningar av den sorten. */
  showFormagor?: boolean;
  /** Läraren tittar via provkontot - visa vem hen är och vägen tillbaka. */
  impersonated?: boolean;
}

function CourseSwitcher({
  courses,
  currentCourseId,
}: {
  courses: CourseOption[];
  currentCourseId: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchTo(courseId: number) {
    if (courseId === currentCourseId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/student-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Kunde inte byta kurs");
        setBusy(false);
        return;
      }
      // Full omladdning: sessionscookien är ny, och kursscopade sidor
      // (moment, uppgifter) gäller inte i den kurs vi just bytte till.
      window.location.assign("/student");
    } catch {
      setError("Kunde inte byta kurs");
      setBusy(false);
    }
  }

  return (
    <div className="px-3 mt-3">
      <label htmlFor="kursvaxlare" className="sr-only">
        Byt kurs
      </label>
      <select
        id="kursvaxlare"
        value={currentCourseId}
        disabled={busy}
        onChange={(e) => switchTo(Number(e.target.value))}
        className="w-full rounded-lg bg-white/10 border border-white/15 px-2 py-1.5 text-sm text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white/30"
      >
        {courses.map((c) => (
          <option key={c.courseId} value={c.courseId} className="text-foreground bg-surface">
            {c.courseName}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export default function StudentSidebar({
  courseName,
  studentNumber,
  unreadFeedback,
  practiceDue,
  currentCourseId,
  courses = [],
  showFormagor = false,
  impersonated = false,
}: StudentSidebarProps) {
  const links = [
    { href: "/student", label: "Hem", exact: true },
    { href: "/student/practice", label: "Att öva på", badge: practiceDue || undefined },
    ...(showFormagor
      ? [{ href: "/student/formagor", label: "Förmågeträning" }]
      : []),
    { href: "/student/results", label: "Mina resultat" },
    { href: "/student/feedback", label: "Feedback", badge: unreadFeedback || undefined },
  ];

  const showSwitcher = currentCourseId != null && courses.length > 1;

  return (
    <BaseSidebar
      links={links}
      headerContent={
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider text-white/50 px-3">Elev</div>
          <h1 className="text-lg font-bold mt-1 px-3 tracking-tight">{courseName}</h1>
          {showSwitcher && (
            <CourseSwitcher courses={courses} currentCourseId={currentCourseId} />
          )}
        </div>
      }
      footerContent={
        <div className="border-t border-white/15 pt-4">
          {studentNumber != null && (
            <div className="px-3 mb-3">
              <div className="text-[10px] uppercase tracking-wider text-white/50">
                {impersonated ? "Lärarvy" : "Inloggad"}
              </div>
              <div className="text-sm font-medium">Elev #{studentNumber}</div>
              {impersonated && (
                <div className="text-[10px] leading-snug text-white/45 mt-0.5">
                  Provkontot - det du gör här räknas inte i klassens siffror
                </div>
              )}
            </div>
          )}
          {impersonated && currentCourseId != null && (
            <Link
              href={`/admin/courses/${currentCourseId}`}
              className="block px-3 py-2.5 rounded-lg text-sm text-white/75 hover:bg-sidebar-hover hover:text-white transition-all"
            >
              &larr; Tillbaka till adminvyn
            </Link>
          )}
          <form action="/api/student/logout" method="POST">
            <button
              type="submit"
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-white/75 hover:bg-sidebar-hover hover:text-white transition-all"
            >
              Logga ut
            </button>
          </form>
        </div>
      }
      mobileTopbar={<span className="font-bold text-sm truncate">{courseName}</span>}
    />
  );
}
