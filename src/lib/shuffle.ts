/**
 * Fisher-Yates. Returnerar en ny array - indata rörs inte.
 *
 * Slumpkällan går att skicka in, så tester kan köra den deterministiskt.
 * Ska bara användas på PRESENTATIONSORDNING, aldrig på urvalet: vilka
 * frågor som kommer med i ett pass avgörs av retrievability och dagens tak,
 * och det är inte något att slumpa bort.
 */
export function shuffle<T>(
  items: readonly T[],
  random: () => number = Math.random
): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
