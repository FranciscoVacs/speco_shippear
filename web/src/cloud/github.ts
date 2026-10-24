// GitHub in one click: right after signing in with GitHub, the session carries GitHub's token for that person (once; a refresh drops it).
// The service uses it to list the Speco installations the person can see, and hands a claim for the ones on their own account,
// so connecting those needs no trip to GitHub. The token goes to our service only and is never stored here.
import { api, ApiError } from "./api";
import { githubToken } from "./auth";

export interface FoundInstallation {
  installation_id: number;
  account: string;
  account_id: number;
  account_type: "User" | "Organization";
  linked_org: string | null;
  /** present only for an installation on the person's own account that no company has yet */
  claim: string | null;
  repositories: number | null;
}

let found: Promise<FoundInstallation[]> | null = null;

/** -> what the person has on GitHub, or [] when the session has no GitHub token (email sign-in, or it was refreshed) */
export function findInstallations(): Promise<FoundInstallation[]> {
  found ??= githubToken().then((token) => (token ? api<FoundInstallation[]>("/api/github/installations", { body: { github_token: token } }) : []))
    .catch(() => []);
  return found;
}

/** -> how many repositories were connected. A claim lasts minutes: an expired one is asked for again once. */
export async function linkInstallation(orgId: string, installationId: number): Promise<number> {
  for (const retry of [false, true]) {
    if (retry) found = null;
    const inst = (await findInstallations()).find((i) => i.installation_id === installationId);
    if (!inst?.claim) throw new ApiError(400, "this installation cannot be connected from here");
    try {
      const r = await api<{ repositories: number }>(`/api/orgs/${orgId}/github/link`, { body: { claim: inst.claim } });
      found = null;
      return r.repositories;
    } catch (e) {
      if (retry || !(e instanceof ApiError) || e.status !== 400) throw e;
    }
  }
  throw new ApiError(400, "unreachable");
}

/** GitHub's own page, for an account without Speco or an organization (only its admins choose there); straight to that account if known */
export async function goInstall(orgId: string, targetId?: number): Promise<void> {
  const r = await api<{ url: string }>("/api/github/install-url", { body: { org_id: orgId, ...(targetId ? { target_id: targetId } : {}) } });
  window.location.href = r.url;
}
