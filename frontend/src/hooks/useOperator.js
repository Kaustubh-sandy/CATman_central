import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export function useOperator() {
  const [operator, setOperator] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/operators/me')
      .then((res) => {
        if (!cancelled) setOperator(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { operator, loading };
}
