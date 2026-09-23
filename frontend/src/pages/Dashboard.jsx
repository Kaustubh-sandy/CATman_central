import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Play, LogOut, CheckCircle2, Cpu, UserCheck } from 'lucide-react';
import { useLive } from '../context/LiveContext';
import MachineStatusCard from '../components/MachineStatusCard';
import SiteConditionsCard from '../components/SiteConditionsCard';
import TaskCard from '../components/TaskCard';
import PrimaryButton from '../components/PrimaryButton';
import PrecheckPanel from '../components/dashboard/PrecheckPanel';
import PrecheckFailed from '../components/dashboard/PrecheckFailed';
import PrecheckWarnings from '../components/dashboard/PrecheckWarnings';
import SafetyChecklist from '../components/dashboard/SafetyChecklist';
import ActiveTaskPanel from '../components/dashboard/ActiveTaskPanel';
import EnvelopeIndicator from '../components/dashboard/EnvelopeIndicator';
import ShiftSummary from '../components/dashboard/ShiftSummary';
import EndShiftForm from '../components/dashboard/EndShiftForm';
import AlertItem from '../components/alerts/AlertItem';

const HEADLINE_TONE = {
  PRECHECK_FAILED: 'text-danger',
  TASK_ACTIVE: 'text-ok',
  TASK_PAUSED: 'text-warn',
};
const FOCUS_HIGHLIGHT_MS = 2500;

// The assistant links here with ?focus=<section>: scroll to it and flash it.
function useFocusParam() {
  const [params, setParams] = useSearchParams();
  const focus = params.get('focus');

  useEffect(() => {
    if (!focus) return undefined;
    const timer = setTimeout(() => {
      const el = document.getElementById(`focus-${focus}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('focus-flash');
        setTimeout(() => el.classList.remove('focus-flash'), FOCUS_HIGHLIGHT_MS);
      }
      setParams({}, { replace: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [focus, setParams]);
}

function TaskList({ tasks, onStart, nextId }) {
  const { t } = useLive();
  return (
    <div id="focus-tasks">
      <div className="font-condensed text-label uppercase tracking-wide text-white/60 mb-2">{t('tasks.title')}</div>
      {tasks.length === 0 ? (
        <div className="rounded border-2 border-border bg-surface p-4 text-white/60">{t('tasks.none')}</div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              highlight={task.id === nextId}
              onStart={onStart && ['PENDING'].includes(task.status) ? onStart : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PrecheckChip({ precheck }) {
  const { t } = useLive();
  if (!precheck?.overall) return null;
  const tone = precheck.overall === 'PASS' ? 'border-ok text-ok' : precheck.overall === 'FAIL' ? 'border-danger text-danger' : 'border-warn text-warn';
  const Icon = precheck.mode === 'MANUAL' ? UserCheck : Cpu;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border-2 px-2 py-0.5 font-condensed font-bold uppercase ${tone}`}>
      <Icon size={16} strokeWidth={2.5} />
      {t('precheck.last', { result: t(`precheck.overall.${precheck.overall}`) })}
    </span>
  );
}

export default function Dashboard() {
  useFocusParam();
  const { t, operator, machine, shift, tasks, site, envelope, myAlerts, actions } = useLive();
  const [endingShift, setEndingShift] = useState(false);

  useEffect(() => {
    if (shift?.state === 'SHIFT_ENDED') setEndingShift(false);
  }, [shift?.state]);

  if (!shift || !operator) {
    return <div className="max-w-3xl mx-auto text-white/60 font-condensed text-2xl uppercase">{t('dash.loading')}</div>;
  }

  const state = shift.state;
  const activeTask = tasks.find((x) => x.id === shift.activeTaskId);
  const nextTask = tasks.find((x) => x.status === 'PENDING');
  const canEndShift = ['PRECHECK_PASSED', 'CHECKLIST_COMPLETE', 'TASK_ACTIVE', 'TASK_PAUSED', 'TASK_COMPLETE', 'PRECHECK_FAILED'].includes(state);
  const machineCard = (
    <div id="focus-machine">
      <MachineStatusCard machine={machine} compact={['TASK_ACTIVE', 'TASK_PAUSED'].includes(state)} />
    </div>
  );

  let body;
  switch (state) {
    case 'NOT_STARTED':
      body = (
        <>
          {machineCard}
          <SiteConditionsCard conditions={site} />
          <TaskList tasks={tasks} />
          <div id="focus-precheck">
            <PrimaryButton icon={ClipboardCheck} onClick={actions.runPrecheck}>
              {t('precheck.run')}
            </PrimaryButton>
          </div>
        </>
      );
      break;
    case 'PRECHECK_RUNNING':
      body = <PrecheckPanel precheck={shift.precheck} />;
      break;
    case 'PRECHECK_FAILED':
      body = (
        <>
          <PrecheckFailed precheck={shift.precheck} />
          {machineCard}
        </>
      );
      break;
    case 'PRECHECK_PASSED':
      body =
        shift.precheck?.needsAck && !shift.precheck?.warningsAcknowledgedAt ? (
          <PrecheckWarnings precheck={shift.precheck} />
        ) : (
          <SafetyChecklist checklist={shift.checklist} />
        );
      break;
    case 'CHECKLIST_COMPLETE':
    case 'TASK_COMPLETE':
      body = (
        <>
          {state === 'TASK_COMPLETE' && (
            <div className="rounded border-2 border-ok bg-ok/10 text-ok p-4 flex items-center gap-3 font-condensed font-bold text-2xl">
              <CheckCircle2 size={36} strokeWidth={2.5} />
              {tasks.find((x) => x.id === shift.lastCompletedTaskId)?.title}
            </div>
          )}
          {nextTask ? (
            <>
              <div className="font-condensed font-bold text-2xl">{t('ready.next', { title: nextTask.title })}</div>
              <PrimaryButton icon={Play} onClick={() => actions.startTask(nextTask.id)}>
                {t('ready.startTask')}
              </PrimaryButton>
            </>
          ) : (
            <div className="rounded border-2 border-ok text-ok p-4 font-condensed font-bold text-2xl">{t('ready.noTasks')}</div>
          )}
          {envelope && <EnvelopeIndicator envelope={envelope.envelope} distanceM={envelope.distanceM} />}
          <TaskList tasks={tasks} onStart={actions.startTask} nextId={nextTask?.id} />
          {machineCard}
        </>
      );
      break;
    case 'TASK_ACTIVE':
    case 'TASK_PAUSED':
      body = (
        <>
          <ActiveTaskPanel task={activeTask} paused={state === 'TASK_PAUSED'} />
          {envelope && <EnvelopeIndicator envelope={envelope.envelope} distanceM={envelope.distanceM} />}
          {machineCard}
          {myAlerts.length > 0 && (
            <div>
              <div className="font-condensed text-label uppercase tracking-wide text-white/60 mb-2">{t('alerts.feed')}</div>
              <ul className="space-y-3">
                {myAlerts.slice(0, 4).map((a) => (
                  <AlertItem key={a.id} alert={a} />
                ))}
              </ul>
            </div>
          )}
        </>
      );
      break;
    case 'SHIFT_ENDED':
      body = <ShiftSummary summary={shift.summary} />;
      break;
    default:
      body = null;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <div>
        <div className={`font-condensed font-bold text-figure uppercase leading-none ${HEADLINE_TONE[state] || ''}`}>{t(`headline.${state}`)}</div>
        <div className="text-white/60 mt-2 flex items-center gap-3 flex-wrap">
          <span>{t('dash.welcome', { name: operator.name })}</span>
          {state !== 'PRECHECK_RUNNING' && state !== 'PRECHECK_FAILED' && <PrecheckChip precheck={shift.precheck} />}
        </div>
      </div>

      {endingShift ? <EndShiftForm onCancel={() => setEndingShift(false)} /> : body}

      {canEndShift && !endingShift && (
        <PrimaryButton icon={LogOut} tone="secondary" onClick={() => setEndingShift(true)}>
          {t('ready.endShift')}
        </PrimaryButton>
      )}
    </div>
  );
}
