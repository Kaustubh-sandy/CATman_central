import { Outlet } from 'react-router-dom';
import AppShell from './AppShell';
import { useOperator } from '../hooks/useOperator';
import { useFleet } from '../hooks/useFleet';

export default function AppShellRoute() {
  const { operator } = useOperator();
  const { machines } = useFleet();

  const assignedMachine = operator
    ? machines.find((m) => m.machineId === operator.assignedMachineId)
    : null;

  return (
    <AppShell machine={assignedMachine} operator={operator}>
      <Outlet context={{ operator, machines, assignedMachine }} />
    </AppShell>
  );
}
