/**
 * Klientens IP ur proxyheaders. Endast första värdet i x-forwarded-for
 * (som proxyn sätter till den riktiga klienten) accepteras, med x-real-ip
 * som reserv. Returnerar "unknown" när inget giltigt hittas.
 *
 * Headern kan spoofas av den som kontrollerar anslutningen, så anropare ska
 * alltid lägga en andra gräns på en axel klienten inte styr (användarnamn,
 * e-post).
 */
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  const candidate = forwarded || real || "";
  if (candidate && (IPV4.test(candidate) || IPV6.test(candidate))) {
    return candidate;
  }
  return "unknown";
}
