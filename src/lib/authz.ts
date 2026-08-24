/**
 * Behörighetsreglerna, fristående från hur inloggningen lästes.
 *
 * Allt här är rena funktioner utan I/O, så att reglerna går att testa utan
 * att mocka NextAuth eller databasen. Upplösningen av vem den anropande är
 * ligger i `require-auth.ts`.
 *
 * Modellen har två roller. OWNER ser hela plattformen. TEACHER ser bara sina
 * egna kurser - och "ser" är bokstavligt: en kurs som ligger utanför
 * behörigheten ska inte dyka upp i listor, inte gå att nå via URL och inte
 * läcka genom en global vy.
 */

/** Vem som gör anropet, och vad hen får se. */
export type AdminScope = {
  /** Kontots id, eller null för API-nyckeln som inte är ett konto. */
  adminId: number | null;
  name: string;
  isOwner: boolean;
  /**
   * Kurserna kontot når. `null` betyder alla kurser och gäller ägaren och
   * API-nyckeln. En lärare utan kurser har en tom lista, inte null - därför
   * är skillnaden mellan `null` och `[]` betydelsebärande och får aldrig
   * kollapsa till en falsy-koll.
   */
  courseIds: number[] | null;
};

/** Ägarens och API-nyckelns obegränsade scope. */
export function fullScope(adminId: number | null, name: string): AdminScope {
  return { adminId, name, isOwner: true, courseIds: null };
}

/** Når det här scopet den angivna kursen? */
export function scopeAllowsCourse(scope: AdminScope, courseId: number): boolean {
  if (scope.courseIds === null) return true;
  if (!Number.isInteger(courseId)) return false;
  return scope.courseIds.includes(courseId);
}

/**
 * Prisma-filter för modeller som har `courseId` direkt: Survey, Topic,
 * Student, Unit, CampaignSnapshot.
 *
 * Ägaren får ett tomt filter, alltså ingen begränsning. En lärare får ett
 * `in`-filter - även när listan är tom, vilket då korrekt ger noll träffar.
 */
export function courseScopeWhere(
  scope: AdminScope
): Record<string, never> | { courseId: { in: number[] } } {
  if (scope.courseIds === null) return {};
  return { courseId: { in: scope.courseIds } };
}

/**
 * Samma sak för Question, som saknar egen `courseId` och når kursen via
 * ämnet. Måste hållas i takt med `courseScopeWhere` - glöms den här bort
 * läcker den globala frågebanken.
 */
export function questionScopeWhere(
  scope: AdminScope
): Record<string, never> | { topic: { courseId: { in: number[] } } } {
  if (scope.courseIds === null) return {};
  return { topic: { courseId: { in: scope.courseIds } } };
}

/** Prisma-filter för Course självt (`id` i stället för `courseId`). */
export function ownCoursesWhere(
  scope: AdminScope
): Record<string, never> | { id: { in: number[] } } {
  if (scope.courseIds === null) return {};
  return { id: { in: scope.courseIds } };
}

/**
 * Får det här scopet skapa och radera kurser, och administrera konton?
 * Sådant är ägarens ensak - en lärare förvaltar en kurs, hen grundar den inte.
 */
export function scopeIsOwner(scope: AdminScope): boolean {
  return scope.isOwner;
}
