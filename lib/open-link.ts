/**
 * HTTPS link that opens a page inside Nimiq Pay.
 * https://nimiq.dev/mini-apps/#sharing-your-mini-app
 * Returns null for http (local Custom URL testing) and for unparseable input.
 */
export function nimiqPayOpenUrl(pageUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const path = url.pathname === "/" ? "" : url.pathname;
  return `https://nimpay.app/miniapps/open/${url.host}${path}${url.search}`;
}
