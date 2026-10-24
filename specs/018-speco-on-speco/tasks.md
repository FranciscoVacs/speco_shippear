# Tasks: Speco on Speco

## Phase 3: User Story 1 - Speco is its own first company (Priority: P1)

- [ ] T001 [US1] Connect the Speco repository to a company of ours and record the result in docs/22-speco-on-speco.md (FR-001, FR-002, SC-003)

## Phase 4: User Story 2 - A remote MCP that any Claude can reach (Priority: P1)

- [ ] T002 [US2] Serve the MCP endpoint and point clients without access to the authorization server in cloud/speco_cloud/mcp_server.py and cloud/speco_cloud/oauth.py (FR-003)
- [ ] T003 [US2] Enable registration of MCP clients and host the consent screen in web/src/pages/AuthorizeClient.tsx and web/src/router.tsx (FR-004)
- [ ] T004 [US2] Accept only accesses of authorized clients and open each call as the person in cloud/speco_cloud/oauth.py (FR-005, FR-006)
- [ ] T011 [US3] Refuse every decision when the access carries a client identifier in supabase/migrations/20261016000002_agents_cannot_decide.sql (FR-011, SC-002)

## Phase 5: User Story 3 - Agents read and propose, never decide (Priority: P1)

- [ ] T005 [US3] Add the read only tools and the draft check that stores nothing in cloud/speco_cloud/mcp_server.py (FR-007, FR-008)
- [ ] T006 [US3] Keep every decision out of the tool list and test it in tests/cloud/test_mcp_server.py (FR-009, SC-002)

## Phase 6: User Story 4 - Speco-first: check before building, compare after (Priority: P1)

- [ ] T007 [US4] Require a person's approval for changes to the product folder in cloud/speco_cloud/app.py (FR-010)
- [ ] T008 [US4] Write the loop for building Speco with an agent in docs/22-speco-on-speco.md (SC-001)

## Phase 7: Verification

- [ ] T009 Test the endpoint, the isolation of what a client sees and the refusal of foreign accesses in tests/cloud/test_mcp_server.py (FR-003, FR-005, FR-006)
- [ ] T010 Drive the consent screen in a browser in web/scripts/verify-mcp-consent.mjs (SC-001, FR-004)
