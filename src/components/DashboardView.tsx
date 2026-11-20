import React, { useState, useRef, useMemo } from 'react';
import { Customer, JobProject, LocationInfo, WeatherCondition } from '../types';
import {
  PipelineStage,
  PIPELINE_STAGE_META,
  getCustomerPipelineStage,
  isJobEligibleForScheduledList,
  isJobCompletedOrPaid,
  parseLocalDateMs,
  formatScheduledDate,
  getLocalTodayIso,
} from '../utils/projectHelpers';

interface DashboardViewProps {
  customers: Customer[];
  currentLocation: LocationInfo;
  currentWeather: WeatherCondition | null;
  isFollowingGps?: boolean;
  onToggleFollowMe?: (follow: boolean) => void;
  onOpenWeatherHub: () => void;
  onOpenNewCustomer: () => void;
  onOpenFolder: (customerId: number) => void;
  onTogglePin: (customerId: number, e: React.MouseEvent) => void;
}

interface ScheduledQuickItem {
  key: string;
  customer: Customer;
  job?: JobProject;
  schedDate: string;
  sortMs: number | null;
}

const TOP_CARD_LIMIT = 3;

export const DashboardView: React.FC<DashboardViewProps> = ({
  customers,
  currentLocation,
  currentWeather,
  isFollowingGps = true,
  onToggleFollowMe,
  onOpenWeatherHub,
  onOpenNewCustomer,
  onOpenFolder,
  onTogglePin,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [folderExpanded, setFolderExpanded] = useState<Record<string, boolean>>({});
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | PipelineStage>('ALL');
  const folderListRef = useRef<HTMLDivElement | null>(null);

  // Active & Scheduled open by default; Pending & Complete / Paid collapsed by default
  const [folderOpenState, setFolderOpenState] = useState<Record<string, boolean>>({
    pinned: true,
    active: true,
    scheduled: true,
    pending: false,
    completed: false,
  });

  const todayStr = getLocalTodayIso();
  const todayMs = parseLocalDateMs(todayStr) ?? 0;

  // Filter customers live by client name or street address (plus phone convenience)
  const q = searchQuery.toLowerCase().trim();
  const filtered = useMemo(() => {
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
    );
  }, [customers, q]);

  // Helper: earliest upcoming scheduled date for a customer (strictly excludes Completed/Paid jobs)
  const getCustomerNextSchedDate = (c: Customer): string => {
    const datedJobs = (c.jobs || [])
      .filter((j) => isJobEligibleForScheduledList(c, j) && Boolean(j.schedDate?.trim()))
      .sort((a, b) => {
        const msA = parseLocalDateMs(a.schedDate) ?? Number.MAX_SAFE_INTEGER;
        const msB = parseLocalDateMs(b.schedDate) ?? Number.MAX_SAFE_INTEGER;
        return msA - msB;
      });
    return datedJobs.length > 0 ? datedJobs[0].schedDate : '';
  };

  // Group filtered customers into the 4 clean pipeline stages + independent Pinned list
  const { pinnedCusts, activeCusts, scheduledCusts, pendingCusts, completedCusts } = useMemo(() => {
    const pinned: Customer[] = [];
    const active: Customer[] = [];
    const scheduled: Customer[] = [];
    const pending: Customer[] = [];
    const completed: Customer[] = [];

    filtered.forEach((c) => {
      if (c.isPinned) {
        pinned.push(c);
      }

      const stage = getCustomerPipelineStage(c);
      if (stage === 'ACTIVE') active.push(c);
      else if (stage === 'SCHEDULED') scheduled.push(c);
      else if (stage === 'PENDING') pending.push(c);
      else completed.push(c);
    });

    // Prioritize pinned customers first, then most recently active
    const sortPinnedThenActive = (a: Customer, b: Customer) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }
      return (b.lastActive || 0) - (a.lastActive || 0);
    };

    // For Scheduled folder: pinned first, then soonest scheduled date chronologically
    const sortScheduledFolder = (a: Customer, b: Customer) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }
      const msA = parseLocalDateMs(getCustomerNextSchedDate(a));
      const msB = parseLocalDateMs(getCustomerNextSchedDate(b));
      if (msA !== null && msB !== null && msA !== msB) return msA - msB;
      if (msA !== null && msB === null) return -1;
      if (msA === null && msB !== null) return 1;
      return (b.lastActive || 0) - (a.lastActive || 0);
    };

    pinned.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
    active.sort(sortPinnedThenActive);
    scheduled.sort(sortScheduledFolder);
    pending.sort(sortPinnedThenActive);
    completed.sort(sortPinnedThenActive);

    return {
      pinnedCusts: pinned,
      activeCusts: active,
      scheduledCusts: scheduled,
      pendingCusts: pending,
      completedCusts: completed,
    };
  }, [filtered]);

  // Overall (unfiltered) stage counts for top KPI tiles
  const stageCounts = useMemo(() => {
    const counts: Record<PipelineStage, number> = {
      ACTIVE: 0,
      SCHEDULED: 0,
      PENDING: 0,
      COMPLETED: 0,
    };
    customers.forEach((c) => {
      counts[getCustomerPipelineStage(c)] += 1;
    });
    return counts;
  }, [customers]);

  // Strictly chronologically sorted Scheduled Jobs Quick List (soonest date first)
  // Strictly filters out Complete, Completed, Paid, and Complete / Paid jobs
  const chronologicalScheduledJobs = useMemo<ScheduledQuickItem[]>(() => {
    const items: ScheduledQuickItem[] = [];

    customers.forEach((cust) => {
      if (
        cust.statusOverride &&
        cust.statusOverride !== 'AUTO' &&
        isJobCompletedOrPaid(cust.statusOverride)
      ) {
        return;
      }

      const custSchedJobs = (cust.jobs || []).filter((j) =>
        isJobEligibleForScheduledList(cust, j)
      );

      if (custSchedJobs.length > 0) {
        custSchedJobs.forEach((job) => {
          items.push({
            key: `${cust.id}-${job.id}`,
            customer: cust,
            job,
            schedDate: job.schedDate || '',
            sortMs: parseLocalDateMs(job.schedDate),
          });
        });
      } else if (getCustomerPipelineStage(cust) === 'SCHEDULED') {
        const allDone =
          (cust.jobs || []).length > 0 &&
          (cust.jobs || []).every((j) => isJobCompletedOrPaid(j.status));
        if (!allDone) {
          items.push({
            key: `${cust.id}-override`,
            customer: cust,
            schedDate: '',
            sortMs: null,
          });
        }
      }
    });

    items.sort((a, b) => {
      if (a.sortMs !== null && b.sortMs !== null) {
        if (a.sortMs !== b.sortMs) return a.sortMs - b.sortMs;
        return a.customer.name.localeCompare(b.customer.name);
      }
      if (a.sortMs !== null) return -1;
      if (b.sortMs !== null) return 1;
      return a.customer.name.localeCompare(b.customer.name);
    });

    return items;
  }, [customers]);

  const toggleFolderOpen = (key: string) => {
    setFolderOpenState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleFolderExpanded = (key: string) => {
    setFolderExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStatTileClick = (stage: PipelineStage) => {
    const folderKey =
      stage === 'ACTIVE'
        ? 'active'
        : stage === 'SCHEDULED'
        ? 'scheduled'
        : stage === 'PENDING'
        ? 'pending'
        : 'completed';

    setSelectedFilter((prev) => (prev === stage ? 'ALL' : stage));
    setFolderOpenState((prev) => ({ ...prev, [folderKey]: true }));
    setTimeout(() => {
      folderListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const renderCustomerCard = (c: Customer, keyPrefix: string) => {
    const stage = getCustomerPipelineStage(c);
    const meta = PIPELINE_STAGE_META[stage];
    const nextSchedDate = getCustomerNextSchedDate(c);
    const isTodayWork = Boolean(nextSchedDate && nextSchedDate === todayStr);
    const mapUrl = `http://maps.google.com/?q=${encodeURIComponent(c.address || '')}`;

    return (
      <div
        key={`${keyPrefix}-${c.id}`}
        className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 hover:border-[#f1c40f] transition-all"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div
            onClick={() => onOpenFolder(c.id)}
            className="flex-1 cursor-pointer hover:opacity-85 transition-opacity min-w-0"
          >
            <div className="font-extrabold text-xs text-[var(--text)] flex items-center gap-1.5">
              {c.isPinned && <span className="text-[#f1c40f]" title="Pinned Priority">★</span>}
              <span className="truncate">{c.name}</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] line-clamp-1">
              {c.address || 'No address logged'}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => onTogglePin(c.id, e)}
              aria-label={c.isPinned ? 'Unpin customer' : 'Pin customer to top'}
              className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded border transition-all cursor-pointer active:scale-95 ${
                c.isPinned
                  ? 'bg-[#f1c40f] text-[#231709] border-[#f1c40f] shadow-xs'
                  : 'bg-transparent text-[var(--text-muted)] border-[var(--border)] hover:border-[#f1c40f] hover:text-[#f1c40f]'
              }`}
            >
              {c.isPinned ? '★ Pinned' : '☆ Pin'}
            </button>

            {isTodayWork && (
              <span className="bg-red-500 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded">
                TODAY
              </span>
            )}

            {nextSchedDate && (
              <span className="bg-[#0a84ff]/15 text-[#60a5fa] border border-[#0a84ff]/35 text-[8.5px] font-bold px-1.5 py-0.5 rounded">
                📅 {formatScheduledDate(nextSchedDate)}
              </span>
            )}

            <span
              style={{ backgroundColor: meta.color, color: meta.textColor }}
              className="text-[8px] font-black uppercase px-2 py-0.5 rounded"
            >
              {meta.label}
            </span>
          </div>
        </div>

        {/* Quick Call, Text, Map Bar */}
        <div className="flex gap-1.5 mt-2.5 pt-2 border-t border-dashed border-[var(--border)]">
          <a
            href={`tel:${c.phone || ''}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-center py-1 bg-[var(--surface-subtle)] hover:bg-[var(--accent)] hover:text-white rounded border border-[var(--border)] text-[10px] font-bold text-[var(--text)] transition-colors"
          >
            📞 Call
          </a>
          <a
            href={`sms:${c.phone || ''}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-center py-1 bg-[var(--surface-subtle)] hover:bg-[var(--accent)] hover:text-white rounded border border-[var(--border)] text-[10px] font-bold text-[var(--text)] transition-colors"
          >
            💬 Text
          </a>
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-center py-1 bg-[var(--surface-subtle)] hover:bg-[var(--accent)] hover:text-white rounded border border-[var(--border)] text-[10px] font-bold text-[var(--text)] transition-colors"
          >
            🗺️ Map
          </a>
        </div>
      </div>
    );
  };

  const renderFolderGroup = (
    key: 'pinned' | 'active' | 'scheduled' | 'pending' | 'completed',
    title: string,
    colorBorder: string,
    list: Customer[],
    emptyDesc: string,
    stageFilterMatch?: PipelineStage
  ) => {
    if (selectedFilter !== 'ALL') {
      if (key === 'pinned') return null;
      if (stageFilterMatch && selectedFilter !== stageFilterMatch) return null;
    }

    // Hide empty folders unless user explicitly selected that filter tab
    if (list.length === 0) {
      if (selectedFilter !== 'ALL' && stageFilterMatch === selectedFilter) {
        return (
          <div
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center mb-3 shadow-sm"
            style={{ borderLeft: `4px solid ${colorBorder}` }}
          >
            <div className="font-extrabold text-xs text-[var(--text)] mb-1">{title}</div>
            <p className="text-[11px] text-[var(--text-muted)] max-w-sm mx-auto">{emptyDesc}</p>
          </div>
        );
      }
      return null;
    }

    const isOpen = q.length > 0 || selectedFilter !== 'ALL' || !!folderOpenState[key];
    const isExpanded = q.length > 0 || !!folderExpanded[key];
    const shouldCapAtThree = key !== 'pinned' && !isExpanded && list.length > TOP_CARD_LIMIT;
    const visibleItems = shouldCapAtThree ? list.slice(0, TOP_CARD_LIMIT) : list;

    return (
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm transition-all mb-3"
        style={{ borderLeft: `4px solid ${colorBorder}` }}
      >
        <button
          type="button"
          onClick={() => toggleFolderOpen(key)}
          className="w-full bg-[var(--surface-subtle)] px-4 py-3 font-bold text-xs text-[var(--text)] flex justify-between items-center cursor-pointer select-none text-left hover:bg-[var(--border)] transition-colors"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            <span className="bg-[#2c2317] text-[#f1c40f] text-[10px] font-black px-2 py-0.5 rounded-full border border-[#f1c40f]/30">
              {list.length}
            </span>
            {isOpen && shouldCapAtThree && (
              <span className="text-[10px] text-[var(--text-muted)] font-normal">
                (showing top {TOP_CARD_LIMIT} of {list.length})
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold text-[var(--text-muted)]">
            {isOpen ? '▲' : '▼'}
          </span>
        </button>

        {isOpen && (
          <div className="p-3 space-y-2">
            {visibleItems.map((c) => renderCustomerCard(c, key))}

            {/* Show All (X) / Show Top 3 Toggle */}
            {key !== 'pinned' && list.length > TOP_CARD_LIMIT && q.length === 0 && (
              <button
                type="button"
                onClick={() => toggleFolderExpanded(key)}
                className="w-full py-2.5 bg-[#1c1d25] hover:bg-[#252733] border border-dashed border-[#f1c40f]/60 hover:border-[#f1c40f] rounded-lg text-xs font-black uppercase tracking-wider text-[#f1c40f] cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm mt-1"
              >
                <span>{isExpanded ? '▲' : '▼'}</span>
                <span>
                  {isExpanded ? `Show Top ${TOP_CARD_LIMIT}` : `Show All (${list.length})`}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3.5 max-w-2xl mx-auto pb-20">
      {/* Weather Header Bar */}
      <div
        onClick={onOpenWeatherHub}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-3.5 shadow-sm border-l-4 border-l-[#f1c40f] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer hover:border-[#f1c40f] transition-all active:scale-[0.99]"
        title="Tap for 7-day contractor weather hub"
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5 flex-wrap">
            {isFollowingGps ? (
              <span className="flex items-center gap-1 bg-[#1c2e1f] text-[#30d158] border border-[#30d158]/40 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black uppercase shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse"></span>
                🛰️ Live GPS
              </span>
            ) : (
              <span className="bg-[#2c2317] text-[#f1c40f] border border-[#f1c40f]/40 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold shrink-0">
                📍 Fixed Loc
              </span>
            )}

            <span className="font-extrabold truncate">
              {currentWeather
                ? `${currentLocation.name}: ${currentWeather.temp}°F • 💨 ${currentWeather.windSpeed} mph`
                : `${currentLocation.name} Weather`}
            </span>
          </div>

          <div className="text-[10px] sm:text-[11px] text-[var(--text-muted)] mt-1 flex items-center gap-2 flex-wrap">
            <span className="truncate">
              {currentWeather ? currentWeather.conditionText : 'Tap for spray forecast'}
            </span>
            {onToggleFollowMe && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFollowMe(!isFollowingGps);
                }}
                className={`text-[8.5px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors shrink-0 ${
                  isFollowingGps
                    ? 'bg-[#121318] text-gray-400 hover:text-white border-[var(--border)]'
                    : 'bg-[#30d158] text-white border-[#30d158] font-black'
                }`}
              >
                {isFollowingGps ? 'Pause GPS' : '🛰️ Resume GPS'}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-[var(--border)]">
          {currentWeather && (
            <span
              style={{ backgroundColor: currentWeather.badgeBg }}
              className="text-[8.5px] sm:text-[9px] font-extrabold uppercase px-2 py-0.5 rounded text-white shadow-xs"
            >
              {currentWeather.badgeText}
            </span>
          )}
          <span className="text-xs text-[#f1c40f] font-bold">➔</span>
        </div>
      </div>

      {/* 4 Clean Pipeline Stage Stat Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
        {/* Active */}
        <button
          type="button"
          onClick={() => handleStatTileClick('ACTIVE')}
          className={`bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border p-2.5 sm:p-3 rounded-xl border-l-4 border-l-[#30d158] shadow-xs text-left transition-all active:scale-95 cursor-pointer ${
            selectedFilter === 'ACTIVE' ? 'ring-2 ring-[#30d158] border-[#30d158]' : 'border-[var(--border)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-2xl font-black text-[#30d158] block leading-none">
              {stageCounts.ACTIVE}
            </span>
            <span className="text-xs">🎨</span>
          </div>
          <span className="text-[9.5px] sm:text-[10px] uppercase font-extrabold text-[var(--text)] tracking-wider mt-1 block truncate">
            Active
          </span>
          <span className="text-[8.5px] sm:text-[9px] text-[var(--text-muted)] truncate block">
            In progress
          </span>
        </button>

        {/* Scheduled */}
        <button
          type="button"
          onClick={() => handleStatTileClick('SCHEDULED')}
          className={`bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border p-2.5 sm:p-3 rounded-xl border-l-4 border-l-[#0a84ff] shadow-xs text-left transition-all active:scale-95 cursor-pointer ${
            selectedFilter === 'SCHEDULED' ? 'ring-2 ring-[#0a84ff] border-[#0a84ff]' : 'border-[var(--border)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-2xl font-black text-[#0a84ff] block leading-none">
              {stageCounts.SCHEDULED}
            </span>
            <span className="text-xs">📅</span>
          </div>
          <span className="text-[9.5px] sm:text-[10px] uppercase font-extrabold text-[var(--text)] tracking-wider mt-1 block truncate">
            Scheduled
          </span>
          <span className="text-[8.5px] sm:text-[9px] text-[var(--text-muted)] truncate block">
            Upcoming jobs
          </span>
        </button>

        {/* Pending */}
        <button
          type="button"
          onClick={() => handleStatTileClick('PENDING')}
          className={`bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border p-2.5 sm:p-3 rounded-xl border-l-4 border-l-[#f1c40f] shadow-xs text-left transition-all active:scale-95 cursor-pointer ${
            selectedFilter === 'PENDING' ? 'ring-2 ring-[#f1c40f] border-[#f1c40f]' : 'border-[var(--border)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-2xl font-black text-[#f1c40f] block leading-none">
              {stageCounts.PENDING}
            </span>
            <span className="text-xs">⏳</span>
          </div>
          <span className="text-[9.5px] sm:text-[10px] uppercase font-extrabold text-[var(--text)] tracking-wider mt-1 block truncate">
            Pending
          </span>
          <span className="text-[8.5px] sm:text-[9px] text-[var(--text-muted)] truncate block">
            Estimates &amp; leads
          </span>
        </button>

        {/* Complete / Paid */}
        <button
          type="button"
          onClick={() => handleStatTileClick('COMPLETED')}
          className={`bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border p-2.5 sm:p-3 rounded-xl border-l-4 border-l-[#38bdf8] shadow-xs text-left transition-all active:scale-95 cursor-pointer ${
            selectedFilter === 'COMPLETED' ? 'ring-2 ring-[#38bdf8] border-[#38bdf8]' : 'border-[var(--border)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-2xl font-black text-[#38bdf8] block leading-none">
              {stageCounts.COMPLETED}
            </span>
            <span className="text-xs">✅</span>
          </div>
          <span className="text-[9.5px] sm:text-[10px] uppercase font-extrabold text-[var(--text)] tracking-wider mt-1 block truncate">
            Complete / Paid
          </span>
          <span className="text-[8.5px] sm:text-[9px] text-[var(--text-muted)] truncate block">
            Finished jobs
          </span>
        </button>
      </div>

      {/* Quick Action Bar (+ Add New Customer) */}
      <button
        type="button"
        onClick={onOpenNewCustomer}
        className="w-full py-3 bg-[#f1c40f] hover:bg-[#d4ac0d] text-[#231709] font-black text-xs rounded-xl shadow-md cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-2"
      >
        <span>➕</span>
        <span>Add New Customer</span>
      </button>

      {/* Customer Section Header + Fast Live Search Bar */}
      <div ref={folderListRef} className="space-y-2.5 pt-1">
        <div className="relative">
          <input
            type="text"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Search clients by name or street address..."
            className="w-full bg-[var(--surface)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded-xl pl-4 pr-10 py-3 text-sm outline-none shadow-sm transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[var(--text-muted)] hover:text-[var(--text)] px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Pipeline Stage Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setSelectedFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex-shrink-0 ${
              selectedFilter === 'ALL'
                ? 'bg-[#f1c40f] text-[#231709] font-black'
                : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            All Clients ({filtered.length})
          </button>

          <button
            type="button"
            onClick={() => setSelectedFilter('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
              selectedFilter === 'ACTIVE'
                ? 'bg-[#30d158] text-white'
                : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            <span>🎨</span>
            <span>Active ({activeCusts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFilter('SCHEDULED')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
              selectedFilter === 'SCHEDULED'
                ? 'bg-[#0a84ff] text-white'
                : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            <span>📅</span>
            <span>Scheduled ({scheduledCusts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
              selectedFilter === 'PENDING'
                ? 'bg-[#f1c40f] text-[#231709] font-black'
                : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            <span>⏳</span>
            <span>Pending ({pendingCusts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFilter('COMPLETED')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
              selectedFilter === 'COMPLETED'
                ? 'bg-[#38bdf8] text-[#0c1926] font-black'
                : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            <span>✅</span>
            <span>Complete / Paid ({completedCusts.length})</span>
          </button>
        </div>

        {/* Customer Folders: Pinned at top, then 4 clean pipeline stages */}
        <div className="space-y-1">
          {renderFolderGroup(
            'pinned',
            '★ Pinned Priority Customers',
            '#f1c40f',
            pinnedCusts,
            'No pinned priority customers.'
          )}
          {renderFolderGroup(
            'active',
            '🎨 Active Jobs',
            '#30d158',
            activeCusts,
            'No active jobs in progress right now.',
            'ACTIVE'
          )}
          {renderFolderGroup(
            'scheduled',
            '📅 Scheduled Jobs',
            '#0a84ff',
            scheduledCusts,
            'No scheduled jobs yet. Add a start date or set status to Scheduled on a project.',
            'SCHEDULED'
          )}
          {renderFolderGroup(
            'pending',
            '⏳ Pending Estimates & Leads',
            '#f1c40f',
            pendingCusts,
            'No pending estimates or leads right now.',
            'PENDING'
          )}
          {renderFolderGroup(
            'completed',
            '✅ Complete / Paid',
            '#38bdf8',
            completedCusts,
            'No completed or paid projects yet.',
            'COMPLETED'
          )}

          {filtered.length === 0 && (
            <div className="text-center py-10 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-muted)]">
              No customers match &ldquo;{searchQuery}&rdquo;.
            </div>
          )}
        </div>
      </div>

      {/* Scheduled Jobs Quick List — Strictly Chronological with Exact Dates */}
      {chronologicalScheduledJobs.length > 0 && (
        <div className="mt-4 bg-[var(--surface)] border border-[#0a84ff]/40 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">📅</span>
              <h3 className="text-xs font-black text-[#0a84ff] uppercase tracking-wider">
                Scheduled Jobs Quick List
              </h3>
            </div>
            <span className="text-[10px] font-bold text-[var(--text-muted)]">
              Soonest First ({chronologicalScheduledJobs.length})
            </span>
          </div>

          <div className="space-y-1.5">
            {chronologicalScheduledJobs.map((entry) => {
              const isToday = entry.sortMs !== null && entry.sortMs === todayMs;
              const isPast = entry.sortMs !== null && entry.sortMs < todayMs;
              const formattedDate = formatScheduledDate(entry.schedDate);

              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => onOpenFolder(entry.customer.id)}
                  className="w-full text-left p-2.5 rounded-lg bg-[var(--surface-subtle)] hover:bg-[#0a84ff]/10 border border-[var(--border)] hover:border-[#0a84ff]/60 transition-colors flex items-center justify-between gap-2.5 cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${
                          isToday
                            ? 'bg-[#f1c40f] text-[#231709]'
                            : isPast
                            ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                            : 'bg-[#0a84ff]/15 text-[#60a5fa] border border-[#0a84ff]/35'
                        }`}
                      >
                        {isToday ? `TODAY • ${formattedDate}` : formattedDate}
                      </span>
                      <span className="text-xs font-extrabold text-[var(--text)] truncate">
                        {entry.customer.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                      {entry.job?.title ? `${entry.job.title} • ` : ''}
                      {entry.customer.address || 'No address logged'}
                    </div>
                  </div>
                  <span className="text-[#0a84ff] text-[10px] font-extrabold shrink-0">
                    Open ➔
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* + New Customer Button */}
      <button
        type="button"
        onClick={onOpenNewCustomer}
        className="w-full py-3.5 bg-[var(--accent-secondary)] hover:opacity-95 text-white font-extrabold uppercase tracking-wider text-xs rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer mt-2"
      >
        + New Customer
      </button>
    </div>
  );
};
