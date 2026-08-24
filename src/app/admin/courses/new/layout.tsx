import { requireOwnerPage } from "@/lib/page-auth";

/**
 * Sidan under är en klientkomponent och kan inte kontrollera behörighet
 * själv. Layouten är server-sidig och gör det åt den: att grunda en kurs är
 * ägarens sak, så en lärare ska inte ens se formuläret. API:et nekar också,
 * men ett formulär som alltid misslyckas är ett sämre svar än ingen sida.
 */
export default async function NewCourseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwnerPage();
  return <>{children}</>;
}
