import React, { useMemo, useState } from 'react';
import { Customer, JobProject } from '../../types';
import {
  isJobEligibleForScheduledList,
  parseLocalDateMs,
  formatScheduledDate,
} from '../../utils/projectHelpers';
import {
  syncAllScheduledJobsToGoogleCalendar,
  generateIcsContent,
  BatchCalendarSyncResult,
} from '../../utils/googleWorkspace';

interface CalendarSyncModalProps {
  customers: Customer[];
  onPersistEventIds: (eventIdMap: Record<number, string>) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

interface SyncPreviewRow {
  customer: Customer;
  job: JobProject;
  sortMs: number | null;
  hasGoogleEventId: boolean;
}

export const CalendarSyncModal: React.FC<CalendarSyncModalProps> = ({
  customers,
  onPersistEventIds,
  onClose,
  onToast,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<BatchCalendarSyncResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scheduledRows = useMemo<SyncPreviewRow[]>(() => {
    const rows: SyncPreviewRow[] = [];
    customers.forEach((cust) => {
      (cust.jobs || []).forEach((job) => {
        if (!isJobEligibleForScheduledList(cust, job)) return;
        rows.push({
          customer: cust,
          job,
          sortMs: parseLocalDateMs(job.schedDate),
          hasGoogleEventId: Boolean(job.googleEventId || job.googleCalendarEventId),
        });
      });
    });

    rows.sort((a, b) => {
      if (a.sortMs !== null && b.sortMs !== null && a.sortMs !== b.sortMs) {
        return a.sortMs - b.sortMs;
      }
      if (a.sortMs !== null && b.sortMs === null) return -1;
      if (a.sortMs === null && b.sortMs !== null) return 1;
      return a.customer.name.localeCompare(b.customer.name);
    });

    return rows;
  }, [customers]);

  const datedCount = scheduledRows.filter((r) => Boolean(r.job.schedDate?.trim())).length;

  const handleSyncGoogleCalendar = async () => {
    if (datedCount === 0) {
      setErrorMsg('No scheduled jobs have a start date set yet.');
      return;
    }

    setSyncing(true);
    setErrorMsg(null);
    setSyncResult(null);

    try {
      const res = await syncAllScheduledJobsToGoogleCalendar(customers);
      if (Object.keys(res.eventIdMap).length > 0) {
        onPersistEventIds(res.eventIdMap);
      }
      setSyncResult(res);
      if (res.errors.length === 0) {
        onToast(
          `✔ Calendar Synced: ${res.updatedCount} updated, ${res.createdCount} added (no duplicates)`
        );
      } else {
        onToast(`Calendar synced with ${res.errors.length} issue(s)`);
      }
    } catch (err: any) {
      const msg = err?.message || 'Google Calendar sign-in or sync failed.';
      setErrorMsg(msg);
      onToast(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handleExportIcsFallback = async () => {
    if (datedCount === 0) {
      onToast('No scheduled jobs with start dates to export.');
      return;
    }
    const icsString = generateIcsContent(customers);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const file = new File([icsString], 'Krueger_Schedule_Sync.ics', { type: 'text/calendar' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Krueger Painting Schedule',
            text: `Import ${datedCount} scheduled jobs into your calendar`,
            files: [file],
          });
          onToast('✔ Opened Calendar Import on Device');
          return;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Krueger_Schedule_Sync.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast('✔ Calendar File (.ICS) Downloaded');
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[#0a84ff]/50 rounded-2xl w-full max-w-lg p-4 sm:p-5 shadow-2xl space-y-4 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#0a84ff]">
              Google Calendar Sync
            </span>
            <h2 className="text-base font-black text-[var(--text)]">
              Sync All Scheduled Jobs
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] font-bold text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
          Syncs all upcoming/active scheduled jobs to your Google Calendar. Previously exported jobs are <strong className="text-[var(--text)]">updated in place</strong> using their stored event ID so re-syncing never creates duplicate events.
        </div>

        {/* Scheduled Jobs Pulled from App */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
            <span>Scheduled Jobs Ready ({datedCount})</span>
            <span>Chronological Order</span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
            {scheduledRows.length === 0 ? (
              <div className="text-center py-6 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl text-xs text-[var(--text-muted)]">
                No upcoming scheduled jobs found. Completed and Paid jobs are automatically excluded.
              </div>
            ) : (
              scheduledRows.map(({ customer, job, hasGoogleEventId }) => (
                <div
                  key={`${customer.id}-${job.id}`}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="bg-[#0a84ff]/15 text-[#60a5fa] border border-[#0a84ff]/35 text-[9.5px] font-black px-1.5 py-0.5 rounded">
                        {job.schedDate ? formatScheduledDate(job.schedDate) : 'No Start Date'}
                      </span>
                      <span className="text-xs font-extrabold text-[var(--text)] truncate">
                        {customer.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                      {job.title || 'Painting Project'}
                      {customer.address ? ` • ${customer.address}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-black px-2 py-0.5 rounded shrink-0 ${
                      hasGoogleEventId
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                        : 'bg-[#2c2317] text-[#f1c40f] border border-[#f1c40f]/30'
                    }`}
                  >
                    {hasGoogleEventId ? '✓ Synced (Will Update)' : 'New Event'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sync Result Summary */}
        {syncResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-3 space-y-1 text-xs">
            <div className="font-black text-emerald-400">
              ✔ Google Calendar Sync Complete (Zero Duplicates)
            </div>
            <div className="text-[11px] text-[var(--text)]">
              Updated existing: <strong>{syncResult.updatedCount}</strong> • Newly added:{' '}
              <strong>{syncResult.createdCount}</strong>
              {syncResult.skippedNoDateCount > 0 && (
                <span> • Skipped (no date): {syncResult.skippedNoDateCount}</span>
              )}
            </div>
            {syncResult.errors.length > 0 && (
              <div className="text-[10.5px] text-red-400 pt-1">
                {syncResult.errors.join(' | ')}
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={syncing || datedCount === 0}
            onClick={handleSyncGoogleCalendar}
            className="w-full py-3 bg-[#0a84ff] hover:opacity-95 text-white font-black uppercase tracking-wider text-xs rounded-xl shadow-lg cursor-pointer transition-transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>🔄</span>
            <span>
              {syncing
                ? 'Syncing to Google Calendar...'
                : `Sync ${datedCount} Scheduled Job${datedCount === 1 ? '' : 's'} to Google Calendar`}
            </span>
          </button>

          <button
            type="button"
            disabled={datedCount === 0}
            onClick={handleExportIcsFallback}
            className="w-full py-2.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-xs rounded-xl cursor-pointer transition-colors disabled:opacity-50"
          >
            📥 Offline Fallback: Export Deduplicated .ICS File
          </button>
        </div>
      </div>
    </div>
  );
};
