# Implementation Plan: Product Layer

**Branch**: `009-product-layer` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

A product module reads goals and decisions from a product folder and the goal and decision ids a spec declares in its header.
It reports a blocker when a spec cites a superseded or rejected decision (FR-001) and a warning when a requirement uses a term an
accepted decision rules out (FR-002), because that match is inferred from text. It warns about a spec with no goal (FR-003) and
about ids that do not exist (FR-005). A goal report lists the goals no feature cites (FR-004). Without a product folder the module
emits nothing (FR-006).

## Technical Context

**Language/Version**: Python 3.11 with the standard library only

**Testing**: pytest with a fixture repository that has one finding of every product rule

**Project Type**: command line tool

## Project Structure

```text
src/specreview/product.py
examples/subscriptions/product/
├── goals.md
└── decisions.md
```
