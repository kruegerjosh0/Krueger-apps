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

type WeatherTabId = 'TODAY' | 'HOURLY' | 'TEN_DAY';

function getPrecipPillStyle(mode: PrecipMode): string {
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

function getWorkBadgeMeta(status: 'GO' | 'CAUTION' | 'HOLD' | WorkabilityStatus): {
  label: 'GO' | 'CAUTION' | 'NO-GO';
  pill: string;
  dot: string;
} {
  if (status === 'HOLD' || status === 'SNOW_ICE_RISK') {
    return {
      label: 'NO-GO',
      pill: 'bg-red-500 text-white',
      dot: 'bg-red-500',
    };
  }
  if (status === 'CAUTION') {
    return {
      label: 'CAUTION',
      pill: 'bg-amber-400 text-slate-950',
      dot: 'bg-amber-400',
    };
  }
  return {
    label: 'GO',
    pill: 'bg-emerald-500 text-slate-950',
    dot: 'bg-emerald-500',
  };
}

function formatLocationLabel(loc: LocationInfo): string {
  if (!loc.region) return loc.name;
  const r = loc.region.trim();
  if (r.toLowerCase().includes('wisconsin') || r.endsWith(', WI') || r === 'WI') {
    return `${loc.name}, WI`;
  }
  return `${loc.name}, ${r}`;
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

  // Strict single-view tab state: Today (default) | Hourly | 10-Day
  const [activeTab, setActiveTab] = useState<WeatherTabId>('TODAY');
  const [expandedDayDate, setExpandedDayDate] = useState<string | null>(null);

  // Collapsible Change City drawer
  const [showCityPicker, setShowCityPicker] = useState(false);
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
    setShowCityPicker(false);
  };

  const handleUseGps = async () => {
    setGpsLoading(true);
    setErrorMsg('');
    try {
      const gpsLoc = await getCurrentGpsPosition();
      if (onToggleFollowMe) onToggleFollowMe(true);
      onLocationChange(gpsLoc);
      setShowCityPicker(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to access GPS location.');
    } finally {
      setGpsLoading(false);
    }
  };

  const current = weather?.current;
  const guard = weather?.exteriorGuard;
  const hourly24 = weather?.hourly.slice(0, 24) || [];
  const daily10 = weather?.daily.slice(0, 10) || [];
  const todayDaily = daily10[0];

  // Today conditional Snow/Freeze banner check:
  // ONLY show if snowfall_sum > 0 in next 48h (today + tomorrow) OR temps drop below 32°F today
  const snowNext48h =
    (daily10[0]?.snowfallIn || 0) + (daily10[1]?.snowfallIn || 0);
  const hasSnow48h = snowNext48h > 0;
  const hasFreezeToday =
    Boolean(current && current.temp < 32) ||
    Boolean(todayDaily && todayDaily.tempMin < 32);
  const showSnowOrFreezeBanner = hasSnow48h || hasFreezeToday;

  // Format Today condition string cleanly (e.g. "Light Drizzle · Rain" or "Mostly Clear · Dry")
  const todayConditionLine = current
    ? current.precipMode === 'DRY'
      ? `${current.wmoDescription} · Dry`
      : `${current.wmoDescription} · ${current.precipTypeLabel}`
    : '';

  const todayWorkBadge = guard ? getWorkBadgeMeta(guard.paintingStatus) : null;

  return (
    <div className="space-y-2.5 max-w-2xl mx-auto pb-20">
      {/* Slim Header Bar + 3 Full-Width Segmented Buttons */}
      <div className="sticky top-[52px] sm:top-[60px] z-30 bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] rounded-2xl p-2.5 shadow-md space-y-2">
        {/* Slim Header: West Bend, WI + Change City + Refresh */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            <span className="text-sm shrink-0">📍</span>
            <span className="text-xs sm:text-sm font-black text-[var(--text)] truncate">
              {formatLocationLabel(currentLocation)}
            </span>
            {isFollowingGps && (
              <span className="text-[8.5px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                GPS
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowCityPicker((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg border text-[10.5px] font-bold cursor-pointer ${
                showCityPicker
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'
              }`}
            >
              {showCityPicker ? 'Done' : 'Change City'}
            </button>
            <button
              type="button"
              onClick={() => loadWeatherData(currentLocation.lat, currentLocation.lng)}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[10.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer disabled:opacity-50"
            >
              <span className={loading ? 'inline-block animate-spin mr-1' : 'mr-1'}>🔄</span>
              Refresh
            </button>
          </div>
        </div>

        {/* Collapsible Change City Drawer */}
        {showCityPicker && (
          <div className="pt-2 border-t border-[var(--border)] space-y-2">
            <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city or zip (e.g. Kewaskum, Hartford)…"
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {searching ? '…' : 'Go'}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] max-h-36 overflow-y-auto">
                {searchResults.map((loc, idx) => (
                  <button
                    key={`${loc.name}-${loc.lat}-${idx}`}
                    type="button"
                    onClick={() => selectLocation(loc)}
                    className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-[var(--surface-subtle)] flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-bold text-[var(--text)]">{loc.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {[loc.region, loc.country].filter(Boolean).join(', ')}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleUseGps}
                disabled={gpsLoading}
                className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 cursor-pointer disabled:opacity-50"
              >
                {gpsLoading ? 'Locating…' : '📍 Use GPS'}
              </button>
              {DEFAULT_WISCONSIN_PRESETS.slice(0, 5).map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => selectLocation(preset)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3 Full-Width Segmented Buttons: Today | Hourly | 10-Day */}
        <div
          role="tablist"
          aria-label="Weather view switcher"
          className="grid grid-cols-3 gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl p-1"
        >
          {(
            [
              { id: 'TODAY', label: 'Today' },
              { id: 'HOURLY', label: 'Hourly' },
              { id: 'TEN_DAY', label: '10-Day' },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-2 rounded-lg text-xs font-black tracking-wide transition-all cursor-pointer ${
                  isActive
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

      {/* Error Notice */}
      {errorMsg && (
        <div className="bg-red-950/40 border border-red-500/40 text-red-200 rounded-xl px-3 py-2 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Initial Loading State */}
      {loading && !weather && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center space-y-1.5">
          <div className="text-2xl animate-pulse">🌦️</div>
          <p className="text-xs font-bold text-[var(--text-muted)]">
            Loading forecast for {formatLocationLabel(currentLocation)}…
          </p>
        </div>
      )}

      {/* ============================================================
          VIEW 1: TODAY (DEFAULT — FITS ON 1 SCREEN, ZERO REPETITION)
         ============================================================ */}
      {weather && current && guard && activeTab === 'TODAY' && (
        <section role="tabpanel" aria-label="Today weather" className="space-y-2.5">
          {/* 1 Main Current Card */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-md space-y-4">
            {/* Big Temp + Condition */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-4xl leading-none">{current.precipIcon}</span>
                <div>
                  <div className="text-4xl font-black tracking-tight text-[var(--text)] leading-none">
                    {current.temp}°F
                  </div>
                  <div className="text-xs font-bold text-[var(--text-muted)] mt-1">
                    {todayConditionLine}
                  </div>
                </div>
              </div>

              {todayDaily && (
                <div className="text-right shrink-0">
                  <div className="text-xs font-black text-[var(--text)]">
                    H {todayDaily.tempMax}° / L {todayDaily.tempMin}°
                  </div>
                  {current.precipMode !== 'DRY' && (
                    <span
                      className={`inline-block mt-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${getPrecipPillStyle(
                        current.precipMode
                      )}`}
                    >
                      {current.precipTypeLabel} {current.rainProb}%
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Single Compact Row: Feels Like | Wind / Gusts | Humidity */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 text-center">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                  Feels Like
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5">
                  {current.feelsLike}°F
                </div>
              </div>

              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 text-center">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                  Wind / Gusts
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5">
                  {current.windSpeed}{' '}
                  <span className="text-[10.5px] font-bold text-[var(--text-muted)]">
                    / G{current.windGusts}
                  </span>
                </div>
              </div>

              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 text-center">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                  Humidity
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5">
                  {current.humidity}%
                </div>
              </div>
            </div>

            {/* Single Exterior Work Badge (GO / CAUTION / NO-GO) + One Short Sentence Why */}
            {todayWorkBadge && (
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 flex items-start gap-2.5">
                <span
                  className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full shrink-0 tracking-wider ${todayWorkBadge.pill}`}
                >
                  {todayWorkBadge.label}
                </span>
                <p className="text-xs text-[var(--text)] leading-snug">
                  {guard.paintingSummary}
                </p>
              </div>
            )}
          </div>

          {/* Conditional Snow/Freeze Banner — ONLY rendered when snowfall > 0 in 48h OR temp < 32°F today */}
          {showSnowOrFreezeBanner && (
            <div className="rounded-2xl border border-sky-400/50 bg-sky-950/35 px-3.5 py-3 flex items-start gap-2.5 shadow-sm">
              <span className="text-lg leading-none mt-0.5">
                {hasSnow48h ? '❄️' : '🌡️'}
              </span>
              <div className="space-y-0.5">
                <div className="text-xs font-black text-sky-200">
                  {hasSnow48h && hasFreezeToday
                    ? `Snow & Freeze Alert (${formatSnowInches(snowNext48h)} next 48h • Low ${todayDaily?.tempMin ?? current.temp}°F)`
                    : hasSnow48h
                    ? `Snow Alert — ${formatSnowInches(snowNext48h)} projected next 48 hours`
                    : `Freeze Alert — Low of ${todayDaily?.tempMin ?? current.temp}°F today`}
                </div>
                <p className="text-[11px] text-sky-100/80 leading-snug">
                  Keep waterborne paint, primers, and caulk indoors above 35°F and watch slick surfaces.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============================================================
          VIEW 2: HOURLY (CLEAN 24-HOUR VERTICAL LIST — 1 ROW PER HOUR)
         ============================================================ */}
      {weather && activeTab === 'HOURLY' && (
        <section
          role="tabpanel"
          aria-label="Hourly forecast"
          className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm"
        >
          <div className="grid grid-cols-[1.2fr_0.65fr_0.8fr_1.35fr] px-3.5 py-2 bg-[var(--bg)]/85 border-b border-[var(--border)] text-[9.5px] font-black uppercase tracking-wider text-[var(--text-muted)]">
            <span>Time</span>
            <span className="text-center">Sky</span>
            <span className="text-center">Temp</span>
            <span className="text-right">Precip</span>
          </div>

          <div className="divide-y divide-[var(--border)]/60">
            {hourly24.map((h, idx) => {
              const isNow = idx === 0;
              const isSnow = h.snowfallIn > 0;
              const isRain = !isSnow && (h.rainIn > 0 || h.rainProb >= 15 || h.precipMode === 'RAIN');
              const rowIcon = isSnow ? '❄️' : isRain ? h.precipIcon : h.precipIcon;

              return (
                <div
                  key={h.isoTime}
                  className={`grid grid-cols-[1.2fr_0.65fr_0.8fr_1.35fr] items-center px-3.5 py-2 text-xs ${
                    isNow ? 'bg-[var(--accent)]/12' : ''
                  }`}
                >
                  <span className={isNow ? 'text-[var(--accent)] font-black' : 'font-bold text-[var(--text)]'}>
                    {h.timeStr}
                    {h.dayLabel !== 'Today' && (
                      <span className="ml-1 text-[9.5px] font-semibold text-[var(--text-muted)]">
                        {h.dayLabel}
                      </span>
                    )}
                  </span>

                  <span className="text-base text-center leading-none">{rowIcon}</span>

                  <span className="text-center font-black text-[var(--text)]">{h.temp}°</span>

                  <span className="text-right">
                    {isSnow ? (
                      <span className="text-[11px] font-extrabold text-sky-300">
                        ❄️ {h.rainProb}%
                      </span>
                    ) : isRain ? (
                      <span className="text-[11px] font-extrabold text-blue-300">
                        🌧️ {h.rainProb}%
                      </span>
                    ) : (
                      <span className="text-[10.5px] font-bold text-emerald-400/80">
                        Clear
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ============================================================
          VIEW 3: 10-DAY (10 COMPACT SINGLE-LINE ROWS + TAP TO EXPAND 1 DAY)
         ============================================================ */}
      {weather && activeTab === 'TEN_DAY' && (
        <section
          role="tabpanel"
          aria-label="10-Day forecast"
          className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm"
        >
          <div className="divide-y divide-[var(--border)]">
            {daily10.map((day: DailyForecast) => {
              const isExpanded = expandedDayDate === day.dateStr;
              const badge = getWorkBadgeMeta(day.workability);

              const precipText =
                day.precipMode === 'WINTRY_MIX'
                  ? `🌨️ ${day.rainProb}%`
                  : day.precipMode === 'SNOW'
                  ? `❄️ ${day.rainProb}%`
                  : day.precipMode === 'RAIN'
                  ? `🌧️ ${day.rainProb}%`
                  : 'Dry';

              return (
                <div key={day.dateStr}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedDayDate((prev) => (prev === day.dateStr ? null : day.dateStr))
                    }
                    aria-expanded={isExpanded}
                    className="w-full px-3 py-2.5 grid grid-cols-[1.35fr_0.4fr_0.85fr_0.95fr_0.25fr] items-center gap-1 hover:bg-[var(--surface-subtle)]/60 text-left cursor-pointer"
                  >
                    <span className="text-xs font-extrabold text-[var(--text)] truncate">
                      {day.dayName}
                    </span>

                    <span className="text-base text-center leading-none">{day.precipIcon}</span>

                    <span className="text-center">
                      <span
                        className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${getPrecipPillStyle(
                          day.precipMode
                        )}`}
                      >
                        {precipText}
                      </span>
                    </span>

                    <span className="text-right text-xs font-black text-[var(--text)] whitespace-nowrap">
                      <span className="text-[var(--text-muted)] font-semibold">{day.tempMin}°</span>
                      <span className="mx-0.5 text-[var(--text-muted)]">/</span>
                      <span>{day.tempMax}°</span>
                    </span>

                    <span className="flex justify-end items-center">
                      <span
                        className={`w-2.5 h-2.5 rounded-full inline-block ${badge.dot}`}
                        title={badge.label}
                      />
                    </span>
                  </button>

                  {/* Single-Day Inline Details (Snow hidden completely whenever snowfallIn === 0) */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3 pt-2 bg-[var(--bg)]/80 border-t border-[var(--border)]/60 space-y-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                        <span className="font-bold text-[var(--text)]">
                          💨 Wind {day.windSpeedMax} mph (Gusts {day.windGustsMax} mph)
                        </span>
                        {day.rainSumIn > 0 && (
                          <span className="font-extrabold text-blue-300">
                            🌧️ Rain: {formatRainInches(day.rainSumIn)}
                          </span>
                        )}
                        {day.snowfallIn > 0 && (
                          <span className="font-extrabold text-sky-300">
                            ❄️ Snow: {formatSnowInches(day.snowfallIn)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                          {day.workabilityHint}
                        </p>
                        <span
                          className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${badge.pill}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
