import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

const POLL_MS = 60000;

export function useSiteConditions() {
  const [conditions, setConditions] = useState(null);

  useEffect(() => {
    let cancelled = false;

    function load() {
      apiClient
        .get('/site/conditions')
        .then((res) => {
          if (!cancelled) setConditions(res.data);
        })
        .catch(() => {});
    }

    load();
    const interval = setInterval(load, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return conditions;
}
