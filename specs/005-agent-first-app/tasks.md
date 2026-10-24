# Tasks: Agent-First App

**Input**: Design documents from `/specs/005-agent-first-app/`

## Phase 1: Setup

- [X] T001 Generate the sample reviews from this repository's own specs and the example repository in web/public/samples/ (FR-014, FR-018)
- [X] T002 [P] Add the Vercel configuration with the static output and the rewrite to the index page in web/vercel.json (FR-016, FR-017)

## Phase 2: Foundational

- [X] T003 Add page routing with real addresses and the application shell layout in web/src/shell/Shell.tsx (FR-008, FR-016)
- [X] T004 [P] Add the simulated session with the user, the workspaces and the notifications in web/src/shell/session.ts (FR-009, FR-012)
- [X] T005 [P] Add the Spanish and English texts and the language switch in web/src/i18n/ (FR-015)

## Phase 3: User Story 3 - Navigate like a real product (Priority: P1)

- [X] T006 [US3] Build the collapsible sidebar with the main sections in web/src/shell/Sidebar.tsx (FR-008)
- [X] T007 [US3] Build the tenant switcher in web/src/shell/TenantSwitcher.tsx (FR-009)
- [X] T008 [US3] Build the user menu with profile, language, theme, documentation, help and log out in web/src/shell/UserMenu.tsx (FR-010)
- [X] T009 [US3] Build the signed-out screen that signs in again in web/src/shell/SignedOut.tsx (FR-011)
- [X] T010 [US3] Build the notifications menu that marks events as read in web/src/shell/Notifications.tsx (FR-012)
- [X] T011 [US3] Build the command palette for pages, features and rules in web/src/shell/CommandPalette.tsx (FR-013)
- [X] T012 [US3] Make the sidebar, the menus and the palette reachable with the keyboard in web/src/shell/ (FR-020)

## Phase 4: User Story 1 - Start from the agent (Priority: P1)

- [X] T013 [US1] Build the conversation store shared by the root page and the side panel in web/src/agent/store.ts (FR-007)
- [X] T014 [US1] Build the empty chat page with suggested prompts and the message box in web/src/pages/Home.tsx (FR-001, FR-002)
- [X] T015 [US1] Build the simulated agent that answers with a review card in web/src/agent/demoAgent.ts (FR-003, FR-018)
- [X] T016 [US1] Connect the conversation to the streaming backend when a model is reachable in web/src/agent/backendAgent.ts (FR-019)

## Phase 5: User Story 2 - Work with the agent beside any page (Priority: P1)

- [X] T017 [US2] Build the collapsible right side panel in web/src/agent/SidePanel.tsx (FR-004, FR-005)
- [X] T018 [US2] Show the feature of the current page as the context of the agent in web/src/agent/SidePanel.tsx (FR-006)

## Phase 6: User Story 4 - See what a production workspace offers (Priority: P2)

- [X] T019 [US4] Build the settings pages for members, API keys, integrations, usage and notifications in web/src/pages/settings/ (FR-014)

## Phase 7: User Story 6 - Share the demo on Vercel (Priority: P1)

- [X] T020 [US6] Check that the production build served as static files opens every inner page directly in web/scripts/verify-shell.mjs (FR-016, FR-017)

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T021 [P] Check that a visitor gets a review card in at most 2 interactions in web/scripts/verify-shell.mjs (SC-001)
- [X] T022 [P] Check that the JavaScript of the first view, before the first interaction and without the idle prefetch, is at most 250 KB gzipped in web/scripts/verify-shell.mjs (SC-002)
