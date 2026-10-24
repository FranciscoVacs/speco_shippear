import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTheme } from "./shell/theme";
import { captureAcquisition } from "./cloud/acquisition";
import { captureOrgHint } from "./cloud/orgs";
import "./styles.css";
import "./shell/shell.css";
import "./agent/agent.css";

initTheme();
captureAcquisition();
captureOrgHint();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
