"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

/**
 * Visar vilket konto som är inloggat, och loggar ut.
 *
 * Adminvyn hade ingen utloggning alls - enda vägen ur en session var att
 * rensa cookies i webbläsaren. Det märktes först när plattformen fick fler
 * än ett konto och det blev nödvändigt att kunna byta mellan dem.
 *
 * Utloggningen river även en eventuell elevsession från "Visa som elev".
 * De två sessionerna sitter i skilda cookies och är avsiktligt oberoende,
 * men att lämna kvar en provkontosession efter utloggning vore ett förvirrande
 * halvtillstånd - särskilt när nästa som loggar in är någon annan.
 */
export default function AdminAccountFooter({
  name,
  email,
}: {
  name: string;
  email?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  async function loggaUt() {
    if (busy) return;
    setBusy(true);
    // redirect: "manual" - routen svarar med en omdirigering vi inte vill
    // följa här; det enda som betyder något är att cookien rivs.
    await fetch("/api/student/logout", {
      method: "POST",
      redirect: "manual",
    }).catch(() => {});
    await signOut({ callbackUrl: "/admin/login" });
  }

  return (
    <div className="border-t border-white/15 pt-4">
      <div className="px-3 pb-2">
        <p className="text-xs text-white/70 font-medium truncate">{name}</p>
        {email && (
          <p className="text-[10px] text-white/40 truncate" title={email}>
            {email}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={loggaUt}
        disabled={busy}
        className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-white/75 hover:bg-sidebar-hover hover:text-white transition-all disabled:opacity-50"
      >
        {busy ? "Loggar ut..." : "Logga ut"}
      </button>
    </div>
  );
}
