import React, { useState } from 'react';
import { JobProject } from '../../types';
import { createGoogleCalendarUrl, GoogleCalendarEvent } from '../../utils/googleWorkspace';

interface DayPopupModalProps {
  dateStr: string;
  jobs: { customerName: string; customerId: number; job: JobProject; address?: string; phone?: string }[];
  googleEvents?: GoogleCalendarEvent[];
  onOpenFolder: (customerId: number) => void;
  onDeleteGoogleEvent?: (eventId: string, summary: string) => Promise<void>;
  onClose: () => void;
}

export const DayPopupModal: React.FC<DayPopupModalProps> = ({
  dateStr,
  jobs,
  googleEvents = [],
  onOpenFolder,
  onDeleteGoogleEvent,
  onClose,
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Format readable date
  const readableDate = (() => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
    } catch {}
    return dateStr;
  })();

  const formatGoogleTime = (ev: GoogleCalendarEvent) => {
    if (ev.start?.dateTime) {
      try {
        const dStart = new Date(ev.start.dateTime);
        const startTimeStr = dStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        if (ev.end?.dateTime) {
          const dEnd = new Date(ev.end.dateTime);
          const endTimeStr = dEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          return `${startTimeStr} - ${endTimeStr}`;
        }
        return startTimeStr;
      } catch {
        return 'Timed Event';
      }
    }
    return 'All-Day Event';
  };

  const handleDeleteEvent = async (ev: GoogleCalendarEvent) => {
    if (!onDeleteGoogleEvent) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete "${ev.summary}" from Google Calendar? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setDeletingId(ev.id);
      await onDeleteGoogleEvent(ev.id, ev.summary);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg p-3.5 sm:p-5 shadow-2xl space-y-3.5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Daily Schedule &amp; Sync Inspector
            </span>
            <h3 className="text-sm sm:text-base font-black text-[var(--text)]">{readableDate}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] font-bold text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Section 1: Google Calendar Events from Phone */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#4285f4] flex items-center gap-1.5">
                <span>🗓️</span>
                <span>Google Calendar Events ({googleEvents.length})</span>
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">Synced with phone</span>
            </div>

            {googleEvents.length > 0 ? (
              <div className="space-y-2">
                {googleEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-[var(--surface-subtle)] border border-[#4285f4]/40 p-3 rounded-xl space-y-1.5 shadow-xs"
                    style={{ borderLeft: '4px solid #4285f4' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs sm:text-sm text-white">
                            {ev.summary}
                          </span>
                          {ev.calendarName && ev.calendarName !== 'Primary' && (
                            <span className="text-[9px] bg-[#4285f4]/20 text-[#8ab4f8] px-1.5 py-0.2 rounded font-bold">
                              {ev.calendarName}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-bold text-[#8ab4f8] flex items-center gap-1 mt-0.5">
                          <span>🕒 {formatGoogleTime(ev)}</span>
                        </div>
                      </div>

                      {ev.htmlLink && (
                        <a
                          href={ev.htmlLink}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 bg-[#1a233a] hover:bg-[#253252] text-[#8ab4f8] border border-[#4285f4]/30 rounded text-[10px] font-bold shrink-0 flex items-center gap-1 cursor-pointer"
                          title="Open event in Google Calendar"
                        >
                          <span>Open ➔</span>
                        </a>
                      )}
                    </div>

                    {ev.location && (
                      <div className="text-[11px] text-[var(--text-muted)] truncate flex items-center gap-1">
                        <span>📍</span>
                        <span>{ev.location}</span>
                      </div>
                    )}

                    {ev.description && (
                      <p className="text-[10px] sm:text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed bg-[var(--bg)]/50 p-2 rounded-lg">
                        {ev.description}
                      </p>
                    )}

                    {onDeleteGoogleEvent && (
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          disabled={deletingId === ev.id}
                          onClick={() => handleDeleteEvent(ev)}
                          className="text-[10px] text-red-400 hover:text-red-300 font-bold px-2 py-0.5 rounded hover:bg-red-500/10 cursor-pointer transition disabled:opacity-50"
                        >
                          {deletingId === ev.id ? 'Deleting...' : '🗑️ Remove Event'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-[var(--surface-subtle)]/50 rounded-xl text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border)]">
                No Google Calendar events scheduled for this date.
              </div>
            )}
          </div>

          {/* Section 2: Krueger Painting Projects */}
          <div className="space-y-2 pt-1 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                <span>🎨</span>
                <span>Painting Projects ({jobs.length})</span>
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">Krueger Painting OS</span>
            </div>

            {jobs.length > 0 ? (
              <div className="space-y-2">
                {jobs.map((item, idx) => {
                  const statusBg =
                    item.job.status === 'SCHEDULED'
                      ? '#0a84ff'
                      : '#bf5af2';

                  const gCalUrl = createGoogleCalendarUrl(
                    item.customerName,
                    item.job,
                    item.address,
                    item.phone
                  );

                  return (
                    <div
                      key={idx}
                      className="bg-[var(--surface-subtle)] border border-[var(--border)] p-3 rounded-xl space-y-2 shadow-xs"
                      style={{ borderLeft: `4px solid ${statusBg}` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-xs sm:text-sm text-[var(--text)] truncate">
                          {item.customerName}
                        </span>
                        <span
                          style={{ backgroundColor: statusBg }}
                          className="text-[8px] font-black uppercase px-2 py-0.5 rounded text-white shrink-0"
                        >
                          {item.job.status}
                        </span>
                      </div>

                      <div className="text-[11px] sm:text-xs font-bold text-[var(--accent)]">
                        {item.job.title || 'General Scope Project'}
                      </div>

                      {item.address && (
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          📍 {item.address}
                        </div>
                      )}

                      {item.job.scope && (
                        <p className="text-[10px] sm:text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                          {item.job.scope}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <a
                          href={gCalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="py-1.5 px-2 bg-[#4285f4] hover:bg-[#3367d6] text-white font-extrabold text-[10px] sm:text-[11px] rounded-lg cursor-pointer text-center flex items-center justify-center gap-1 shadow-sm transition-transform active:scale-95"
                          title="Add directly into Google Calendar app or web"
                        >
                          <span>📅</span>
                          <span className="truncate">Add to Google Cal</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenFolder(item.customerId);
                          }}
                          className="py-1.5 px-2 bg-[var(--accent-secondary)] hover:opacity-90 text-white font-extrabold text-[10px] sm:text-[11px] rounded-lg cursor-pointer text-center truncate shadow-sm transition-transform active:scale-95"
                        >
                          Open Folder ➔
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 bg-[var(--surface-subtle)]/50 rounded-xl text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border)]">
                No painting projects scheduled for this date.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
