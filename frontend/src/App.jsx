import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppShellRoute from './layout/AppShellRoute';
import Dashboard from './pages/Dashboard';
import ELearning from './pages/ELearning';
import ComingSoon from './pages/ComingSoon';

// three.js is heavy; only load it when a simulation is opened.
const SimulationPlayer = lazy(() => import('./pages/SimulationPlayer'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShellRoute />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/learning" element={<ELearning />} />
          <Route path="/history" element={<ComingSoon title="Task History" />} />
          <Route path="/profile" element={<ComingSoon title="Profile" />} />
        </Route>
        <Route
          path="/learning/sim/:moduleId"
          element={
            <Suspense
              fallback={
                <div className="fixed inset-0 flex items-center justify-center bg-ink font-condensed text-2xl uppercase text-white/70">
                  Loading cab…
                </div>
              }
            >
              <SimulationPlayer />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
