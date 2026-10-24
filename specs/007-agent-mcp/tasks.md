# Tasks: Agent MCP Server

## Phase 3: User Story 1 - The agent checks the spec first (Priority: P1)

- [X] T001 [US1] Serve the blockers tool over standard input and output with no runtime dependency in src/specreview/mcp.py (FR-001, FR-006)
- [X] T002 [US1] Apply the configuration, the baseline and the waivers to every answer in src/specreview/mcp.py (FR-002)
- [X] T003 [US1] Return the EARS pattern and the issues of one requirement text in src/specreview/mcp.py (FR-003)

## Phase 4: User Story 2 - Stop an implementation that cannot start (Priority: P2)

- [X] T004 [US2] Stop the request and print the blockers with a gate command in src/specreview/cli_sub.py (FR-004)
- [X] T005 [US2] Exit quietly outside a Spec Kit project in src/specreview/cli_sub.py (FR-005)
- [X] T006 [US2] Wire the gate to the implement request in plugin/hooks/hooks.json (FR-004)
