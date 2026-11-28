import React, { useState, useEffect, useCallback } from 'react';
import {
  DailyForecast,
  HourlyForecast,
  LocationInfo,
  NextTwoHoursSlot,
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
import { WeatherRadar } from './WeatherRadar';

interface WeatherViewProps {
  currentLocation: LocationInfo;
  isFollowingGps?: boolean;
  onToggleFollowMe?: (follow: boolean) => void;
  onLocationChange: (loc: LocationInfo) => void;
}

type WeatherTabId = 'NOW' | 'HOURLY' | 'DAILY' | 'RADAR';

function getWorkBadgeMeta(status: 'GO' | 'CAUTION' | 'HOLD' | WorkabilityStatus): {
  label: 'GO' | 'CAUTION' | 'NO-GO';
  pill: string;
  dot: string;
} {
  if (status === 'HOLD' || status === 'SNOW_ICE_RISK') {
    return {
      label: 'NO-GO',
      pill: 'bg-red-500/90 text-white',
      dot: 'bg-red-500',
    };
  }
  if (status === 'CAUTION') {
    return {
      label: 'CAUTION',
      pill: 'bg-amber-400 text-black',
      dot: 'bg-amber-400',
    };
  }
  return {
    label: 'GO',
    pill: 'bg-emerald-500 text-black',
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
      return 'Freezing Drizzle';
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
      return 'Rain Showers';
    case 81:
    case 82:
      return 'Heavy Showers';
    case 85:
    case 86:
      return options?.allowSnowLabel === false ? 'Cloudy' : 'Snow Showers';
    case 95:
    case 96:
    case 99:
      return 'Thunderstorms';
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

function getMinuteBarSegmentClass(mode: PrecipMode, allDry: boolean): string {
  if (allDry || mode === 'DRY') return 'bg-emerald-500';
  switch (mode) {
    case 'SNOW':
      return 'bg-sky-400';
    case 'WINTRY_MIX':
      return 'bg-amber-400';
    case 'RAIN':
      return 'bg-blue-500';
    default:
      return 'bg-emerald-500';
  }
}

interface MinuteCastSummary {
  allDry: boolean;
  headline: string;
  subline: string;
  badgeText: string;
  badgeColor: string;
  icon: string;
}

function summarizeNextTwoHours(slots: NextTwoHoursSlot[]): MinuteCastSummary {
  const activeSlots = slots.filter((s) => s.mode !== 'DRY');
  if (activeSlots.length === 0) {
    return {
      allDry: true,
      headline: 'Dry for the next 2 hours • Clear exterior work window',
      subline: 'No rain or snow expected over the next 120 minutes',
      badgeText: 'DRY',
      badgeColor: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/45',
      icon: '☀️',
    };
  }

  const hasSnow = activeSlots.some((s) => s.mode === 'SNOW');
  const hasMix = activeSlots.some((s) => s.mode === 'WINTRY_MIX');
  const precipWord = hasMix ? 'Wintry mix' : hasSnow ? 'Snow' : 'Rain';
  const icon = hasMix ? '🌨️' : hasSnow ? '❄️' : '🌧️';
  const badgeColor = hasMix
    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/45'
    : hasSnow
    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/45'
    : 'bg-blue-500/20 text-blue-300 border border-blue-400/45';

  const firstWetIdx = slots.findIndex((s) => s.mode !== 'DRY');
  const lastWetIdx = slots.reduce((last, s, i) => (s.mode !== 'DRY' ? i : last), firstWetIdx);
  const totalSnow = slots.reduce((sum, s) => sum + (s.snowfallIn || 0), 0);
  const totalRain = slots.reduce((sum, s) => sum + (s.rainIn || 0), 0);

  let timing = `${precipWord} expected within 2 hours`;
  if (firstWetIdx === 0) {
    const durationMin = (lastWetIdx + 1) * 15;
    timing =
      durationMin >= 120
        ? `${precipWord} continuing for the next 2 hours`
        : `${precipWord} ending in ~${durationMin} min`;
  } else {
    const startMin = firstWetIdx * 15;
    timing = `${precipWord} starting in ~${startMin} min`;
  }

  const subline =
    totalSnow > 0 && totalRain > 0
      ? `Est. ${formatSnowInches(totalSnow)} snow + ${formatRainInches(totalRain)} rain`
      : totalSnow > 0
      ? `Est. ${formatSnowInches(totalSnow)} snow next 2 hrs`
      : totalRain > 0
      ? `Est. ${formatRainInches(totalRain)} rain next 2 hrs`
      : 'Scattered shower activity';

  return {
    allDry: false,
    headline: `${timing} • ${subline}`,
    subline,
    badgeText: precipWord.toUpperCase(),
    badgeColor,
    icon,
  };
}

type PaintReadinessStatus = 'GOOD' | 'CAUTION' | 'STOP';

interface PaintReadinessItem {
  id: 'temp' | 'wind' | 'dew';
  title: string;
  status: PaintReadinessStatus;
  reading: string;
  detail: string;
}

function getReadinessPillClass(status: PaintReadinessStatus): string {
  if (status === 'STOP') {
    return 'bg-red-500/20 text-red-300 border border-red-500/45';
  }
  if (status === 'CAUTION') {
    return 'bg-amber-400/20 text-amber-300 border border-amber-400/45';
  }
  return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/45';
}

function mapWorkabilityToReadiness(status: WorkabilityStatus): PaintReadinessStatus {
  if (status === 'SNOW_ICE_RISK') return 'STOP';
  if (status === 'CAUTION') return 'CAUTION';
  return 'GOOD';
}

function evaluatePaintReadiness(
  current: FullWeatherResponse['current'],
  todayDaily?: DailyForecast
): { overall: PaintReadinessStatus; items: PaintReadinessItem[] } {
  const tonightLow = todayDaily?.tempMin ?? current.temp;
  const dewSpread = current.temp - current.dewPoint;

  // 1. Temperature & Overnight Low (35°F cold-rated min / 50°F standard min)
  let tempStatus: PaintReadinessStatus = 'GOOD';
  let tempDetail = 'Above 50°F safe coating range';
  if (current.temp < 35 || tonightLow < 32) {
    tempStatus = 'STOP';
    tempDetail =
      current.temp < 35
        ? 'Below 35°F minimum safe temp'
        : `Freeze tonight (${tonightLow}°) — cure risk`;
  } else if (current.temp < 50 || tonightLow < 40) {
    tempStatus = 'CAUTION';
    tempDetail =
      current.temp < 50
        ? '35–49°F — cold-rated coatings only'
        : `Cool overnight low (${tonightLow}°)`;
  }

  // 2. Wind & Spray Risk (flagging gusts >= 15-20 mph for ladder/overspray caution)
  let windStatus: PaintReadinessStatus = 'GOOD';
  let windDetail = 'Calm — safe for spraying & ladders';
  if (current.windGusts >= 25 || current.windSpeed >= 20) {
    windStatus = 'STOP';
    windDetail = 'High wind — hold spraying & ladder work';
  } else if (current.windGusts >= 15 || current.windSpeed >= 12) {
    windStatus = 'CAUTION';
    windDetail = 'Gusts ≥15 mph — overspray & ladder caution';
  }

  // 3. Dew Point Spread (warn if spread <= 5°F for condensation risk)
  let dewStatus: PaintReadinessStatus = 'GOOD';
  let dewDetail = 'Dry surface — safe paint adhesion';
  if (dewSpread <= 3) {
    dewStatus = 'STOP';
    dewDetail = '≤3°F spread — active condensation risk';
  } else if (dewSpread <= 5) {
    dewStatus = 'CAUTION';
    dewDetail = '≤5°F spread — condensation risk';
  }

  const items: PaintReadinessItem[] = [
    {
      id: 'temp',
      title: 'Temp & Overnight Low',
      status: tempStatus,
      reading: `Now ${current.temp}° · Low ${tonightLow}°`,
      detail: tempDetail,
    },
    {
      id: 'wind',
      title: 'Wind & Spray Risk',
      status: windStatus,
      reading: `${current.windSpeed} mph · Gusts ${current.windGusts}`,
      detail: windDetail,
    },
    {
      id: 'dew',
      title: 'Dew Point Spread',
      status: dewStatus,
      reading: `${dewSpread >= 0 ? '+' : ''}${dewSpread}°F (DP ${current.dewPoint}°)`,
      detail: dewDetail,
    },
  ];

  const hasActivePrecip =
    current.precipMode === 'SNOW' ||
    current.precipMode === 'WINTRY_MIX' ||
    current.rainIn > 0;

  let overall: PaintReadinessStatus = 'GOOD';
  if (hasActivePrecip || items.some((i) => i.status === 'STOP')) {
    overall = 'STOP';
  } else if (current.precipMode === 'RAIN' || items.some((i) => i.status === 'CAUTION')) {
    overall = 'CAUTION';
  }

  return { overall, items };
}

function formatDaylightRemaining(sunriseIso?: string, sunsetIso?: string): string {
  if (!sunriseIso || !sunsetIso) return '—';
  const sunriseMs = new Date(sunriseIso).getTime();
  const sunsetMs = new Date(sunsetIso).getTime();
  if (!Number.isFinite(sunriseMs) || !Number.isFinite(sunsetMs)) return '—';

  const nowMs = Date.now();
  const formatHm = (ms: number) => {
    const totalMins = Math.max(0, Math.round(ms / 60000));
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  if (nowMs < sunriseMs) {
    return `Sunrise in ${formatHm(sunriseMs - nowMs)}`;
  }
  if (nowMs <= sunsetMs) {
    return `${formatHm(sunsetMs - nowMs)} daylight left`;
  }
  return `After sunset · ${formatHm(sunsetMs - sunriseMs)} day`;
}

function formatVisibilityMiles(visMi?: number): string {
  if (typeof visMi !== 'number' || !Number.isFinite(visMi)) return '10+ mi';
  if (visMi >= 10) return '10+ mi';
  return `${visMi.toFixed(1)} mi`;
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

  // Strict single-panel AccuWeather tabs: NOW | HOURLY | DAILY
  const [activeTab, setActiveTab] = useState<WeatherTabId>('NOW');
  const [expandedHourIso, setExpandedHourIso] = useState<string | null>(null);
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
  const hourly36 = weather?.hourly.slice(0, 36) || [];
  const hourly48 = weather?.hourly.slice(0, 48) || [];
  const daily10 = weather?.daily.slice(0, 10) || [];
  const todayDaily = daily10[0];
  const tomorrowDaily = daily10[1];
  const nextSixHours = hourly36.slice(0, 6);
  const nextTwoHours = weather?.nextTwoHours || [];
  const [selectedRadarHourIdx, setSelectedRadarHourIdx] = useState<number>(0);

  const nextWetHour48 = hourly48.find(
    (h) => h.snowfallIn > 0 || h.rainIn > 0 || h.rainProb >= 20 || h.precipMode === 'RAIN'
  );
  const selectedRadarHour = hourly48[selectedRadarHourIdx] || hourly48[0] || null;

  // Conditional Snow/Freeze banner check: ONLY show when snow > 0 in next 48h OR temp < 32°F today
  const snowNext48h = (daily10[0]?.snowfallIn || 0) + (daily10[1]?.snowfallIn || 0);
  const hasSnow48h = snowNext48h > 0;
  const hasFreezeToday =
    Boolean(current && current.temp < 32) ||
    Boolean(todayDaily && todayDaily.tempMin < 32);
  const showSnowOrFreezeBanner = hasSnow48h || hasFreezeToday;

  const todayWorkBadge = guard ? getWorkBadgeMeta(guard.paintingStatus) : null;
  const minuteCast = summarizeNextTwoHours(nextTwoHours);
  const minuteBarSlots: NextTwoHoursSlot[] =
    nextTwoHours.length > 0
      ? nextTwoHours.slice(0, 8)
      : Array.from({ length: 8 }, (_, idx) => ({
          isoTime: '',
          minuteOffset: idx * 15,
          timeStr: idx === 0 ? 'Now' : `+${idx * 15}m`,
          rainIn: 0,
          snowfallIn: 0,
          precipIn: 0,
          precipProb: 0,
          mode: 'DRY' as PrecipMode,
        }));
  const dewSpread = current ? current.temp - current.dewPoint : 10;
  const paintReadiness = current ? evaluatePaintReadiness(current, todayDaily) : null;
  const daylightRemainingLabel = formatDaylightRemaining(
    todayDaily?.sunriseIso,
    todayDaily?.sunsetIso
  );

  // Group 36-hour forecast under day headers (TODAY, TOMORROW, etc.)
  const hourlyGroups: Array<{
    label: string;
    items: Array<{ hour: HourlyForecast; isFirst: boolean }>;
  }> = [];
  hourly36.forEach((h, idx) => {
    const label = (h.dayDividerLabel || h.dayLabel).toUpperCase();
    const lastGroup = hourlyGroups[hourlyGroups.length - 1];
    if (!lastGroup || lastGroup.label !== label) {
      hourlyGroups.push({ label, items: [{ hour: h, isFirst: idx === 0 }] });
    } else {
      lastGroup.items.push({ hour: h, isFirst: idx === 0 });
    }
  });

  // Global 10-day temperature bounds for AccuWeather range bars
  const minTemp10 = daily10.length > 0 ? Math.min(...daily10.map((d) => d.tempMin)) : 30;
  const maxTemp10 = daily10.length > 0 ? Math.max(...daily10.map((d) => d.tempMax)) : 70;
  const spanTemp10 = Math.max(1, maxTemp10 - minTemp10);

  return (
    <div className="bg-[#000000] text-[#f5f7fa] rounded-2xl p-2.5 sm:p-3.5 border border-[#1a1d24] flex flex-col gap-3 max-w-2xl mx-auto mb-20">
      {/* Slim Location Bar + AccuWeather Top Tab Strip (Normal Flow — Zero Overlap) */}
      <div className="bg-[#121418] border border-[#22262e] rounded-2xl overflow-hidden shadow-lg flex flex-col">
        {/* Location Row */}
        <div className="px-3.5 pt-3 pb-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full bg-[#F05514] shrink-0 shadow-[0_0_8px_rgba(240,85,20,0.8)]"
              aria-hidden="true"
            />
            <span className="text-xs sm:text-sm font-black tracking-tight text-white truncate">
              {formatLocationLabel(currentLocation)}
            </span>
            {isFollowingGps && (
              <span className="text-[8.5px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-[#F05514]/20 text-[#f58a58] border border-[#F05514]/45 shrink-0">
                GPS
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowCityPicker((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg border text-[10.5px] font-bold transition-colors cursor-pointer ${
                showCityPicker
                  ? 'bg-[#F05514] text-white border-[#F05514]'
                  : 'bg-[#1a1d24] border-[#2a2f3a] text-[#e2e8f0] hover:border-[#F05514]'
              }`}
            >
              {showCityPicker ? 'Done' : 'Change City'}
            </button>
            <button
              type="button"
              onClick={() => loadWeatherData(currentLocation.lat, currentLocation.lng)}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg bg-[#1a1d24] border border-[#2a2f3a] text-[10.5px] font-bold text-[#e2e8f0] hover:border-[#F05514] transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className={loading ? 'inline-block animate-spin mr-1' : 'mr-1'}>🔄</span>
              Refresh
            </button>
          </div>
        </div>

        {/* Collapsible Change City Drawer */}
        {showCityPicker && (
          <div className="px-3.5 pb-3 pt-2.5 border-t border-[#22262e] bg-[#0b0d10] flex flex-col gap-2">
            <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city or zip (e.g. Kewaskum, Hartford)…"
                className="flex-1 bg-[#121418] border border-[#2a2f3a] text-white placeholder-[#64748b] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#F05514]"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-3 py-1.5 rounded-lg bg-[#F05514] hover:bg-[#d9490e] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {searching ? '…' : 'Go'}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="bg-[#121418] border border-[#22262e] rounded-lg divide-y divide-[#22262e] max-h-36 overflow-y-auto">
                {searchResults.map((loc, idx) => (
                  <button
                    key={`${loc.name}-${loc.lat}-${idx}`}
                    type="button"
                    onClick={() => selectLocation(loc)}
                    className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-[#1a1d24] flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-bold text-white">{loc.name}</span>
                    <span className="text-[10px] text-[#9ca3af]">
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
                className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border border-[#F05514]/50 bg-[#F05514]/15 text-[#f58a58] cursor-pointer disabled:opacity-50"
              >
                {gpsLoading ? 'Locating…' : '📍 Use GPS'}
              </button>
              {DEFAULT_WISCONSIN_PRESETS.slice(0, 5).map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => selectLocation(preset)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-[#121418] text-[#9ca3af] border-[#22262e] hover:text-white hover:border-[#F05514] cursor-pointer"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AccuWeather Top Tab Strip: Now | Hourly | 10-Day | Radar with #F05514 Bottom Indicator */}
        <div
          role="tablist"
          aria-label="Weather view switcher"
          className="grid grid-cols-4 border-t border-[#22262e] bg-[#0e1014]"
        >
          {(
            [
              { id: 'NOW', label: 'Now' },
              { id: 'HOURLY', label: 'Hourly' },
              { id: 'DAILY', label: '10-Day' },
              { id: 'RADAR', label: 'Radar' },
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
                className={`relative py-2.5 text-[10.5px] sm:text-[11px] font-black tracking-wider uppercase transition-colors cursor-pointer ${
                  isActive ? 'text-white' : 'text-[#8b949e] hover:text-[#cbd5e1]'
                }`}
              >
                {tab.label}
                <span
                  className={`absolute bottom-0 left-2.5 right-2.5 h-[3px] rounded-t-full transition-opacity ${
                    isActive ? 'bg-[#F05514] opacity-100' : 'opacity-0'
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Notice */}
      {errorMsg && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Initial Loading State */}
      {loading && !weather && (
        <div className="bg-[#121418] border border-[#22262e] rounded-2xl p-6 text-center flex flex-col items-center gap-2">
          <div className="text-3xl animate-pulse">☀️</div>
          <p className="text-xs font-bold text-[#9ca3af]">
            Loading forecast for {formatLocationLabel(currentLocation)}…
          </p>
        </div>
      )}

      {/* ============================================================
          TAB 1: NOW — HERO + COMPACT MINUTECAST + PAINT READINESS + 6H + 2x3 GRID + TONIGHT/TOMORROW
         ============================================================ */}
      {weather && current && guard && activeTab === 'NOW' && (
        <section role="tabpanel" aria-label="Now weather" className="flex flex-col gap-3">
          {/* 1. Compact Current Weather Hero Header */}
          <div className="bg-[#121418] border border-[#22262e] rounded-2xl p-4 shadow-md">
            <div className="flex items-center justify-between gap-3">
              {/* Left: Crisp Icon + Bold XX° + RealFeel® XX° */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-5xl leading-none select-none" aria-hidden="true">
                  {current.precipIcon}
                </span>
                <div className="flex flex-col">
                  <div className="text-5xl sm:text-6xl font-black tracking-tight text-white leading-none tabular-nums">
                    {current.temp}°
                  </div>
                  <div className="text-xs font-bold mt-1 tabular-nums">
                    <span className="text-[#f58a58]">RealFeel®</span>{' '}
                    <span className="text-[#cbd5e1] font-extrabold">{current.feelsLike}°</span>
                  </div>
                </div>
              </div>

              {/* Right: Condition + High/Low + Overall Exterior Pill */}
              <div className="min-w-0 text-right flex flex-col items-end gap-1.5">
                <div className="text-sm sm:text-base font-extrabold text-white leading-tight">
                  {getShortConditionLabel(current.weatherCode, {
                    snowfallIn: current.snowfallIn,
                    allowSnowLabel: current.precipMode === 'SNOW' || current.precipMode === 'WINTRY_MIX',
                  })}
                </div>
                {todayDaily && (
                  <div className="text-xs font-bold text-[#9ca3af] tabular-nums">
                    High <span className="text-white">{todayDaily.tempMax}°</span> / Low{' '}
                    <span className="text-[#cbd5e1]">{todayDaily.tempMin}°</span>
                  </div>
                )}
                {todayWorkBadge && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider ${todayWorkBadge.pill}`}
                  >
                    <span>Exterior: {todayWorkBadge.label}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Compact Horizontal MinuteCast® 120-Minute Timeline Card */}
          <div className="bg-[#121418] border border-[#22262e] rounded-2xl px-3.5 py-3 shadow-md flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-3.5 rounded-full bg-[#F05514] shrink-0" aria-hidden="true" />
                <h3 className="text-[10.5px] font-black uppercase tracking-widest text-[#cbd5e1]">
                  MinuteCast®
                </h3>
                <span className="text-[10px] text-[#64748b] font-semibold hidden sm:inline">
                  Next 120 min
                </span>
              </div>
              <span
                className={`text-[9.5px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider shrink-0 ${minuteCast.badgeColor}`}
              >
                {minuteCast.badgeText} • 2 HR
              </span>
            </div>

            {/* 8 x 15-Minute Segmented Horizontal Bar */}
            <div className="space-y-1">
              <div
                className="grid grid-cols-8 gap-1"
                role="img"
                aria-label={minuteCast.headline}
              >
                {minuteBarSlots.map((slot, idx) => (
                  <div
                    key={slot.minuteOffset ?? idx}
                    title={`${slot.timeStr}: ${slot.mode}`}
                    className={`h-2.5 rounded-full transition-colors ${getMinuteBarSegmentClass(
                      slot.mode,
                      minuteCast.allDry
                    )} ${slot.mode === 'DRY' && !minuteCast.allDry ? 'opacity-45' : 'opacity-95'}`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-[9px] font-bold text-[#64748b] tabular-nums">
                <span className="text-[#F05514] font-black">NOW</span>
                <span>30m</span>
                <span>60m</span>
                <span>90m</span>
                <span>120m</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#e2e8f0] leading-snug">
              <span className="text-sm leading-none shrink-0" aria-hidden="true">
                {minuteCast.icon}
              </span>
              <span>{minuteCast.headline}</span>
            </div>
          </div>

          {/* 3. Structured Exterior Paint Readiness Grid */}
          {paintReadiness && (
            <div className="bg-[#121418] border border-[#22262e] rounded-2xl p-3.5 shadow-md flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-3.5 rounded-full bg-[#F05514]" aria-hidden="true" />
                  <h3 className="text-[10.5px] font-black uppercase tracking-widest text-[#cbd5e1]">
                    Exterior Paint Readiness
                  </h3>
                </div>
                <span
                  className={`text-[9.5px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider ${getReadinessPillClass(
                    paintReadiness.overall
                  )}`}
                >
                  {paintReadiness.overall}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {paintReadiness.items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#0b0d11] border border-[#22262e] rounded-xl p-2.5 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#9ca3af]">
                        {item.title}
                      </span>
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider shrink-0 ${getReadinessPillClass(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="text-xs font-black text-white tabular-nums">
                      {item.reading}
                    </div>
                    <div className="text-[10.5px] text-[#94a3b8] leading-snug">
                      {item.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Today's Next-6-Hours Strip */}
          {nextSixHours.length > 0 && (
            <div className="bg-[#121418] border border-[#22262e] rounded-2xl p-3.5 shadow-md flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-3.5 rounded-full bg-[#F05514]" aria-hidden="true" />
                  <h3 className="text-[10.5px] font-black uppercase tracking-widest text-[#cbd5e1]">
                    Next 6 Hours
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('HOURLY')}
                  className="text-[10px] font-extrabold text-[#f58a58] hover:text-[#F05514] cursor-pointer"
                >
                  Full Hourly →
                </button>
              </div>

              <div className="grid grid-cols-6 gap-1 sm:gap-2">
                {nextSixHours.map((h, idx) => {
                  const icon = h.snowfallIn > 0 ? '❄️' : h.precipIcon;
                  const isWet = h.snowfallIn > 0 || h.rainIn > 0 || h.rainProb >= 20;
                  return (
                    <div
                      key={h.isoTime}
                      className={`rounded-xl border px-1 py-2 flex flex-col items-center justify-between gap-1 text-center ${
                        idx === 0
                          ? 'bg-[#F05514]/15 border-[#F05514]/45'
                          : 'bg-[#0b0d11] border-[#22262e]'
                      }`}
                    >
                      <span
                        className={`text-[9.5px] sm:text-[10px] font-extrabold truncate max-w-full ${
                          idx === 0 ? 'text-[#f58a58]' : 'text-[#9ca3af]'
                        }`}
                      >
                        {h.timeStr}
                      </span>
                      <span className="text-base sm:text-lg leading-none" aria-hidden="true">
                        {icon}
                      </span>
                      <span className="text-xs sm:text-sm font-black text-white tabular-nums">
                        {h.temp}°
                      </span>
                      <span
                        className={`text-[9px] sm:text-[9.5px] font-bold tabular-nums ${
                          isWet ? 'text-sky-300' : 'text-[#64748b]'
                        }`}
                      >
                        💧{h.rainProb}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. 2x3 Current Conditions Metric Cards Grid */}
          <div className="bg-[#121418] border border-[#22262e] rounded-2xl p-3.5 shadow-md flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-3.5 rounded-full bg-[#F05514]" aria-hidden="true" />
                <h3 className="text-[10.5px] font-black uppercase tracking-widest text-[#cbd5e1]">
                  Current Conditions
                </h3>
              </div>
              <span className="text-[10px] font-semibold text-[#64748b]">
                Updated {weather.fetchedAt}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* 1. RealFeel */}
              <div className="bg-[#0b0d11] border border-[#22262e] rounded-xl p-3 flex flex-col justify-between gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#9ca3af]">
                  RealFeel®
                </span>
                <div className="text-xl font-black text-[#f58a58] tabular-nums leading-tight">
                  {current.feelsLike}°
                </div>
                <span className="text-[10px] text-[#64748b] font-semibold">
                  {current.feelsLike === current.temp
                    ? 'Matches air temp'
                    : current.feelsLike < current.temp
                    ? `${current.temp - current.feelsLike}° cooler w/ wind`
                    : `${current.feelsLike - current.temp}° warmer feel`}
                </span>
              </div>

              {/* 2. Wind & Gusts */}
              <div className="bg-[#0b0d11] border border-[#22262e] rounded-xl p-3 flex flex-col justify-between gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#9ca3af]">
                  Wind &amp; Gusts
                </span>
                <div className="text-xl font-black text-white tabular-nums leading-tight">
                  {current.windSpeed} <span className="text-xs font-bold text-[#9ca3af]">mph</span>
                </div>
                <span
                  className={`text-[10px] font-bold tabular-nums ${
                    current.windGusts >= 25
                      ? 'text-red-400'
                      : current.windGusts >= 15
                      ? 'text-amber-400'
                      : 'text-[#64748b]'
                  }`}
                >
                  Gusts {current.windGusts} mph
                  {current.windGusts >= 15 ? ' ⚠️' : ''}
                </span>
              </div>

              {/* 3. Humidity */}
              <div className="bg-[#0b0d11] border border-[#22262e] rounded-xl p-3 flex flex-col justify-between gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#9ca3af]">
                  Humidity
                </span>
                <div className="text-xl font-black text-white tabular-nums leading-tight">
                  {current.humidity}%
                </div>
                <span
                  className={`text-[10px] font-semibold ${
                    current.humidity > 80 ? 'text-amber-400' : 'text-[#64748b]'
                  }`}
                >
                  {current.humidity > 80
                    ? 'High — slower cure'
                    : current.humidity >= 45
                    ? 'Moderate humidity'
                    : 'Dry air • fast dry'}
                </span>
              </div>

              {/* 4. Dew Point (with spread °F) */}
              <div className="bg-[#0b0d11] border border-[#22262e] rounded-xl p-3 flex flex-col justify-between gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#9ca3af]">
                  Dew Point
                </span>
                <div
                  className={`text-xl font-black tabular-nums leading-tight ${
                    dewSpread <= 3
                      ? 'text-red-400'
                      : dewSpread <= 5
                      ? 'text-amber-400'
                      : 'text-white'
                  }`}
                >
                  {current.dewPoint}°
                </div>
                <span
                  className={`text-[10px] font-bold tabular-nums ${
                    dewSpread <= 5 ? 'text-amber-300' : 'text-emerald-400'
                  }`}
                >
                  Spread {dewSpread >= 0 ? '+' : ''}
                  {dewSpread}°F {dewSpread <= 5 ? '· Dew risk' : '· Dry'}
                </span>
              </div>

              {/* 5. Cloud Cover & Visibility */}
              <div className="bg-[#0b0d11] border border-[#22262e] rounded-xl p-3 flex flex-col justify-between gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#9ca3af]">
                  Clouds &amp; Vis
                </span>
                <div className="text-xl font-black text-white tabular-nums leading-tight">
                  {current.cloudCover ?? 0}%
                </div>
                <span className="text-[10px] text-[#94a3b8] font-semibold tabular-nums">
                  Visibility {formatVisibilityMiles(current.visibilityMi)}
                </span>
              </div>

              {/* 6. Sunrise & Sunset (+ daylight remaining) */}
              <div className="bg-[#0b0d11] border border-[#22262e] rounded-xl p-3 flex flex-col justify-between gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#9ca3af]">
                  Sunrise &amp; Sunset
                </span>
                <div className="text-[11.5px] font-black text-white tabular-nums leading-snug space-y-0.5">
                  <div>
                    <span className="text-[#f58a58]">🌅</span> {todayDaily?.sunrise || '—'}
                  </div>
                  <div>
                    <span className="text-[#F05514]">🌇</span> {todayDaily?.sunset || '—'}
                  </div>
                </div>
                <span className="text-[9.5px] text-[#94a3b8] font-semibold truncate">
                  {daylightRemainingLabel}
                </span>
              </div>
            </div>
          </div>

          {/* 6. Tonight & Tomorrow 2-Column Outlook Card */}
          {(todayDaily || tomorrowDaily) && (
            <div className="bg-[#121418] border border-[#22262e] rounded-2xl p-3.5 shadow-md flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-3.5 rounded-full bg-[#F05514]" aria-hidden="true" />
                  <h3 className="text-[10.5px] font-black uppercase tracking-widest text-[#cbd5e1]">
                    Tonight &amp; Tomorrow
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('DAILY')}
                  className="text-[10px] font-extrabold text-[#f58a58] hover:text-[#F05514] cursor-pointer"
                >
                  10-Day Outlook →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Tonight's Forecast */}
                {todayDaily && (
                  <div className="bg-[#0b0d11] border border-[#22262e] rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-300">
                        🌙 Tonight&apos;s Forecast
                      </span>
                      <span className="text-base leading-none" aria-hidden="true">
                        {todayDaily.nightIcon}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-lg font-black text-white tabular-nums">
                        Low {todayDaily.tempMin}°
                      </span>
                      <span className="text-[11px] font-bold text-[#cbd5e1] truncate">
                        {todayDaily.nightCondition}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10.5px] text-[#94a3b8] font-semibold tabular-nums pt-1 border-t border-[#1c2028]">
                      <span>
                        💨 {todayDaily.nightWindSpeed} mph (G{todayDaily.nightWindGusts})
                      </span>
                      <span
                        className={
                          todayDaily.nightPrecipProb >= 25 ? 'text-sky-300 font-bold' : ''
                        }
                      >
                        💧 {todayDaily.nightPrecipProb}% precip
                      </span>
                    </div>
                  </div>
                )}

                {/* Tomorrow's Outlook */}
                {tomorrowDaily && (() => {
                  const tomorrowReadiness = mapWorkabilityToReadiness(tomorrowDaily.workability);
                  return (
                    <div className="bg-[#0b0d11] border border-[#22262e] rounded-xl p-3 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#f58a58]">
                          {tomorrowDaily.precipIcon} Tomorrow ({tomorrowDaily.dayName})
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider shrink-0 ${getReadinessPillClass(
                            tomorrowReadiness
                          )}`}
                        >
                          {tomorrowReadiness}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-lg font-black text-white tabular-nums">
                          {tomorrowDaily.tempMax}°{' '}
                          <span className="text-xs font-bold text-[#9ca3af]">
                            / {tomorrowDaily.tempMin}°
                          </span>
                        </span>
                        <span className="text-[11px] font-bold text-[#cbd5e1] truncate">
                          {tomorrowDaily.dayCondition}
                        </span>
                      </div>
                      <div className="text-[10.5px] text-[#94a3b8] leading-snug pt-1 border-t border-[#1c2028]">
                        {tomorrowDaily.workabilityHint || tomorrowDaily.workabilityLabel}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Conditional Snow/Freeze Banner — ONLY rendered when snowfall > 0 in 48h OR temp < 32°F today */}
          {showSnowOrFreezeBanner && (
            <div className="rounded-2xl border border-sky-400/45 bg-sky-950/35 px-3.5 py-3 flex items-start gap-2.5">
              <span className="text-lg leading-none mt-0.5">{hasSnow48h ? '❄️' : '🌡️'}</span>
              <div className="flex flex-col gap-0.5">
                <div className="text-xs font-black text-sky-200">
                  {hasSnow48h && hasFreezeToday
                    ? `Snow & Freeze Alert (${formatSnowInches(snowNext48h)} next 48h · Low ${todayDaily?.tempMin ?? current.temp}°)`
                    : hasSnow48h
                    ? `Snow Alert — ${formatSnowInches(snowNext48h)} projected next 48 hours`
                    : `Freeze Alert — Low of ${todayDaily?.tempMin ?? current.temp}° today`}
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
          TAB 2: HOURLY — ACCUWEATHER EXPANDABLE HOURLY LIST
         ============================================================ */}
      {weather && activeTab === 'HOURLY' && (
        <section
          role="tabpanel"
          aria-label="Hourly forecast"
          className="bg-[#121418] border border-[#22262e] rounded-2xl overflow-hidden shadow-md"
        >
          <div>
            {hourlyGroups.map((group) => (
              <div key={group.label}>
                {/* Day Section Header */}
                <div className="px-3.5 py-2 bg-[#0a0c10] border-y border-[#22262e] first:border-t-0 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-3 rounded-full bg-[#F05514]" aria-hidden="true" />
                    <span className="text-[10.5px] font-black uppercase tracking-widest text-white">
                      {group.label}
                    </span>
                  </div>
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#64748b]">
                    Tap row for details
                  </span>
                </div>

                <div className="divide-y divide-[#22262e]">
                  {group.items.map(({ hour: h, isFirst }) => {
                    const isExpanded = expandedHourIso === h.isoTime;
                    const isSnow = h.snowfallIn > 0;
                    const rowIcon = isSnow ? '❄️' : h.precipIcon;
                    const isWet = isSnow || h.rainIn > 0 || h.rainProb >= 20;

                    const accumDisplay = isSnow
                      ? {
                          text: `❄️ ${formatSnowInches(h.snowfallIn)} Snow`,
                          tone: 'text-sky-300',
                        }
                      : h.rainIn > 0
                      ? {
                          text: `💧 ${formatRainInches(h.rainIn)} Rain`,
                          tone: 'text-blue-300',
                        }
                      : {
                          text: 'Dry',
                          tone: 'text-emerald-400',
                        };

                    return (
                      <div key={h.isoTime}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedHourIso((prev) => (prev === h.isoTime ? null : h.isoTime))
                          }
                          aria-expanded={isExpanded}
                          className={`w-full px-3 sm:px-4 py-2.5 grid grid-cols-[54px_26px_42px_minmax(0,1fr)_60px_14px] items-center gap-1.5 text-left transition-colors cursor-pointer hover:bg-[#181c23] ${
                            isFirst ? 'bg-[#F05514]/10' : isExpanded ? 'bg-[#171a21]' : ''
                          }`}
                        >
                          {/* Time */}
                          <span
                            className={`text-xs whitespace-nowrap ${
                              isFirst ? 'text-[#F05514] font-black' : 'text-white font-extrabold'
                            }`}
                          >
                            {h.timeStr}
                          </span>

                          {/* Weather Icon */}
                          <span className="text-base text-center leading-none" aria-hidden="true">
                            {rowIcon}
                          </span>

                          {/* Temp */}
                          <span className="text-sm font-black text-white tabular-nums">
                            {h.temp}°
                          </span>

                          {/* RealFeel® XX° */}
                          <span className="text-[11px] font-semibold text-[#9ca3af] truncate tabular-nums">
                            <span className="text-[#f58a58]/90">RealFeel®</span>{' '}
                            <span className="text-[#cbd5e1] font-bold">{h.feelsLike}°</span>
                          </span>

                          {/* Dynamic Precip % (Snow ONLY when snowfall > 0; otherwise raindrop) */}
                          <span
                            className={`text-right text-[11px] font-extrabold whitespace-nowrap tabular-nums ${
                              isSnow
                                ? 'text-sky-300'
                                : isWet
                                ? 'text-blue-300'
                                : 'text-[#64748b]'
                            }`}
                          >
                            {isSnow ? `❄️ ${h.rainProb}%` : `💧 ${h.rainProb}%`}
                          </span>

                          {/* Chevron */}
                          <span className="flex justify-end items-center">
                            <span
                              className={`text-[9px] inline-block transition-transform duration-200 ${
                                isExpanded ? 'rotate-180 text-[#F05514]' : 'text-[#64748b]'
                              }`}
                              aria-hidden="true"
                            >
                              ▼
                            </span>
                          </span>
                        </button>

                        {/* Smooth Tap-to-Expand 2x2 Sub-Grid */}
                        <div
                          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                            isExpanded
                              ? 'grid-rows-[1fr] opacity-100'
                              : 'grid-rows-[0fr] opacity-0'
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div className="px-3.5 pb-3 pt-2.5 bg-[#0a0c10] border-t border-[#22262e] grid grid-cols-2 gap-2">
                              <div className="bg-[#121418] border border-[#22262e] rounded-xl px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[#8b949e]">
                                  Wind &amp; Gusts
                                </span>
                                <span
                                  className={`text-xs font-black tabular-nums whitespace-nowrap ${
                                    h.windGusts > 20 ? 'text-[#F05514]' : 'text-white'
                                  }`}
                                >
                                  {h.windSpeed} / G{h.windGusts} mph
                                </span>
                              </div>

                              <div className="bg-[#121418] border border-[#22262e] rounded-xl px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[#8b949e]">
                                  Humidity
                                </span>
                                <span className="text-xs font-black text-white tabular-nums">
                                  {h.humidity}%
                                </span>
                              </div>

                              <div className="bg-[#121418] border border-[#22262e] rounded-xl px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[#8b949e]">
                                  Dew Point
                                </span>
                                <span className="text-xs font-black text-white tabular-nums">
                                  {h.dewPoint}°F
                                </span>
                              </div>

                              <div className="bg-[#121418] border border-[#22262e] rounded-xl px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[#8b949e]">
                                  Accumulation
                                </span>
                                <span
                                  className={`text-xs font-black tabular-nums whitespace-nowrap ${accumDisplay.tone}`}
                                >
                                  {accumDisplay.text}
                                </span>
                              </div>
                            </div>
                          </div>
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
          TAB 3: DAILY (10-DAY) — TEMPERATURE RANGE BARS & DAY/NIGHT SPLIT
         ============================================================ */}
      {weather && activeTab === 'DAILY' && (
        <section
          role="tabpanel"
          aria-label="Daily 10-Day forecast"
          className="bg-[#121418] border border-[#22262e] rounded-2xl overflow-hidden shadow-md"
        >
          <div className="px-3.5 py-2 bg-[#0a0c10] border-b border-[#22262e] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1 h-3 rounded-full bg-[#F05514]" aria-hidden="true" />
              <span className="text-[10.5px] font-black uppercase tracking-widest text-white">
                10-Day Daily Outlook
              </span>
            </div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#64748b]">
              Tap for Day / Night
            </span>
          </div>

          <div className="divide-y divide-[#22262e]">
            {daily10.map((day: DailyForecast, idx: number) => {
              const isToday = idx === 0;
              const isExpanded = expandedDayDate === day.dateStr;
              const badge = getWorkBadgeMeta(day.workability);

              // Compute gradient temperature bar positioning across 10-day range
              const rawLeft = ((day.tempMin - minTemp10) / spanTemp10) * 100;
              const rawWidth = ((day.tempMax - day.tempMin) / spanTemp10) * 100;
              const barWidth = Math.max(14, Math.min(100, rawWidth));
              const barLeft = Math.max(0, Math.min(100 - barWidth, rawLeft));

              // Optional current-temp indicator dot position on Today's bar
              const curDotPct =
                isToday && current
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        ((current.temp - day.tempMin) / Math.max(1, day.tempMax - day.tempMin)) *
                          100
                      )
                    )
                  : null;

              const isSnowDay = day.snowfallIn > 0 || day.precipMode === 'SNOW';
              const isMixDay = day.precipMode === 'WINTRY_MIX';
              const precipBarText = isMixDay
                ? `🌨️ ${day.rainProb}%`
                : isSnowDay
                ? `❄️ ${day.rainProb}%`
                : `💧 ${day.rainProb}%`;

              // Exact accumulation string — NEVER shows 0.0" Snow on non-snow days
              const accumSummary =
                day.snowfallIn > 0 && day.rainSumIn > 0
                  ? {
                      text: `🌨️ ${formatSnowInches(day.snowfallIn)} Snow + ${formatRainInches(day.rainSumIn)} Rain`,
                      tone: 'text-purple-300',
                    }
                  : day.snowfallIn > 0
                  ? {
                      text: `❄️ ${formatSnowInches(day.snowfallIn)} Snow`,
                      tone: 'text-sky-300',
                    }
                  : day.rainSumIn > 0
                  ? {
                      text: `💧 ${formatRainInches(day.rainSumIn)} Rain`,
                      tone: 'text-blue-300',
                    }
                  : {
                      text: 'Dry (0.00")',
                      tone: 'text-emerald-400',
                    };

              return (
                <div key={day.dateStr}>
                  {/* Single Horizontal AccuWeather Bar */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedDayDate((prev) => (prev === day.dateStr ? null : day.dateStr))
                    }
                    aria-expanded={isExpanded}
                    className={`w-full px-3 sm:px-4 py-2.5 grid grid-cols-[72px_24px_48px_minmax(0,1fr)_14px] items-center gap-1.5 text-left transition-colors cursor-pointer hover:bg-[#181c23] ${
                      isExpanded ? 'bg-[#171a21]' : ''
                    }`}
                  >
                    {/* Day + Date (e.g., TUE 11/24) */}
                    <span
                      className={`text-[11px] sm:text-xs font-black tracking-tight whitespace-nowrap ${
                        isToday ? 'text-[#F05514]' : 'text-white'
                      }`}
                    >
                      {day.shortDateLabel}
                    </span>

                    {/* Icon */}
                    <span className="text-base text-center leading-none" aria-hidden="true">
                      {day.precipIcon}
                    </span>

                    {/* Precip % */}
                    <span
                      className={`text-[10.5px] font-extrabold whitespace-nowrap tabular-nums ${
                        isMixDay
                          ? 'text-purple-300'
                          : isSnowDay
                          ? 'text-sky-300'
                          : day.rainProb >= 20 || day.rainSumIn > 0
                          ? 'text-blue-300'
                          : 'text-[#64748b]'
                      }`}
                    >
                      {precipBarText}
                    </span>

                    {/* Low° [====●====] High° Gradient Temperature Range Bar */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-7 text-right text-[11px] font-bold text-[#9ca3af] tabular-nums shrink-0">
                        {day.tempMin}°
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-[#22262e] relative overflow-hidden">
                        <div
                          className="absolute top-0 bottom-0 rounded-full"
                          style={{
                            left: `${barLeft}%`,
                            width: `${barWidth}%`,
                            background:
                              'linear-gradient(90deg, #38bdf8 0%, #fbbf24 55%, #F05514 100%)',
                          }}
                        >
                          {curDotPct !== null && (
                            <span
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white border border-[#000000] shadow"
                              style={{ left: `${curDotPct}%` }}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      </div>
                      <span className="w-7 text-left text-[11px] font-black text-white tabular-nums shrink-0">
                        {day.tempMax}°
                      </span>
                    </div>

                    {/* Chevron */}
                    <span className="flex justify-end items-center">
                      <span
                        className={`text-[9px] inline-block transition-transform duration-200 ${
                          isExpanded ? 'rotate-180 text-[#F05514]' : 'text-[#64748b]'
                        }`}
                        aria-hidden="true"
                      >
                        ▼
                      </span>
                    </span>
                  </button>

                  {/* Smooth Tap-to-Expand Day / Night Breakdown Drawer */}
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                      isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-3.5 pb-3.5 pt-3 bg-[#0a0c10] border-t border-[#22262e] flex flex-col gap-2.5">
                        {/* Day / Night Split Cards */}
                        <div className="grid grid-cols-2 gap-2">
                          {/* DAY Card */}
                          <div className="bg-[#121418] border border-[#22262e] rounded-xl p-2.5 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9.5px] font-black uppercase tracking-widest text-[#F05514]">
                                Day
                              </span>
                              <span className="text-base leading-none" aria-hidden="true">
                                {day.precipIcon}
                              </span>
                            </div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg font-black text-white tabular-nums leading-none">
                                {day.tempMax}°
                              </span>
                              <span className="text-[10px] font-bold text-[#f58a58] tabular-nums">
                                RF {day.feelsLikeMax}°
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-[#cbd5e1] truncate">
                              {day.dayCondition || day.wmoDescription}
                            </div>
                            <div className="text-[10px] text-[#9ca3af] font-semibold tabular-nums">
                              Wind {day.windSpeedMax} / G{day.windGustsMax} mph
                            </div>
                          </div>

                          {/* NIGHT Card */}
                          <div className="bg-[#121418] border border-[#22262e] rounded-xl p-2.5 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9.5px] font-black uppercase tracking-widest text-[#94a3b8]">
                                Night
                              </span>
                              <span className="text-base leading-none" aria-hidden="true">
                                {day.nightIcon}
                              </span>
                            </div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg font-black text-white tabular-nums leading-none">
                                {day.tempMin}°
                              </span>
                              <span className="text-[10px] font-bold text-[#94a3b8] tabular-nums">
                                RF {day.feelsLikeMin}°
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-[#cbd5e1] truncate">
                              {day.nightCondition}
                            </div>
                            <div className="text-[10px] text-[#9ca3af] font-semibold tabular-nums">
                              Wind {day.nightWindSpeed} / G{day.nightWindGusts} mph
                            </div>
                          </div>
                        </div>

                        {/* Precip & Moisture Hairline Strip */}
                        <div className="bg-[#121418] border border-[#22262e] rounded-xl px-3 py-2 grid grid-cols-2 gap-2 text-[11px]">
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider">
                              Precipitation
                            </span>
                            <span className={`font-extrabold tabular-nums ${accumSummary.tone}`}>
                              {accumSummary.text}
                            </span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider">
                              Humidity &amp; Dew Pt
                            </span>
                            <span className="font-extrabold text-white tabular-nums">
                              {day.humidityMean}% · DP {day.dewPointMean}°
                            </span>
                          </div>
                        </div>

                        {/* 1-Line Exterior Paint/Wash Suitability Note */}
                        <div className="bg-[#121418] border border-[#22262e] rounded-xl px-3 py-2 flex items-start gap-2">
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 tracking-wider mt-0.5 ${badge.pill}`}
                          >
                            {badge.label}
                          </span>
                          <p className="text-[11px] text-[#cbd5e1] leading-snug">
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

      {/* ============================================================
          TAB 4: RADAR — PAST + FUTURE DOPPLER MAP + 48-HOUR PRECIP OUTLOOK
         ============================================================ */}
      {activeTab === 'RADAR' && (
        <section
          role="tabpanel"
          aria-label="Future Radar and 48-Hour Precipitation Outlook"
          className="flex flex-col gap-3"
        >
          {/* 1. Interactive Past + Future RainViewer Radar Map */}
          <WeatherRadar currentLocation={currentLocation} />

          {/* 2. Extended 48-Hour Future Precipitation Scrubber (Open-Meteo Hourly) */}
          <div className="bg-[#121418] border border-[#22262e] rounded-2xl p-3.5 shadow-md flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-3.5 rounded-full bg-[#F05514]" aria-hidden="true" />
                <h3 className="text-[10.5px] font-black uppercase tracking-widest text-white">
                  Extended 48-Hour Precip Outlook
                </h3>
              </div>

              {nextWetHour48 ? (
                <span
                  className={`text-[9.5px] font-black px-2 py-0.5 rounded-full ${
                    nextWetHour48.snowfallIn > 0
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-400/40'
                  }`}
                >
                  {nextWetHour48.snowfallIn > 0
                    ? `❄️ Snow ${nextWetHour48.dayLabel} ${nextWetHour48.timeStr} (${nextWetHour48.rainProb}%)`
                    : `💧 Rain ${nextWetHour48.dayLabel} ${nextWetHour48.timeStr} (${nextWetHour48.rainProb}%)`}
                </span>
              ) : (
                <span className="text-[9.5px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                  DRY NEXT 48 HRS
                </span>
              )}
            </div>

            {/* Selected Hour Detail Readout */}
            {selectedRadarHour && (
              <div className="bg-[#0a0c10] border border-[#22262e] rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-black text-[#F05514] whitespace-nowrap">
                    {selectedRadarHour.dayLabel} {selectedRadarHour.timeStr}
                  </span>
                  <span className="text-[#475569]">·</span>
                  <span className="font-bold text-white tabular-nums whitespace-nowrap">
                    {selectedRadarHour.temp}°
                  </span>
                  <span className="text-[#9ca3af] truncate">
                    Wind {selectedRadarHour.windSpeed}/G{selectedRadarHour.windGusts}
                  </span>
                </div>
                <span
                  className={`font-black whitespace-nowrap tabular-nums ${
                    selectedRadarHour.snowfallIn > 0
                      ? 'text-sky-300'
                      : selectedRadarHour.rainIn > 0 || selectedRadarHour.rainProb >= 15
                      ? 'text-blue-300'
                      : 'text-emerald-400'
                  }`}
                >
                  {selectedRadarHour.snowfallIn > 0
                    ? `❄️ ${selectedRadarHour.rainProb}% (${formatSnowInches(selectedRadarHour.snowfallIn)})`
                    : selectedRadarHour.rainIn > 0
                    ? `💧 ${selectedRadarHour.rainProb}% (${formatRainInches(selectedRadarHour.rainIn)})`
                    : selectedRadarHour.rainProb >= 15
                    ? `💧 ${selectedRadarHour.rainProb}%`
                    : `Dry (${selectedRadarHour.rainProb}%)`}
                </span>
              </div>
            )}

            {/* Horizontal Scrollable 48-Hour Bar Chart / Timeline */}
            {hourly48.length > 0 ? (
              <div className="overflow-x-auto pb-1.5 -mx-1 px-1">
                <div className="flex items-end gap-1.5 min-w-max">
                  {hourly48.map((h, idx) => {
                    const isSnow = h.snowfallIn > 0;
                    const isRain =
                      !isSnow && (h.rainIn > 0 || h.rainProb >= 15 || h.precipMode === 'RAIN');
                    const isSelected = idx === selectedRadarHourIdx;
                    const showDayTag =
                      idx === 0 || (idx > 0 && hourly48[idx - 1].dateStr !== h.dateStr);
                    const barHeightPx = Math.max(
                      6,
                      Math.round((Math.min(100, Math.max(0, h.rainProb)) / 100) * 56)
                    );
                    const compactHour =
                      h.timeStr === 'Now'
                        ? 'Now'
                        : h.timeStr.replace(':00 ', '').replace(' AM', 'a').replace(' PM', 'p');

                    return (
                      <button
                        key={h.isoTime}
                        type="button"
                        onClick={() => setSelectedRadarHourIdx(idx)}
                        className={`w-11 shrink-0 rounded-xl p-1.5 flex flex-col items-center gap-1 border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#1a1d24] border-[#F05514]'
                            : 'bg-[#0a0c10] border-[#1f242e] hover:border-[#323948]'
                        }`}
                      >
                        <span className="text-[8px] font-black uppercase tracking-wider h-2.5 leading-none text-[#F05514]">
                          {showDayTag ? h.dayLabel : ''}
                        </span>

                        <span className="text-[11px] leading-none h-3.5 flex items-center justify-center">
                          {isSnow ? '❄️' : isRain ? '💧' : '·'}
                        </span>

                        {/* Precip Probability Bar */}
                        <div className="w-4 h-14 bg-[#181b22] rounded-md flex items-end overflow-hidden p-0.5">
                          <div
                            className={`w-full rounded-sm transition-all ${
                              isSnow
                                ? 'bg-sky-400'
                                : isRain
                                ? 'bg-blue-500'
                                : 'bg-[#2e3440]'
                            }`}
                            style={{ height: `${barHeightPx}px` }}
                          />
                        </div>

                        <span
                          className={`text-[9px] font-extrabold tabular-nums leading-none ${
                            isSnow
                              ? 'text-sky-300'
                              : isRain
                              ? 'text-blue-300'
                              : 'text-[#64748b]'
                          }`}
                        >
                          {h.rainProb}%
                        </span>

                        <span
                          className={`text-[9px] font-bold whitespace-nowrap leading-none ${
                            idx === 0 ? 'text-[#F05514] font-black' : 'text-[#9ca3af]'
                          }`}
                        >
                          {compactHour}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-xs font-semibold text-[#8b949e]">
                Loading 48-hour precipitation timeline…
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
