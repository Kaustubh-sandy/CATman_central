import { AlertOctagon, AlertTriangle, ShieldAlert } from 'lucide-react';

// Alerts arrive as a rule code + numeric params and are translated on the device.
export function alertText(alert, t) {
  const titleKey = `alert.title.${alert.ruleId}`;
  const reasonKey = `alert.reason.${alert.ruleId}`;
  const title = t(titleKey);
  const reason = t(reasonKey, alert.params || {});
  return {
    title: title === titleKey ? alert.ruleId : title,
    reason: reason === reasonKey ? alert.reason : reason,
  };
}

export const SEVERITY_STYLE = {
  CRITICAL: { cls: 'border-danger text-danger', bg: 'bg-danger', Icon: AlertOctagon },
  HIGH: { cls: 'border-danger text-danger', bg: 'bg-danger', Icon: ShieldAlert },
  MEDIUM: { cls: 'border-warn text-warn', bg: 'bg-warn', Icon: AlertTriangle },
};
