"use client";

import Link from "next/link";
import BaseSidebar from "@/components/BaseSidebar";

interface CourseSidebarProps {
  courseId: number;
  courseName: string;
}

export default function CourseSidebar({ courseId, courseName }: CourseSidebarProps) {
  const base = `/admin/courses/${courseId}`;

  const links = [
    { href: base, label: "Dashboard", exact: true },
    { href: `${base}/questions`, label: "Frågebank" },
    { href: `${base}/surveys`, label: "Enkäter" },
    { href: `${base}/units`, label: "Moment" },
    { href: `${base}/students`, label: "Elever" },
    { href: `${base}/progress`, label: "Elevöversikt" },
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
      mobileTopbar={
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-white/50 hover:text-white text-xs">&larr;</Link>
          <span className="font-bold text-sm truncate">{courseName}</span>
        </div>
      }
    />
  );
}
