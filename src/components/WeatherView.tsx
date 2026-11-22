import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

function getGuardPillStyle(status: 'GO' | 'CAUTION' | 'HOLD'): string {
  switch (status) {
    case 'HOLD':
      return 'bg-red-500 text-white';
    case 'CAUTION':
      return 'bg-amber-400 text-slate-950';
    case 'GO':
    default:
      return 'bg-emerald-500 text-slate-950';
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
    return parts.length > 0 ? `Wintry Mix: ${parts.join(' + ')}` : `Wintry Mix (${day.rainProb}%)`;
  }
  if (day.precipMode === 'SNOW') {
    return day.snowfallIn > 0
      ? `Snow: ${formatSnowInches(day.snowfallIn)} (${day.rainProb}%)`
      : `Snow (${day.rainProb}%)`;
  }
  if (day.precipMode === 'RAIN') {
    return day.rainSumIn > 0
      ? `Rain: ${formatRainInches(day.rainSumIn)} (${day.rainProb}%)`
      : `Rain chance: ${day.rainProb}%`;
  }
  return 'Dry / Clear';
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

  // Strict single-panel active tab: Hourly (default) | 7-Day | Work Guard
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

  // Next 7 Days Alerts: ONLY days with snow, freeze risk (<=32°F), or rain
  const next7DayAlerts = useMemo(() => {
    return daily7
      .map((day) => {
        const tags: Array<{ label: string; tone: 'snow' | 'freeze' | 'rain' }> = [];
        if (day.precipMode === 'WINTRY_MIX') {
          const parts: string[] = [];
          if (day.snowfallIn > 0) parts.push(`${formatSnowInches(day.snowfallIn)} snow`);
          if (day.rainSumIn > 0) parts.push(`${formatRainInches(day.rainSumIn)} rain`);
          tags.push({
            label: `🌨️ Mix${parts.length ? ` (${parts.join(' + ')})` : ` (${day.rainProb}%)`}`,
            tone: 'snow',
          });
        } else if (day.precipMode === 'SNOW') {
          tags.push({
            label: `❄️ Snow${day.snowfallIn > 0 ? ` (${formatSnowInches(day.snowfallIn)})` : ` (${day.rainProb}%)`}`,
            tone: 'snow',
          });
        } else if (day.precipMode === 'RAIN') {
          tags.push({
            label: `${day.precipIcon} ${day.precipTypeLabel} (${day.rainProb}%${day.rainSumIn > 0 ? ` • ${formatRainInches(day.rainSumIn)}` : ''})`,
            tone: 'rain',
          });
        }

        if (day.tempMin <= 32) {
          tags.push({ label: `🌡️ Freeze (${day.tempMin}°F)`, tone: 'freeze' });
        }

        return { dayName: day.dayName, dateStr: day.dateStr, tags };
      })
      .filter((entry) => entry.tags.length > 0);
  }, [daily7]);

  const renderCurrentPrecipPill = () => {
    if (!current) return null;
    if (current.precipMode === 'WINTRY_MIX') {
      return (
        <span className={`inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${getPrecipBadgeStyle('WINTRY_MIX')}`}>
          <span>🌨️</span>
          <span>Wintry Mix</span>
        </span>
      );
    }
    if (current.precipMode === 'SNOW') {
      return (
        <span className={`inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${getPrecipBadgeStyle('SNOW')}`}>
          <span>❄️</span>
          <span>Snow • {current.rainProb}%</span>
        </span>
      );
    }
    if (current.precipMode === 'RAIN') {
      return (
        <span className={`inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${getPrecipBadgeStyle('RAIN')}`}>
          <span>{current.precipIcon}</span>
          <span>{current.precipTypeLabel} • {current.rainProb}%</span>
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${getPrecipBadgeStyle('DRY')}`}>
        <span>✓</span>
        <span>Dry / Clear</span>
      </span>
    );
  };

  return (
    <div className="space-y-2.5 max-w-2xl mx-auto pb-20">
      {/* Sticky Top Controls + 3-Tab Segmented Bar */}
      <div className="sticky top-[52px] sm:top-[60px] z-30 bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] rounded-2xl p-2.5 shadow-md space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            <span className="text-base shrink-0">{current?.precipIcon || '🌦️'}</span>
            <span className="text-xs sm:text-sm font-black text-[var(--text)] truncate">
              {currentLocation.name}
            </span>
            {isFollowingGps && (
              <span className="text-[8.5px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                GPS
              </span>
            )}
            {weather?.fetchedAt && (
              <span className="text-[9.5px] text-[var(--text-muted)] hidden sm:inline">
                • {weather.fetchedAt}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleUseGps}
              disabled={gpsLoading}
              className="px-2 py-1 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[10px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer disabled:opacity-50"
              title="Use GPS"
            >
              {gpsLoading ? '…' : '📍 GPS'}
            </button>
            <button
              type="button"
              onClick={() => setShowLocationPicker((prev) => !prev)}
              className={`px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                showLocationPicker
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)]'
              }`}
            >
              {showLocationPicker ? 'Done' : 'City'}
            </button>
            <button
              type="button"
              onClick={() => loadWeatherData(currentLocation.lat, currentLocation.lng)}
              disabled={loading}
              className="px-2 py-1 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[10px] text-[var(--text)] cursor-pointer disabled:opacity-50"
              aria-label="Refresh weather"
            >
              <span className={loading ? 'inline-block animate-spin' : ''}>🔄</span>
            </button>
          </div>
        </div>

        {/* Collapsible Location Picker */}
        {showLocationPicker && (
          <div className="pt-2 border-t border-[var(--border)] space-y-2">
            <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city or zip…"
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

            <div className="flex flex-wrap gap-1">
              {DEFAULT_WISCONSIN_PRESETS.slice(0, 6).map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => selectLocation(preset)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sticky 3-Tab Segmented Bar: Hourly | 7-Day | Work Guard */}
        <div
          role="tablist"
          aria-label="Weather tabs"
          className="grid grid-cols-3 gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl p-1"
        >
          {(
            [
              { id: 'HOURLY', label: 'Hourly' },
              { id: 'DAILY', label: '7-Day' },
              { id: 'GUARD', label: 'Work Guard' },
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
                className={`py-1.5 px-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
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
            Loading forecast for {currentLocation.name}…
          </p>
        </div>
      )}

      {/* ============================================================
          SINGLE ACTIVE PANEL — ONLY ONE TAB EXISTS IN DOM AT A TIME
         ============================================================ */}

      {/* TAB 1: HOURLY (DEFAULT) */}
      {weather && current && activeSubTab === 'HOURLY' && (
        <section role="tabpanel" aria-label="Hourly forecast" className="space-y-2.5">
          {/* Top Compact Hero Strip */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-3xl leading-none">{current.precipIcon}</span>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black text-[var(--text)] leading-none">
                      {current.temp}°F
                    </span>
                    <span className="text-[11px] font-bold text-[var(--text-muted)]">
                      Feels {current.feelsLike}°
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] mt-0.5">
                    {current.wmoDescription}
                  </div>
                </div>
              </div>
              {renderCurrentPrecipPill()}
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[var(--border)]/70 text-center">
              <div className="bg-[var(--bg)] rounded-xl py-1.5 px-2">
                <div className="text-[8.5px] uppercase font-bold text-[var(--text-muted)]">Wind</div>
                <div className="text-xs font-black text-[var(--text)]">
                  {current.windSpeed} <span className="text-[10px] font-semibold text-[var(--text-muted)]">/ G{current.windGusts}</span>
                </div>
              </div>
              <div className="bg-[var(--bg)] rounded-xl py-1.5 px-2">
                <div className="text-[8.5px] uppercase font-bold text-[var(--text-muted)]">Humidity</div>
                <div className="text-xs font-black text-[var(--text)]">{current.humidity}%</div>
              </div>
              <div className="bg-[var(--bg)] rounded-xl py-1.5 px-2">
                <div className="text-[8.5px] uppercase font-bold text-[var(--text-muted)]">Dew Pt</div>
                <div className="text-xs font-black text-[var(--text)]">{current.dewPoint}°F</div>
              </div>
            </div>
          </div>

          {/* Compact Scrollable 24-Hour List (1 clean row per hour: Time | Icon | Temp | Precip %) */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-[1.2fr_0.7fr_0.8fr_1.3fr] px-3 py-1.5 bg-[var(--bg)]/80 border-b border-[var(--border)] text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
              <span>Time</span>
              <span className="text-center">Sky</span>
              <span className="text-center">Temp</span>
              <span className="text-right">Precip</span>
            </div>

            <div className="max-h-[48vh] overflow-y-auto divide-y divide-[var(--border)]/60">
              {hourly24.map((h, idx) => {
                const isNow = idx === 0;
                const isSnowHour = h.snowfallIn > 0 && h.precipMode === 'SNOW';
                const isMixHour = h.snowfallIn > 0 && h.precipMode === 'WINTRY_MIX';
                const isRainHour = h.precipMode === 'RAIN';

                return (
                  <div
                    key={h.isoTime}
                    className={`grid grid-cols-[1.2fr_0.7fr_0.8fr_1.3fr] items-center px-3 py-2 text-xs ${
                      isNow ? 'bg-[var(--accent)]/12 font-extrabold' : ''
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

                    <span className="text-base text-center leading-none">{h.precipIcon}</span>

                    <span className="text-center font-black text-[var(--text)]">{h.temp}°</span>

                    <span className="text-right">
                      {isMixHour ? (
                        <span className="text-[10.5px] font-extrabold text-purple-300">
                          🌨️ Mix {h.rainProb}%
                        </span>
                      ) : isSnowHour ? (
                        <span className="text-[10.5px] font-extrabold text-sky-300">
                          ❄️ Snow {h.rainProb}%
                        </span>
                      ) : isRainHour ? (
                        <span className="text-[10.5px] font-extrabold text-blue-300">
                          {h.precipIcon} Rain {h.rainProb}%
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-400/80">Dry</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: 7-DAY (COMPACT SINGLE-LINE ROWS + SINGLE ACCORDION DRAWER) */}
      {weather && activeSubTab === 'DAILY' && (
        <section
          role="tabpanel"
          aria-label="7-Day forecast"
          className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm"
        >
          <div className="divide-y divide-[var(--border)]">
            {daily7.map((day) => {
              const isExpanded = expandedDayDate === day.dateStr;

              const precipBadgeText =
                day.precipMode === 'WINTRY_MIX'
                  ? `Mix ${day.rainProb}%`
                  : day.precipMode === 'SNOW'
                  ? `Snow ${day.rainProb}%`
                  : day.precipMode === 'RAIN'
                  ? `Rain ${day.rainProb}%`
                  : 'Dry / Clear';

              return (
                <div key={day.dateStr}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedDayDate((prev) => (prev === day.dateStr ? null : day.dateStr))
                    }
                    aria-expanded={isExpanded}
                    className="w-full px-3 py-2.5 grid grid-cols-[1.35fr_0.45fr_1.05fr_0.95fr] items-center gap-1.5 hover:bg-[var(--surface-subtle)]/60 text-left cursor-pointer"
                  >
                    <span className="text-xs font-extrabold text-[var(--text)] truncate">
                      {day.dayName}
                    </span>

                    <span className="text-base text-center leading-none">{day.precipIcon}</span>

                    <span className="flex justify-center">
                      <span
                        className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${getPrecipBadgeStyle(
                          day.precipMode
                        )}`}
                      >
                        {precipBadgeText}
                      </span>
                    </span>

                    <span className="text-right text-xs font-black text-[var(--text)] whitespace-nowrap">
                      <span className="text-[var(--text-muted)] font-semibold">{day.tempMin}°</span>
                      <span className="mx-0.5 text-[var(--text-muted)]">/</span>
                      <span>{day.tempMax}°</span>
                      <span
                        className={`ml-1.5 inline-block text-[10px] text-[var(--text-muted)] transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      >
                        ▾
                      </span>
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-2 bg-[var(--bg)]/75 border-t border-[var(--border)]/60 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold text-[var(--text)]">
                          💨 Gusts: {day.windGustsMax} mph{' '}
                          <span className="text-[var(--text-muted)] font-normal">
                            (wind {day.windSpeedMax} mph)
                          </span>
                        </span>
                        <span className="font-extrabold text-[var(--text)]">
                          {renderDailyAccumulationText(day)}
                        </span>
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
        </section>
      )}

      {/* TAB 3: WORK GUARD (ONE READINESS CARD + COMPACT NEXT 7 DAYS ALERTS BOX) */}
      {weather && guard && activeSubTab === 'GUARD' && (
        <section role="tabpanel" aria-label="Work Guard" className="space-y-2.5">
          {/* Card 1: Exterior Paint & Wash Readiness */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                Exterior Paint &amp; Wash Readiness
              </h3>
              <span className="text-[10px] font-bold text-[var(--accent)] truncate">
                {guard.bestWindowLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-black text-[var(--text)]">🎨 Painting</span>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${getGuardPillStyle(guard.paintingStatus)}`}>
                    {guard.paintingLabel}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] leading-snug">
                  {guard.paintingSummary}
                </p>
              </div>

              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-black text-[var(--text)]">💦 Washing</span>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${getGuardPillStyle(guard.washingStatus)}`}>
                    {guard.washingLabel}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] leading-snug">
                  {guard.washingSummary}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {guard.checks.map((chk) => {
                const tone = getCheckToneStyle(chk.status);
                return (
                  <div
                    key={chk.id}
                    className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-1.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                        {chk.label}
                      </div>
                      <div className="text-[11px] font-black text-[var(--text)] truncate">
                        {chk.reading}
                      </div>
                    </div>
                    <span className={`text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${tone.pill}`}>
                      {tone.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 2: Next 7 Days Alerts (ONLY days with snow, freeze risk, or rain) */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                Next 7 Days Alerts
              </h3>
              <span className="text-[10px] font-bold text-[var(--text-muted)]">
                {next7DayAlerts.length === 0
                  ? '0 alerts'
                  : `${next7DayAlerts.length} flagged ${next7DayAlerts.length === 1 ? 'day' : 'days'}`}
              </span>
            </div>

            {next7DayAlerts.length === 0 ? (
              <div className="bg-emerald-950/25 border border-emerald-500/40 rounded-xl px-3 py-2.5 text-xs font-extrabold text-emerald-300 text-center">
                ✓ All clear for exterior work
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]/70 bg-[var(--bg)] border border-[var(--border)] rounded-xl overflow-hidden">
                {next7DayAlerts.map((item) => (
                  <div
                    key={item.dateStr}
                    className="px-3 py-2 flex items-center justify-between gap-2 flex-wrap"
                  >
                    <span className="text-xs font-extrabold text-[var(--text)]">
                      {item.dayName}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {item.tags.map((tag, i) => (
                        <span
                          key={i}
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            tag.tone === 'snow'
                              ? 'bg-sky-500/20 text-sky-200 border border-sky-400/45'
                              : tag.tone === 'freeze'
                              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/45'
                              : 'bg-blue-500/20 text-blue-200 border border-blue-400/45'
                          }`}
                        >
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
