// Builds artifact/template.html: the app as page content for a hosted Artifact (no <html>/<head>/<body>),
// React/ReactDOM loaded from cdnjs (pinned), app code bundled unminified. Contains the SPECREVIEW_DATA marker
// that `specreview -f html --template artifact/template.html` replaces with the report. This is the public DEMO: it bundles the
// lazy agent runtime (assistant-ui + the simulated agent) so the agent panel works offline over the embedded report.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const out = await build({
  entryPoints: ["src/main.tsx"], bundle: true, write: false, format: "iife", target: "es2020",
  jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment",
  tsconfigRaw: { compilerOptions: { jsx: "react" } },            // the project's tsconfig asks for the automatic runtime
  loader: { ".css": "empty" },                                   // styles are inlined separately below
  inject: ["artifact/react-global.js"],
  alias: { react: "./artifact/react-shim.cjs", "react/jsx-runtime": "./artifact/jsx-runtime-shim.cjs", "react-dom/client": "./artifact/react-dom-shim.cjs", "react-dom": "./artifact/react-dom-shim.cjs" },
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}", __CLOUD_BUILD__: "false" },   // react-router / lucide-react branch on it; no VITE_* here: the demo has no cloud
  minify: false, legalComments: "none",
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
// styles.css (tokens, review UI) + shell.css (sidebar, menus, pages) + agent.css (chat, cards): all inlined, the CSS imports above are empty loaders
const css = ["src/styles.css", "src/shell/shell.css", "src/agent/agent.css"].map((f) => readFileSync(f, "utf8")).join("\n");
const edge = `
/* hosted-page rules: side gutters clear system bars; sticky bar sits below the top inset */
.shell-body > main, .topbar { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
`;
const html = `<title>Spec Reviewer</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
${edge}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>window.__SPECREVIEW__ = null; window.__SR_MEMORY_ROUTER__ = true;</script>
<!--SPECREVIEW_DATA-->
<script>
${js}
</script>
`;
writeFileSync("artifact/template.html", html);
console.log("artifact/template.html", html.length, "bytes");
