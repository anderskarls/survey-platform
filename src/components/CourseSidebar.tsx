"use client";

import { useState } from "react";
import Link from "next/link";
import BaseSidebar from "@/components/BaseSidebar";
import AdminAccountFooter from "@/components/admin/AdminAccountFooter";

interface CourseSidebarProps {
  courseId: number;
  courseName: string;
  adminName: string;
  adminEmail?: string | null;
}

/**
 * Tar läraren in i kursens elevvy via provkontot - utan elevlösenord, eftersom
 * adminsessionen redan bevisar vem hen är. Adminsessionen ligger kvar i sin
 * egen cookie, så vägen tillbaka är bara en länk.
 */
function ViewAsStudentButton({ courseId }: { courseId: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function viewAsStudent() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/student-impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Kunde inte öppna elevvyn");
        setBusy(false);
        return;
      }
      // Full omladdning: elevsessionen sitter i en ny cookie
      window.location.assign("/student");
    } catch {
      setError("Kunde inte öppna elevvyn");
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-white/15 pt-4">
      <button
        type="button"
        onClick={viewAsStudent}
        disabled={busy}
        className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-white/75 hover:bg-sidebar-hover hover:text-white transition-all disabled:opacity-50"
      >
        {busy ? "Öppnar..." : "Visa som elev"}
      </button>
      <p className="px-3 mt-1 text-[10px] leading-snug text-white/45">
        Provkontot - syns inte i klassens siffror
      </p>
      {error && <p className="px-3 mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export default function CourseSidebar({
  courseId,
  courseName,
  adminName,
  adminEmail,
}: CourseSidebarProps) {
  const base = `/admin/courses/${courseId}`;

  const links = [
    { href: base, label: "Dashboard", exact: true },
    { href: `${base}/questions`, label: "Frågebank" },
    { href: `${base}/surveys`, label: "Enkäter" },
    { href: `${base}/units`, label: "Moment" },
    { href: `${base}/students`, label: "Elever" },
    { href: `${base}/progress`, label: "Elevöversikt" },
    { href: `${base}/practice`, label: "Övning" },
    { href: `${base}/kampanj`, label: "Kampanjen" },
  ];

  return (
    <BaseSidebar
      links={links}
      headerContent={
        <div className="mb-6">
          <Link href="/admin" className="text-xs text-white/50 hover:text-white/80 transition-colors">
            &larr; Alla kurser
          </Link>
          <h1 className="text-lg font-bold mt-1.5 px-3 tracking-tight">{courseName}</h1>
        </div>
      }
      footerContent={
        <>
          <ViewAsStudentButton courseId={courseId} />
          <AdminAccountFooter name={adminName} email={adminEmail} />
        </>
      }
      mobileTopbar={
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-white/50 hover:text-white text-xs">&larr;</Link>
          <span className="font-bold text-sm truncate">{courseName}</span>
        </div>
      }
    />
  );
}
