import { useEffect, useState } from 'react';

// Re-renders the caller every `intervalMs` so relative times ("3s ago") keep counting.
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
