// The pre-005 UI checks (top tabs, hash routing, assistant tab) were retired with the old UI; see verify-ui.legacy.mjs.
// This entry point now runs the shell verification, which covers every route, the shell, onboarding, the guide, the rules
// glossary, samples mode, server mode and embedded mode.
await import("./verify-shell.mjs");
