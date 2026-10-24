// "/" : the agent as the whole page (FR-001, FR-002). The conversation UI lives in src/agent (HomeChat).
// In the cloud a company with nothing in it first answers one plain question: do you have software, or an idea (spec 016, FR-001).
import { useEffect, useState } from "react";
import { AgentSlot } from "../agent/AgentSlot";
import { api } from "../cloud/api";
import { cloudEnabled } from "../cloud/config";
import { listIdeas } from "../cloud/ideas";
import { currentTenant, useSession } from "../shell/session";
import { Skeleton } from "../States";
import { Welcome } from "./Welcome";

/** `null` while it is not known, then whether the company has nothing yet: no repository read and no idea */
function useEmptyCompany(org: string | null): boolean | null {
  const [empty, setEmpty] = useState<boolean | null>(null);
  useEffect(() => {
    if (!org) return;
    let live = true;
    setEmpty(null);
    Promise.all([api<unknown[]>(`/api/orgs/${org}/repositories?status=all`), listIdeas(org)])
      .then(([repos, ideas]) => live && setEmpty(repos.length === 0 && ideas.length === 0))
      .catch(() => live && setEmpty(false));            // when in doubt, the person lands on the agent as before
    return () => {
      live = false;
    };
  }, [org]);
  return empty;
}

function CloudHome() {
  const org = currentTenant(useSession()).id;
  const empty = useEmptyCompany(org);
  if (empty === null) return <div className="page"><Skeleton /></div>;
  return empty ? <Welcome /> : <AgentSlot variant="home" context={{ page: "home" }} />;
}

export default function Home() {
  return cloudEnabled() ? <CloudHome /> : <AgentSlot variant="home" context={{ page: "home" }} />;
}
