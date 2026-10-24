// The four milestones of the checklist. Each one is completed by something the person does in the real product (FR-002),
// never by ticking a box.
import type { Key } from "../i18n";
import type { MilestoneId } from "./store";

/** the demo feature with two rules that contradict each other (FR-003) */
export const SAMPLE_FEATURE = "003-team-invitations";

export interface Milestone {
  id: MilestoneId;
  title: Key;
  hint: Key;
  /** where the milestone takes the person; null = it asks the agent instead */
  to: string | null;
}

export const MILESTONE_LIST: Milestone[] = [
  { id: "decisions", title: "act.m1.title", hint: "act.m1.hint", to: "/decisions" },
  { id: "review", title: "act.m2.title", hint: "act.m2.hint", to: `/reviews/${SAMPLE_FEATURE}` },
  { id: "decide", title: "act.m3.title", hint: "act.m3.hint", to: `/reviews/${SAMPLE_FEATURE}` },
  { id: "ask", title: "act.m4.title", hint: "act.m4.hint", to: null },
];
