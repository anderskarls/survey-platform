"use client";

import BaseSidebar from "@/components/BaseSidebar";

interface StudentSidebarProps {
  courseName: string;
  studentNumber?: number;
  unreadFeedback: number;
  practiceDue?: number;
}

export default function StudentSidebar({ courseName, studentNumber, unreadFeedback, practiceDue }: StudentSidebarProps) {
  const links = [
    { href: "/student", label: "Hem", exact: true },
    { href: "/student/practice", label: "Att öva på", badge: practiceDue || undefined },
    { href: "/student/formagor", label: "Förmågeträning" },
    { href: "/student/results", label: "Mina resultat" },
    { href: "/student/feedback", label: "Feedback", badge: unreadFeedback || undefined },
  ];

  return (
    <BaseSidebar
      links={links}
      headerContent={
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider text-white/50 px-3">Elev</div>
          <h1 className="text-lg font-bold mt-1 px-3 tracking-tight">{courseName}</h1>
        </div>
      }
      footerContent={
        <div className="border-t border-white/15 pt-4">
          {studentNumber != null && (
            <div className="px-3 mb-3">
              <div className="text-[10px] uppercase tracking-wider text-white/50">Inloggad</div>
              <div className="text-sm font-medium">Elev #{studentNumber}</div>
            </div>
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
