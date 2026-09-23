import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppShellRoute from './layout/AppShellRoute';
import Dashboard from './pages/Dashboard';
import ComingSoon from './pages/ComingSoon';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShellRoute />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/learning" element={<ComingSoon title="E-Learning" />} />
          <Route path="/history" element={<ComingSoon title="Task History" />} />
          <Route path="/profile" element={<ComingSoon title="Profile" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
