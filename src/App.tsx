import { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { ToastProvider, SaveStatusProvider, ErrorBoundary } from "@/components/app";
import { Spinner } from "@/components/ui";
import { SessionRoute } from '@/components/app/SessionRoute';
import styles from "./App.module.css";
import { useColorScheme } from '@/hooks/useColorScheme';

/*
 * Each page is lazy-loaded — its JS bundle is only fetched the first time
 * the user navigates to that route, keeping the initial load fast.
 */
const Home = lazy(() =>
  import("@/pages/Home/Home").then((m) => ({ default: m.Home })),
);
const Game = lazy(() =>
  import("@/pages/Game/Game").then((m) => ({ default: m.Game })),
);
const GmPlaybook = lazy(() =>
  import("@/pages/GmPlaybook/GmPlaybook").then((m) => ({
    default: m.GmPlaybook,
  })),
);
const SteadingPlaybook = lazy(() =>
  import("@/pages/SteadingPlaybook/SteadingPlaybook").then((m) => ({
    default: m.SteadingPlaybook,
  })),
);
const CharacterPlaybook = lazy(() =>
  import("@/pages/CharacterPlaybook/CharacterPlaybook").then((m) => ({
    default: m.CharacterPlaybook,
  })),
);
const NotFound = lazy(() =>
  import("@/pages/NotFound/NotFound").then((m) => ({ default: m.NotFound })),
);

/*
 * App — the root of the entire application.
 *
 * Wraps everything in:
 *   ToastProvider  — makes toast notifications available to every component
 *   ErrorBoundary  — catches JS crashes and shows a fallback UI
 *   Suspense       — shows nothing while a lazy page bundle is loading
 *
 * Route map:
 *   /                        → Home
 *   /game                    → Game (party overview, secret in browser storage)
 *   /game/gm                 → GM Playbook
 *   /game/steading           → Steading Playbook
 *   /game/:playbook          → Character Playbook
 *   *                        → NotFound (404)
 *
 * SiteBanner, the TopBar wordmark, and the footer are all handled inside
 * PageLayout / PageHeader, so no shared shell wrapper is needed here.
 */
export const App = () => {
  useColorScheme();
  // Key the boundary to the route path so a render error on one page clears
  // when the user navigates elsewhere, instead of blanking the app until reload.
  const { pathname } = useLocation();
  return (
  <ToastProvider>
    <SaveStatusProvider>
    <ErrorBoundary resetKey={pathname}>
      <Suspense
        fallback={
          <div className={styles.loading} aria-live="polite" aria-busy="true">
            <Spinner />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route element={<SessionRoute />}>
            <Route path="/game" element={<Game />} />
            <Route path="/game/gm" element={<GmPlaybook />} />
            <Route path="/game/steading" element={<SteadingPlaybook />} />
            <Route path="/game/:playbook" element={<CharacterPlaybook />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
    </SaveStatusProvider>
  </ToastProvider>
  );
};
