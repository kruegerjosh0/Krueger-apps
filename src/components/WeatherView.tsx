import React, { useState, useEffect, useCallback } from 'react';
import {
  DailyForecast,
  HourlyForecast,
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

type WeatherTabId = 'NOW' | 'HOURLY' | 'TEN_DAY';

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

function getShortConditionLabel(
  code: number,
  options?: { snowfallIn?: number; allowSnowLabel?: boolean }
): string {
  if (options?.snowfallIn && options.snowfallIn > 0) {
    if (code === 75 || code === 86) return 'Heavy Snow';
    if (code === 71) return 'Light Snow';
    return 'Snow';
  }
  switch (code) {
    case 0:
      return 'Clear';
    case 1:
      return 'Mostly Clear';
    case 2:
      return 'Partly Cloudy';
    case 3:
      return 'Overcast';
    case 45:
      return 'Fog';
    case 48:
      return 'Freezing Fog';
    case 51:
      return 'Light Drizzle';
    case 53:
    case 55:
      return 'Drizzle';
    case 56:
    case 57:
      return 'Frz Drizzle';
    case 61:
      return 'Light Rain';
    case 63:
      return 'Rain';
    case 65:
      return 'Heavy Rain';
    case 66:
    case 67:
      return 'Freezing Rain';
    case 71:
      return options?.allowSnowLabel === false ? 'Cloudy' : 'Light Snow';
    case 73:
    case 77:
      return options?.allowSnowLabel === false ? 'Overcast' : 'Snow';
    case 75:
      return options?.allowSnowLabel === false ? 'Overcast' : 'Heavy Snow';
    case 80:
      return 'Showers';
    case 81:
    case 82:
      return 'Heavy Rain';
    case 85:
    case 86:
      return options?.allowSnowLabel === false ? 'Cloudy' : 'Snow Showers';
    case 95:
    case 96:
    case 99:
      return 'Storms';
    default:
      return 'Cloudy';
  }
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

  // Strict single-view tab state: Now (default) | Hourly | 10-Day
  const [activeTab, setActiveTab] = useState<WeatherTabId>('NOW');
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
  const hourly36 = weather?.hourly.slice(0, 36) || [];
  const daily10 = weather?.daily.slice(0, 10) || [];
  const todayDaily = daily10[0];

  // Now conditional Snow/Freeze banner check:
  // ONLY show if snowfall_sum > 0 in next 48h (today + tomorrow) OR temps drop below 32°F today
  const snowNext48h =
    (daily10[0]?.snowfallIn || 0) + (daily10[1]?.snowfallIn || 0);
  const hasSnow48h = snowNext48h > 0;
  const hasFreezeToday =
    Boolean(current && current.temp < 32) ||
    Boolean(todayDaily && todayDaily.tempMin < 32);
  const showSnowOrFreezeBanner = hasSnow48h || hasFreezeToday;

  // Contractor & Precip Summary metrics for Now tab
  const dewSpread = current ? current.temp - current.dewPoint : 10;
  const dewPointNote =
    dewSpread <= 4
      ? { text: `Condensation risk (${dewSpread}° spread)`, tone: 'text-red-300' }
      : dewSpread <= 7
      ? { text: `Watch shade (${dewSpread}° spread)`, tone: 'text-amber-300' }
      : { text: `Safe spread (+${dewSpread}° above DP)`, tone: 'text-emerald-300' };

  const snow24h = hourly24.reduce((sum, h) => sum + (h.snowfallIn || 0), 0);
  const rain24h = hourly24.reduce((sum, h) => sum + (h.rainIn || 0), 0);
  const maxProb24h = hourly24.reduce((max, h) => Math.max(max, h.rainProb || 0), 0);

  const next24hPrecip =
    snow24h > 0 && rain24h > 0
      ? {
          value: `🌨️ ${formatSnowInches(snow24h)} Snow`,
          sub: `+ ${formatRainInches(rain24h)} rain · ${maxProb24h}%`,
          tone: 'text-purple-200',
        }
      : snow24h > 0
      ? {
          value: `❄️ ${formatSnowInches(snow24h)} Snow`,
          sub: `Peak chance ${maxProb24h}%`,
          tone: 'text-sky-200',
        }
      : rain24h > 0
      ? {
          value: `🌧️ ${formatRainInches(rain24h)} Rain`,
          sub: `Peak chance ${maxProb24h}%`,
          tone: 'text-blue-200',
        }
      : maxProb24h >= 20
      ? {
          value: `🌧️ Spotty (${maxProb24h}%)`,
          sub: 'Trace rain possible',
          tone: 'text-blue-200',
        }
      : {
          value: maxProb24h === 0 ? 'Dry (0%)' : `Dry (${maxProb24h}%)`,
          sub: 'Clear 24h exterior window',
          tone: 'text-emerald-300',
        };

  const todayHourlyGusts = hourly24
    .filter((h) => h.dayLabel === 'Today')
    .map((h) => h.windGusts || 0);
  const peakWindGustToday = Math.max(
    todayDaily?.windGustsMax || 0,
    current?.windGusts || 0,
    ...todayHourlyGusts
  );
  const peakGustNote =
    peakWindGustToday > 25
      ? { text: 'High gusts — skip spraying', tone: 'text-red-300' }
      : peakWindGustToday > 20
      ? { text: 'Gusts > 20 — brush/roll', tone: 'text-amber-300' }
      : { text: 'Calm for spray & ladders', tone: 'text-emerald-300' };

  // Group 36-hour forecast by day divider (Today, Tomorrow, etc.)
  const hourlyGroups: Array<{ label: string; items: Array<{ hour: HourlyForecast; isFirst: boolean }> }> = [];
  hourly36.forEach((h, idx) => {
    const label = h.dayDividerLabel || h.dayLabel;
    const lastGroup = hourlyGroups[hourlyGroups.length - 1];
    if (!lastGroup || lastGroup.label !== label) {
      hourlyGroups.push({ label, items: [{ hour: h, isFirst: idx === 0 }] });
    } else {
      lastGroup.items.push({ hour: h, isFirst: idx === 0 });
    }
  });

  // Format Now condition string cleanly (e.g. "Light Drizzle · Rain" or "Mostly Clear · Dry")
  const todayConditionLine = current
    ? current.precipMode === 'DRY'
      ? `${current.wmoDescription} · Dry`
      : `${current.wmoDescription} · ${current.precipTypeLabel}`
    : '';

  const todayWorkBadge = guard ? getWorkBadgeMeta(guard.paintingStatus) : null;

  return (
    <div className="flex flex-col gap-3 max-w-2xl mx-auto pb-20">
      {/* Slim Header Bar + 3 Full-Width Segmented Buttons */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-md flex flex-col gap-2.5">
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

        {/* 3 Full-Width Segmented Buttons: Now | Hourly | 10-Day */}
        <div
          role="tablist"
          aria-label="Weather view switcher"
          className="grid grid-cols-3 gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl p-1"
        >
          {(
            [
              { id: 'NOW', label: 'Now' },
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
          VIEW 1: NOW (DETAILED CURRENT OVERVIEW + CONTRACTOR SUMMARY)
         ============================================================ */}
      {weather && current && guard && activeTab === 'NOW' && (
        <section role="tabpanel" aria-label="Now weather" className="flex flex-col gap-3">
          {/* 1 Main Current Card */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-md flex flex-col gap-4">
            {/* Big Current Temp + Weather Icon (Left) | Condition + High/Low (Right) */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-4xl sm:text-5xl leading-none select-none" aria-hidden="true">
                  {current.precipIcon}
                </span>
                <div className="text-4xl sm:text-5xl font-black tracking-tight text-[var(--text)] leading-none tabular-nums">
                  {current.temp}°F
                </div>
              </div>

              <div className="min-w-0 text-right flex flex-col items-end gap-1">
                <div className="text-xs sm:text-sm font-extrabold text-[var(--text)] leading-snug">
                  {todayConditionLine}
                </div>
                {todayDaily && (
                  <div className="text-xs font-bold text-[var(--text-muted)] tabular-nums">
                    H {todayDaily.tempMax}° / L {todayDaily.tempMin}°
                  </div>
                )}
                {current.precipMode !== 'DRY' && (
                  <span
                    className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full ${getPrecipPillStyle(
                      current.precipMode
                    )}`}
                  >
                    {current.precipTypeLabel} {current.rainProb}%
                  </span>
                )}
              </div>
            </div>

            {/* Single Compact Row: Feels Like | Wind / Gusts | Humidity */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 text-center">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                  Feels Like
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5 tabular-nums">
                  {current.feelsLike}°F
                </div>
              </div>

              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 text-center">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                  Wind / Gusts
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5 tabular-nums whitespace-nowrap">
                  {current.windSpeed}{' '}
                  <span className="text-[10.5px] font-bold text-[var(--text-muted)]">
                    / G{current.windGusts}
                  </span>
                </div>
              </div>

              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 text-center">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                  Humidity
                </div>
                <div className="text-sm font-black text-[var(--text)] mt-0.5 tabular-nums">
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

          {/* 2x2 Contractor & Precip Summary Card */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 shadow-sm flex flex-col gap-2.5">
            <h3 className="text-[10.5px] font-black uppercase tracking-wider text-[var(--text-muted)]">
              Contractor &amp; Precip Summary
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {/* 1. Dew Point + Condensation Check */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 flex flex-col gap-0.5">
                <div className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                  Dew Point
                </div>
                <div className="text-sm font-black text-[var(--text)] tabular-nums">
                  {current.dewPoint}°F
                </div>
                <div className={`text-[10px] font-semibold leading-tight ${dewPointNote.tone}`}>
                  {dewPointNote.text}
                </div>
              </div>

              {/* 2. Next 24h Precip (Dynamic Snow / Rain / Dry) */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 flex flex-col gap-0.5">
                <div className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                  Next 24h Precip
                </div>
                <div className={`text-sm font-black tabular-nums ${next24hPrecip.tone}`}>
                  {next24hPrecip.value}
                </div>
                <div className="text-[10px] font-semibold text-[var(--text-muted)] leading-tight">
                  {next24hPrecip.sub}
                </div>
              </div>

              {/* 3. Peak Wind Gusts Today */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 flex flex-col gap-0.5">
                <div className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                  Peak Wind Gusts
                </div>
                <div
                  className={`text-sm font-black tabular-nums ${
                    peakWindGustToday > 20 ? 'text-amber-300' : 'text-[var(--text)]'
                  }`}
                >
                  {peakWindGustToday} mph
                </div>
                <div className={`text-[10px] font-semibold leading-tight ${peakGustNote.tone}`}>
                  {peakGustNote.text}
                </div>
              </div>

              {/* 4. Sunrise & Sunset */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 flex flex-col gap-0.5">
                <div className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                  Sunrise &amp; Sunset
                </div>
                <div className="text-xs sm:text-sm font-black text-[var(--text)] tabular-nums leading-snug">
                  <span className="whitespace-nowrap">🌅 {todayDaily?.sunrise || '—'}</span>
                  <span className="mx-1 text-[var(--text-muted)] font-semibold">·</span>
                  <span className="whitespace-nowrap">🌇 {todayDaily?.sunset || '—'}</span>
                </div>
                <div className="text-[10px] font-semibold text-[var(--text-muted)] leading-tight">
                  Daylight drying window
                </div>
              </div>
            </div>
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
          VIEW 2: HOURLY (DETAILED 36-HOUR BREAKDOWN WITH DAY DIVIDERS)
         ============================================================ */}
      {weather && activeTab === 'HOURLY' && (
        <section
          role="tabpanel"
          aria-label="Hourly forecast"
          className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm"
        >
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.75fr)_minmax(0,0.95fr)_minmax(0,0.95fr)] gap-1.5 px-3 py-2 bg-[var(--bg)] border-b border-[var(--border)] text-[9.5px] font-black uppercase tracking-wider text-[var(--text-muted)]">
            <span>Hour / Sky</span>
            <span className="text-center">Temp</span>
            <span className="text-center">Wind / Gusts</span>
            <span className="text-right">Precip</span>
          </div>

          <div>
            {hourlyGroups.map((group) => (
              <div key={group.label}>
                {/* Day Divider */}
                <div className="px-3 py-1.5 bg-[var(--surface-subtle)]/90 border-y border-[var(--border)] flex items-center justify-between">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-[var(--accent)]">
                    {group.label}
                  </span>
                  <span className="text-[9.5px] font-bold text-[var(--text-muted)]">
                    {group.items.length} {group.items.length === 1 ? 'hr' : 'hrs'}
                  </span>
                </div>

                <div className="divide-y divide-[var(--border)]/60">
                  {group.items.map(({ hour: h, isFirst }) => {
                    const isSnow = h.snowfallIn > 0;
                    const isRain =
                      !isSnow && (h.rainIn > 0 || h.rainProb >= 15 || h.precipMode === 'RAIN');
                    const rowIcon = isSnow ? '❄️' : h.precipIcon;
                    const shortLabel = getShortConditionLabel(h.weatherCode, {
                      snowfallIn: h.snowfallIn,
                      allowSnowLabel: false,
                    });
                    const isGusty = h.windGusts > 20;

                    return (
                      <div
                        key={h.isoTime}
                        className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.75fr)_minmax(0,0.95fr)_minmax(0,0.95fr)] items-center gap-1.5 px-3 py-2 text-xs ${
                          isFirst ? 'bg-[var(--accent)]/12' : ''
                        }`}
                      >
                        {/* Hour + Condition Icon & Short Label */}
                        <div className="min-w-0 flex flex-col">
                          <span
                            className={`text-xs leading-tight ${
                              isFirst
                                ? 'text-[var(--accent)] font-black'
                                : 'font-extrabold text-[var(--text)]'
                            }`}
                          >
                            {h.timeStr}
                          </span>
                          <span className="text-[10px] font-semibold text-[var(--text-muted)] truncate flex items-center gap-1 mt-0.5">
                            <span className="leading-none shrink-0" aria-hidden="true">
                              {rowIcon}
                            </span>
                            <span className="truncate">{shortLabel}</span>
                          </span>
                        </div>

                        {/* Temp + Feels Like */}
                        <div className="text-center flex flex-col items-center">
                          <span className="text-xs font-black text-[var(--text)] tabular-nums leading-tight">
                            {h.temp}°
                          </span>
                          <span className="text-[9.5px] font-semibold text-[var(--text-muted)] tabular-nums whitespace-nowrap mt-0.5">
                            Feels {h.feelsLike}°
                          </span>
                        </div>

                        {/* Wind / Gusts */}
                        <div className="text-center flex flex-col items-center">
                          <span
                            className={`text-[11px] font-extrabold tabular-nums whitespace-nowrap leading-tight ${
                              isGusty ? 'text-amber-300' : 'text-[var(--text)]'
                            }`}
                          >
                            {h.windSpeed}{' '}
                            <span
                              className={
                                isGusty
                                  ? 'text-amber-300 font-black'
                                  : 'text-[var(--text-muted)] font-bold'
                              }
                            >
                              / G{h.windGusts}
                            </span>
                          </span>
                          <span className="text-[9px] font-semibold text-[var(--text-muted)] mt-0.5">
                            mph
                          </span>
                        </div>

                        {/* Dynamic Precip Badge: Snow ONLY if snowfall > 0; otherwise Rain or muted 0% */}
                        <div className="flex justify-end">
                          {isSnow ? (
                            <span className="inline-flex flex-col items-end px-1.5 py-0.5 rounded-lg bg-sky-500/20 border border-sky-400/45 text-sky-200 leading-tight">
                              <span className="text-[10.5px] font-extrabold whitespace-nowrap tabular-nums">
                                ❄️ {h.rainProb}%
                              </span>
                              <span className="text-[9.5px] font-bold text-sky-100 whitespace-nowrap tabular-nums">
                                {formatSnowInches(h.snowfallIn)}
                              </span>
                            </span>
                          ) : isRain ? (
                            <span className="inline-flex flex-col items-end px-1.5 py-0.5 rounded-lg bg-blue-500/20 border border-blue-400/45 text-blue-200 leading-tight">
                              <span className="text-[10.5px] font-extrabold whitespace-nowrap tabular-nums">
                                🌧️ {h.rainProb}%
                              </span>
                              {h.rainIn > 0 && (
                                <span className="text-[9.5px] font-bold text-blue-100 whitespace-nowrap tabular-nums">
                                  {formatRainInches(h.rainIn)}
                                </span>
                              )}
                            </span>
                          ) : h.rainProb > 0 ? (
                            <span className="text-[10.5px] font-bold text-[var(--text-muted)]/85 whitespace-nowrap tabular-nums">
                              🌧️ {h.rainProb}%
                            </span>
                          ) : (
                            <span className="text-[10.5px] font-bold text-[var(--text-muted)]/55 tabular-nums">
                              0%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============================================================
          VIEW 3: 10-DAY (SINGLE-BAR COLLAPSIBLE ACCORDION ROWS)
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
              const compactDayLabel = day.dayName.startsWith('Tomorrow')
                ? 'Tomorrow'
                : day.dayName;
              const shortCondition = getShortConditionLabel(day.weatherCode, {
                snowfallIn: day.snowfallIn,
                allowSnowLabel: day.precipMode === 'SNOW' || day.precipMode === 'WINTRY_MIX',
              });

              const precipText =
                day.precipMode === 'WINTRY_MIX'
                  ? `🌨️ ${day.rainProb}%`
                  : day.precipMode === 'SNOW'
                  ? `❄️ ${day.rainProb}%`
                  : day.precipMode === 'RAIN'
                  ? `🌧️ ${day.rainProb}%`
                  : 'Dry';

              const precipAccum =
                day.snowfallIn > 0 && day.rainSumIn > 0
                  ? {
                      text: `🌨️ ${formatSnowInches(day.snowfallIn)} Snow`,
                      sub: `+ ${formatRainInches(day.rainSumIn)} Rain`,
                      tone: 'text-purple-200',
                    }
                  : day.snowfallIn > 0
                  ? {
                      text: `❄️ ${formatSnowInches(day.snowfallIn)} Snow`,
                      sub: `${day.rainProb}% snow chance`,
                      tone: 'text-sky-200',
                    }
                  : day.rainSumIn > 0
                  ? {
                      text: `🌧️ ${formatRainInches(day.rainSumIn)} Rain`,
                      sub: `${day.rainProb}% rain chance`,
                      tone: 'text-blue-200',
                    }
                  : day.precipMode === 'SNOW'
                  ? {
                      text: '❄️ Light Flurries',
                      sub: `${day.rainProb}% chance`,
                      tone: 'text-sky-200',
                    }
                  : day.precipMode === 'RAIN'
                  ? {
                      text: `🌧️ Spotty (${day.rainProb}%)`,
                      sub: 'Trace / light shower',
                      tone: 'text-blue-200',
                    }
                  : {
                      text: 'Dry',
                      sub: `${day.rainProb}% chance`,
                      tone: 'text-emerald-300',
                    };

              return (
                <div key={day.dateStr}>
                  {/* Single Horizontal Accordion Bar */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedDayDate((prev) => (prev === day.dateStr ? null : day.dateStr))
                    }
                    aria-expanded={isExpanded}
                    className={`w-full px-2.5 sm:px-3.5 py-2.5 grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)_50px_48px_52px_10px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_58px_56px_60px_14px] items-center gap-1 sm:gap-2 hover:bg-[var(--surface-subtle)]/60 text-left cursor-pointer transition-colors ${
                      isExpanded ? 'bg-[var(--surface-subtle)]/40' : ''
                    }`}
                  >
                    {/* Day */}
                    <span className="text-[11px] sm:text-xs font-extrabold text-[var(--text)] truncate">
                      {compactDayLabel}
                    </span>

                    {/* Icon + Short Condition */}
                    <span className="min-w-0 flex items-center gap-1">
                      <span className="text-sm leading-none shrink-0" aria-hidden="true">
                        {day.precipIcon}
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-semibold text-[var(--text-muted)] truncate">
                        {shortCondition}
                      </span>
                    </span>

                    {/* Dynamic Rain or Snow % */}
                    <span className="flex justify-center">
                      <span
                        className={`inline-block text-[9.5px] sm:text-[10px] font-extrabold px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap tabular-nums ${getPrecipPillStyle(
                          day.precipMode
                        )}`}
                      >
                        {precipText}
                      </span>
                    </span>

                    {/* Low° / High° */}
                    <span className="text-right text-[11px] sm:text-xs font-black text-[var(--text)] whitespace-nowrap tabular-nums">
                      <span className="text-[var(--text-muted)] font-semibold">{day.tempMin}°</span>
                      <span className="mx-0.5 text-[var(--text-muted)]">/</span>
                      <span>{day.tempMax}°</span>
                    </span>

                    {/* GO / CAUTION / NO-GO Pill */}
                    <span className="flex justify-center">
                      <span
                        className={`inline-block text-center w-full text-[8.5px] sm:text-[9.5px] font-black uppercase px-1 py-0.5 rounded-full whitespace-nowrap tracking-wide ${badge.pill}`}
                      >
                        {badge.label}
                      </span>
                    </span>

                    {/* Chevron */}
                    <span className="flex justify-end items-center">
                      <span
                        className={`text-[9px] text-[var(--text-muted)] inline-block transition-transform duration-200 ${
                          isExpanded ? 'rotate-180 text-[var(--accent)]' : ''
                        }`}
                        aria-hidden="true"
                      >
                        ▼
                      </span>
                    </span>
                  </button>

                  {/* Smooth Tap-to-Expand Inline Detail Drawer */}
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                      isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-3 pb-3 pt-2.5 bg-[var(--bg)]/85 border-t border-[var(--border)]/70 flex flex-col gap-2.5">
                        {/* 2x2 Contractor Metric Grid */}
                        <div className="grid grid-cols-2 gap-2">
                          {/* 1. Feels Like (High / Low) */}
                          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2 flex flex-col gap-0.5">
                            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                              Feels Like (Hi / Lo)
                            </span>
                            <span className="text-xs font-black text-[var(--text)] tabular-nums">
                              {day.feelsLikeMax}° / {day.feelsLikeMin}°F
                            </span>
                          </div>

                          {/* 2. Wind & Peak Gusts */}
                          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2 flex flex-col gap-0.5">
                            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                              Wind &amp; Peak Gusts
                            </span>
                            <span
                              className={`text-xs font-black tabular-nums ${
                                day.windGustsMax > 20 ? 'text-amber-300' : 'text-[var(--text)]'
                              }`}
                            >
                              {day.windSpeedMax} mph · G{day.windGustsMax}
                            </span>
                          </div>

                          {/* 3. Precip Accumulation */}
                          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2 flex flex-col gap-0.5">
                            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                              Precip Accumulation
                            </span>
                            <span className={`text-xs font-black tabular-nums ${precipAccum.tone}`}>
                              {precipAccum.text}
                            </span>
                            <span className="text-[9.5px] font-semibold text-[var(--text-muted)] leading-tight">
                              {precipAccum.sub}
                            </span>
                          </div>

                          {/* 4. Humidity & Dew Point */}
                          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2 flex flex-col gap-0.5">
                            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wide">
                              Humidity &amp; Dew Pt
                            </span>
                            <span className="text-xs font-black text-[var(--text)] tabular-nums">
                              {day.humidityMean}% · DP {day.dewPointMean}°F
                            </span>
                          </div>
                        </div>

                        {/* 1-Line Contractor Workability Note */}
                        <div className="bg-[var(--surface)]/80 border border-[var(--border)] rounded-xl px-2.5 py-2 flex items-start gap-2">
                          <span
                            className={`mt-1 w-2 h-2 rounded-full shrink-0 ${badge.dot}`}
                            aria-hidden="true"
                          />
                          <p className="text-[11px] font-medium text-[var(--text)] leading-snug">
                            {day.workabilityHint}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
