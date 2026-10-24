# Implementation Plan: Speco on Speco

**Branch**: `018-speco-on-speco` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

## Summary

The Speco repository is connected through the GitHub App to a company of ours, which needs nothing new in the product (FR-001, FR-002, SC-003). The service gains a remote MCP endpoint over HTTP. Without an access it answers with the standard pointer to its authorization server (FR-003); the authorization server is Supabase Auth acting as an OAuth 2.1 server, with registration of MCP clients enabled so Claude registers itself (FR-004), and a consent screen hosted by the web app where the person accepts or refuses. The endpoint accepts only accesses issued by our authorization server to a client that a person authorized, recognized by the client identifier in the access, and refuses the person's own web session there (FR-006). The database refuses every decision when the access carries a client identifier, so a connected client cannot decide even by skipping the tools (FR-011, SC-002). Each call opens as the person who authorized it, so the database isolation of the company applies unchanged (FR-005, SC-001). The tools are read only: pending decisions, reviews, rules, baselines and changes (FR-007) plus a check of a draft spec that stores nothing (FR-008); none can decide anything (FR-009, SC-002). Changes to the product folder of a repository that is a company's product definition need a person's approval before they count (FR-010). A guide describes the Speco-first loop for building Speco with an agent (SC-001).

## Technical Context

**Language/Version**: Python 3.11, TypeScript 5 with React 18

**Storage**: PostgreSQL

**Testing**: pytest on a real Postgres, a real browser for the consent screen

**Project Type**: web service

## Project Structure

```text
cloud/speco_cloud/mcp_server.py
cloud/speco_cloud/oauth.py
cloud/speco_cloud/app.py
web/src/pages/AuthorizeClient.tsx
web/src/router.tsx
tests/cloud/test_mcp_server.py
web/scripts/verify-mcp-consent.mjs
docs/22-speco-on-speco.md
```
