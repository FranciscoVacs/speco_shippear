// Routes (FR-016). Real paths via createBrowserRouter when the page is served over http(s); an in-memory router when
// the app is embedded (exported HTML opened from file://, hosted artifact), so no URL change is needed there.
import { lazy } from "react";
import { Navigate, createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router-dom";
import { Shell } from "./shell/Shell";
import { SignedOut } from "./shell/SignedOut";
import Home from "./pages/Home";
import { isEmbedded } from "./data";
import { cloudEnabled } from "./cloud/config";
import { CloudGate } from "./cloud/CloudGate";
import ReferralLanding from "./pages/ReferralLanding";

const DecisionsPage = lazy(() => import("./pages/DecisionsPage"));
const ReviewsPage = lazy(() => import("./pages/ReviewsPage"));
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const RulesPage = lazy(() => import("./pages/RulesPage"));
const DocsPage = lazy(() => import("./pages/DocsPage"));
const DevelopersPage = lazy(() => import("./pages/DevelopersPage"));
const ProductGuidePage = lazy(() => import("./pages/ProductGuidePage"));
const ConnectRepo = lazy(() => import("./pages/ConnectRepo"));
const PortraitPage = lazy(() => import("./pages/PortraitPage"));
const Ideas = lazy(() => import("./pages/Ideas"));
const Idea = lazy(() => import("./pages/Idea"));
const LedgerPage = lazy(() => import("./pages/LedgerPage"));
const AuthorizeClient = lazy(() => import("./pages/AuthorizeClient"));
const AgentsPage = lazy(() => import("./pages/AgentsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const BelloLayout = lazy(() => import("./bello/BelloLayout"));
const BelloOverview = lazy(() => import("./bello/pages/Overview"));
const BelloSpecs = lazy(() => import("./bello/pages/SpecsPage"));
const BelloRules = lazy(() => import("./bello/pages/RulesPage"));
const BelloTrace = lazy(() => import("./bello/pages/TracePage"));
const BelloHome = lazy(() => import("./bello/pages/AssistantPage"));

/** `/bello/specs` → `/specs`, keeping the query, for links shared before the workspace became the whole app */
function LegacyBelloRedirect() {
  const { pathname, search } = window.location;
  const rest = pathname.replace(/^\/bello\/?/, "");
  return <Navigate to={(rest === "asistente" ? "/" : "/" + rest) + search} replace />;
}
const SettingsLayout = lazy(() => import("./pages/settings/SettingsLayout"));
const General = lazy(() => import("./pages/settings/General"));
const Members = lazy(() => import("./pages/settings/Members"));
const ApiKeys = lazy(() => import("./pages/settings/ApiKeys"));
const Integrations = lazy(() => import("./pages/settings/Integrations"));
const Usage = lazy(() => import("./pages/settings/Usage"));
const Billing = lazy(() => import("./pages/settings/Billing"));
const NotificationSettings = lazy(() => import("./pages/settings/Notifications"));
const Profile = lazy(() => import("./pages/settings/Profile"));

function buildRoutes(embedded: boolean): RouteObject[] {
  const settings: RouteObject[] = embedded
    ? []
    : [
        {
          path: "settings",
          element: <SettingsLayout />,
          children: [
            { index: true, element: <Navigate to="/settings/general" replace /> },
            { path: "general", element: <General /> },
            { path: "members", element: <Members /> },
            { path: "api-keys", element: <ApiKeys /> },
            { path: "integrations", element: <Integrations /> },
            { path: "usage", element: <Usage /> },
            { path: "billing", element: <Billing /> },
            { path: "notifications", element: <NotificationSettings /> },
            { path: "profile", element: <Profile /> },
          ],
        },
      ];
  return [
    ...(embedded ? [] : [{ path: "/signed-out", element: <SignedOut /> } satisfies RouteObject]),
    ...(embedded || !cloudEnabled() ? [] : [{ path: "/r/:code", element: <ReferralLanding /> } satisfies RouteObject]),
    {
      path: "/",
      element: cloudEnabled() ? <CloudGate><Shell embedded={embedded} /></CloudGate> : <Shell embedded={embedded} />,
      children: [
        // embedded reports have no agent home: land on the single report
        ...(embedded
          ? [{ index: true, element: <Navigate to="/reviews/report" replace /> } satisfies RouteObject]
          : [
              {
                element: <BelloLayout />,
                children: [
                  { index: true, element: <BelloHome /> },
                  { path: "dashboard", element: <BelloOverview /> },
                  { path: "specs", element: <BelloSpecs /> },
                  { path: "reglas", element: <BelloRules /> },
                  { path: "trazabilidad", element: <BelloTrace /> },
                ],
              } satisfies RouteObject,
              { path: "bello", element: <Navigate to="/dashboard" replace /> } satisfies RouteObject,
              { path: "bello/*", element: <LegacyBelloRedirect /> } satisfies RouteObject,
              { path: "speco-home", element: <Home /> } satisfies RouteObject,
            ]),
        { path: "decisions", element: <DecisionsPage /> },
        ...(embedded ? [] : [{ path: "ledger", element: <LedgerPage /> } satisfies RouteObject]),
        { path: "reviews", element: <ReviewsPage /> },
        { path: "reviews/:featureId", element: <ReviewPage /> },
        ...(embedded ? [] : [{ path: "connect", element: <ConnectRepo /> } satisfies RouteObject]),
        ...(embedded ? [] : [{ path: "portrait", element: <PortraitPage /> } satisfies RouteObject]),
        ...(embedded || !cloudEnabled() ? [] : [{ path: "oauth/consent", element: <AuthorizeClient /> } satisfies RouteObject]),
        ...(embedded || !cloudEnabled() ? [] : [{ path: "agents", element: <AgentsPage /> } satisfies RouteObject]),
        ...(embedded || !cloudEnabled() ? [] : [{ path: "ideas", element: <Ideas /> } satisfies RouteObject, { path: "ideas/:id", element: <Idea /> } satisfies RouteObject]),
        { path: "rules", element: <RulesPage /> },
        { path: "rules/:ruleId", element: <RulesPage /> },
        { path: "docs", element: <DocsPage /> },
        { path: "docs/developers", element: <DevelopersPage /> },
        { path: "docs/product", element: <ProductGuidePage /> },
        ...settings,
        { path: "*", element: <NotFound /> },
      ],
    },
  ];
}

/** Links from before real routes existed: `/#guia-...` and `/#<feature-id>`. A hash with parameters is not one of them: it is how the
 * sign-in comes back (`#access_token=…`, `#error=…`), and the sign-in library must find it untouched. */
function upgradeLegacyHash() {
  const { pathname, hash } = window.location;
  if (pathname !== "/" || hash.length < 2 || hash.includes("=")) return;
  if (/^#guia(-|$)/.test(hash)) window.history.replaceState(null, "", "/docs" + hash);
  else window.history.replaceState(null, "", "/reviews/" + encodeURIComponent(decodeURIComponent(hash.slice(1))));
}

export function createAppRouter() {
  // the hosted artifact template sets __SR_MEMORY_ROUTER__: its URL belongs to the host page, so the app must not read or write it
  if (isEmbedded() || window.location.protocol === "file:" || (window as { __SR_MEMORY_ROUTER__?: boolean }).__SR_MEMORY_ROUTER__) {
    return createMemoryRouter(buildRoutes(true), { initialEntries: ["/reviews/report"] });
  }
  upgradeLegacyHash();
  return createBrowserRouter(buildRoutes(false));
}
