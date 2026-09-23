import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLive } from '../context/LiveContext';

// Executes a navigate action returned by the backend assistant
// (targets defined in backend/src/services/assistant.service.js NAV_TARGETS).
export function useAssistantNavigation() {
  const navigate = useNavigate();
  const { setAlertCenterOpen, setAssistantOpen } = useLive();

  return useCallback(
    (action) => {
      if (!action || action.type !== 'navigate') return;
      if (action.focus === 'alerts') {
        navigate('/');
        setAssistantOpen(false);
        setAlertCenterOpen(true);
        return;
      }
      if (action.route.startsWith('/learning/sim/')) setAssistantOpen(false);
      navigate(action.focus ? `${action.route}?focus=${action.focus}` : action.route);
    },
    [navigate, setAlertCenterOpen, setAssistantOpen]
  );
}
