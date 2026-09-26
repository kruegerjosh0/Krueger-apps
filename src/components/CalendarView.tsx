import React, { useState, useEffect } from 'react';
import { Customer, JobProject } from '../types';
import {
  signInWithGoogle,
  fetchGoogleCalendarEvents,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  GoogleCalendarEvent,
  subscribeToAuth,
  createGoogleCalendarUrl,
} from '../utils/googleWorkspace';
import { User } from 'firebase/auth';

interface CalendarViewProps {
  customers: Customer[];
  onOpenFolder: (customerId: number) => void;
  onOpenDayPopup: (
    dateStr: string,
    jobs: { customerName: string; customerId: number; job: JobProject; address?: string; phone?: string }[],
    googleEvents: GoogleCalendarEvent[]
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
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'GRID' | 'AGENDA'>('GRID');

  // Quick Add Event Form State
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [newEventAllDay, setNewEventAllDay] = useState(true);
  const [newEventStartTime, setNewEventStartTime] = useState('09:00');
  const [newEventEndTime, setNewEventEndTime] = useState('10:00');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [addingEvent, setAddingEvent] = useState(false);

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
      setAccessToken(token);
      if (token) {
        loadGoogleCalendar(token);
      } else {
        setGoogleEvents([]);
      }
    });
    return () => unsub();
  }, [currentDate]);

  const loadGoogleCalendar = async (token?: string) => {
    setSyncing(true);
    setSyncError(null);
    try {
      const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${totalDaysInMonth}`;
      const events = await fetchGoogleCalendarEvents(startOfMonth, endOfMonth);
      setGoogleEvents(events);
      setLastSyncedTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (err: any) {
      console.warn('Could not load Google Calendar events:', err);
      setSyncError(err?.message || 'Failed to sync with Google Calendar.');
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    setSyncError(null);
    try {
      const res = await signInWithGoogle();
      onToast?.(`✔ Connected to Google Calendar as ${res.user.email}`);
      await loadGoogleCalendar(res.accessToken);
    } catch (err: any) {
      console.error('Google Calendar connect error:', err);
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setSyncError('Google Sign-In popup closed. Please tap again to grant permission.');
      } else if (err?.code === 'auth/popup-blocked') {
        setSyncError('Browser blocked the Google popup window. Please allow popups for this site.');
      } else {
        setSyncError(err.message || 'Google authorization could not complete.');
      }
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleDeleteGoogleEvent = async (eventId: string, summary: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${summary}" from your Google Calendar? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteGoogleCalendarEvent(eventId);
      setGoogleEvents((prev) => prev.filter((e) => e.id !== eventId));
      onToast?.(`✔ Removed "${summary}" from Google Calendar`);
    } catch (err: any) {
      onToast?.(`Failed to delete event: ${err.message}`);
    }
  };

  const handleCreateQuickEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) {
      onToast?.('Please enter an event title');
      return;
    }

    setAddingEvent(true);
    try {
      const created = await createGoogleCalendarEvent({
        summary: newEventTitle.trim(),
        startDate: newEventDate,
        startTime: newEventAllDay ? undefined : newEventStartTime,
        endTime: newEventAllDay ? undefined : newEventEndTime,
        allDay: newEventAllDay,
        location: newEventLocation.trim(),
        description: newEventDesc.trim(),
      });
      setGoogleEvents((prev) => [created, ...prev]);
      onToast?.(`✔ Event "${newEventTitle}" added to Google Calendar!`);
      setQuickAddModalOpen(false);
      setNewEventTitle('');
      setNewEventLocation('');
      setNewEventDesc('');
    } catch (err: any) {
      onToast?.(`Error adding event: ${err.message}`);
    } finally {
      setAddingEvent(false);
    }
  };

  // Helper to extract all calendar dates an event covers
  const getDatesForGoogleEvent = (ev: GoogleCalendarEvent): string[] => {
    const dates: string[] = [];
    if (ev.start?.date) {
      // All-day event (YYYY-MM-DD)
      const start = ev.start.date;
      const end = ev.end?.date;
      if (!end || end <= start) {
        dates.push(start);
      } else {
        // Google all-day end date is exclusive
        try {
          const curr = new Date(start + 'T00:00:00');
          const endObj = new Date(end + 'T00:00:00');
          while (curr < endObj) {
            dates.push(curr.toISOString().split('T')[0]);
            curr.setDate(curr.getDate() + 1);
          }
        } catch {
          dates.push(start);
        }
      }
    } else if (ev.start?.dateTime) {
      try {
        const startD = new Date(ev.start.dateTime);
        const y = startD.getFullYear();
        const m = String(startD.getMonth() + 1).padStart(2, '0');
        const d = String(startD.getDate()).padStart(2, '0');
        const startLocal = `${y}-${m}-${d}`;

        if (ev.end?.dateTime) {
          const endD = new Date(ev.end.dateTime);
          const curr = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
          const endDay = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate());

          if (curr.getTime() === endDay.getTime()) {
            dates.push(startLocal);
          } else {
            while (curr <= endDay) {
              const cy = curr.getFullYear();
              const cm = String(curr.getMonth() + 1).padStart(2, '0');
              const cd = String(curr.getDate()).padStart(2, '0');
              dates.push(`${cy}-${cm}-${cd}`);
              curr.setDate(curr.getDate() + 1);
            }
          }
        } else {
          dates.push(startLocal);
        }
      } catch {
        const raw = ev.start.dateTime.split('T')[0];
        if (raw) dates.push(raw);
      }
    }
    return dates;
  };

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
        return 'Timed';
      }
    }
    return 'All-Day';
  };

  // Collect painting jobs by day
  const dayJobsMap: Record<
    string,
    { customerName: string; customerId: number; job: JobProject; address?: string; phone?: string }[]
  > = {};

  customers.forEach((c) => {
    (c.jobs || []).forEach((j) => {
      const start = j.schedDate;
      const end = j.schedEndDate || j.schedDate;
      if (!start) return;

      for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (dateStr >= start && dateStr <= end) {
          if (!dayJobsMap[dateStr]) dayJobsMap[dateStr] = [];
          dayJobsMap[dateStr].push({
            customerName: c.name,
            customerId: c.id,
            job: j,
            address: c.address,
            phone: c.phone,
          });
        }
      }
    });
  });

  // Map Google Calendar events by day
  const googleDayMap: Record<string, GoogleCalendarEvent[]> = {};
  googleEvents.forEach((ev) => {
    const dates = getDatesForGoogleEvent(ev);
    dates.forEach((dStr) => {
      if (!googleDayMap[dStr]) googleDayMap[dStr] = [];
      googleDayMap[dStr].push(ev);
    });
  });

  // Build unified agenda items for the month
  interface AgendaItem {
    dateStr: string;
    isGoogle: boolean;
    color: string;
    title: string;
    subText?: string;
    timeText?: string;
    location?: string;
    googleEvent?: GoogleCalendarEvent;
    customerId?: number;
    customerName?: string;
    job?: JobProject;
    phone?: string;
    address?: string;
  }

  const agendaItems: AgendaItem[] = [];

  // Add painting jobs to agenda
  customers.forEach((c) => {
    (c.jobs || []).forEach((j) => {
      const start = j.schedDate;
      const end = j.schedEndDate || j.schedDate;
      if (!start) return;

      for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (dateStr >= start && dateStr <= end) {
          const color = j.status === 'ACTIVE' ? '#30d158' : j.status === 'SCHEDULED' ? '#0a84ff' : '#bf5af2';
          agendaItems.push({
            dateStr,
            isGoogle: false,
            color,
            title: `${c.name} - ${j.title || 'Painting Project'}`,
            subText: j.scope || 'Painting Project',
            location: c.address,
            customerId: c.id,
            customerName: c.name,
            job: j,
            phone: c.phone,
            address: c.address,
          });
        }
      }
    });
  });

  // Add Google events to agenda
  googleEvents.forEach((ev) => {
    const dates = getDatesForGoogleEvent(ev);
    dates.forEach((dStr) => {
      if (dStr.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
        agendaItems.push({
          dateStr: dStr,
          isGoogle: true,
          color: '#4285f4',
          title: ev.summary,
          subText: ev.description,
          timeText: formatGoogleTime(ev),
          location: ev.location,
          googleEvent: ev,
        });
      }
    });
  });

  agendaItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  // Single job launcher
  const handleAddJobToGoogleCalendar = (
    customerName: string,
    job: JobProject,
    address?: string,
    phone?: string,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    const url = createGoogleCalendarUrl(customerName, job, address, phone);
    window.open(url, '_blank');
    onToast?.(`✔ Opening Google Calendar for ${customerName}`);
  };

  return (
    <div className="space-y-3.5 max-w-2xl mx-auto pb-20 px-1 sm:px-0">
      {/* Google Calendar Status & Connection Card */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-md space-y-3">
        {/* Top Connection Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#4285f4]/15 border border-[#4285f4]/30 flex items-center justify-center shrink-0">
              <span className="text-xl">📅</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-black text-white">Google Calendar Sync</h2>
                {accessToken ? (
                  <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Live Phone Sync
                  </span>
                ) : (
                  <span className="bg-amber-950/80 text-amber-300 border border-amber-500/50 text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    Needs Google Login
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-[var(--text-muted)]">
                {accessToken
                  ? `Showing all phone & personal appointments (${googleEvents.length} events loaded)`
                  : 'Connect your Google account to view all calendar events from your phone in this app'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {accessToken ? (
              <>
                <button
                  type="button"
                  onClick={() => loadGoogleCalendar(accessToken)}
                  disabled={syncing}
                  className="px-2.5 py-1.5 bg-[#4285f4] hover:bg-[#3367d6] text-white text-xs font-black rounded-lg cursor-pointer flex items-center gap-1.5 shadow transition-transform active:scale-95 disabled:opacity-50"
                  title="Reload Google Calendar events"
                >
                  <span className={syncing ? 'animate-spin' : ''}>🔄</span>
                  <span>{syncing ? 'Syncing...' : 'Refresh'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewEventDate(new Date().toISOString().split('T')[0]);
                    setQuickAddModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)] text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1"
                  title="Add an event to your Google Calendar"
                >
                  <span>➕</span>
                  <span className="hidden sm:inline">Add Event</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogle}
                disabled={connectingGoogle}
                className="w-full sm:w-auto bg-white hover:bg-gray-100 text-gray-800 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-2 shadow-md border border-gray-300 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-3.5 h-3.5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span>{connectingGoogle ? 'Connecting...' : 'Sign in with Google'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSyncModalOpen(true)}
              className="px-2.5 py-1.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)] text-xs font-bold rounded-lg cursor-pointer"
              title="Calendar Export & Hub"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Sync error alert if any */}
        {syncError && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-2">
            <span>⚠️ {syncError}</span>
            <button
              type="button"
              onClick={handleConnectGoogle}
              className="text-[10px] font-bold text-amber-300 underline hover:text-white cursor-pointer shrink-0"
            >
              Reconnect
            </button>
          </div>
        )}

        {/* Connection status line */}
        {accessToken && currentUser && (
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
            <span className="truncate">
              👤 Account: <strong className="text-white">{currentUser.email || 'Google User'}</strong>
            </span>
            {lastSyncedTime && <span>Last checked: {lastSyncedTime}</span>}
          </div>
        )}

        {/* Mode Toggle: Grid vs Agenda */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border)]">
          <div className="flex bg-[var(--surface-subtle)] p-0.5 rounded-lg border border-[var(--border)] text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('GRID')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-[10.5px] sm:text-xs font-bold ${
                viewMode === 'GRID'
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              📅 Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('AGENDA')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-[10.5px] sm:text-xs font-bold ${
                viewMode === 'AGENDA'
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              📋 All Events ({agendaItems.length})
            </button>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="px-2.5 py-1 bg-[var(--surface-subtle)] hover:bg-[var(--border)] rounded-md text-[11px] font-bold text-[var(--text)] cursor-pointer"
            >
              ←
            </button>
            <span className="font-extrabold text-xs sm:text-sm text-[var(--accent)] tracking-wide">
              {monthNames[month].slice(0, 3)} {year}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="px-2.5 py-1 bg-[var(--surface-subtle)] hover:bg-[var(--border)] rounded-md text-[11px] font-bold text-[var(--text)] cursor-pointer"
            >
              →
            </button>
          </div>
        </div>

        {/* MONTH GRID VIEW */}
        {viewMode === 'GRID' && (
          <div className="space-y-1">
            {/* Days of week header */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center mb-0.5">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div
                  key={i}
                  className="text-[9px] sm:text-[10px] uppercase font-extrabold text-[var(--text-muted)] py-0.5"
                >
                  <span className="sm:hidden">{d}</span>
                  <span className="hidden sm:inline">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}
                  </span>
                </div>
              ))}
            </div>

            {/* Calendar Grid Days */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
              {/* Empty leading cells */}
              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[52px] sm:min-h-[75px] bg-transparent opacity-20" />
              ))}

              {/* Day cells */}
              {Array.from({ length: totalDaysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const jobsToday = dayJobsMap[dateStr] || [];
                const gEventsToday = googleDayMap[dateStr] || [];
                const totalItemsCount = jobsToday.length + gEventsToday.length;
                const hasItems = totalItemsCount > 0;

                return (
                  <div
                    key={`day-${dayNum}`}
                    onClick={() => onOpenDayPopup(dateStr, jobsToday, gEventsToday)}
                    className={`min-h-[52px] sm:min-h-[75px] p-1 rounded-lg border flex flex-col justify-start gap-0.5 cursor-pointer transition-all active:scale-95 ${
                      hasItems
                        ? 'bg-[var(--surface-subtle)] border-[#4285f4]/50 shadow-xs'
                        : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--accent)]'
                    }`}
                  >
                    <div className="text-[9px] sm:text-[10px] font-bold text-[var(--text)] px-0.5 flex items-center justify-between">
                      <span>{dayNum}</span>
                      {hasItems && (
                        <span className="flex items-center gap-0.5">
                          {jobsToday.length > 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#30d158]" title="Painting Project" />
                          )}
                          {gEventsToday.length > 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4285f4]" title="Google Calendar Event" />
                          )}
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5 overflow-hidden">
                      {/* Render Google Calendar events (Blue pills) */}
                      {gEventsToday.slice(0, 1).map((ev) => (
                        <div
                          key={`g-${ev.id}`}
                          className="bg-[#4285f4] text-white text-[7px] sm:text-[8px] font-extrabold px-1 py-0.2 rounded truncate leading-tight shadow-xs flex items-center gap-0.5"
                          title={`Google: ${ev.summary}`}
                        >
                          <span>🗓️</span>
                          <span className="truncate">{ev.summary}</span>
                        </div>
                      ))}

                      {/* Render Painting jobs (Status color pills) */}
                      {jobsToday.slice(0, gEventsToday.length > 0 ? 1 : 2).map((item, idx) => {
                        const tagBg =
                          item.job.status === 'ACTIVE'
                            ? '#30d158'
                            : item.job.status === 'SCHEDULED'
                            ? '#0a84ff'
                            : '#bf5af2';
                        return (
                          <div
                            key={`j-${idx}`}
                            style={{ backgroundColor: tagBg }}
                            className="text-[7px] sm:text-[8px] font-bold text-white px-1 py-0.2 rounded truncate shadow-xs leading-tight"
                            title={`${item.customerName}: ${item.job.title || item.job.status}`}
                          >
                            {item.customerName}
                          </div>
                        );
                      })}

                      {/* Show remaining overflow count */}
                      {totalItemsCount > 2 && (
                        <div className="text-[6.5px] sm:text-[7.5px] text-[#4285f4] font-black px-0.5">
                          +{totalItemsCount - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AGENDA LIST VIEW */}
        {viewMode === 'AGENDA' && (
          <div className="space-y-2 pt-1">
            {agendaItems.map((item, i) => (
              <div
                key={i}
                className="bg-[var(--bg)] border border-[var(--border)] p-2.5 sm:p-3 rounded-xl space-y-1.5 shadow-xs"
                style={{ borderLeft: `4px solid ${item.color}` }}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] sm:text-xs font-black text-[var(--accent)] shrink-0">
                      [{item.dateStr}]
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-[var(--text)] truncate">
                      {item.title}
                    </span>
                  </div>

                  <span
                    style={{ backgroundColor: item.color }}
                    className="text-[8px] font-black uppercase px-2 py-0.5 rounded text-white shrink-0"
                  >
                    {item.isGoogle ? 'Google Cal' : item.job?.status || 'Scheduled'}
                  </span>
                </div>

                {item.timeText && (
                  <div className="text-[10.5px] font-bold text-[#8ab4f8] flex items-center gap-1">
                    <span>🕒 {item.timeText}</span>
                  </div>
                )}

                {item.location && (
                  <div className="text-[10px] text-[var(--text-muted)] truncate flex items-center gap-1">
                    <span>📍</span>
                    <span>{item.location}</span>
                  </div>
                )}

                {item.subText && (
                  <p className="text-[10px] text-[var(--text-muted)] line-clamp-2">
                    {item.subText}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-1.5 pt-1">
                  {item.isGoogle && item.googleEvent && (
                    <>
                      {item.googleEvent.htmlLink && (
                        <a
                          href={item.googleEvent.htmlLink}
                          target="_blank"
                          rel="noreferrer"
                          className="py-1 px-2.5 bg-[#4285f4] hover:bg-[#3367d6] text-white text-[10px] font-extrabold rounded-lg flex items-center gap-1 shadow cursor-pointer transition active:scale-95"
                        >
                          <span>Open in Google Cal ➔</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteGoogleEvent(item.googleEvent!.id, item.googleEvent!.summary)
                        }
                        className="py-1 px-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded-lg border border-red-500/30 cursor-pointer ml-auto"
                      >
                        🗑️ Delete
                      </button>
                    </>
                  )}

                  {!item.isGoogle && item.job && item.customerName && (
                    <>
                      <button
                        type="button"
                        onClick={(e) =>
                          handleAddJobToGoogleCalendar(
                            item.customerName!,
                            item.job!,
                            item.address,
                            item.phone,
                            e
                          )
                        }
                        className="py-1 px-2.5 bg-[#4285f4] hover:bg-[#3367d6] text-white font-extrabold text-[10px] rounded-lg cursor-pointer flex items-center gap-1 shadow transition-transform active:scale-95"
                        title="Add to Google Calendar"
                      >
                        <span>📅</span>
                        <span>Add to Google Cal</span>
                      </button>

                      {item.customerId && (
                        <button
                          type="button"
                          onClick={() => onOpenFolder(item.customerId!)}
                          className="py-1 px-2.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-[10px] rounded-lg cursor-pointer ml-auto"
                        >
                          Open Folder ➔
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            {agendaItems.length === 0 && (
              <div className="text-center py-8 text-xs text-[var(--text-muted)] bg-[var(--bg)] rounded-xl border border-[var(--border)]">
                No events or appointments scheduled for {monthNames[month]} {year}.
              </div>
            )}
          </div>
        )}

        {/* Sync Controls & Export footer */}
        <div className="pt-2 border-t border-[var(--border)] flex flex-wrap justify-between items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)]">
            💡 Tap any day on the grid to inspect details and synced events
          </span>
          <button
            type="button"
            onClick={onExportAllJobsIcs}
            className="px-2.5 py-1 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[10px] font-bold text-[var(--accent)] rounded-lg cursor-pointer flex items-center gap-1"
          >
            <span>📥</span>
            <span>Export Phone Sync (.ICS)</span>
          </button>
        </div>
      </div>

      {/* Quick Add Event to Google Calendar Modal */}
      {quickAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-[#121318] border-2 border-[#4285f4] rounded-2xl w-full max-w-md p-4 sm:p-5 shadow-2xl space-y-3.5 my-auto">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                <div>
                  <h3 className="text-sm font-black text-white">Add Event to Google Calendar</h3>
                  <p className="text-[10px] text-gray-400">Syncs immediately to your phone&apos;s Google Calendar</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickAddModalOpen(false)}
                className="text-gray-400 hover:text-white font-bold text-xs px-2.5 py-1 bg-[#1c1d25] rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuickEvent} className="space-y-3 text-xs text-gray-200">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                  Event Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paint consultation or Estimate walk-through"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full bg-[#1c1d25] border border-[var(--border)] text-white rounded-xl px-3 py-2 text-xs outline-none focus:border-[#4285f4]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full bg-[#1c1d25] border border-[var(--border)] text-white rounded-xl px-3 py-2 text-xs outline-none focus:border-[#4285f4]"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-300">
                    <input
                      type="checkbox"
                      checked={newEventAllDay}
                      onChange={(e) => setNewEventAllDay(e.target.checked)}
                      className="w-4 h-4 accent-[#4285f4] cursor-pointer"
                    />
                    <span>All-Day Event</span>
                  </label>
                </div>
              </div>

              {!newEventAllDay && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={newEventStartTime}
                      onChange={(e) => setNewEventStartTime(e.target.value)}
                      className="w-full bg-[#1c1d25] border border-[var(--border)] text-white rounded-xl px-3 py-2 text-xs outline-none focus:border-[#4285f4]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={newEventEndTime}
                      onChange={(e) => setNewEventEndTime(e.target.value)}
                      className="w-full bg-[#1c1d25] border border-[var(--border)] text-white rounded-xl px-3 py-2 text-xs outline-none focus:border-[#4285f4]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                  Location (Job Site / Address)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1244 Maple St, West Bend, WI"
                  value={newEventLocation}
                  onChange={(e) => setNewEventLocation(e.target.value)}
                  className="w-full bg-[#1c1d25] border border-[var(--border)] text-white rounded-xl px-3 py-2 text-xs outline-none focus:border-[#4285f4]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                  Notes &amp; Details
                </label>
                <textarea
                  rows={2}
                  placeholder="Customer contact, paint codes, site notes..."
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  className="w-full bg-[#1c1d25] border border-[var(--border)] text-white rounded-xl px-3 py-2 text-xs outline-none focus:border-[#4285f4]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setQuickAddModalOpen(false)}
                  className="w-full py-2.5 bg-[#1c1d25] text-gray-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingEvent}
                  className="w-full py-2.5 bg-[#4285f4] hover:bg-[#3367d6] text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition active:scale-95 disabled:opacity-50"
                >
                  {addingEvent ? 'Adding...' : 'Save to Google Cal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Google Calendar Sync Options Modal */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in">
          <div className="bg-[#121318] border-2 border-[#4285f4] rounded-2xl w-full max-w-md p-3.5 sm:p-5 shadow-2xl space-y-3 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                <div>
                  <h3 className="text-sm font-black text-white">Google Calendar Sync Hub</h3>
                  <p className="text-[10px] text-gray-400">Sync directly with your phone&apos;s Google Calendar</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSyncModalOpen(false)}
                className="text-gray-400 hover:text-white font-bold text-xs px-2.5 py-1 bg-[#1c1d25] rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-300">
              {/* Option 1: 1-Tap Add to Google Calendar for scheduled jobs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#4285f4]">
                    ⚡ 1-Tap Add to Google Calendar
                  </span>
                  <span className="text-[10px] text-gray-400 font-bold">
                    {customers.flatMap((c) => (c.jobs || []).filter((j) => j.schedDate)).length} jobs scheduled
                  </span>
                </div>

                {customers.flatMap((c) =>
                  (c.jobs || [])
                    .filter((j) => j.schedDate)
                    .map((j) => ({ customer: c, job: j }))
                ).length > 0 ? (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {customers
                      .flatMap((c) =>
                        (c.jobs || [])
                          .filter((j) => j.schedDate)
                          .map((j) => ({ customer: c, job: j }))
                      )
                      .sort((a, b) => (a.job.schedDate || '').localeCompare(b.job.schedDate || ''))
                      .map((item, idx) => {
                        const gUrl = createGoogleCalendarUrl(
                          item.customer.name,
                          item.job,
                          item.customer.address,
                          item.customer.phone
                        );
                        return (
                          <div
                            key={idx}
                            className="p-2.5 bg-[#1c1d25] rounded-xl border border-[var(--border)] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-extrabold text-xs text-white truncate">
                                {item.customer.name}
                              </div>
                              <div className="text-[10px] text-gray-400 flex items-center gap-1.5 flex-wrap">
                                <span className="text-[#30d158] font-bold">
                                  📅 {item.job.schedDate}
                                </span>
                                {item.job.title && (
                                  <span className="truncate text-gray-300">• {item.job.title}</span>
                                )}
                              </div>
                              {item.customer.address && (
                                <div className="text-[9px] text-gray-500 truncate">
                                  📍 {item.customer.address}
                                </div>
                              )}
                            </div>

                            <a
                              href={gUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 bg-[#4285f4] hover:bg-[#3367d6] text-white font-extrabold text-[10px] rounded-lg cursor-pointer flex items-center gap-1 shrink-0 shadow transition-transform active:scale-95"
                              title="Add directly into Google Calendar app"
                            >
                              <span>📅</span>
                              <span className="truncate">Add to Cal</span>
                            </a>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="p-3 bg-[#1c1d25] rounded-xl text-center text-[11px] text-gray-400 border border-[var(--border)]">
                    No scheduled jobs found with dates yet. Open any project or customer folder to set a scheduled start date.
                  </div>
                )}
              </div>

              {/* Option 2: Full Phone Calendar Sync (.ICS File) */}
              <div className="p-3 bg-[#1c1d25] rounded-xl border border-[var(--border)] space-y-1.5">
                <div className="font-extrabold text-white flex items-center gap-1.5">
                  <span>📥</span>
                  <span>Export All Jobs (.ICS Phone Sync)</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Downloads an .ics file containing all client dates, site locations, and job notes. Tap the downloaded file in your phone notification bar to import into Google Calendar.
                </p>
                <button
                  type="button"
                  onClick={onExportAllJobsIcs}
                  className="w-full py-2 bg-[#252733] hover:bg-[#2e3140] text-white font-black text-xs rounded-lg border border-[var(--border)] shadow cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <span>📥</span>
                  <span>Download .ICS Calendar File</span>
                </button>
              </div>

              {/* Option 3: Direct Google Calendar Web Link */}
              <a
                href="https://calendar.google.com/calendar"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 bg-[#1c1d25] hover:bg-[#253252] border border-[#4285f4]/30 text-[#8ab4f8] font-extrabold text-xs rounded-xl text-center block cursor-pointer"
              >
                🌐 Open Google Calendar App / Web ➔
              </a>
            </div>

            <button
              type="button"
              onClick={() => setSyncModalOpen(false)}
              className="w-full py-2.5 bg-[#252733] hover:bg-[#2e3140] text-gray-300 font-bold text-xs rounded-xl cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
