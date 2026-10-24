# Spec Reviewer Constitution

## Core Principles

### I. Offline and deterministic by default
Every review MUST be reproducible and MUST work without network access. A language model is an optional layer and MUST
NOT be required for any finding to exist.

### II. Evidence decides severity
A finding MUST be a blocker only when its evidence is firm (an explicit citation, a contradiction in the text, or a model's
confirmation). A heuristic guess MUST NOT block. A false blocker costs more trust than a missed gap.

### III. Read-only analysis
A review MUST NOT modify files in the repository it reviews, and the assistant proposes text that the user applies. Only
commands the user runs explicitly to record a decision (`init`, `baseline`, `waive`) MAY write, and only the files they
announce: `specreview.toml`, the workflow, `product/jira.json`, and `.specreview/` (baseline, waivers, members and the approval
log). A decision an authenticated approver records from the app or from Slack is such an explicit act. (Amended 2026-10-14: before this, the tool had no way to
remember a team's accepted findings, and teams with existing debt could not adopt it. See product decision D-005.)

### IV. One source of truth
What a rule means is defined once (the rule catalog) and reused by the CLI, the UI and the docs.

### V. Known truth before trust
Every analyzer MUST be exercised against a fixture with planted defects and against a real repository, and the
limitations found MUST be written down.

### VI. Dogfooding
The product's own features are specified with Spec Kit and reviewed with Spec Reviewer. Its own specs MUST have no blockers.
