import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocationInfo } from '../types';

interface WeatherRadarProps {
  currentLocation: LocationInfo;
}

interface RadarHostData {
  host: string;
  radar: {
    past: { time: number; path: string }[];
    nowcast: { time: number; path: string }[];
  };
}

export const WeatherRadar: React.FC<WeatherRadarProps> = ({ currentLocation }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const radarTileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [radarSource, setRadarSource] = useState<'noaa' | 'rainviewer'>('noaa');
  const [radarData, setRadarData] = useState<RadarHostData | null>(null);
  const [frames, setFrames] = useState<{ time: number; path: string; isForecast: boolean }[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [loadingRadar, setLoadingRadar] = useState<boolean>(false);
  const [colorScheme, setColorScheme] = useState<number>(2); // 2: Universal, 4: NEXRAD
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [opacity, setOpacity] = useState<number>(0.75);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapContainerRef.current, {
      center: [currentLocation.lat, currentLocation.lng],
      zoom: 8,
      minZoom: 4,
      maxZoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    // High-reliability OpenStreetMap base tiles (free, reliable, all zoom levels)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: 4,
      maxZoom: 18,
      subdomains: ['a', 'b', 'c'],
    }).addTo(map);

    // Contractor Location Marker
    const customIcon = L.divIcon({
      className: 'custom-radar-pin',
      html: `
        <div style="position: relative; width: 32px; height: 32px;">
          <div style="position: absolute; inset: 0; background: #f1c40f; opacity: 0.3; border-radius: 50%; animation: ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position: absolute; inset: 4px; background: #231709; border: 2px solid #f1c40f; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5);">
            🎨
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const marker = L.marker([currentLocation.lat, currentLocation.lng], { icon: customIcon }).addTo(map);
    marker.bindPopup(`<b>${currentLocation.name}</b><br/>Job Site Center`);
    markerRef.current = marker;

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Invalidate map size when expanded or resized
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);
    }
  }, [isExpanded]);

  // Update map center when location changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 8);
      if (markerRef.current) {
        markerRef.current.setLatLng([currentLocation.lat, currentLocation.lng]);
        markerRef.current.setPopupContent(`<b>${currentLocation.name}</b><br/>Job Site Center`);
      }
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 200);
    }
  }, [currentLocation.lat, currentLocation.lng, currentLocation.name]);

  // Fetch RainViewer metadata when selected
  useEffect(() => {
    if (radarSource !== 'rainviewer') return;

    const fetchRadar = async () => {
      setLoadingRadar(true);
      try {
        let data: RadarHostData | null = null;
        try {
          const proxyRes = await fetch('/api/radar-status');
          if (proxyRes.ok) {
            data = await proxyRes.json();
          }
        } catch {
          // fallback to direct
        }

        if (!data || !data.radar) {
          const directRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
          if (directRes.ok) {
            data = await directRes.json();
          }
        }

        if (data && data.radar) {
          setRadarData(data);

          const allFrames: { time: number; path: string; isForecast: boolean }[] = [];
          if (data.radar?.past) {
            data.radar.past.forEach((f) => allFrames.push({ ...f, isForecast: false }));
          }
          if (data.radar?.nowcast) {
            data.radar.nowcast.forEach((f) => allFrames.push({ ...f, isForecast: true }));
          }

          setFrames(allFrames);
          if (allFrames.length > 0) {
            const latestPastIndex = (data.radar?.past?.length || 1) - 1;
            setCurrentFrameIndex(Math.max(0, latestPastIndex));
          }
        }
      } catch (err) {
        console.error('Failed to load radar data:', err);
      } finally {
        setLoadingRadar(false);
      }
    };

    fetchRadar();
    const interval = setInterval(fetchRadar, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [radarSource]);

  // Update Radar Layer based on selected source
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (radarTileLayerRef.current) {
      map.removeLayer(radarTileLayerRef.current);
      radarTileLayerRef.current = null;
    }

    if (radarSource === 'noaa') {
      // High-resolution US National Weather Service NEXRAD composite reflectivity
      // 100% free public domain, updated every 2-5 min, NO API key required, supports all zoom levels
      const noaaLayer = L.tileLayer(
        'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png',
        {
          opacity: opacity,
          zIndex: 100,
          minZoom: 4,
          maxZoom: 16,
        }
      ).addTo(map);

      radarTileLayerRef.current = noaaLayer;
    } else if (radarSource === 'rainviewer' && radarData && frames.length > 0) {
      const frame = frames[currentFrameIndex];
      if (!frame) return;

      // CRITICAL FIX: RainViewer free public tier restricts tile requests to zoom level <= 7.
      // Setting maxNativeZoom: 7 causes Leaflet to upscale level 7 tiles for higher zoom levels (8-16),
      // completely eliminating the "needs an API key, zoom level is not supported" error!
      const tileUrl = `${radarData.host}${frame.path}/256/{z}/{x}/{y}/${colorScheme}/1_1.png`;

      const rvLayer = L.tileLayer(tileUrl, {
        opacity: opacity,
        zIndex: 100,
        minZoom: 4,
        maxNativeZoom: 7, // Fixes zoom error permanently
        maxZoom: 16,
      }).addTo(map);

      radarTileLayerRef.current = rvLayer;
    }
  }, [radarSource, currentFrameIndex, radarData, frames, colorScheme, opacity]);

  // RainViewer Loop Animation
  useEffect(() => {
    if (radarSource !== 'rainviewer' || !isPlaying || frames.length === 0) return;

    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
    }, 750);

    return () => clearInterval(timer);
  }, [radarSource, isPlaying, frames.length]);

  const currentFrame = frames[currentFrameIndex];
  const frameTimeStr =
    radarSource === 'noaa'
      ? 'LIVE NWS DOPPLER'
      : currentFrame
      ? new Date(currentFrame.time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : 'LIVE';

  return (
    <div
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg transition-all ${
        isExpanded ? 'fixed inset-4 z-50 flex flex-col' : 'space-y-0'
      }`}
    >
      {/* Header Bar */}
      <div className="bg-[#121318] px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌧️</span>
          <div>
            <h3 className="text-xs sm:text-sm font-extrabold text-[var(--text)] flex items-center gap-2">
              <span>Live Weather Radar</span>
              <span className="bg-[#1c2e1f] text-[#30d158] border border-[#30d158]/40 text-[9px] font-black px-1.5 py-0.2 rounded uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse"></span>
                Active Stream
              </span>
            </h3>
            <p className="text-[10px] text-[var(--text-muted)]">
              {currentLocation.name} site • {frameTimeStr} {radarSource === 'rainviewer' && currentFrame?.isForecast ? '(30m Forecast)' : ''}
            </p>
          </div>
        </div>

        {/* Radar Source Switcher & Controls */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center bg-[#1c1d25] p-0.5 rounded-lg border border-[var(--border)] text-[10px] font-bold">
            <button
              type="button"
              onClick={() => setRadarSource('noaa')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                radarSource === 'noaa'
                  ? 'bg-amber-500 text-black font-extrabold shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              NOAA US Doppler (Live)
            </button>
            <button
              type="button"
              onClick={() => setRadarSource('rainviewer')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                radarSource === 'rainviewer'
                  ? 'bg-amber-500 text-black font-extrabold shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              RainViewer Loop
            </button>
          </div>

          {radarSource === 'rainviewer' && (
            <select
              value={colorScheme}
              onChange={(e) => setColorScheme(parseInt(e.target.value, 10))}
              className="bg-[#1c1d25] border border-[var(--border)] text-white text-[10px] font-bold px-2 py-1 rounded outline-none"
              title="Radar Color Palette"
            >
              <option value="2">Universal Radar</option>
              <option value="4">NEXRAD Classic</option>
              <option value="1">TITAN Weather</option>
              <option value="6">HD Contrast</option>
            </select>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="bg-[#1c1d25] hover:bg-[#2c2317] border border-[var(--border)] text-gray-300 hover:text-white px-2 py-1 rounded text-xs font-bold transition-colors cursor-pointer"
            title={isExpanded ? 'Minimize Radar' : 'Maximize Radar'}
          >
            {isExpanded ? '✕ Close' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      {/* Interactive Map View */}
      <div className={`relative w-full ${isExpanded ? 'flex-1' : 'h-72 sm:h-96'} bg-[#121318]`}>
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Loading Overlay */}
        {loadingRadar && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[500] text-xs font-bold text-white gap-2">
            <span className="animate-spin text-lg">🔄</span>
            <span>Connecting to live radar feed...</span>
          </div>
        )}

        {/* Floating Intensity Legend */}
        <div className="absolute bottom-3 left-3 z-[400] bg-black/80 backdrop-blur-md border border-[var(--border)] rounded-lg p-2 text-[9px] text-white shadow-xl pointer-events-none hidden sm:block">
          <div className="font-extrabold text-[8px] uppercase tracking-wider text-gray-300 mb-1">
            Precipitation Intensity (dBZ)
          </div>
          <div className="flex items-center gap-1.5 font-bold">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#00ff00]"></span> Light</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#ffff00]"></span> Mod</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#ff6600]"></span> Heavy</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#cc0000]"></span> Severe</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#ff00ff]"></span> Hail</span>
          </div>
        </div>

        {/* Recenter & Zoom Controls */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 8);
              }
            }}
            className="bg-black/85 hover:bg-black text-white border border-[var(--border)] px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow"
          >
            <span>🎯</span>
            <span className="hidden sm:inline">Center Site</span>
          </button>

          <div className="flex flex-col bg-black/85 border border-[var(--border)] rounded-lg overflow-hidden shadow">
            <button
              type="button"
              onClick={() => mapInstanceRef.current?.zoomIn()}
              className="px-2.5 py-1 text-white hover:bg-[#2c2317] hover:text-[#f1c40f] font-black text-sm border-b border-[var(--border)] cursor-pointer text-center"
              title="Zoom In"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => mapInstanceRef.current?.zoomOut()}
              className="px-2.5 py-1 text-white hover:bg-[#2c2317] hover:text-[#f1c40f] font-black text-sm cursor-pointer text-center"
              title="Zoom Out"
            >
              −
            </button>
          </div>
        </div>
      </div>

      {/* Radar Playback & Timeline Controls */}
      <div className="bg-[#121318] p-3 border-t border-[var(--border)] space-y-2">
        <div className="flex items-center justify-between gap-3">
          {radarSource === 'rainviewer' ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-8 h-8 rounded-lg bg-[#f1c40f] hover:bg-[#e0b40e] text-[#231709] font-black text-xs flex items-center justify-center shadow cursor-pointer transition-transform active:scale-95"
                  title={isPlaying ? 'Pause Radar Loop' : 'Play Radar Loop'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const latestPastIndex = (radarData?.radar?.past?.length || 1) - 1;
                    setCurrentFrameIndex(Math.max(0, latestPastIndex));
                    setIsPlaying(false);
                  }}
                  className="bg-[#1c1d25] hover:bg-[#252733] border border-[var(--border)] text-white text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg cursor-pointer"
                >
                  Live Now
                </button>
              </div>

              {/* Time Scrubber */}
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 min-w-10 text-right">
                  {frames[0] ? new Date(frames[0].time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, frames.length - 1)}
                  value={currentFrameIndex}
                  onChange={(e) => {
                    setCurrentFrameIndex(parseInt(e.target.value, 10));
                    setIsPlaying(false);
                  }}
                  className="flex-1 accent-[#f1c40f] cursor-pointer h-1.5 bg-[#2a2c38] rounded-lg"
                />
                <span className="text-[10px] font-black text-[#f1c40f] min-w-14">
                  {frameTimeStr} {currentFrame?.isForecast ? '★' : ''}
                </span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center gap-3">
              <span className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Official US NOAA / NWS NEXRAD Doppler Radar (West Bend &amp; Regional coverage)
              </span>
              <span className="text-[11px] text-zinc-400 hidden sm:inline">
                Real-time base reflectivity stream (no zoom limit, zero API key required)
              </span>
            </div>
          )}

          {/* Opacity Control */}
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <span>Opacity:</span>
            <input
              type="range"
              min={0.3}
              max={1.0}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-16 accent-[#f1c40f] cursor-pointer h-1 bg-[#2a2c38]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
          <span>Real-time weather radar. Zoom and drag map freely to monitor job sites and storm cells.</span>
          <span className="font-semibold text-gray-300">
            {radarSource === 'noaa' ? 'NOAA / Iowa Mesonet NEXRAD' : 'RainViewer Doppler API'}
          </span>
        </div>
      </div>
    </div>
  );
};
