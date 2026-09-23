import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { socket } from '../api/socket';
import { deriveFuelPercent } from '../utils/telemetry';

export function useFleet() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get('/fleet')
      .then((res) => {
        if (!cancelled) setMachines(res.data.machines);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    function onTelemetry(payload) {
      setMachines((prev) =>
        prev.map((m) =>
          m.machineId === payload.machineId
            ? { ...m, telemetry: payload, fuelPercent: deriveFuelPercent(payload) }
            : m
        )
      );
    }

    function onConnectivity(update) {
      setMachines((prev) =>
        prev.map((m) =>
          m.machineId === update.machineId
            ? { ...m, connectivity: { status: update.status, lastSeenAt: update.lastSeenAt } }
            : m
        )
      );
    }

    socket.on('machine:telemetry', onTelemetry);
    socket.on('machine:connectivity', onConnectivity);

    return () => {
      cancelled = true;
      socket.off('machine:telemetry', onTelemetry);
      socket.off('machine:connectivity', onConnectivity);
    };
  }, []);

  return { machines, loading, error };
}
