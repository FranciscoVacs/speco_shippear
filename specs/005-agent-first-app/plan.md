# Implementation Plan: Agent-First App

**Branch**: `005-agent-first-app` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

The interface is rebuilt around an application shell: a collapsible sidebar with a tenant switcher (FR-008, FR-009) and a top
bar with the user menu, notifications, language and theme (FR-010, FR-011, FR-012, FR-015), plus a command palette (FR-013).
Pages have real addresses so a deep link opens its page (FR-016). The root page is an empty chat with suggested prompts
(FR-001, FR-002); every other page shows the same conversation in a collapsible right panel that knows the page it sits on
(FR-004, FR-005, FR-006, FR-007). A single conversation store feeds both (FR-007). The agent has two engines behind one interface: a
simulated agent that runs in the browser and answers with review cards built from sample reviews (FR-003, FR-018), and the
existing streaming backend when a local server with a model is reachable (FR-019). Sign-in, workspaces, members, API keys,
billing and notifications are simulated and labelled as demo data (FR-014). The build is a static site configured for Vercel
with a rewrite to the index page (FR-016, FR-017). Everything is operable from the keyboard (FR-020).

## Technical Context

**Language/Version**: TypeScript 5 with React 18

**Primary Dependencies**: assistant-ui for the chat, a small router; no new runtime services

**Storage**: browser storage for preferences only (theme, language, panel state, sidebar state)

**Testing**: Playwright against the production build served as static files; type checks with strict settings

**Target Platform**: Vercel static hosting and the local server

**Project Type**: single-page web application

**Performance Goals**: at most 250 KB of JavaScript gzipped on the first page (SC-002)

**Constraints**: the public demo never calls a language model

## Constitution Check

I Offline by default: PASS, the demo agent runs in the browser. III Read-only: PASS, the agent only proposes text.
IV One source of truth: PASS, the rule catalog and the sample reviews come from the engine. VI Dogfooding: this feature is
specified and reviewed with the tool before it is built.

## Project Structure

```text
web/
├── src/shell/        # sidebar, top bar, menus, palette, session store
├── src/pages/        # home chat, features, rules, docs, settings
├── src/agent/        # conversation store, simulated agent, backend agent, side panel
├── src/i18n/         # Spanish and English texts
├── public/samples/   # reviews generated from this repository's own specs
└── vercel.json
```

## Complexity Tracking

None.
