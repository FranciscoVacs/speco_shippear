// The service's HTTP API from the browser. The access token travels in the Authorization header (never in the URL or a cookie).
import { accessToken, signOut } from "./auth";
import { CLOUD } from "./config";

export class ApiError extends Error {
  constructor(public status: number, public detail: string, public code?: string) {
    super(`${status} ${detail}`);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessToken();
  if (!token) throw new ApiError(401, "not signed in");
  const res = await fetch(CLOUD.url + path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { Authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 401) {
    void signOut();                                    // the service does not accept this session (FR-005)
    throw new ApiError(401, "session expired");
  }
  if (!res.ok) {
    let detail = res.statusText;
    let code: string | undefined;
    try {
      const j = (await res.json()) as { detail?: unknown; error?: unknown; code?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (typeof j.error === "string") detail = j.error;           // the billing routes answer { error, code }
      if (typeof j.code === "string") code = j.code;
    } catch {
      /* keep the status text */
    }
    throw new ApiError(res.status, detail, code);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
