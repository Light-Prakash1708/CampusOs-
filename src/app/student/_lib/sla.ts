import { pluralize } from '@/lib/utils';

/**
 * Human SLA countdown for a redressal case, derived entirely from the
 * deadlines stored on the record. The escalation engine writes the deadlines;
 * this only renders them, so the UI can never disagree with the database.
 */
export interface SlaState {
  label: string;
  breached: boolean;
  urgent: boolean;
  /** Which clock is running: the first-response one or the resolution one. */
  phase: 'RESPONSE' | 'RESOLUTION' | 'SETTLED';
}

export function slaState(
  item: {
    responseDueAt: Date | null;
    resolutionDueAt: Date | null;
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
    isSlaBreached: boolean;
  },
  at: number = Date.now(),
): SlaState {
  if (!item.firstResponseAt && item.responseDueAt && !item.resolvedAt) {
    const hours = Math.round((item.responseDueAt.getTime() - at) / 3_600_000);
    if (hours < 0) {
      return {
        label: `First response overdue by ${pluralize(Math.abs(hours), 'hour')}`,
        breached: true,
        urgent: true,
        phase: 'RESPONSE',
      };
    }
    return {
      label: `First response due in ${pluralize(hours, 'hour')}`,
      breached: false,
      urgent: hours <= 6,
      phase: 'RESPONSE',
    };
  }

  if (!item.resolvedAt && item.resolutionDueAt) {
    const hours = Math.round((item.resolutionDueAt.getTime() - at) / 3_600_000);
    if (hours < 0) {
      return {
        label: `Resolution overdue by ${pluralize(Math.abs(hours), 'hour')}`,
        breached: true,
        urgent: true,
        phase: 'RESOLUTION',
      };
    }
    return {
      label: `Resolution due in ${pluralize(hours, 'hour')}`,
      breached: false,
      urgent: hours <= 12,
      phase: 'RESOLUTION',
    };
  }

  return {
    label: item.isSlaBreached ? 'Deadline was missed' : 'Within the agreed deadline',
    breached: item.isSlaBreached,
    urgent: false,
    phase: 'SETTLED',
  };
}
