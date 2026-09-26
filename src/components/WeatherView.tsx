import React, { useState, useEffect } from 'react';
import { LocationInfo, WeatherCondition, HourlyForecast, DailyForecast } from '../types';
import {
  DEFAULT_WISCONSIN_PRESETS,
  searchLocations,
  getCurrentGpsPosition,
  fetchFullWeather,
} from '../utils/weatherService';
import { WeatherRadar } from './WeatherRadar';

interface WeatherViewProps {
  currentLocation: LocationInfo;
  isFollowingGps?: boolean;
  onToggleFollowMe?: (follow: boolean) => void;
  onLocationChange: (loc: LocationInfo) => void;
}

export const WeatherView: React.FC<WeatherViewProps> = ({
  currentLocation,
  isFollowingGps = true,
  onToggleFollowMe,
  onLocationChange,
}) => {
  const [weather, setWeather] = useState<{
    current: WeatherCondition;
    hourly: HourlyForecast[];
    daily: DailyForecast[];
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);

  // Default to FORECAST so user immediately gets paint cure & temp info, with a clean button to open radar
  const [activeWeatherTab, setActiveWeatherTab] = useState<'FORECAST' | 'RADAR'>('FORECAST');

  useEffect(() => {
    loadWeatherData(currentLocation.lat, currentLocation.lng);
  }, [currentLocation.lat, currentLocation.lng]);

  const loadWeatherData = async (lat: number, lng: number) => {
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
  };

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

  return (
    <div className="space-y-3.5 max-w-2xl mx-auto pb-24 animate-in fade-in">
      {/* View Header with Mode Selector */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold uppercase tracking-wide text-[var(--accent)]">
            Weather &amp; Paint Spray Hub
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Live spray conditions, cure advisory &amp; real-time Doppler radar
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadWeatherData(currentLocation.lat, currentLocation.lng)}
          disabled={loading}
          className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--text)] flex items-center gap-1.5 cursor-pointer transition-transform active:scale-95 disabled:opacity-50 shadow-xs"
          title="Refresh weather data"
        >
          <span className={loading ? 'animate-spin' : ''}>🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Streamlined Location & GPS Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-3.5 shadow-md space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Active Location Pin & Name */}
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
                {isFollowingGps && ' • Auto-tracking phone'}
              </div>
            </div>
          </div>

          {/* Quick Location Action Buttons */}
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
              title="Use your phone's real-time GPS location"
            >
              <span>{gpsLoading ? '⏳' : '🛰️'}</span>
              <span>{gpsLoading ? 'Detecting...' : isFollowingGps ? 'GPS Active' : 'Follow Me'}</span>
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

        {/* Collapsible Search and Quick Presets Drawer */}
        {showLocationSearch && (
          <div className="pt-2.5 border-t border-[var(--border)] space-y-2.5 animate-in slide-in-from-top-2">
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any town, city, or zip (e.g. West Bend, Cedarburg, Milwaukee)..."
                    className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-xl px-3 py-2 text-xs outline-none shadow-xs"
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
                  className="bg-[var(--accent)] hover:opacity-95 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl cursor-pointer transition-all active:scale-95 disabled:opacity-50 shadow-xs shrink-0"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </div>

              {/* Suggestions List */}
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
                      <span className="text-[10px] text-[var(--accent)] font-bold">Select ➔</span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            {/* Quick Wisconsin Shortcuts */}
            <div>
              <span className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Quick Wisconsin Shortcuts:
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
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-white font-bold'
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

      {/* Main View Segmented Control Tabs */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl shadow-xs">
        <button
          type="button"
          onClick={() => setActiveWeatherTab('FORECAST')}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeWeatherTab === 'FORECAST'
              ? 'bg-[#f1c40f] text-[#231709] shadow-md'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          <span>🌡️</span>
          <span>Spray &amp; Cure Forecast</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWeatherTab('RADAR')}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeWeatherTab === 'RADAR'
              ? 'bg-[#f1c40f] text-[#231709] shadow-md'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          <span>🌧️</span>
          <span>Live &amp; Future Radar</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: FORECAST & SPRAY CONDITIONS (First & Default) */}
      {activeWeatherTab === 'FORECAST' && weather && (
        <div className="space-y-3.5 animate-in fade-in">
          {/* Main Temperature & Paint Condition Card */}
          <div className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] text-white rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] sm:text-[10.5px] font-extrabold uppercase tracking-wider text-white/85">
                  {currentLocation.isGps ? '📍 Live GPS Weather' : 'Site Forecast'} • {currentLocation.name}
                </span>
                <div className="text-4xl sm:text-5xl font-black tracking-tight my-1 text-white">
                  {weather.current.temp}°F
                </div>
                <div className="text-xs sm:text-sm font-bold text-white/95 mt-0.5">
                  {weather.current.conditionText}
                </div>
              </div>
              <span
                style={{ backgroundColor: weather.current.badgeBg }}
                className="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider px-2.5 sm:px-3 py-1 rounded-lg text-white shadow-md shrink-0"
              >
                {weather.current.badgeText}
              </span>
            </div>

            <div className="mt-3.5 pt-3.5 border-t border-white/20 text-xs font-semibold text-white/95 leading-relaxed bg-black/20 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 p-3.5 sm:p-4 rounded-b-2xl">
              {weather.current.advice}
            </div>
          </div>

          {/* 3 Metric Tiles: Wind, Humidity, Rain Risk */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl text-center shadow-xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Wind</span>
              <div className="text-sm sm:text-base font-extrabold text-[var(--accent)] mt-0.5">
                {weather.current.windSpeed} mph
              </div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl text-center shadow-xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Humidity</span>
              <div className="text-sm sm:text-base font-extrabold text-[var(--accent-secondary)] mt-0.5">
                {weather.current.humidity}%
              </div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl text-center shadow-xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Rain Risk</span>
              <div className="text-sm sm:text-base font-extrabold text-[var(--accent-tertiary)] mt-0.5">
                {weather.current.rainProb}%
              </div>
            </div>
          </div>

          {/* Intuitive "Open Radar" Action Card with Live + Future description */}
          <div className="bg-[var(--surface)] border border-[var(--border)] hover:border-[#f1c40f]/60 rounded-2xl p-3.5 sm:p-4 shadow-md transition-all">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#2c2317] border border-[#f1c40f]/40 flex items-center justify-center text-xl shrink-0 shadow-inner">
                  🌧️
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-black text-[var(--text)] truncate">
                      Live &amp; Future Doppler Radar
                    </h3>
                    <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-black px-1.5 py-0.2 rounded uppercase shrink-0">
                      +6h Future
                    </span>
                    <span className="bg-[#1c2e1f] text-[#30d158] border border-[#30d158]/50 text-[9px] font-black px-1.5 py-0.2 rounded uppercase shrink-0">
                      Live NEXRAD
                    </span>
                  </div>
                  <p className="text-[10.5px] text-[var(--text-muted)] truncate">
                    NOAA dual-pol composite &amp; HRRR supercomputer storm projection for {currentLocation.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveWeatherTab('RADAR')}
                className="bg-[#f1c40f] hover:bg-[#e0b40e] text-[#231709] font-black text-xs px-3.5 py-2 rounded-xl shadow cursor-pointer transition-transform active:scale-95 shrink-0 flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Open Radar</span>
                <span>➔</span>
              </button>
            </div>
          </div>

          {/* Hourly Temperature & Rain Probability Curve */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-md">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)] mb-2.5 flex items-center justify-between">
              <span>📈 Hourly Temperature &amp; Rain Probability</span>
              <span className="text-[9.5px] text-[var(--text-muted)] font-normal">Next 20 Hours</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {weather.hourly.map((h, i) => {
                const isRainRisk = h.rainProb >= 30;
                const isWindRisk = h.windSpeed > 15;
                return (
                  <div
                    key={i}
                    className={`flex-shrink-0 min-w-[70px] p-2.5 rounded-xl border text-center flex flex-col gap-1 transition-all ${
                      isRainRisk
                        ? 'bg-red-500/15 border-red-500 text-white'
                        : 'bg-[var(--surface-subtle)] border-[var(--border)]'
                    }`}
                  >
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">{h.timeStr}</span>
                    <span className="text-base font-black text-[var(--accent)]">{h.temp}°</span>
                    <span
                      className={`text-[9.5px] font-bold ${
                        isRainRisk ? 'text-red-400 font-extrabold' : 'text-[var(--accent-secondary)]'
                      }`}
                    >
                      💧{h.rainProb}%
                    </span>
                    {isWindRisk && (
                      <span className="text-[8px] text-amber-400 font-bold">💨{h.windSpeed}m</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 7-Day Contractor Outlook */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-md">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)] block mb-2.5">
              📅 7-Day Contractor Forecast Outlook
            </span>

            <div className="space-y-1.5">
              {weather.daily.map((d, idx) => {
                const isRainRisk = d.rainProb >= 30;
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                      isRainRisk
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-[var(--surface-subtle)] border-[var(--border)]'
                    }`}
                  >
                    <div className="font-bold text-[var(--text)]">{d.dayName}</div>
                    <div>
                      <span className="text-[var(--accent)] font-extrabold">Hi: {d.tempMax}°F</span>
                      <span className="text-[var(--text-muted)] mx-1.5">/</span>
                      <span className="text-[var(--text-muted)]">Lo: {d.tempMin}°F</span>
                    </div>
                    <div
                      className={`font-bold ${
                        isRainRisk ? 'text-red-400 font-extrabold' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      💧 {d.rainProb}% Rain
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE MOVING DOPPLER RADAR (Dedicated, unified animation) */}
      {activeWeatherTab === 'RADAR' && (
        <div className="space-y-3 animate-in fade-in">
          {/* Quick Return Bar */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setActiveWeatherTab('FORECAST')}
              className="text-xs font-bold text-[var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>←</span>
              <span>Back to Spray Forecast</span>
            </button>
            <span className="text-[10.5px] text-[var(--text-muted)]">
              Continuous Doppler rain loop
            </span>
          </div>

          {/* Unified Animated Weather Radar */}
          <WeatherRadar currentLocation={currentLocation} />

          {/* Radar Context Summary Card */}
          {weather && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 shadow-md flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[var(--text)]">
                  {currentLocation.name} Paint Advisory: <span className="text-[#f1c40f]">{weather.current.badgeText}</span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Current: {weather.current.temp}°F • Humidity: {weather.current.humidity}% • Today&rsquo;s Rain Risk: {weather.current.rainProb}%
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveWeatherTab('FORECAST')}
                className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-xl border border-[var(--border)] cursor-pointer whitespace-nowrap transition-colors shrink-0"
              >
                View Full Forecast ➔
              </button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-xs text-[var(--text-muted)]">
          <div className="animate-spin text-2xl mb-2">🔄</div>
          Updating weather forecast for {currentLocation.name}...
        </div>
      )}
    </div>
  );
};
