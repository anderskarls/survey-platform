import { redirect, notFound } from "next/navigation";
import { AdminScope, scopeAllowsCourse, scopeIsOwner } from "./authz";
import { getAdminScope } from "./require-auth";

/**
 * Behörighetskontroll för adminsidor (server-komponenter).
 *
 * Motsvarigheten till `requireAdmin` på API-sidan, men med sidornas
 * felspråk: en obehörig skickas till inloggningen, och en kurs utanför
 * behörigheten visas som att den inte finns. `notFound` i stället för ett
 * synligt "förbjudet" är avsiktligt - en lärare ska inte kunna kartlägga
 * vilka kurser som finns genom att prova kurs-id.
 */
export async function requirePageScope(): Promise<AdminScope> {
  const scope = await getAdminScope();
  if (!scope || scope === "invalid-key") redirect("/admin/login");
  return scope;
}

/** Som ovan, men kräver dessutom åtkomst till en bestämd kurs. */
export async function requireCoursePage(courseId: number): Promise<AdminScope> {
  const scope = await requirePageScope();
  if (!scopeAllowsCourse(scope, courseId)) notFound();
  return scope;
}

/** Sidor som bara ägaren ska nå: skapa kurs, kontoadministration. */
export async function requireOwnerPage(): Promise<AdminScope> {
  const scope = await requirePageScope();
  if (!scopeIsOwner(scope)) notFound();
  return scope;
}
