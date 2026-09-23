import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import MachineStatusCard from '../components/MachineStatusCard';
import SiteConditionsCard from '../components/SiteConditionsCard';
import TaskCard from '../components/TaskCard';
import PrimaryButton from '../components/PrimaryButton';
import { useTasks } from '../hooks/useTasks';
import { useSiteConditions } from '../hooks/useSiteConditions';

export default function Dashboard() {
  const { operator, assignedMachine } = useOutletContext();
  const { tasks } = useTasks(operator?.operatorId);
  const conditions = useSiteConditions();
  const [precheckNote, setPrecheckNote] = useState(false);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="font-condensed font-bold text-figure uppercase leading-none">
          Ready to Start
        </div>
        <div className="text-white/60 mt-1">
          {operator ? `Welcome, ${operator.name}` : 'Loading operator…'}
        </div>
      </div>

      {assignedMachine ? (
        <MachineStatusCard machine={assignedMachine} />
      ) : (
        <div className="rounded border-2 border-border bg-surface p-5 text-white/60">
          No machine assigned yet.
        </div>
      )}

      <SiteConditionsCard conditions={conditions} />

      <div>
        <div className="font-condensed text-label uppercase tracking-wide text-white/60 mb-2">
          Today's Tasks
        </div>
        {tasks.length === 0 ? (
          <div className="rounded border-2 border-border bg-surface p-4 text-white/60">
            No tasks scheduled today.
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      {precheckNote && (
        <div className="rounded border-2 border-warn bg-warn/10 text-warn p-3 font-condensed font-semibold">
          Pre-check flow arrives in the next build phase.
        </div>
      )}

      <PrimaryButton icon={ClipboardCheck} onClick={() => setPrecheckNote(true)}>
        Run Machine Pre-Check
      </PrimaryButton>
    </div>
  );
}
