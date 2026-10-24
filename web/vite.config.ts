import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// root-relative: Vite resolves it against the project root
const stub = "/src/agent/agent-runtime.stub.tsx";

// singlefile inlines the app <script> into <head>; move it to the end of <body>, after the
// `<!--SPECREVIEW_DATA-->` marker, so the exporter's injected data sits right before the app script.
const appScriptAfterMarker = (): Plugin => ({
  name: "specreview-script-order",
  enforce: "post",
  generateBundle(_o, bundle) {
    const html = bundle["index.html"];
    if (!html || html.type !== "asset" || typeof html.source !== "string") return;
    let src = html.source;
    const open = src.indexOf('<script type="module"');
    const close = src.indexOf("</script>", open);
    if (open < 0 || close < 0) return;
    const script = src.slice(open, close + "</script>".length);
    src = src.slice(0, open) + src.slice(close + "</script>".length);
    src = src.replace("</body>", `    ${script}\n  </body>`);
    html.source = src;
  },
});

// In dev, serve the Vercel functions under web/api/bello/* (Web-standard GET/POST/PATCH exports) before the /api proxy kicks in.
const belloApi = (): Plugin => ({
  name: "bello-api-dev",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const m = url.pathname.match(/^\/api\/bello\/([a-z-]+)$/);
      if (!m) return next();
      try {
        const mod = (await server.ssrLoadModule(`/api/bello/${m[1]}.ts`)) as Record<string, (r: Request) => Promise<Response>>;
        const handler = mod[req.method ?? "GET"];
        if (!handler) {
          res.statusCode = 405;
          return res.end();
        }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = chunks.length && req.method !== "GET" ? Buffer.concat(chunks) : undefined;
        const out = await handler(new Request(url, { method: req.method, headers: req.headers as Record<string, string>, body }));
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await out.arrayBuffer()));
      } catch (e) {
        server.config.logger.error(`[bello-api] ${(e as Error).stack ?? e}`);
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "dev api error" }));
      }
    });
  },
});

// `vite build --mode single` -> one self-contained dist-single/index.html, unminified.
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  // Cloud mode (spec 015) exists only in builds that were given all three public addresses. Everywhere else the constant is the literal
  // `false`, so the sign-in library behind it is dropped from the bundle (NFR-001) and the exported report stays one small file.
  const env = loadEnv(mode, ".", "VITE_");
  const cloud = !single && !!(env.VITE_CLOUD_URL && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
  // the dev API needs server-only secrets (database + AI Gateway auth), which v0 writes to the repo root
  const serverEnv = { ...loadEnv(mode, "..", ""), ...loadEnv(mode, ".", "") };
  for (const key of ["DATABASE_URL", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"]) {
    if (!process.env[key] && serverEnv[key]) process.env[key] = serverEnv[key];
  }
  return {
    define: { __CLOUD_BUILD__: JSON.stringify(cloud) },
    plugins: [react(), ...(single ? [viteSingleFile(), appScriptAfterMarker()] : [belloApi()])],
    // Exported single-file pages have no agent (no panel, no home): the lazy runtime module (assistant-ui + engines + cards) is replaced by an empty stub.
    resolve: { alias: single ? [{ find: /^\.\/agent-runtime$/, replacement: stub }] : [] },
    // In single mode samples are not embedded: the exporter injects window.__SPECREVIEW__.
    publicDir: single ? false : "public",
    build: { chunkSizeWarningLimit: 600, minify: single ? false : "esbuild", sourcemap: false, outDir: single ? "dist-single" : "dist" },
    server: { allowedHosts: true, proxy: { "/api": "http://127.0.0.1:8765" } },
    preview: { proxy: { "/api": "http://127.0.0.1:8765" } },
  };
});
