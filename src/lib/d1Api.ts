let API_BASE = import.meta.env.VITE_D1_API_URL || "";
while (API_BASE.endsWith("/")) API_BASE = API_BASE.slice(0, -1);

export function d1ApiUrl(path: string): string {
  if (!API_BASE) throw new Error("D1 API URL is not configured (VITE_D1_API_URL).");
  return API_BASE + (path.startsWith("/") ? path : "/" + path);
}

export function getD1SessionToken(): string | null {
  try { return localStorage.getItem("cenpaya_d1_session"); } catch { return null; }
}

export function setD1SessionToken(token: string): void {
  localStorage.setItem("cenpaya_d1_session", token);
}

export function clearD1SessionToken(): void {
  try { localStorage.removeItem("cenpaya_d1_session"); } catch {}
}

export async function d1Request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getD1SessionToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  const response = await fetch(d1ApiUrl(path), { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "CenPaya API request failed");
  }
  return payload as T;
}
