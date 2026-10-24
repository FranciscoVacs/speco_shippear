// Exported single-file reports have no agent: this replaces ./agent-runtime so assistant-ui is not bundled (see vite.config.ts).
export function AgentRuntimeHost() {
  return null;
}
