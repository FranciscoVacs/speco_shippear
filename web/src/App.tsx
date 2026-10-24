import { useState } from "react";
import { RouterProvider } from "react-router-dom";
import { I18nProvider } from "./i18n";
import { DataProvider } from "./DataContext";
import { AgentProvider } from "./agent/AgentProvider";
import { createAppRouter } from "./router";

// assistant-ui is NOT in this graph: AgentProvider loads src/agent/agent-runtime.tsx lazily (first interaction or idle time).
export function App() {
  const [router] = useState(createAppRouter);
  return (
    <I18nProvider>
      <DataProvider>
        <AgentProvider>
          <RouterProvider router={router} />
        </AgentProvider>
      </DataProvider>
    </I18nProvider>
  );
}
