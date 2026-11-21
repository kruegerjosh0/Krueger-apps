import React, { useMemo, useState } from 'react';
import { Customer } from '../../types';
import { formatScheduledDate } from '../../utils/projectHelpers';
import {
  collectScheduledCalendarEntries,
  buildIcsCalendarFile,
  deliverIcsCalendarFile,
  buildGoogleCalendarTemplateUrl,
} from '../../utils/calendarIcs';

interface CalendarSyncModalProps {
  customers: Customer[];
  onMarkCustomersCalendarSynced: (customerIds: number[], syncedAt: number) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const CalendarSyncModal: React.FC<CalendarSyncModalProps> = ({
  customers,
  onMarkCustomersCalendarSynced,
  onClose,
  onToast,
}) => {
  const [exporting, setExporting] = useState<'DELTA' | 'ALL' | null>(null);
  const [lastExportSummary, setLastExportSummary] = useState<string | null>(null);

  const allEntries = useMemo(
    () => collectScheduledCalendarEntries(customers),
    [customers]
  );

  const pendingEntries = useMemo(
    () => allEntries.filter((e) => e.syncStatus === 'NEW' || e.syncStatus === 'UPDATED'),
    [allEntries]
  );

  const syncedEntriesCount = allEntries.length - pendingEntries.length;

  const handleExportBatch = async (mode: 'DELTA' | 'ALL') => {
    const targetEntries = mode === 'DELTA' ? pendingEntries : allEntries;
    if (targetEntries.length === 0) {
      onToast(
        mode === 'DELTA'
          ? 'All scheduled jobs are already up to date!'
          : 'No scheduled jobs with start dates found.'
      );
      return;
    }

    setExporting(mode);
    try {
      const icsString = buildIcsCalendarFile(targetEntries);
      const todayTag = new Date().toISOString().split('T')[0];
      const fileName =
        mode === 'DELTA'
          ? `Krueger_Calendar_Updates_${todayTag}.ics`
          : `Krueger_Calendar_Full_Schedule_${todayTag}.ics`;

      await deliverIcsCalendarFile(icsString, fileName);

      const syncedAt = Date.now();
      const exportedCustomerIds = Array.from(
        new Set(targetEntries.map((entry) => entry.customer.id))
      );
      onMarkCustomersCalendarSynced(exportedCustomerIds, syncedAt);

      const summary = `Downloaded ${fileName} with ${targetEntries.length} job${
        targetEntries.length === 1 ? '' : 's'
      } (overwrite-safe UID + SEQUENCE).`;
      setLastExportSummary(summary);
      onToast(`✔ Downloaded ${targetEntries.length} job${targetEntries.length === 1 ? '' : 's'} to .ICS`);
    } catch (err: any) {
      console.error('ICS export failed:', err);
      onToast('Could not generate calendar file.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[#f1c40f]/50 rounded-2xl w-full max-w-lg p-4 sm:p-5 shadow-2xl space-y-4 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#f1c40f]">
              Zero-Auth .ICS Calendar Sync
            </span>
            <h2 className="text-base font-black text-[var(--text)]">
              📅 Weekly Schedule Sync
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

        {/* Smart Sync Status Banner */}
        <div
          className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
            allEntries.length === 0
              ? 'bg-[var(--surface-subtle)] border-[var(--border)]'
              : pendingEntries.length > 0
              ? 'bg-[#2c2317] border-[#f1c40f]/50'
              : 'bg-emerald-500/10 border-emerald-500/40'
          }`}
        >
          <div className="min-w-0">
            <div
              className={`text-xs font-black ${
                allEntries.length === 0
                  ? 'text-[var(--text)]'
                  : pendingEntries.length > 0
                  ? 'text-[#f1c40f]'
                  : 'text-emerald-400'
              }`}
            >
              {allEntries.length === 0
                ? 'No scheduled jobs yet'
                : pendingEntries.length > 0
                ? `${pendingEntries.length} new/updated job${pendingEntries.length === 1 ? '' : 's'} ready to sync`
                : 'All scheduled jobs up to date'}
            </div>
            <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">
              {allEntries.length === 0
                ? 'Add a scheduled date on a customer project to sync it here.'
                : `${allEntries.length} total scheduled • ${syncedEntriesCount} already synced • Persistent UID + SEQUENCE prevents duplicates`}
            </div>
          </div>
          <span className="text-xl shrink-0">
            {allEntries.length === 0 ? '📭' : pendingEntries.length > 0 ? '🔔' : '✅'}
          </span>
        </div>

        {/* Scheduled Jobs Queue */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
            <span>Scheduled Jobs ({allEntries.length})</span>
            <span>Chronological Order</span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
            {allEntries.length === 0 ? (
              <div className="text-center py-6 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl text-xs text-[var(--text-muted)]">
                No upcoming scheduled jobs found. Completed and Paid jobs are excluded automatically.
              </div>
            ) : (
              allEntries.map((entry) => {
                const { customer, job, syncStatus, sequence } = entry;
                const endLabel =
                  job.schedEndDate && job.schedEndDate !== job.schedDate
                    ? ` ➔ ${formatScheduledDate(job.schedEndDate)}`
                    : '';

                return (
                  <div
                    key={`${customer.id}-${job.id}`}
                    className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="bg-[#0a84ff]/15 text-[#60a5fa] border border-[#0a84ff]/35 text-[9.5px] font-black px-1.5 py-0.5 rounded">
                          {formatScheduledDate(job.schedDate)}
                          {endLabel}
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

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={buildGoogleCalendarTemplateUrl(customer, job)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => onMarkCustomersCalendarSynced([customer.id], Date.now())}
                        className="text-[9px] font-black px-2 py-0.5 rounded bg-[#0a84ff] hover:opacity-95 text-white transition-transform active:scale-95"
                        title="Open this event directly in Google Calendar app (zero file download)"
                      >
                        ↗ GCal
                      </a>
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded ${
                          syncStatus === 'NEW'
                            ? 'bg-[#2c2317] text-[#f1c40f] border border-[#f1c40f]/40'
                            : syncStatus === 'UPDATED'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                        }`}
                      >
                        {syncStatus === 'NEW'
                          ? '🆕 New'
                          : syncStatus === 'UPDATED'
                          ? `✏️ Seq #${sequence}`
                          : `✓ Synced`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Last Export Confirmation */}
        {lastExportSummary && (
          <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-2.5 text-[11px] text-emerald-300 font-semibold">
            ✔ {lastExportSummary}
          </div>
        )}

        {/* Primary & Secondary .ICS Sync Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={exporting !== null || pendingEntries.length === 0}
            onClick={() => handleExportBatch('DELTA')}
            className="w-full py-3 bg-[#f1c40f] hover:bg-[#e0b40e] text-[#111111] font-black uppercase tracking-wider text-xs rounded-xl shadow-lg cursor-pointer transition-transform active:scale-95 disabled:opacity-45 flex items-center justify-center gap-2"
          >
            <span>📅</span>
            <span>
              {exporting === 'DELTA'
                ? 'Generating .ICS File...'
                : pendingEntries.length > 0
                ? `Sync New & Updated Jobs to Calendar (${pendingEntries.length})`
                : 'Sync New & Updated Jobs to Calendar (0)'}
            </span>
          </button>

          <button
            type="button"
            disabled={exporting !== null || allEntries.length === 0}
            onClick={() => handleExportBatch('ALL')}
            className="w-full py-2.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-xs rounded-xl cursor-pointer transition-colors disabled:opacity-45 flex items-center justify-center gap-1.5"
          >
            <span>🔄</span>
            <span>
              {exporting === 'ALL'
                ? 'Generating Full .ICS...'
                : `Re-Export All Scheduled Jobs (${allEntries.length})`}
            </span>
          </button>
        </div>

        {/* Clear Bulk Import Helper Tip */}
        <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3 space-y-1.5 text-[10.5px] text-[var(--text-muted)] leading-relaxed">
          <div>
            <strong className="text-[#f1c40f]">Tip:</strong> For multi-job <code className="text-[var(--text)]">.ics</code> batch files, import via{' '}
            <strong className="text-[var(--text)]">calendar.google.com → Settings → Import &amp; export</strong> so Google Calendar updates existing entries cleanly without duplicates.
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]/60 flex-wrap">
            <span className="text-[10px]">
              For a single job on Android, tap <strong className="text-[#60a5fa]">↗ GCal</strong> above for instant 1-tap open.
            </span>
            <a
              href="https://calendar.google.com/calendar/u/0/r/settings/export"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-extrabold text-[#f1c40f] hover:underline shrink-0"
            >
              Open Import &amp; Export ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
