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
  const [activeWeatherTab, setActiveWeatherTab] = useState<'RADAR' | 'FORECAST' | 'BOTH'>('BOTH');

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
        // Direct match
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
    <div className="space-y-4 max-w-2xl mx-auto pb-20">
      {/* View Title */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold uppercase tracking-wide text-[var(--accent)]">
            Live Weather &amp; Spray Hub
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Device location tracking, regional search &amp; paint cure conditions
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadWeatherData(currentLocation.lat, currentLocation.lng)}
          disabled={loading}
          className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text)] flex items-center gap-1 cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
        >
          <span className={loading ? 'animate-spin' : ''}>🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Location Control Card */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-md space-y-3">
        {/* Active Location Display & Current Location Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📍</span>
            <div>
              <div className="text-sm font-extrabold text-[var(--text)] flex items-center gap-2 flex-wrap">
                <span>{currentLocation.name}</span>
                {currentLocation.region && (
                  <span className="text-xs text-[var(--text-muted)] font-normal">
                    ({currentLocation.region})
                  </span>
                )}
                {isFollowingGps ? (
                  <span className="bg-[#1c2e1f] text-[#30d158] border border-[#30d158]/50 text-[9px] font-black px-2 py-0.5 rounded uppercase shadow-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse"></span>
                    Follow Me Active (Live GPS)
                  </span>
                ) : (
                  <span className="bg-[#2c2317] text-[#f1c40f] border border-[#f1c40f]/40 text-[9px] font-bold px-2 py-0.5 rounded uppercase shadow-sm">
                    Manual Location
                  </span>
                )}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono">
                Coordinates: {currentLocation.lat.toFixed(4)}°N, {Math.abs(currentLocation.lng).toFixed(4)}°W
                {isFollowingGps && ' • Continuously updating as you travel'}
              </div>
            </div>
          </div>

          {/* Current Device Location / Follow Me Button */}
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={gpsLoading}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-2 cursor-pointer shadow-sm ${
              isFollowingGps
                ? 'bg-[#30d158] text-white border-[#30d158] font-black'
                : 'bg-[#2c2317] hover:bg-[#3b2b1d] border-[#f1c40f] text-[#f1c40f] font-extrabold'
            }`}
          >
            <span>{gpsLoading ? '⏳' : '🛰️'}</span>
            <span>
              {gpsLoading
                ? 'Detecting Location...'
                : isFollowingGps
                ? '🛰️ Following My GPS Location'
                : '🛰️ Follow Me (Live GPS)'}
            </span>
          </button>
        </div>

        {/* Search Any City or Region Input */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
            Search Any City, Town, Zip, or Region
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type city or region (e.g. West Bend, Campbellsport, Chicago, Dallas)..."
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-xl px-3.5 py-2.5 text-xs outline-none shadow-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="absolute right-3 top-2.5 text-[var(--text-muted)] hover:text-[var(--text)] text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="bg-[var(--accent-secondary)] hover:opacity-95 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-all active:scale-95 disabled:opacity-50 shadow-sm"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Search Suggestions Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl z-30 max-h-60 overflow-y-auto divide-y divide-[var(--border)]">
              {searchResults.map((loc, idx) => (
                <button
                  key={`${loc.name}-${loc.lat}-${idx}`}
                  type="button"
                  onClick={() => selectSearchedLocation(loc)}
                  className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-[var(--surface-subtle)] flex items-center justify-between cursor-pointer transition-colors"
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

        {/* Quick Regional Shortcuts */}
        <div>
          <span className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1.5">
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
                  onClick={() => onLocationChange(preset)}
                  className={`text-[10.5px] px-2.5 py-1 rounded-lg border transition-all active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent-secondary)] border-[var(--accent-secondary)] text-white font-bold'
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

      {/* Weather Hub View Selector Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl">
        <button
          type="button"
          onClick={() => setActiveWeatherTab('RADAR')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeWeatherTab === 'RADAR'
              ? 'bg-[#f1c40f] text-[#231709] shadow-md'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          <span>🌧️</span>
          <span>Live Doppler Radar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWeatherTab('FORECAST')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeWeatherTab === 'FORECAST'
              ? 'bg-[#f1c40f] text-[#231709] shadow-md'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          <span>🌡️</span>
          <span>Spray Forecast</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWeatherTab('BOTH')}
          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeWeatherTab === 'BOTH'
              ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
          title="Display both live radar and detailed forecast together"
        >
          <span>📱</span>
          <span className="hidden sm:inline">Both</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* 1. Real-Time Interactive Doppler Radar Map (Shown when RADAR or BOTH is active) */}
      {(activeWeatherTab === 'RADAR' || activeWeatherTab === 'BOTH') && (
        <div className="space-y-2">
          {activeWeatherTab === 'RADAR' && (
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] px-1">
              <span className="font-bold text-[var(--text)] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse"></span>
                Site Radar: {currentLocation.name}
              </span>
              <span>Drag scrubber or click Play to inspect storm movement</span>
            </div>
          )}
          <WeatherRadar currentLocation={currentLocation} />
        </div>
      )}

      {/* 2. Forecast & Spray Conditions (Shown when FORECAST or BOTH is active) */}
      {(activeWeatherTab === 'FORECAST' || activeWeatherTab === 'BOTH') && weather && (
        <>
          <div className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] text-white rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-white/85">
                  {currentLocation.isGps ? '📍 Current Device Location' : 'Weather Forecast'} • {currentLocation.name}
                </span>
                <div className="text-4xl sm:text-5xl font-black tracking-tight my-1 text-white">
                  {weather.current.temp}°F
                </div>
                <div className="text-sm font-bold text-white/95 mt-1">{weather.current.conditionText}</div>
              </div>
              <span
                style={{ backgroundColor: weather.current.badgeBg }}
                className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg text-white shadow-md"
              >
                {weather.current.badgeText}
              </span>
            </div>

            <div className="mt-3.5 pt-3.5 border-t border-white/20 text-xs font-semibold text-white/95 leading-relaxed bg-black/20 -mx-5 -mb-5 p-4 rounded-b-2xl">
              {weather.current.advice}
            </div>
          </div>

          {/* 3 Metric Tiles */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl text-center shadow-sm">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Wind</span>
              <div className="text-base font-extrabold text-[var(--accent)] mt-0.5">
                {weather.current.windSpeed} mph
              </div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl text-center shadow-sm">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Humidity</span>
              <div className="text-base font-extrabold text-[var(--accent-secondary)] mt-0.5">
                {weather.current.humidity}%
              </div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl text-center shadow-sm">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Rain Risk</span>
              <div className="text-base font-extrabold text-[var(--accent-tertiary)] mt-0.5">
                {weather.current.rainProb}%
              </div>
            </div>
          </div>

          {/* Hourly Temperature & Rain Risk Curve */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-md">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)] mb-2.5 flex items-center justify-between">
              <span>📈 Hourly Temperature &amp; Rain Probability</span>
              <span className="text-[9px] text-[var(--text-muted)] font-normal">Next 20 Hours</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {weather.hourly.map((h, i) => {
                const isRainRisk = h.rainProb >= 30;
                const isWindRisk = h.windSpeed > 15;
                return (
                  <div
                    key={i}
                    className={`flex-shrink-0 min-w-[72px] p-2.5 rounded-xl border text-center flex flex-col gap-1 transition-all ${
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
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-md">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)] block mb-2.5">
              📅 7-Day Contractor Forecast Outlook
            </span>

            <div className="space-y-2">
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
        </>
      )}

      {loading && (
        <div className="text-center py-12 text-xs text-[var(--text-muted)]">
          <div className="animate-spin text-2xl mb-2">🔄</div>
          Loading weather forecast for {currentLocation.name}...
        </div>
      )}
    </div>
  );
};
