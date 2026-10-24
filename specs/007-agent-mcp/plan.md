# Implementation Plan: Agent MCP Server

**Branch**: `007-agent-mcp` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

A server speaks JSON-RPC over standard input and output and offers the tools the agent needs: the blockers of a feature
(FR-001), the full review, the check of one requirement (FR-003) and the explanation of a rule. It reads the repository
configuration, baseline and waivers so it agrees with the pull request review (FR-002). It uses only the standard library
(FR-006). A gate command exits with an error and prints the blockers, and a Claude Code plugin hook runs it when the user asks
to implement (FR-004); it exits quietly outside a Spec Kit project (FR-005).

## Technical Context

**Language/Version**: Python 3.11 with the standard library only

**Testing**: pytest with a real subprocess handshake

**Project Type**: command line tool and Claude Code plugin

## Project Structure

```text
src/specreview/
├── mcp.py
└── cli_sub.py
plugin/
├── .mcp.json
├── commands/review-spec.md
└── hooks/hooks.json
```
