import BaseSidebar from "@/components/BaseSidebar";
import AdminAccountFooter from "@/components/admin/AdminAccountFooter";
import { requirePageScope } from "@/lib/page-auth";

const adminLinks = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/questions", label: "Frågebank" },
  { href: "/admin/surveys", label: "Enkäter" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Slår mot databasen i stället för att bara lita på sessionscookien, så
  // att ett borttaget konto tappar åtkomsten direkt i stället för när
  // cookien går ut.
  const scope = await requirePageScope();
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded"
      >
        Hoppa till innehåll
      </a>
      <BaseSidebar
        links={adminLinks}
        headerContent={
          <div className="mb-6 px-3">
            <h1 className="text-lg font-bold text-white tracking-tight">Enkätplattform</h1>
            <p className="text-xs text-white/50 mt-0.5">{scope.name}</p>
          </div>
        }
        footerContent={<AdminAccountFooter name={scope.name} email={scope.email} />}
        mobileTopbar={<span className="font-bold text-sm">Enkätplattform</span>}
      />
      <main id="main-content" className="flex-1 p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
