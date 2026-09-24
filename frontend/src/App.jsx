import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LiveProvider } from './context/LiveContext';
import AppShellRoute from './layout/AppShellRoute';
import Dashboard from './pages/Dashboard';
import ELearning from './pages/ELearning';
import TaskHistory from './pages/TaskHistory';
import Profile from './pages/Profile';
import ControlRoom from './pages/ControlRoom';
import SkillProfile from './pages/SkillProfile';

// three.js is heavy; only load it when a simulation is opened.
const SimulationPlayer = lazy(() => import('./pages/SimulationPlayer'));

export default function App() {
  return (
    <BrowserRouter>
      <LiveProvider>
        <Routes>
          <Route element={<AppShellRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/learning" element={<ELearning />} />
            <Route path="/history" element={<TaskHistory />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/skills" element={<SkillProfile />} />
            <Route path="/control-room" element={<ControlRoom />} />
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
      </LiveProvider>
    </BrowserRouter>
  );
}
