import React, { useState, useEffect } from 'react';
import { Customer, JobProject } from '../types';
import {
  signInWithGoogle,
  getAccessToken,
  fetchGoogleCalendarEvents,
  syncJobToGoogleCalendar,
  GoogleCalendarEvent,
  subscribeToAuth,
} from '../utils/googleWorkspace';
import { User } from 'firebase/auth';

interface CalendarViewProps {
  customers: Customer[];
  onOpenFolder: (customerId: number) => void;
  onOpenDayPopup: (
    dateStr: string,
    jobs: { customerName: string; customerId: number; job: JobProject }[]
  ) => void;
  onExportAllJobsIcs: () => void;
  onToast?: (msg: string) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  customers,
  onOpenFolder,
  onOpenDayPopup,
  onExportAllJobsIcs,
  onToast,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [confirmSyncModal, setConfirmSyncModal] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  const changeMonth = (delta: number) => {
    setCurrentDate(new Date(year, month + delta, 1));
  };

  // Auth subscription
  useEffect(() => {
    const unsub = subscribeToAuth((user, token) => {
      setCurrentUser(user);
      if (token) {
        loadGoogleCalendar(token);
      } else {
        setGoogleEvents([]);
      }
    });
    return () => unsub();
  }, [currentDate]);

  const loadGoogleCalendar = async (token?: string) => {
    try {
      const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${totalDaysInMonth}`;
      const events = await fetchGoogleCalendarEvents(startOfMonth, endOfMonth);
      setGoogleEvents(events);
      setLastSyncedTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (err: any) {
      console.warn('Could not load Google Calendar events:', err);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      setSyncing(true);
      const res = await signInWithGoogle();
      onToast?.(`✔ Connected Google Calendar (${res.user.email})`);
      await loadGoogleCalendar(res.accessToken);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        onToast?.('ℹ Sign-in cancelled');
      } else if (err?.code === 'auth/popup-blocked') {
        onToast?.('⚠️ Pop-up was blocked by browser');
      } else {
        onToast?.(`Sign-in failed: ${err.message}`);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleRequestPushToGoogle = async () => {
    const token = await getAccessToken();
    if (!token) {
      await handleConnectGoogle();
      return;
    }
    // Show explicit confirmation dialog as required by Workspace integration guidelines
    setConfirmSyncModal(true);
  };

  const handleExecutePushToGoogle = async () => {
    setConfirmSyncModal(false);
    setSyncing(true);
    let syncedCount = 0;
    try {
      // Find all scheduled jobs
      for (const c of customers) {
        for (const j of c.jobs || []) {
          if (j.schedDate && (j.status === 'SCHEDULED' || j.status === 'ACTIVE' || j.status === 'PENDING')) {
            try {
              await syncJobToGoogleCalendar(c, j);
              syncedCount++;
            } catch (err) {
              console.warn(`Error syncing job ${j.id}:`, err);
            }
          }
        }
      }
      onToast?.(`✔ Synced ${syncedCount} painting projects to Google Calendar!`);
      const token = await getAccessToken();
      if (token) await loadGoogleCalendar(token);
    } catch (err: any) {
      onToast?.(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Collect scheduled jobs
  const agendaItems: {
    dateStr: string;
    color: string;
    text: string;
    cId?: number;
    jobTitle?: string;
    isGoogle?: boolean;
  }[] = [];

  const dayJobsMap: Record<
    string,
    { customerName: string; customerId: number; job: JobProject }[]
  > = {};

  const googleDayMap: Record<string, GoogleCalendarEvent[]> = {};

  customers.forEach((c) => {
    (c.jobs || []).forEach((j) => {
      const start = j.schedDate;
      const end = j.schedEndDate || j.schedDate;
      if (!start) return;

      for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (dateStr >= start && dateStr <= end) {
          if (!dayJobsMap[dateStr]) dayJobsMap[dateStr] = [];
          dayJobsMap[dateStr].push({ customerName: c.name, customerId: c.id, job: j });

          const color = j.status === 'ACTIVE' ? '#30d158' : j.status === 'SCHEDULED' ? '#0a84ff' : '#bf5af2';
          agendaItems.push({
            dateStr,
            color,
            text: `${c.name} ${j.title ? `(${j.title})` : ''} - ${j.status}`,
            cId: c.id,
            jobTitle: j.title,
          });
        }
      }
    });
  });

  // Also map Google Calendar events
  googleEvents.forEach((ev) => {
    const rawDate = ev.start?.date || ev.start?.dateTime?.split('T')[0];
    if (rawDate) {
      if (!googleDayMap[rawDate]) googleDayMap[rawDate] = [];
      googleDayMap[rawDate].push(ev);

      // Add to agenda if in this month
      if (rawDate.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
        agendaItems.push({
          dateStr: rawDate,
          color: '#4285f4',
          text: `Google Calendar: ${ev.summary}`,
          isGoogle: true,
        });
      }
    }
  });

  agendaItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-20">
      {/* Calendar Header Card */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-md">
        {/* Top Google Sync Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <div>
              <div className="text-xs font-black text-[var(--text)] flex items-center gap-2">
                <span>Master Calendar &amp; Schedule</span>
                {currentUser ? (
                  <span className="bg-[#1c2e1f] text-[#30d158] border border-[#30d158]/50 text-[9px] font-black px-1.5 py-0.2 rounded uppercase flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse"></span>
                    Google Synced
                  </span>
                ) : (
                  <span className="bg-[#2c2317] text-[#f1c40f] border border-[#f1c40f]/40 text-[9px] font-bold px-1.5 py-0.2 rounded uppercase">
                    Local Device
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">
                {currentUser?.email
                  ? `Connected to ${currentUser.email} • ${lastSyncedTime ? `Last sync ${lastSyncedTime}` : ''}`
                  : 'Connect with Google Calendar to sync all jobs with your phone and team'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {currentUser ? (
              <button
                type="button"
                onClick={handleRequestPushToGoogle}
                disabled={syncing}
                className="bg-[#4285f4] hover:bg-[#3367d6] text-white px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow transition-transform active:scale-95 disabled:opacity-50"
              >
                <span className={syncing ? 'animate-spin' : ''}>🔄</span>
                <span>{syncing ? 'Syncing...' : 'Sync to Google Calendar'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogle}
                disabled={syncing}
                className="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow transition-transform active:scale-95"
              >
                <span>🌐</span>
                <span>Connect Google Calendar</span>
              </button>
            )}
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between pb-3 mb-2">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="px-3 py-1.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] rounded-lg text-xs font-bold text-[var(--text)] cursor-pointer"
          >
            ← Prev
          </button>
          <span className="font-extrabold text-base text-[var(--accent)] tracking-wide">
            {monthNames[month]} {year}
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="px-3 py-1.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] rounded-lg text-xs font-bold text-[var(--text)] cursor-pointer"
          >
            Next →
          </button>
        </div>

        {/* Days of week */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-[10px] uppercase font-extrabold text-[var(--text-muted)] py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells before day 1 */}
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[75px] bg-transparent opacity-20" />
          ))}

          {/* Days */}
          {Array.from({ length: totalDaysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const jobsToday = dayJobsMap[dateStr] || [];
            const gEventsToday = googleDayMap[dateStr] || [];
            const hasItems = jobsToday.length > 0 || gEventsToday.length > 0;

            return (
              <div
                key={`day-${dayNum}`}
                onClick={() => onOpenDayPopup(dateStr, jobsToday)}
                className={`min-h-[75px] sm:min-h-[85px] p-1 rounded-lg border flex flex-col justify-start gap-1 cursor-pointer transition-all active:scale-95 ${
                  hasItems
                    ? 'bg-[var(--surface-subtle)] border-[var(--accent)] shadow-sm'
                    : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--accent)]'
                }`}
              >
                <div className="text-[10px] font-bold text-[var(--text)] px-1 flex items-center justify-between">
                  <span>{dayNum}</span>
                  {gEventsToday.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4285f4]" title="Google Event" />
                  )}
                </div>
                <div className="space-y-1 overflow-hidden">
                  {jobsToday.slice(0, 2).map((item, idx) => {
                    const tagBg =
                      item.job.status === 'ACTIVE'
                        ? '#30d158'
                        : item.job.status === 'SCHEDULED'
                        ? '#0a84ff'
                        : '#bf5af2';
                    return (
                      <div
                        key={idx}
                        style={{ backgroundColor: tagBg }}
                        className="text-[7.5px] font-bold text-white px-1 py-0.5 rounded truncate shadow-xs"
                        title={`${item.customerName}: ${item.job.title || item.job.status}`}
                      >
                        {item.customerName}
                      </div>
                    );
                  })}
                  {gEventsToday.slice(0, 1).map((gev, gIdx) => (
                    <div
                      key={`g-${gIdx}`}
                      className="text-[7.5px] font-bold text-white bg-[#4285f4] px-1 py-0.5 rounded truncate"
                      title={`Google Calendar: ${gev.summary}`}
                    >
                      {gev.summary}
                    </div>
                  ))}
                  {jobsToday.length + gEventsToday.length > 2 && (
                    <div className="text-[7px] text-[var(--accent)] font-extrabold px-1">
                      +{jobsToday.length + gEventsToday.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sync Controls & Export */}
        <div className="mt-4 pt-3 border-t border-[var(--border)] flex flex-wrap justify-between items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)] font-semibold">
            Tap any day to view full day agenda &amp; details
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportAllJobsIcs}
              className="px-3 py-1.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[10px] font-bold text-[var(--accent)] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center gap-1"
            >
              <span>📥</span>
              <span>Export .ICS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Master Job Agenda */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-md">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-[var(--accent)] mb-3">
          📋 Master Agenda For This Month ({agendaItems.length})
        </h3>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {agendaItems.map((item, i) => (
            <div
              key={i}
              onClick={() => {
                if (item.cId) onOpenFolder(item.cId);
              }}
              className="bg-[var(--surface-subtle)] hover:border-[var(--accent)] border border-[var(--border)] p-2.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-all active:scale-[0.99]"
              style={{ borderLeft: `4px solid ${item.color}` }}
            >
              <div>
                <span className="font-extrabold text-[var(--accent)] mr-2">[{item.dateStr}]</span>
                <span className="font-bold text-[var(--text)]">{item.text}</span>
              </div>
              {item.cId && (
                <span className="text-[10px] text-[var(--accent)] font-bold ml-2">Open ➔</span>
              )}
            </div>
          ))}

          {agendaItems.length === 0 && (
            <div className="text-center py-8 text-xs text-[var(--text-muted)]">
              No jobs or estimates scheduled for {monthNames[month]} {year}.
            </div>
          )}
        </div>
      </div>

      {/* Explicit User Confirmation Dialog (MANDATORY per Workspace Integration rules) */}
      {confirmSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#121318] border-2 border-[#4285f4] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-sm font-black text-white">Sync to Google Calendar</h3>
                <p className="text-[10px] text-gray-400">Google Workspace Confirmation</p>
              </div>
            </div>

            <p className="text-xs text-gray-200 leading-relaxed">
              Are you sure you want to push your scheduled painting projects and customer job sites to your primary Google Calendar (<strong>{currentUser?.email}</strong>)?
            </p>

            <div className="bg-[#1c1d25] p-3 rounded-xl border border-[var(--border)] text-[11px] text-gray-300 space-y-1">
              <div>• Adds customer name, job scope &amp; work dates</div>
              <div>• Includes site address for Google Maps directions</div>
              <div>• Sets reminders 1 day and 2 hours before job starts</div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSyncModal(false)}
                className="flex-1 py-2.5 bg-[#1c1d25] hover:bg-[#252733] text-gray-300 font-bold text-xs rounded-xl border border-[var(--border)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePushToGoogle}
                className="flex-1 py-2.5 bg-[#4285f4] hover:bg-[#3367d6] text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
              >
                Confirm &amp; Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
