import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export function useTasks(operatorId) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!operatorId) return undefined;

    let cancelled = false;
    setLoading(true);

    apiClient
      .get('/tasks/today', { params: { operatorId } })
      .then((res) => {
        if (!cancelled) setTasks(res.data.tasks);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [operatorId]);

  return { tasks, loading };
}
