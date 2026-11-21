import React, { useState, useEffect, useCallback } from 'react';
import {
  LocationInfo,
  WorkabilityStatus,
  RegionalWeatherSnapshot,
} from '../types';
import {
  DEFAULT_WISCONSIN_PRESETS,
  searchLocations,
  getCurrentGpsPosition,
  fetchFullWeather,
  fetchRegionalSeWiWeather,
  formatInches,
  FullWeatherResponse,
} from '../utils/weatherService';

interface WeatherViewProps {
  currentLocation: LocationInfo;
  isFollowingGps?: boolean;
  onToggleFollowMe?: (follow: boolean) => void;
  onLocationChange: (loc: LocationInfo) => void;
}

const getWorkabilityBadgeClasses = (status: WorkabilityStatus): string => {
  switch (status) {
    case 'SNOW_ICE_RISK':
      return 'bg-red-500/20 text-red-300 border border-red-500/50';
    case 'CAUTION':
      return 'bg-amber-500/20 text-amber-300 border border-amber-500/50';
    case 'GO':
    default:
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50';
  }
};

const getWorkabilityDotClasses = (status: WorkabilityStatus): string => {
  switch (status) {
    case 'SNOW_ICE_RISK':
      return 'bg-red-400';
    case 'CAUTION':
      return 'bg-amber-400';
    case 'GO':
    default:
      return 'bg-emerald-400';
  }
};

export const WeatherView: React.FC<WeatherViewProps> = ({
  currentLocation,
  isFollowingGps = false,
  onToggleFollowMe,
  onLocationChange,
}) => {
  const [weather, setWeather] = useState<FullWeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Location search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);

  // View controls
  const [activeWeatherTab, setActiveWeatherTab] = useState<'OUTLOOK' | 'REGIONAL'>('OUTLOOK');
  const [hourlyRange, setHourlyRange] = useState<24 | 48>(24);
  const [dailyRange, setDailyRange] = useState<7 | 10>(10);

  // SE Wisconsin regional tracker state
  const [regionalData, setRegionalData] = useState<RegionalWeatherSnapshot[]>([]);
  const [regionalLoading, setRegionalLoading] = useState(false);
  const [regionalError, setRegionalError] = useState('');

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

  const loadRegionalData = useCallback(async () => {
    setRegionalLoading(true);
    setRegionalError('');
    try {
      const snapshots = await fetchRegionalSeWiWeather(DEFAULT_WISCONSIN_PRESETS);
      setRegionalData(snapshots);
    } catch (err: any) {
      setRegionalError(err.message || 'Unable to load Southeast Wisconsin regional tracker.');
    } finally {
      setRegionalLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeatherData(currentLocation.lat, currentLocation.lng);
  }, [currentLocation.lat, currentLocation.lng, loadWeatherData]);

  useEffect(() => {
    if (activeWeatherTab === 'REGIONAL' && regionalData.length === 0 && !regionalLoading) {
      loadRegionalData();
    }
  }, [activeWeatherTab, regionalData.length, regionalLoading, loadRegionalData]);

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
        setErrorMsg(`No locations found matching "${query}". Try another city, state, or zip.`);
      } else if (results.length === 1) {
        selectSearchedLocation(results[0]);
      }
    } catch {
      setErrorMsg('Location search failed. Please verify your connection.');
    } finally {
      setSearching(false);
    }
  };

  const selectSearchedLocation = (loc: LocationInfo) => {
    if (onToggleFollowMe) onToggleFollowMe(false);
    onLocationChange(loc);
    setSearchResults([]);
    setSearchQuery('');
    setShowLocationSearch(false);
  };

  const handleUseCurrentLocation = async () => {
    setGpsLoading(true);
    setErrorMsg('');
    try {
      const gpsLoc = await getCurrentGpsPosition();
      if (onToggleFollowMe) onToggleFollowMe(true);
      onLocationChange(gpsLoc);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not access device location. Check permissions.');
    } finally {
      setGpsLoading(false);
    }
  };

  const handleRefreshAll = () => {
    loadWeatherData(currentLocation.lat, currentLocation.lng);
    if (activeWeatherTab === 'REGIONAL') {
      loadRegionalData();
    }
  };

  const visibleHourly = weather ? weather.hourly.slice(0, hourlyRange) : [];
  const visibleDaily = weather ? weather.daily.slice(0, dailyRange) : [];
  const maxDailySnow = Math.max(1, ...visibleDaily.map((d) => d.snowfallIn));

  const getSeverityBannerStyle = (severity: NonNullable<FullWeatherResponse['winterOutlook']['severity']>) => {
    switch (severity) {
      case 'STORM_ALERT':
        return {
          wrapper: 'border-red-500/60 bg-gradient-to-br from-red-950/70 via-[#1b141a] to-[#121318]',
          badge: 'bg-red-500 text-white',
          badgeLabel: 'WINTER STORM / ICE ALERT',
        };
      case 'ADVISORY':
        return {
          wrapper: 'border-sky-400/50 bg-gradient-to-br from-sky-950/65 via-[#131b26] to-[#121318]',
          badge: 'bg-sky-500 text-slate-950',
          badgeLabel: 'SNOW & TRAVEL ADVISORY',
        };
      case 'COLD_WATCH':
        return {
          wrapper: 'border-cyan-400/45 bg-gradient-to-br from-cyan-950/55 via-[#121923] to-[#121318]',
          badge: 'bg-cyan-400 text-slate-950',
          badgeLabel: 'COLD & FREEZE WATCH',
        };
      case 'CLEAR':
      default:
        return {
          wrapper: 'border-emerald-500/40 bg-gradient-to-br from-emerald-950/45 via-[#131b18] to-[#121318]',
          badge: 'bg-emerald-500 text-slate-950',
          badgeLabel: 'CLEAR WINTER OUTLOOK',
        };
    }
  };

  const getAdvisoryToneClasses = (tone: 'danger' | 'warn' | 'cold' | 'ok') => {
    switch (tone) {
      case 'danger':
        return 'bg-red-500/12 border-red-500/35 text-red-100';
      case 'warn':
        return 'bg-amber-500/12 border-amber-500/35 text-amber-100';
      case 'cold':
        return 'bg-sky-500/12 border-sky-500/35 text-sky-100';
      case 'ok':
      default:
        return 'bg-emerald-500/12 border-emerald-500/35 text-emerald-100';
    }
  };

  return (
    <div className="space-y-3.5 max-w-2xl mx-auto pb-24 animate-in fade-in">
      {/* View Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold uppercase tracking-wide text-[#38bdf8] flex items-center gap-1.5">
            <span>❄️</span>
            <span>Winter &amp; Cold-Weather Tracker</span>
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Southeast WI snow outlook, wind chill, gusts &amp; contractor workability
            {weather?.fetchedAt ? ` • Updated ${weather.fetchedAt}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={loading || regionalLoading}
          className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--text)] flex items-center gap-1.5 cursor-pointer transition-transform active:scale-95 disabled:opacity-50 shadow-xs shrink-0"
          title="Refresh weather data"
        >
          <span className={loading || regionalLoading ? 'animate-spin' : ''}>🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Streamlined Location & GPS Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-3.5 shadow-md space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">📍</span>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-extrabold text-[var(--text)] flex items-center gap-2 flex-wrap">
                <span className="truncate">{currentLocation.name}</span>
                {currentLocation.region && (
                  <span className="text-xs text-[var(--text-muted)] font-normal">
                    ({currentLocation.region})
                  </span>
                )}
                {isFollowingGps ? (
                  <span className="bg-[#1c2e1f] text-[#30d158] border border-[#30d158]/50 text-[9px] font-black px-1.5 py-0.5 rounded uppercase flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse"></span>
                    Live GPS
                  </span>
                ) : (
                  <span className="bg-[#2c2317] text-[#f1c40f] border border-[#f1c40f]/40 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0">
                    Selected Site
                  </span>
                )}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                {currentLocation.lat.toFixed(3)}°N, {Math.abs(currentLocation.lng).toFixed(3)}°W
                {isFollowingGps ? ' • Auto-tracking device' : ' • Open-Meteo Live Model'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={gpsLoading}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-xs ${
                isFollowingGps
                  ? 'bg-[#1c2e1f] text-[#30d158] border-[#30d158]/60 font-black'
                  : 'bg-[var(--surface-subtle)] hover:bg-[var(--border)] border-[var(--border)] text-[var(--text)]'
              }`}
              title="Use your device's real-time GPS location"
            >
              <span>{gpsLoading ? '⏳' : '🛰️'}</span>
              <span>{gpsLoading ? 'Detecting...' : isFollowingGps ? 'GPS Active' : 'Use GPS'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowLocationSearch(!showLocationSearch)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1 shadow-xs ${
                showLocationSearch
                  ? 'bg-[#2c2317] text-[#f1c40f] border-[#f1c40f]/60'
                  : 'bg-[var(--surface-subtle)] hover:bg-[var(--border)] border-[var(--border)] text-[var(--text)]'
              }`}
              title="Search a different city or region"
            >
              <span>🔍</span>
              <span>{showLocationSearch ? 'Close' : 'Change City'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Location Lookup & SE Wisconsin Presets */}
        {showLocationSearch && (
          <div className="pt-2.5 border-t border-[var(--border)] space-y-2.5 animate-in slide-in-from-top-2">
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any town, city, or zip (e.g. West Bend, Hartford, Cedarburg)..."
                    className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[#38bdf8] text-[var(--text)] rounded-xl px-3 py-2 text-xs outline-none shadow-xs"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="absolute right-3 top-2 text-[var(--text-muted)] hover:text-[var(--text)] text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={searching || !searchQuery.trim()}
                  className="bg-[#f1c40f] hover:bg-[#e0b40e] text-[#231709] font-black text-xs px-3.5 py-2 rounded-xl cursor-pointer transition-all active:scale-95 disabled:opacity-50 shadow-xs shrink-0"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl z-30 max-h-52 overflow-y-auto divide-y divide-[var(--border)]">
                  {searchResults.map((loc, idx) => (
                    <button
                      key={`${loc.name}-${loc.lat}-${idx}`}
                      type="button"
                      onClick={() => selectSearchedLocation(loc)}
                      className="w-full text-left px-3.5 py-2 text-xs hover:bg-[var(--surface-subtle)] flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div>
                        <span className="font-extrabold text-[var(--text)]">{loc.name}</span>
                        <span className="text-[11px] text-[var(--text-muted)] ml-2">
                          {[loc.region, loc.country].filter(Boolean).join(', ')}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#38bdf8] font-bold">Select ➔</span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            <div>
              <span className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Southeast Wisconsin Shortcuts:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_WISCONSIN_PRESETS.map((preset) => {
                  const isSelected =
                    !currentLocation.isGps &&
                    currentLocation.name.toLowerCase() === preset.name.toLowerCase();
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => selectSearchedLocation(preset)}
                      className={`text-[10.5px] px-2.5 py-1 rounded-lg border transition-all active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-[#f1c40f] border-[#f1c40f] text-[#231709] font-black'
                          : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] font-semibold'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main View Segmented Tabs (Zero Broken External Embeds) */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl shadow-xs">
        <button
          type="button"
          onClick={() => setActiveWeatherTab('OUTLOOK')}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeWeatherTab === 'OUTLOOK'
              ? 'bg-[#f1c40f] text-[#231709] shadow-md'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          <span>❄️</span>
          <span>Winter &amp; Snow Outlook</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWeatherTab('REGIONAL')}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeWeatherTab === 'REGIONAL'
              ? 'bg-[#f1c40f] text-[#231709] shadow-md'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          <span>🗺️</span>
          <span>SE WI Regional Tracker</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: WINTER & SNOW OUTLOOK */}
      {activeWeatherTab === 'OUTLOOK' && weather && (
        <div className="space-y-3.5 animate-in fade-in">
          {/* 1. Prominent Winter & Snow Outlook Alert Summary Card */}
          {(() => {
            const outlook = weather.winterOutlook;
            const style = getSeverityBannerStyle(outlook.severity);
            return (
              <div className={`rounded-2xl border p-4 shadow-xl space-y-3 ${style.wrapper}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${style.badge}`}>
                        {style.badgeLabel}
                      </span>
                      <span className="text-[10px] font-bold text-slate-300">
                        Winter &amp; Snow Outlook • {currentLocation.name}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-white leading-snug">
                      {outlook.headline}
                    </h3>
                  </div>
                </div>

                {/* 48-Hour & 7-Day Snowfall + Cold/Gust KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-black/35 border border-white/10 rounded-xl p-2.5">
                    <span className="text-[9.5px] uppercase font-bold text-sky-300 tracking-wider block">
                      Next 48h Snow
                    </span>
                    <div className="text-xl font-black text-white leading-tight mt-0.5">
                      {formatInches(outlook.snow48hIn)}
                    </div>
                    <span className="text-[9.5px] text-slate-300">
                      {outlook.snow48hIn > 0 ? 'Accumulation' : 'Dry 48h'}
                    </span>
                  </div>

                  <div className="bg-black/35 border border-white/10 rounded-xl p-2.5">
                    <span className="text-[9.5px] uppercase font-bold text-cyan-300 tracking-wider block">
                      Next 7-Day Snow
                    </span>
                    <div className="text-xl font-black text-white leading-tight mt-0.5">
                      {formatInches(outlook.snow7dIn)}
                    </div>
                    <span className="text-[9.5px] text-slate-300">
                      {outlook.snowDaysCount7d > 0
                        ? `${outlook.snowDaysCount7d} winter ${outlook.snowDaysCount7d === 1 ? 'day' : 'days'}`
                        : '0 snow days'}
                    </span>
                  </div>

                  <div className="bg-black/35 border border-white/10 rounded-xl p-2.5">
                    <span className="text-[9.5px] uppercase font-bold text-blue-300 tracking-wider block">
                      7d Min Wind Chill
                    </span>
                    <div className="text-xl font-black text-white leading-tight mt-0.5">
                      {outlook.lowestFeelsLike7d}°F
                    </div>
                    <span className="text-[9.5px] text-slate-300">
                      Air Low: {outlook.lowestTemp7d}°F
                    </span>
                  </div>

                  <div className="bg-black/35 border border-white/10 rounded-xl p-2.5">
                    <span className="text-[9.5px] uppercase font-bold text-amber-300 tracking-wider block">
                      7d Peak Gusts
                    </span>
                    <div className="text-xl font-black text-white leading-tight mt-0.5">
                      {outlook.peakGust7d} <span className="text-xs font-bold">mph</span>
                    </div>
                    <span className="text-[9.5px] text-slate-300">
                      {outlook.freezingNights7d} freezing {outlook.freezingNights7d === 1 ? 'night' : 'nights'}
                    </span>
                  </div>
                </div>

                {/* Auto-Generated Snow, Freeze & Travel Advisories */}
                <div className="space-y-1.5">
                  {outlook.advisories.map((adv, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border px-3 py-2 text-xs flex items-start gap-2 ${getAdvisoryToneClasses(adv.tone)}`}
                    >
                      <span className="text-sm shrink-0 mt-0.5">{adv.icon}</span>
                      <div className="min-w-0">
                        <div className="font-extrabold text-[11.5px] leading-tight">{adv.title}</div>
                        <div className="text-[10.5px] opacity-90 leading-snug mt-0.5">{adv.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 2. Current Conditions & Workability Card */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-md space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                  Right Now • {currentLocation.name}
                </span>
                <div className="flex items-baseline gap-2.5 mt-0.5 flex-wrap">
                  <span className="text-4xl font-black tracking-tight text-[var(--text)]">
                    {weather.current.temp}°F
                  </span>
                  <span className="text-xs font-bold text-[#38bdf8]">
                    Feels like {weather.current.feelsLike}°F
                  </span>
                </div>
                <div className="text-xs font-bold text-[var(--text)] mt-1">
                  {weather.current.wmoDescription} • {weather.current.precipTypeLabel}
                </div>
              </div>

              <span
                className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0 ${getWorkabilityBadgeClasses(
                  weather.current.workability
                )}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${getWorkabilityDotClasses(weather.current.workability)}`} />
                {weather.current.workabilityLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-[var(--surface-subtle)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                <span className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] block">
                  Wind Chill
                </span>
                <div className="text-sm font-black text-[#38bdf8] mt-0.5">
                  {weather.current.feelsLike}°F
                </div>
              </div>

              <div className="bg-[var(--surface-subtle)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                <span className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] block">
                  Wind / Gusts
                </span>
                <div className="text-sm font-black text-[#f1c40f] mt-0.5">
                  {weather.current.windSpeed} / {weather.current.windGusts} mph
                </div>
              </div>

              <div className="bg-[var(--surface-subtle)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                <span className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] block">
                  Precip Risk
                </span>
                <div className="text-sm font-black text-[var(--accent)] mt-0.5">
                  {weather.current.rainProb}%
                </div>
              </div>

              <div className="bg-[var(--surface-subtle)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                <span className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] block">
                  Humidity
                </span>
                <div className="text-sm font-black text-[var(--accent-tertiary)] mt-0.5">
                  {weather.current.humidity}%
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--text)] leading-relaxed">
              {weather.current.advice}
            </div>
          </div>

          {/* 3. Hourly Snowfall, Wind Chill & Gust Timeline */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-md">
            <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#38bdf8]">
                ⏱️ Hourly Snow, Wind Chill &amp; Gusts
              </div>

              <div className="flex items-center gap-1 bg-[var(--surface-subtle)] p-0.5 rounded-lg border border-[var(--border)] text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setHourlyRange(24)}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                    hourlyRange === 24
                      ? 'bg-[#f1c40f] text-[#231709] font-black'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  24h
                </button>
                <button
                  type="button"
                  onClick={() => setHourlyRange(48)}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                    hourlyRange === 48
                      ? 'bg-[#f1c40f] text-[#231709] font-black'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  48h
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {visibleHourly.map((h, i) => {
                const isWinterPrecip =
                  h.snowfallIn > 0 ||
                  h.precipType === 'SNOW' ||
                  h.precipType === 'FREEZING_RAIN' ||
                  h.precipType === 'WINTRY_MIX';
                const isIce = h.precipType === 'FREEZING_RAIN';
                const isGusty = h.windGusts >= 25;

                return (
                  <div
                    key={h.isoTime || i}
                    className={`flex-shrink-0 min-w-[82px] p-2.5 rounded-xl border text-center flex flex-col gap-0.5 transition-all ${
                      isIce
                        ? 'bg-red-500/15 border-red-500/60'
                        : isWinterPrecip
                        ? 'bg-sky-500/15 border-sky-400/50'
                        : 'bg-[var(--surface-subtle)] border-[var(--border)]'
                    }`}
                  >
                    <span className="text-[9px] font-bold uppercase text-[var(--text-muted)]">
                      {h.dayLabel}
                    </span>
                    <span className="text-[10.5px] font-extrabold text-[var(--text)]">
                      {h.timeStr}
                    </span>
                    <span className="text-base leading-none my-0.5">{h.precipIcon}</span>
                    <span className="text-sm font-black text-[var(--text)]">{h.temp}°</span>
                    <span className="text-[9px] font-bold text-[#38bdf8]">
                      Feels {h.feelsLike}°
                    </span>

                    {h.snowfallIn > 0 ? (
                      <span className="text-[9.5px] font-black text-sky-300 bg-sky-500/20 rounded px-1 py-0.5 mt-0.5">
                        ❄️ +{formatInches(h.snowfallIn)}
                      </span>
                    ) : (
                      <span
                        className={`text-[9.5px] font-bold mt-0.5 ${
                          h.rainProb >= 40 ? 'text-amber-300' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {h.precipType === 'FREEZING_RAIN'
                          ? `🧊 ${h.rainProb}%`
                          : h.precipType === 'SNOW'
                          ? `❄️ ${h.rainProb}%`
                          : `💧 ${h.rainProb}%`}
                      </span>
                    )}

                    <span
                      className={`text-[8.5px] font-bold ${
                        isGusty ? 'text-amber-400' : 'text-[var(--text-muted)]'
                      }`}
                      title={`Wind ${h.windSpeed} mph, Gusts ${h.windGusts} mph`}
                    >
                      💨 {h.windSpeed}g{h.windGusts}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Multi-Day (7+ Day) Snowfall, Precip Type & Cold-Weather Workability Breakdown */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#f1c40f] block">
                  📅 {dailyRange}-Day Snowfall &amp; Contractor Workability
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  Thresholds: Exterior cutoff &lt;35–40°F • Freeze alert ≤32°F • Snow/Ice travel risk
                </span>
              </div>

              <div className="flex items-center gap-1 bg-[var(--surface-subtle)] p-0.5 rounded-lg border border-[var(--border)] text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setDailyRange(7)}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                    dailyRange === 7
                      ? 'bg-[#f1c40f] text-[#231709] font-black'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  7-Day
                </button>
                <button
                  type="button"
                  onClick={() => setDailyRange(10)}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                    dailyRange === 10
                      ? 'bg-[#f1c40f] text-[#231709] font-black'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  10-Day
                </button>
              </div>
            </div>

            {/* Compact Badge Legend */}
            <div className="flex flex-wrap gap-1.5 text-[9.5px] font-bold">
              <span className={`px-2 py-0.5 rounded-md ${getWorkabilityBadgeClasses('GO')}`}>
                ● Go (40°F+ &amp; Dry)
              </span>
              <span className={`px-2 py-0.5 rounded-md ${getWorkabilityBadgeClasses('CAUTION')}`}>
                ● Caution - Cold/Wind (&lt;40°F / Freeze / Gusts)
              </span>
              <span className={`px-2 py-0.5 rounded-md ${getWorkabilityBadgeClasses('SNOW_ICE_RISK')}`}>
                ● Snow/Ice Risk (Snow / Mix / Extreme Chill)
              </span>
            </div>

            <div className="space-y-2">
              {visibleDaily.map((d, idx) => {
                const snowPct = d.snowfallIn > 0 ? Math.min(100, Math.max(10, (d.snowfallIn / maxDailySnow) * 100)) : 0;
                const isSnowOrIceRow = d.workability === 'SNOW_ICE_RISK';

                return (
                  <div
                    key={d.dateStr || idx}
                    className={`p-3 rounded-xl border space-y-2 transition-colors ${
                      isSnowOrIceRow
                        ? 'bg-red-500/8 border-red-500/35'
                        : d.snowfallIn > 0
                        ? 'bg-sky-500/8 border-sky-500/30'
                        : 'bg-[var(--surface-subtle)] border-[var(--border)]'
                    }`}
                  >
                    {/* Top Row: Day, Condition, Workability Badge */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg leading-none shrink-0">{d.precipIcon}</span>
                        <div className="min-w-0">
                          <div className="font-extrabold text-xs text-[var(--text)] truncate">
                            {d.dayName}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] truncate">
                            {d.wmoDescription} • {d.precipTypeLabel} ({d.rainProb}%)
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[9.5px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md flex items-center gap-1.5 shrink-0 ${getWorkabilityBadgeClasses(
                          d.workability
                        )}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${getWorkabilityDotClasses(d.workability)}`} />
                        {d.workabilityLabel}
                      </span>
                    </div>

                    {/* Middle Metrics Grid: Temp, Feels Like, Snowfall, Gusts */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div className="bg-[var(--bg)]/60 border border-[var(--border)]/70 rounded-lg px-2.5 py-1.5">
                        <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] block">
                          High / Low
                        </span>
                        <span className="font-extrabold text-[var(--text)]">{d.tempMax}°</span>
                        <span className="text-[var(--text-muted)] mx-1">/</span>
                        <span className={d.tempMin <= 32 ? 'font-extrabold text-[#38bdf8]' : 'text-[var(--text-muted)] font-bold'}>
                          {d.tempMin}°F
                        </span>
                      </div>

                      <div className="bg-[var(--bg)]/60 border border-[var(--border)]/70 rounded-lg px-2.5 py-1.5">
                        <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] block">
                          Wind Chill
                        </span>
                        <span className="font-extrabold text-[#38bdf8]">
                          {d.feelsLikeMax}° / {d.feelsLikeMin}°F
                        </span>
                      </div>

                      <div className="bg-[var(--bg)]/60 border border-[var(--border)]/70 rounded-lg px-2.5 py-1.5">
                        <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] block">
                          Snow Total
                        </span>
                        <span
                          className={`font-black ${
                            d.snowfallIn >= 1
                              ? 'text-sky-300'
                              : d.snowfallIn > 0
                              ? 'text-cyan-300'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          ❄️ {formatInches(d.snowfallIn)}
                        </span>
                      </div>

                      <div className="bg-[var(--bg)]/60 border border-[var(--border)]/70 rounded-lg px-2.5 py-1.5">
                        <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] block">
                          Wind / Gusts
                        </span>
                        <span
                          className={`font-extrabold ${
                            d.windGustsMax >= 25 ? 'text-amber-400' : 'text-[var(--text)]'
                          }`}
                        >
                          💨 {d.windSpeedMax} / {d.windGustsMax} mph
                        </span>
                      </div>
                    </div>

                    {/* Visual Snowfall Bar when snow is projected */}
                    {d.snowfallIn > 0 && (
                      <div className="space-y-1">
                        <div className="w-full h-1.5 bg-[var(--bg)] rounded-full overflow-hidden border border-sky-500/20">
                          <div
                            className="h-full bg-gradient-to-r from-sky-400 to-cyan-200 rounded-full"
                            style={{ width: `${snowPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Planning Guidance Line */}
                    <div className="text-[10.5px] text-[var(--text-muted)] leading-snug">
                      {d.workabilityHint}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SOUTHEAST WISCONSIN REGIONAL TRACKER (Reliable Open-Meteo Batch Data + Official NWS/511 Links) */}
      {activeWeatherTab === 'REGIONAL' && (
        <div className="space-y-3.5 animate-in fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-[#38bdf8] uppercase tracking-wider">
                  🗺️ Washington County &amp; SE WI Winter Tracker
                </h3>
                <p className="text-[10.5px] text-[var(--text-muted)]">
                  Compare snow totals, wind chill &amp; gusts across job zones. Tap any city to view its full 10-day forecast.
                </p>
              </div>
              <button
                type="button"
                onClick={loadRegionalData}
                disabled={regionalLoading}
                className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] px-2.5 py-1 rounded-lg text-[10.5px] font-bold text-[var(--text)] cursor-pointer disabled:opacity-50"
              >
                {regionalLoading ? 'Updating...' : '🔄 Refresh All'}
              </button>
            </div>

            {regionalError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
                {regionalError}
              </div>
            )}

            {regionalLoading && regionalData.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--text-muted)]">
                <div className="animate-spin text-2xl mb-2">❄️</div>
                Loading Southeast Wisconsin snow &amp; wind chill conditions...
              </div>
            ) : (
              <div className="space-y-2">
                {regionalData.map((item) => {
                  const isActive =
                    !currentLocation.isGps &&
                    currentLocation.name.toLowerCase() === item.location.name.toLowerCase();

                  return (
                    <button
                      key={item.location.name}
                      type="button"
                      onClick={() => {
                        selectSearchedLocation(item.location);
                        setActiveWeatherTab('OUTLOOK');
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#2c2317]/60 border-[#f1c40f]'
                          : 'bg-[var(--surface-subtle)] border-[var(--border)] hover:border-[#38bdf8]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <div className="text-xs font-extrabold text-[var(--text)] flex items-center gap-1.5">
                            <span>{item.location.name}</span>
                            {isActive && (
                              <span className="text-[9px] bg-[#f1c40f] text-[#231709] px-1.5 py-0.2 rounded font-black uppercase">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {item.location.region} • {item.precipTypeLabel}
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1 ${getWorkabilityBadgeClasses(
                            item.workability
                          )}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${getWorkabilityDotClasses(item.workability)}`} />
                          {item.workabilityLabel}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 mt-2 pt-2 border-t border-[var(--border)]/60 text-[10.5px]">
                        <div>
                          <span className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block">
                            Temp / Chill
                          </span>
                          <span className="font-extrabold text-[var(--text)]">
                            {item.temp}° / <span className="text-[#38bdf8]">{item.feelsLike}°</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block">
                            48h Snow
                          </span>
                          <span className={item.snow48hIn > 0 ? 'font-black text-sky-300' : 'text-[var(--text-muted)] font-bold'}>
                            {formatInches(item.snow48hIn)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block">
                            7d Snow
                          </span>
                          <span className={item.snow7dIn > 0 ? 'font-black text-cyan-300' : 'text-[var(--text-muted)] font-bold'}>
                            {formatInches(item.snow7dIn)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block">
                            Gusts
                          </span>
                          <span className={item.windGusts >= 25 ? 'font-extrabold text-amber-400' : 'font-bold text-[var(--text)]'}>
                            {item.windGusts} mph
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Direct Official NWS & Wisconsin 511 Links (Reliable External Launch — Zero Broken Iframes) */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 shadow-md space-y-2.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#f1c40f]">
              🛰️ Official Wisconsin Radar &amp; Winter Road Conditions
            </div>
            <p className="text-[10.5px] text-[var(--text-muted)]">
              Opens official NOAA / Wisconsin DOT pages directly in your browser for live KMKX Doppler loops &amp; snowplow road reports.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <a
                href="https://radar.weather.gov/station/kmkx/standard"
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-xl bg-[var(--surface-subtle)] hover:bg-[#38bdf8]/15 border border-[var(--border)] hover:border-[#38bdf8]/60 text-xs font-extrabold text-[var(--text)] flex items-center justify-between transition-colors"
              >
                <span>📡 NWS KMKX Radar</span>
                <span className="text-[#38bdf8]">↗</span>
              </a>
              <a
                href="https://www.weather.gov/mkx/"
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-xl bg-[var(--surface-subtle)] hover:bg-[#f1c40f]/15 border border-[var(--border)] hover:border-[#f1c40f]/60 text-xs font-extrabold text-[var(--text)] flex items-center justify-between transition-colors"
              >
                <span>❄️ NWS SE WI Alerts</span>
                <span className="text-[#f1c40f]">↗</span>
              </a>
              <a
                href="https://511wi.gov/"
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-xl bg-[var(--surface-subtle)] hover:bg-emerald-500/15 border border-[var(--border)] hover:border-emerald-500/60 text-xs font-extrabold text-[var(--text)] flex items-center justify-between transition-colors"
              >
                <span>🛣️ 511WI Winter Roads</span>
                <span className="text-emerald-400">↗</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {loading && !weather && (
        <div className="text-center py-12 text-xs text-[var(--text-muted)]">
          <div className="animate-spin text-2xl mb-2">❄️</div>
          Loading winter &amp; snowfall outlook for {currentLocation.name}...
        </div>
      )}
    </div>
  );
};
