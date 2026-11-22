import React, { useState, useEffect, useCallback } from 'react';
import {
  DailyForecast,
  LocationInfo,
  PrecipMode,
  WorkabilityStatus,
} from '../types';
import {
  DEFAULT_WISCONSIN_PRESETS,
  searchLocations,
  getCurrentGpsPosition,
  fetchFullWeather,
  formatRainInches,
  formatSnowInches,
  FullWeatherResponse,
} from '../utils/weatherService';

interface WeatherViewProps {
  currentLocation: LocationInfo;
  isFollowingGps?: boolean;
  onToggleFollowMe?: (follow: boolean) => void;
  onLocationChange: (loc: LocationInfo) => void;
}

type WeatherSubTab = 'HOURLY' | 'DAILY' | 'GUARD';

function getPrecipBadgeStyle(mode: PrecipMode): string {
  switch (mode) {
    case 'WINTRY_MIX':
      return 'bg-purple-500/20 text-purple-200 border border-purple-400/50';
    case 'SNOW':
      return 'bg-sky-500/20 text-sky-200 border border-sky-400/50';
    case 'RAIN':
      return 'bg-blue-500/20 text-blue-200 border border-blue-400/50';
    case 'DRY':
    default:
      return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40';
  }
}

function getWorkabilityPillStyle(status: WorkabilityStatus): string {
  switch (status) {
    case 'SNOW_ICE_RISK':
      return 'bg-red-500/20 text-red-200 border border-red-500/50';
    case 'CAUTION':
      return 'bg-amber-500/20 text-amber-200 border border-amber-500/50';
    case 'GO':
    default:
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50';
  }
}

function getGuardVerdictStyle(status: 'GO' | 'CAUTION' | 'HOLD'): {
  card: string;
  badge: string;
} {
  switch (status) {
    case 'HOLD':
      return {
        card: 'border-red-500/45 bg-red-950/25',
        badge: 'bg-red-500 text-white',
      };
    case 'CAUTION':
      return {
        card: 'border-amber-500/45 bg-amber-950/25',
        badge: 'bg-amber-400 text-slate-950',
      };
    case 'GO':
    default:
      return {
        card: 'border-emerald-500/45 bg-emerald-950/25',
        badge: 'bg-emerald-500 text-slate-950',
      };
  }
}

function getCheckToneStyle(status: 'PASS' | 'WARN' | 'HOLD'): {
  pill: string;
  label: string;
} {
  switch (status) {
    case 'HOLD':
      return { pill: 'bg-red-500/20 text-red-300 border border-red-500/45', label: 'HOLD' };
    case 'WARN':
      return { pill: 'bg-amber-500/20 text-amber-300 border border-amber-500/45', label: 'WATCH' };
    case 'PASS':
    default:
      return { pill: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/45', label: 'PASS' };
  }
}

function renderDailyAccumulationText(day: DailyForecast): string {
  if (day.precipMode === 'WINTRY_MIX') {
    const parts: string[] = [];
    if (day.snowfallIn > 0) parts.push(`${formatSnowInches(day.snowfallIn)} snow`);
    if (day.rainSumIn > 0) parts.push(`${formatRainInches(day.rainSumIn)} rain`);
    return parts.length > 0 ? `Wintry Mix: ${parts.join(' + ')}` : `Wintry Mix (${day.rainProb}% chance)`;
  }
  if (day.precipMode === 'SNOW') {
    return day.snowfallIn > 0
      ? `Est. Snowfall: ${formatSnowInches(day.snowfallIn)} (${day.rainProb}% chance)`
      : `Light Snow (${day.rainProb}% chance)`;
  }
  if (day.precipMode === 'RAIN') {
    return day.rainSumIn > 0
      ? `Rainfall: ${formatRainInches(day.rainSumIn)} (${day.rainProb}% chance)`
      : `Rain Chance: ${day.rainProb}%`;
  }
  return 'Dry / Clear (<20% precip chance)';
}

export const WeatherView: React.FC<WeatherViewProps> = ({
  currentLocation,
  isFollowingGps = false,
  onToggleFollowMe,
  onLocationChange,
}) => {
  const [weather, setWeather] = useState<FullWeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Clean 3-tab segmented control
  const [activeSubTab, setActiveSubTab] = useState<WeatherSubTab>('HOURLY');
  const [expandedDayDate, setExpandedDayDate] = useState<string | null>(null);

  // Compact collapsible location switcher
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const loadWeatherData = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await fetchFullWeather(lat, lng);
      setWeather(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch weather data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeatherData(currentLocation.lat, currentLocation.lng);
  }, [currentLocation.lat, currentLocation.lng, loadWeatherData]);

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query || query.length < 2) return;

    setSearching(true);
    setErrorMsg('');
    try {
      const results = await searchLocations(query);
      setSearchResults(results);
      if (results.length === 0) {
        setErrorMsg(`No locations found matching "${query}".`);
      } else if (results.length === 1) {
        selectLocation(results[0]);
      }
    } catch {
      setErrorMsg('Location search failed. Check your connection.');
    } finally {
      setSearching(false);
    }
  };

  const selectLocation = (loc: LocationInfo) => {
    if (onToggleFollowMe) onToggleFollowMe(false);
    onLocationChange(loc);
    setSearchResults([]);
    setSearchQuery('');
    setShowLocationPicker(false);
  };

  const handleUseGps = async () => {
    setGpsLoading(true);
    setErrorMsg('');
    try {
      const gpsLoc = await getCurrentGpsPosition();
      if (onToggleFollowMe) onToggleFollowMe(true);
      onLocationChange(gpsLoc);
      setShowLocationPicker(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to access GPS location.');
    } finally {
      setGpsLoading(false);
    }
  };

  const current = weather?.current;
  const hourly24 = weather?.hourly.slice(0, 24) || [];
  const daily7 = weather?.daily.slice(0, 7) || [];
  const guard = weather?.exteriorGuard;

  // Helper for current hero active precipitation status text (strictly mutually exclusive)
  const renderCurrentPrecipPill = () => {
    if (!current) return null;
    if (current.precipMode === 'WINTRY_MIX') {
      const parts: string[] = [];
      if (current.snowfallIn > 0) parts.push(`${formatSnowInches(current.snowfallIn)} snow`);
      if (current.rainIn > 0) parts.push(`${formatRainInches(current.rainIn)} rain`);
      return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full ${getPrecipBadgeStyle('WINTRY_MIX')}`}>
          <span>🌨️</span>
          <span>Wintry Mix{parts.length ? ` • ${parts.join(' + ')}` : ''}</span>
        </span>
      );
    }
    if (current.precipMode === 'SNOW') {
      return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full ${getPrecipBadgeStyle('SNOW')}`}>
          <span>❄️</span>
          <span>
            Snow • {current.rainProb}%
            {current.snowfallIn > 0 ? ` • ${formatSnowInches(current.snowfallIn)}` : ''}
          </span>
        </span>
      );
    }
    if (current.precipMode === 'RAIN') {
      return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full ${getPrecipBadgeStyle('RAIN')}`}>
          <span>{current.precipIcon}</span>
          <span>
            {current.precipTypeLabel} • {current.rainProb}%
            {current.rainIn > 0 ? ` • ${formatRainInches(current.rainIn)}` : ''}
          </span>
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full ${getPrecipBadgeStyle('DRY')}`}>
        <span>✓</span>
        <span>Dry / Clear</span>
      </span>
    );
  };

  return (
    <div className="space-y-3 max-w-2xl mx-auto pb-24 animate-in fade-in">
      {/* Compact Location & Controls Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-lg shrink-0">{current?.precipIcon || '🌦️'}</span>
            <div className="min-w-0">
              <div className="text-sm font-black text-[var(--text)] flex items-center gap-1.5 flex-wrap">
                <span className="truncate">{currentLocation.name}</span>
                {isFollowingGps && (
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    GPS
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] truncate">
                {currentLocation.region || 'Washington County, WI'}
                {weather?.fetchedAt ? ` • Updated ${weather.fetchedAt}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleUseGps}
              disabled={gpsLoading}
              className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-[10.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer disabled:opacity-50"
              title="Use device GPS location"
            >
              {gpsLoading ? '…' : '📍 GPS'}
            </button>
            <button
              type="button"
              onClick={() => setShowLocationPicker((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border text-[10.5px] font-bold cursor-pointer ${
                showLocationPicker
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'
              }`}
            >
              {showLocationPicker ? 'Done' : 'City'}
            </button>
            <button
              type="button"
              onClick={() => loadWeatherData(currentLocation.lat, currentLocation.lng)}
              disabled={loading}
              className="p-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-xs text-[var(--text)] hover:border-[var(--accent)] cursor-pointer disabled:opacity-50"
              title="Refresh forecast"
              aria-label="Refresh forecast"
            >
              <span className={loading ? 'inline-block animate-spin' : ''}>🔄</span>
            </button>
          </div>
        </div>

        {/* Collapsible Location Search & WI Presets */}
        {showLocationPicker && (
          <div className="pt-2 border-t border-[var(--border)] space-y-2">
            <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city or zip (e.g. Kewaskum, Hartford)…"
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-xl px-3 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-3 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {searching ? '…' : 'Go'}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)] max-h-40 overflow-y-auto">
                {searchResults.map((loc, idx) => (
                  <button
                    key={`${loc.name}-${loc.lat}-${idx}`}
                    type="button"
                    onClick={() => selectLocation(loc)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-subtle)] flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-bold text-[var(--text)]">{loc.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {[loc.region, loc.country].filter(Boolean).join(', ')}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_WISCONSIN_PRESETS.slice(0, 6).map((preset) => {
                const isSelected =
                  !isFollowingGps &&
                  Math.abs(preset.lat - currentLocation.lat) < 0.01 &&
                  Math.abs(preset.lng - currentLocation.lng) < 0.01;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => selectLocation(preset)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                        : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3-Tab Segmented Control Bar */}
        <div
          role="tablist"
          aria-label="Weather views"
          className="grid grid-cols-3 gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl p-1"
        >
          {(
            [
              { id: 'HOURLY', label: 'Hourly Today' },
              { id: 'DAILY', label: '7-Day Outlook' },
              { id: 'GUARD', label: 'Work & Guard' },
            ] as const
          ).map((tab) => {
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSubTab(tab.id)}
                className={`py-2 px-1.5 rounded-lg text-[10.5px] sm:text-xs font-extrabold tracking-tight transition-all cursor-pointer truncate ${
                  active
                    ? 'bg-[var(--accent)] text-white shadow'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="bg-red-950/40 border border-red-500/40 text-red-200 rounded-xl px-3 py-2 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Initial Loading State */}
      {loading && !weather && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center space-y-2">
          <div className="text-2xl animate-pulse">🌦️</div>
          <p className="text-xs font-bold text-[var(--text-muted)]">
            Loading Open-Meteo forecast for {currentLocation.name}…
          </p>
        </div>
      )}

      {/* ============================================================
          SUB-TAB 1: HOURLY TODAY
         ============================================================ */}
      {weather && current && activeSubTab === 'HOURLY' && (
        <div className="space-y-3">
          {/* Current Conditions Hero Card (single source of truth — zero duplicate blocks) */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-md space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-4xl leading-none">{current.precipIcon}</span>
                <div>
                  <div className="text-3xl sm:text-4xl font-black tracking-tight text-[var(--text)] leading-none">
                    {current.temp}°F
                  </div>
                  <div className="text-xs font-bold text-[var(--text-muted)] mt-1">
                    {current.wmoDescription}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5">
                {renderCurrentPrecipPill()}
                {daily7[0] && (
                  <span className="text-[11px] font-bold text-[var(--text-muted)]">
                    H {daily7[0].tempMax}° • L {daily7[0].tempMin}°
                  </span>
                )}
              </div>
            </div>

            {/* 4 Core Current Metrics (each metric shown once) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                  Feels Like
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5">
                  {current.feelsLike}°F
                </div>
              </div>

              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                  Wind / Gusts
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5">
                  {current.windSpeed}{' '}
                  <span className="text-[10.5px] font-bold text-[var(--text-muted)]">
                    / G{current.windGusts} mph
                  </span>
                </div>
              </div>

              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                  Humidity
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5">
                  {current.humidity}%
                </div>
              </div>

              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                  Dew Point
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5">
                  {current.dewPoint}°F
                </div>
              </div>
            </div>
          </div>

          {/* Compact 24-Hour Horizontal Timeline */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                Next 24 Hours
              </h3>
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                Swipe horizontally →
              </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1.5">
              {hourly24.map((h, idx) => {
                const isNow = idx === 0;
                const isSnowHour = h.precipMode === 'SNOW' || h.precipMode === 'WINTRY_MIX';
                const isRainHour = h.precipMode === 'RAIN';

                return (
                  <div
                    key={h.isoTime}
                    className={`shrink-0 w-[74px] rounded-xl p-2 border flex flex-col items-center justify-between gap-1 text-center ${
                      isNow
                        ? 'bg-[var(--accent)]/15 border-[var(--accent)]'
                        : 'bg-[var(--bg)] border-[var(--border)]'
                    }`}
                  >
                    <span
                      className={`text-[10px] font-extrabold ${
                        isNow ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {h.timeStr}
                    </span>

                    <span className="text-lg leading-none my-0.5">{h.precipIcon}</span>

                    <span className="text-sm font-black text-[var(--text)] leading-none">
                      {h.temp}°
                    </span>

                    {isSnowHour ? (
                      <span className="text-[9.5px] font-extrabold text-sky-300 leading-tight">
                        {h.precipMode === 'WINTRY_MIX' ? 'Mix' : 'Snow'} {h.rainProb}%
                      </span>
                    ) : isRainHour ? (
                      <span className="text-[9.5px] font-extrabold text-blue-300 leading-tight">
                        Rain {h.rainProb}%
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-400/80 leading-tight">
                        Dry
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          SUB-TAB 2: 7-DAY OUTLOOK (COMPACT EXPANDABLE ROWS)
         ============================================================ */}
      {weather && activeSubTab === 'DAILY' && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              7-Day Forecast
            </h3>
            <span className="text-[10px] text-[var(--text-muted)] font-semibold">
              Tap a day for gusts &amp; exterior details
            </span>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {daily7.map((day) => {
              const isExpanded = expandedDayDate === day.dateStr;

              const precipBadgeText =
                day.precipMode === 'WINTRY_MIX'
                  ? `Mix ${day.rainProb}%`
                  : day.precipMode === 'SNOW'
                  ? `Snow ${day.rainProb}%`
                  : day.precipMode === 'RAIN'
                  ? `${day.precipTypeLabel} ${day.rainProb}%`
                  : 'Dry / Clear';

              return (
                <div key={day.dateStr} className="transition-colors">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedDayDate((prev) => (prev === day.dateStr ? null : day.dateStr))
                    }
                    aria-expanded={isExpanded}
                    className="w-full px-3.5 py-3 flex items-center justify-between gap-2 hover:bg-[var(--surface-subtle)]/60 text-left cursor-pointer"
                  >
                    {/* Left: Day + Icon */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="text-lg shrink-0 leading-none">{day.precipIcon}</span>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-extrabold text-[var(--text)] truncate">
                          {day.dayName}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          {day.wmoDescription}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Dynamic Rain / Snow / Dry Badge */}
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${getPrecipBadgeStyle(
                        day.precipMode
                      )}`}
                    >
                      {precipBadgeText}
                    </span>

                    {/* Right: High / Low + Chevron */}
                    <div className="flex items-center gap-2 shrink-0 min-w-[74px] justify-end">
                      <span className="text-xs sm:text-sm font-black text-[var(--text)]">
                        {day.tempMax}°
                        <span className="text-[var(--text-muted)] font-semibold">
                          /{day.tempMin}°
                        </span>
                      </span>
                      <span
                        className={`text-[10px] text-[var(--text-muted)] transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      >
                        ▾
                      </span>
                    </div>
                  </button>

                  {/* Expanded Single-Day Details */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 bg-[var(--bg)]/60 border-t border-[var(--border)]/60 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2.5 py-2">
                          <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                            Wind &amp; Gusts
                          </div>
                          <div className="text-xs font-extrabold text-[var(--text)] mt-0.5">
                            💨 {day.windSpeedMax} mph • Gusts {day.windGustsMax} mph
                          </div>
                        </div>

                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2.5 py-2">
                          <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                            Precipitation
                          </div>
                          <div className="text-xs font-extrabold text-[var(--text)] mt-0.5">
                            {renderDailyAccumulationText(day)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2.5 py-2">
                        <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                          {day.workabilityHint}
                        </p>
                        <span
                          className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${getWorkabilityPillStyle(
                            day.workability
                          )}`}
                        >
                          {day.workabilityLabel}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================
          SUB-TAB 3: WORK & EXTERIOR GUARD
         ============================================================ */}
      {weather && guard && activeSubTab === 'GUARD' && (
        <div className="space-y-3">
          {/* Contractor Exterior Painting & Pressure Washing Summary Card */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                Today&apos;s Exterior Work Window
              </h3>
              <span className="text-[10px] font-bold text-[var(--accent)]">
                {guard.bestWindowLabel}
              </span>
            </div>

            {/* Painting vs. Pressure Washing Verdict Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(() => {
                const pStyle = getGuardVerdictStyle(guard.paintingStatus);
                return (
                  <div className={`rounded-xl border p-3 space-y-1.5 ${pStyle.card}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-[var(--text)]">
                        🎨 Exterior Painting
                      </span>
                      <span
                        className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full ${pStyle.badge}`}
                      >
                        {guard.paintingLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                      {guard.paintingSummary}
                    </p>
                  </div>
                );
              })()}

              {(() => {
                const wStyle = getGuardVerdictStyle(guard.washingStatus);
                return (
                  <div className={`rounded-xl border p-3 space-y-1.5 ${wStyle.card}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-[var(--text)]">
                        💦 Pressure Washing
                      </span>
                      <span
                        className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full ${wStyle.badge}`}
                      >
                        {guard.washingLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                      {guard.washingSummary}
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* 4 Focused Threshold Checks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {guard.checks.map((chk) => {
                const tone = getCheckToneStyle(chk.status);
                return (
                  <div
                    key={chk.id}
                    className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-[var(--text)]">
                        {chk.label}: <span className="text-[var(--accent)]">{chk.reading}</span>
                      </span>
                      <span
                        className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${tone.pill}`}
                      >
                        {tone.label}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-[var(--text-muted)] leading-snug">
                      {chk.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conditional 7-Day Snow & Freeze Alert Strip (ONLY lights up when snow or freezing temps are forecast) */}
          {guard.hasSnowOrFreeze7d ? (
            <div className="rounded-2xl border border-sky-400/50 bg-sky-950/30 p-3.5 space-y-2 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-sky-200 flex items-center gap-1.5">
                  <span>{guard.snowDays7d.length > 0 ? '❄️' : '🌡️'}</span>
                  <span>
                    {guard.snowDays7d.length > 0 && guard.freezeDays7d.length > 0
                      ? '7-Day Snow & Freeze Alert'
                      : guard.snowDays7d.length > 0
                      ? '7-Day Snow Alert'
                      : '7-Day Freeze Alert'}
                  </span>
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-400 text-slate-950">
                  Active
                </span>
              </div>

              {guard.snowDays7d.length > 0 && (
                <div className="bg-[var(--bg)]/70 border border-sky-500/30 rounded-xl px-3 py-2 text-[11px] text-sky-100 space-y-1">
                  <div className="font-extrabold">
                    ❄️ Projected Snow ({guard.snowDays7d.length}{' '}
                    {guard.snowDays7d.length === 1 ? 'day' : 'days'}
                    {guard.totalSnow7dIn > 0 ? ` • ~${formatSnowInches(guard.totalSnow7dIn)} total` : ''})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {guard.snowDays7d.map((sd) => (
                      <span
                        key={sd.dayName}
                        className="text-[10px] font-bold bg-sky-500/20 text-sky-200 border border-sky-400/40 px-2 py-0.5 rounded-full"
                      >
                        {sd.dayName}
                        {sd.snowfallIn > 0 ? `: ${formatSnowInches(sd.snowfallIn)}` : ` (${sd.precipProb}%)`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {guard.freezeDays7d.length > 0 && (
                <div className="bg-[var(--bg)]/70 border border-cyan-500/30 rounded-xl px-3 py-2 text-[11px] text-cyan-100 space-y-0.5">
                  <div className="font-extrabold">
                    🌡️ {guard.freezeDays7d.length} Freezing{' '}
                    {guard.freezeDays7d.length === 1 ? 'Night' : 'Nights'} (Low {guard.lowestTemp7d}°F)
                  </div>
                  <p className="text-[10.5px] text-cyan-200/80">
                    Bring waterborne paint, primers, and caulk indoors overnight—never store latex below 35°F.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/35 bg-emerald-950/20 px-3.5 py-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-emerald-300">
                ✓ No snow or freezing temperatures forecast over the next 7 days
              </span>
              <span className="text-[10px] font-extrabold text-emerald-400 shrink-0">
                7d Low {guard.lowestTemp7d}°F
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
