import React, { useState, useRef } from 'react';
import { Customer, LocationInfo, WeatherCondition } from '../types';

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
  onOpenBackupModal?: () => void;
}

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
  onOpenBackupModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [folderExpanded, setFolderExpanded] = useState<Record<string, boolean>>({});
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'ACTIVE' | 'SCHEDULED' | 'NEW' | 'PENDING'>('ALL');
  const folderListRef = useRef<HTMLDivElement | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // Total job project metrics across all accounts
  const allJobs = customers.flatMap((c) => c.jobs || []);
  const totalActiveJobs = allJobs.filter((j) => j.status === 'ACTIVE').length;
  const totalScheduledJobs = allJobs.filter(
    (j) => j.status === 'SCHEDULED' || (j.schedDate && j.status !== 'COMPLETED' && j.status !== 'PAID' && j.status !== 'DECLINED')
  ).length;
  const totalPendingJobs = allJobs.filter((j) => j.status === 'PENDING').length;

  // Filter customers based on search
  const q = searchQuery.toLowerCase().trim();
  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.address && c.address.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
  );

  // Group customers by categories
  const pinnedCusts: Customer[] = [];
  const activeCusts: Customer[] = [];
  const scheduledCusts: Customer[] = [];
  const pendingLeads: Customer[] = [];
  const newCusts: Customer[] = [];
  const completedCusts: Customer[] = [];
  const paidCusts: Customer[] = [];
  const archiveCusts: Customer[] = [];

  filtered.forEach((c) => {
    if (c.isPinned) {
      pinnedCusts.push(c);
    }

    let status = c.statusOverride && c.statusOverride !== 'AUTO' ? c.statusOverride : 'NEW';
    if (!c.statusOverride || c.statusOverride === 'AUTO') {
      if (c.jobs && c.jobs.length > 0) {
        if (c.jobs.some((j) => j.status === 'ACTIVE')) status = 'ACTIVE';
        else if (
          c.jobs.some(
            (j) =>
              j.status === 'SCHEDULED' ||
              (j.schedDate && j.status !== 'COMPLETED' && j.status !== 'PAID' && j.status !== 'DECLINED')
          )
        )
          status = 'SCHEDULED';
        else if (c.jobs.some((j) => j.status === 'COMPLETED')) status = 'COMPLETED';
        else if (c.jobs.every((j) => j.status === 'PAID')) status = 'PAID';
        else if (c.jobs.some((j) => j.status === 'ON HOLD' || j.status === 'DECLINED' || j.status === 'OTHER'))
          status = 'ARCHIVE';
        else status = 'PENDING';
      }
    }

    if (status === 'ACTIVE') activeCusts.push(c);
    else if (status === 'SCHEDULED') scheduledCusts.push(c);
    else if (status === 'PENDING') pendingLeads.push(c);
    else if (status === 'NEW') newCusts.push(c);
    else if (status === 'COMPLETED') completedCusts.push(c);
    else if (status === 'PAID') paidCusts.push(c);
    else archiveCusts.push(c);
  });

  const sortByActive = (a: Customer, b: Customer) => (b.lastActive || 0) - (a.lastActive || 0);
  pinnedCusts.sort(sortByActive);
  activeCusts.sort(sortByActive);
  scheduledCusts.sort(sortByActive);
  pendingLeads.sort(sortByActive);
  newCusts.sort(sortByActive);
  completedCusts.sort(sortByActive);
  paidCusts.sort(sortByActive);
  archiveCusts.sort(sortByActive);

  // Active, Scheduled, Pinned, and New Leads open by default
  const [folderOpenState, setFolderOpenState] = useState<Record<string, boolean>>({
    pinned: true,
    active: true,
    scheduled: true,
    new: true,
    pending: false,
    completed: false,
    paid: false,
    archive: false,
  });

  const toggleFolderOpen = (key: string) => {
    setFolderOpenState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleFolderExpanded = (key: string) => {
    setFolderExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStatTileClick = (category: 'ACTIVE' | 'SCHEDULED' | 'NEW' | 'PENDING') => {
    setSelectedFilter(category);
    if (category === 'ACTIVE') {
      setFolderOpenState((prev) => ({ ...prev, active: true, pinned: true }));
      setFolderExpanded((prev) => ({ ...prev, active: true }));
    } else if (category === 'SCHEDULED') {
      setFolderOpenState((prev) => ({ ...prev, scheduled: true }));
      setFolderExpanded((prev) => ({ ...prev, scheduled: true }));
    } else if (category === 'NEW') {
      setFolderOpenState((prev) => ({ ...prev, new: true }));
      setFolderExpanded((prev) => ({ ...prev, new: true }));
    } else if (category === 'PENDING') {
      setFolderOpenState((prev) => ({ ...prev, pending: true }));
      setFolderExpanded((prev) => ({ ...prev, pending: true }));
    }
    setTimeout(() => {
      folderListRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const renderFolderGroup = (
    key: string,
    title: string,
    colorBorder: string,
    list: Customer[],
    emptyDesc?: string
  ) => {
    // If user filtered to another specific category, don't render this group
    if (selectedFilter !== 'ALL') {
      if (selectedFilter === 'ACTIVE' && key !== 'active' && key !== 'pinned') return null;
      if (selectedFilter === 'SCHEDULED' && key !== 'scheduled') return null;
      if (selectedFilter === 'NEW' && key !== 'new') return null;
      if (selectedFilter === 'PENDING' && key !== 'pending') return null;
    }

    // If empty and not specifically filtered, hide to save space
    if (list.length === 0) {
      if (selectedFilter !== 'ALL') {
        return (
          <div
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center mb-3 shadow-sm"
            style={{ borderLeft: `4px solid ${colorBorder}` }}
          >
            <div className="font-extrabold text-xs text-[var(--text)] mb-1">{title}</div>
            <p className="text-[11px] text-[var(--text-muted)] max-w-sm mx-auto">
              {emptyDesc || 'No customer records in this folder right now.'}
            </p>
          </div>
        );
      }
      return null;
    }

    const isOpen = q.length > 0 || selectedFilter !== 'ALL' || !!folderOpenState[key];
    const isExpanded = q.length > 0 || selectedFilter !== 'ALL' || !!folderExpanded[key];
    // Default show up to 5 items for better field visibility
    const visibleItems = isExpanded ? list : list.slice(0, 5);

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
            {isOpen && list.length > 2 && !isExpanded && q.length === 0 && (
              <span className="text-[10px] text-gray-400 font-normal">
                (showing 2 of {list.length})
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold text-gray-400">{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div className="p-3 space-y-2">
            {visibleItems.map((c) => {
              let s = c.statusOverride && c.statusOverride !== 'AUTO' ? c.statusOverride : 'NEW';
              let isTodayWork = false;
              let schedDateVal = '';

              if (!c.statusOverride || c.statusOverride === 'AUTO') {
                if (c.jobs && c.jobs.length > 0) {
                  const activeJob = c.jobs.find((j) => j.status === 'ACTIVE' || j.status === 'SCHEDULED');
                  if (activeJob) {
                    s = activeJob.status;
                    if (activeJob.schedDate === todayStr) isTodayWork = true;
                    if (activeJob.schedDate) schedDateVal = activeJob.schedDate;
                  } else {
                    s = c.jobs[0].status;
                    if (c.jobs[0].schedDate) schedDateVal = c.jobs[0].schedDate;
                  }
                }
              } else if (c.jobs && c.jobs.length > 0) {
                const firstSched = c.jobs.find((j) => j.schedDate);
                if (firstSched) schedDateVal = firstSched.schedDate;
              }

              const pillBg =
                s === 'ACTIVE'
                  ? '#30d158'
                  : s === 'SCHEDULED'
                  ? '#0a84ff'
                  : s === 'COMPLETED'
                  ? '#ff9f0a'
                  : s === 'PAID'
                  ? '#555'
                  : s === 'NEW'
                  ? '#ffd60a'
                  : '#bf5af2';

              const mapUrl = `http://maps.google.com/?q=${encodeURIComponent(c.address || '')}`;

              return (
                <div
                  key={c.id}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--accent)] transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div
                      onClick={() => onOpenFolder(c.id)}
                      className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <div className="font-extrabold text-xs text-[var(--text)]">{c.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                        {c.address || 'No address logged'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => onTogglePin(c.id, e)}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-all cursor-pointer ${
                          c.isPinned
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'bg-transparent text-[var(--text-muted)] border-[var(--border)]'
                        }`}
                      >
                        {c.isPinned ? '📌 Pinned' : 'Pin'}
                      </button>

                      {isTodayWork && (
                        <span className="bg-red-500 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded">
                          📌 Today
                        </span>
                      )}

                      {schedDateVal && (
                        <span className="bg-[var(--accent-secondary)] text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
                          📅 {schedDateVal}
                        </span>
                      )}

                      <span
                        style={{ backgroundColor: pillBg, color: s === 'NEW' ? '#000' : '#fff' }}
                        className="text-[8px] font-black uppercase px-2 py-0.5 rounded"
                      >
                        {s}
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
            })}

            {/* EXPAND BUTTON: Shows 2 customers, click to expand all customers */}
            {list.length > 2 && q.length === 0 && (
              <button
                type="button"
                onClick={() => toggleFolderExpanded(key)}
                className="w-full py-2.5 bg-[#1c1d25] hover:bg-[#252733] border border-dashed border-[#f1c40f]/60 hover:border-[#f1c40f] rounded-lg text-xs font-black uppercase tracking-wider text-[#f1c40f] cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm mt-1"
              >
                <span>{isExpanded ? '▲' : '▼'}</span>
                <span>
                  {isExpanded
                    ? `Collapse (Showing All ${list.length})`
                    : `Expand (${list.length - 2} More Customers)`}
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
      {/* Weather Quick Banner with Location Selector & Follow Me Controls */}
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
            <span className="truncate">{currentWeather ? currentWeather.conditionText : 'Tap for spray forecast'}</span>
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

      {/* 1-Tap Offline Single-File HTML App & Backup Quick Banner */}
      {onOpenBackupModal && (
        <div className="bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-[var(--surface)] border border-amber-500/40 rounded-xl p-3 flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">📱</span>
            <div className="min-w-0">
              <div className="font-extrabold text-xs text-white flex items-center gap-1.5 flex-wrap">
                <span>Single-File HTML App &amp; Data Backup</span>
                <span className="bg-amber-500 text-black text-[8.5px] uppercase font-black px-1.5 py-0.5 rounded shadow-xs">
                  Offline Ready
                </span>
              </div>
              <p className="text-[10.5px] text-amber-200/80 truncate">
                Download .html file to phone or save customer database (.json)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenBackupModal}
            className="shrink-0 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-black text-[11px] rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
          >
            <span>📥</span>
            <span>Download</span>
          </button>
        </div>
      )}

      {/* Quick Dashboard Stat Tiles (Active Jobs, Scheduled, New Leads, Pending Bids) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
        {/* Active Jobs */}
        <button
          type="button"
          onClick={() => handleStatTileClick('ACTIVE')}
          className={`bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border p-2.5 sm:p-3 rounded-xl border-l-4 border-l-[#30d158] shadow-xs text-left transition-all active:scale-95 cursor-pointer ${
            selectedFilter === 'ACTIVE' ? 'ring-2 ring-[#30d158] border-[#30d158]' : 'border-[var(--border)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-2xl font-black text-[#30d158] block leading-none">
              {totalActiveJobs > 0 ? totalActiveJobs : activeCusts.length}
            </span>
            <span className="text-xs">🟢</span>
          </div>
          <span className="text-[9.5px] sm:text-[10px] uppercase font-extrabold text-[var(--text)] tracking-wider mt-1 block truncate">
            Active Jobs
          </span>
          <span className="text-[8.5px] sm:text-[9px] text-[var(--text-muted)] truncate block">
            {activeCusts.length} underway
          </span>
        </button>

        {/* Scheduled Jobs */}
        <button
          type="button"
          onClick={() => handleStatTileClick('SCHEDULED')}
          className={`bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border p-2.5 sm:p-3 rounded-xl border-l-4 border-l-[#0a84ff] shadow-xs text-left transition-all active:scale-95 cursor-pointer ${
            selectedFilter === 'SCHEDULED' ? 'ring-2 ring-[#0a84ff] border-[#0a84ff]' : 'border-[var(--border)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-2xl font-black text-[#0a84ff] block leading-none">
              {totalScheduledJobs > 0 ? totalScheduledJobs : scheduledCusts.length}
            </span>
            <span className="text-xs">📅</span>
          </div>
          <span className="text-[9.5px] sm:text-[10px] uppercase font-extrabold text-[var(--text)] tracking-wider mt-1 block truncate">
            Scheduled
          </span>
          <span className="text-[8.5px] sm:text-[9px] text-[var(--text-muted)] truncate block">
            {scheduledCusts.length} upcoming
          </span>
        </button>

        {/* New Leads */}
        <button
          type="button"
          onClick={() => handleStatTileClick('NEW')}
          className={`bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border p-2.5 sm:p-3 rounded-xl border-l-4 border-l-[#f1c40f] shadow-xs text-left transition-all active:scale-95 cursor-pointer ${
            selectedFilter === 'NEW' ? 'ring-2 ring-[#f1c40f] border-[#f1c40f]' : 'border-[var(--border)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-2xl font-black text-[#f1c40f] block leading-none">
              {newCusts.length}
            </span>
            <span className="text-xs">✨</span>
          </div>
          <span className="text-[9.5px] sm:text-[10px] uppercase font-extrabold text-[var(--text)] tracking-wider mt-1 block truncate">
            New Leads
          </span>
          <span className="text-[8.5px] sm:text-[9px] text-[var(--text-muted)] truncate block">Inquiries</span>
        </button>

        {/* Pending Bids */}
        <button
          type="button"
          onClick={() => handleStatTileClick('PENDING')}
          className={`bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border p-2.5 sm:p-3 rounded-xl border-l-4 border-l-[var(--accent-secondary)] shadow-xs text-left transition-all active:scale-95 cursor-pointer ${
            selectedFilter === 'PENDING' ? 'ring-2 ring-[var(--accent-secondary)] border-[var(--accent-secondary)]' : 'border-[var(--border)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-2xl font-black text-[var(--accent-secondary)] block leading-none">
              {totalPendingJobs > 0 ? totalPendingJobs : pendingLeads.length}
            </span>
            <span className="text-xs">⏳</span>
          </div>
          <span className="text-[9.5px] sm:text-[10px] uppercase font-extrabold text-[var(--text)] tracking-wider mt-1 block truncate">
            Pending Bids
          </span>
          <span className="text-[8.5px] sm:text-[9px] text-[var(--text-muted)] truncate block">
            {pendingLeads.length} awaiting
          </span>
        </button>
      </div>

      {/* Quick Action Bar (+ New Customer) */}
      <button
        type="button"
        onClick={onOpenNewCustomer}
        className="w-full py-3 bg-[var(--accent)] hover:opacity-95 text-[#231709] font-black text-xs rounded-xl shadow-md cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-2"
      >
        <span>➕</span>
        <span>Add New Customer</span>
      </button>

      {/* Search Input */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="🔍 Search clients, addresses, or phone numbers..."
        className="w-full bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-xl px-4 py-3 text-sm outline-none shadow-sm transition-all"
      />

      {/* Category Quick Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        <button
          type="button"
          onClick={() => setSelectedFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex-shrink-0 ${
            selectedFilter === 'ALL'
              ? 'bg-[var(--accent)] text-white'
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
          <span>🟢</span>
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
          onClick={() => setSelectedFilter('NEW')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
            selectedFilter === 'NEW'
              ? 'bg-[#f1c40f] text-[#231709] font-black'
              : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)]'
          }`}
        >
          <span>✨</span>
          <span>New Leads ({newCusts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedFilter('PENDING')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
            selectedFilter === 'PENDING'
              ? 'bg-[var(--accent-secondary)] text-white'
              : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)]'
          }`}
        >
          <span>⏳</span>
          <span>Pending ({pendingLeads.length})</span>
        </button>
      </div>

      {/* Customer Folders */}
      <div ref={folderListRef} className="space-y-1">
        {renderFolderGroup('pinned', '📌 Pinned Active Job Site', 'var(--accent)', pinnedCusts, 'No pinned job sites right now.')}
        {renderFolderGroup(
          'active',
          '🟢 Active Jobs (Underway)',
          '#30d158',
          activeCusts,
          'No active jobs right now. Once a proposal is approved, switch its status to Active to track underway work here.'
        )}
        {renderFolderGroup(
          'scheduled',
          '📅 Scheduled & Future Jobs',
          '#0a84ff',
          scheduledCusts,
          'No scheduled jobs right now. Enter a start date on an estimate to automatically schedule it on the calendar.'
        )}
        {renderFolderGroup('new', '✨ New Leads & Inquiries', '#f1c40f', newCusts, 'No new client leads at the moment.')}
        {renderFolderGroup('pending', '⏳ Pending Estimates & Bids', '#ffd60a', pendingLeads, 'No pending bids awaiting client decision.')}
        {renderFolderGroup('completed', '🏁 Completed — Unpaid', '#38bdf8', completedCusts)}
        {renderFolderGroup('paid', '💵 Paid & Closed', '#555', paidCusts)}
        {renderFolderGroup('archive', '📁 On Hold & Archive', '#bf5af2', archiveCusts)}

        {filtered.length === 0 && (
          <div className="text-center py-10 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-muted)]">
            No customers match &ldquo;{searchQuery}&rdquo;.
          </div>
        )}
      </div>

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
