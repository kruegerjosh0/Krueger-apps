import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationInfo } from '../types';

interface WeatherRadarProps {
  currentLocation: LocationInfo;
}

interface RainViewerFrameRaw {
  time: number;
  path: string;
}

interface RainViewerApiResponse {
  host?: string;
  radar?: {
    past?: RainViewerFrameRaw[];
    nowcast?: RainViewerFrameRaw[];
  };
}

interface RadarFrame {
  id: string;
  time: number; // Unix seconds
  timeStr: string;
  relativeLabel: string;
  isFuture: boolean;
  tileUrl: string;
}

const DEFAULT_WEST_BEND = { lat: 43.4253, lng: -88.1834, name: 'West Bend' };
const RADAR_OPACITY = 0.72;

export const WeatherRadar: React.FC<WeatherRadarProps> = ({ currentLocation }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const centerLat =
    typeof currentLocation?.lat === 'number' && Number.isFinite(currentLocation.lat)
      ? currentLocation.lat
      : DEFAULT_WEST_BEND.lat;
  const centerLng =
    typeof currentLocation?.lng === 'number' && Number.isFinite(currentLocation.lng)
      ? currentLocation.lng
      : DEFAULT_WEST_BEND.lng;
  const siteLabel = currentLocation?.name || DEFAULT_WEST_BEND.name;

  // Initialize Leaflet Map with CartoDB Dark Matter base tiles
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 8,
      minZoom: 4,
      maxZoom: 15,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      minZoom: 4,
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO &middot; Radar: RainViewer',
    }).addTo(map);

    // Subtle AccuWeather-orange home/site marker dot
    const homeIcon = L.divIcon({
      className: 'krueger-map-divicon',
      html: `
        <div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:rgba(240,85,20,0.35);"></span>
          <span style="width:10px;height:10px;border-radius:9999px;background:#F05514;border:2px solid #ffffff;box-shadow:0 0 8px rgba(240,85,20,0.9);"></span>
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    const marker = L.marker([centerLat, centerLng], { icon: homeIcon }).addTo(map);
    marker.bindTooltip(siteLabel, { direction: 'top', offset: [0, -10] });
    markerRef.current = marker;
    mapInstanceRef.current = map;

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
      radarLayerRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Recenter map cleanly whenever active location changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setView([centerLat, centerLng], map.getZoom() || 8);
    if (markerRef.current) {
      markerRef.current.setLatLng([centerLat, centerLng]);
      markerRef.current.setTooltipContent(siteLabel);
    }
    window.setTimeout(() => map.invalidateSize(), 150);
  }, [centerLat, centerLng, siteLabel]);

  // Fetch Past + Future Nowcast radar frames from RainViewer API
  const fetchRadarFrames = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 9000);
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`RainViewer returned HTTP ${res.status}`);
      }

      const data: RainViewerApiResponse = await res.json();
      const host = data?.host || 'https://tilecache.rainviewer.com';
      const pastRaw = Array.isArray(data?.radar?.past) ? data.radar.past : [];
      const nowcastRaw = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];

      if (pastRaw.length === 0 && nowcastRaw.length === 0) {
        throw new Error('No radar frames available right now.');
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const compiled: RadarFrame[] = [];

      // Keep the most recent past scans (up to 12 frames = ~2 hours past)
      pastRaw.slice(-12).forEach((f, idx, arr) => {
        const diffMin = Math.round((f.time - nowSec) / 60);
        const timeStr = new Date(f.time * 1000).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const isLatestPast = idx === arr.length - 1;
        compiled.push({
          id: `past-${f.time}`,
          time: f.time,
          timeStr,
          relativeLabel: isLatestPast ? 'NOW' : `${diffMin}m`,
          isFuture: false,
          tileUrl: `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
        });
      });

      // Include ALL available future nowcast frames
      nowcastRaw.forEach((f) => {
        const diffMin = Math.max(5, Math.round((f.time - nowSec) / 60));
        const timeStr = new Date(f.time * 1000).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        compiled.push({
          id: `future-${f.time}`,
          time: f.time,
          timeStr,
          relativeLabel: `+${diffMin}m`,
          isFuture: true,
          tileUrl: `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
        });
      });

      setFrames(compiled);
      // Start playback right at the latest observed scan so the loop flows straight into future frames
      const firstFutureIdx = compiled.findIndex((f) => f.isFuture);
      const startIdx = firstFutureIdx > 0 ? firstFutureIdx - 1 : Math.max(0, compiled.length - 1);
      setFrameIndex(startIdx);
    } catch {
      setFrames([]);
      setErrorMsg(
        'Live Doppler radar feed is temporarily unreachable. Tap Retry or check the 48-Hour Precip Outlook below.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRadarFrames();
    const refreshTimer = window.setInterval(fetchRadarFrames, 5 * 60 * 1000);
    return () => window.clearInterval(refreshTimer);
  }, [fetchRadarFrames]);

  const activeFrame = frames[frameIndex] || frames[0] || null;
  const pastCount = frames.filter((f) => !f.isFuture).length;
  const futureCount = frames.filter((f) => f.isFuture).length;

  // Update RainViewer tile overlay when active frame changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!activeFrame) {
      if (radarLayerRef.current) {
        map.removeLayer(radarLayerRef.current);
        radarLayerRef.current = null;
      }
      return;
    }

    if (radarLayerRef.current) {
      radarLayerRef.current.setUrl(activeFrame.tileUrl);
      radarLayerRef.current.setOpacity(RADAR_OPACITY);
    } else {
      const layer = L.tileLayer(activeFrame.tileUrl, {
        opacity: RADAR_OPACITY,
        zIndex: 100,
        minZoom: 4,
        maxNativeZoom: 7,
        maxZoom: 15,
      }).addTo(map);
      radarLayerRef.current = layer;
    }
  }, [activeFrame]);

  // Playback animation loop across past + future frames
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;
    const timer = window.setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, 800);
    return () => window.clearInterval(timer);
  }, [isPlaying, frames.length]);

  const handleRecenter = () => {
    mapInstanceRef.current?.setView([centerLat, centerLng], 8);
  };

  return (
    <div className="bg-[#121418] border border-[#22262e] rounded-2xl overflow-hidden shadow-md flex flex-col">
      {/* AccuWeather Dark Radar Header */}
      <div className="px-3.5 py-2.5 bg-[#0e1014] border-b border-[#22262e] flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-[#F05514] shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-white">
                Future Radar
              </h3>
              {activeFrame && (
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider ${
                    activeFrame.isFuture
                      ? 'bg-[#F05514] text-white'
                      : 'bg-[#1f242e] text-[#cbd5e1] border border-[#323948]'
                  }`}
                >
                  {activeFrame.isFuture ? 'FUTURE FORECAST' : 'PAST RADAR'}
                </span>
              )}
            </div>
            <div className="text-[10px] font-semibold text-[#9ca3af] truncate mt-0.5 tabular-nums">
              {activeFrame
                ? `${activeFrame.timeStr} (${activeFrame.relativeLabel}) · ${pastCount} past / ${futureCount} future`
                : `${siteLabel} · RainViewer Doppler`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleRecenter}
            className="px-2 py-1 rounded-lg bg-[#1a1d24] border border-[#2a2f3a] hover:border-[#F05514] text-[10px] font-bold text-[#e2e8f0] cursor-pointer"
            title={`Recenter on ${siteLabel}`}
          >
            🎯
          </button>
          <button
            type="button"
            onClick={fetchRadarFrames}
            disabled={loading}
            className="px-2 py-1 rounded-lg bg-[#1a1d24] border border-[#2a2f3a] hover:border-[#F05514] text-[10px] font-bold text-[#e2e8f0] cursor-pointer disabled:opacity-50"
            title="Reload radar frames"
          >
            <span className={loading ? 'inline-block animate-spin' : ''}>↻</span>
          </button>
        </div>
      </div>

      {/* Interactive Dark Leaflet Map Frame */}
      <div className="relative w-full h-[310px] sm:h-[360px] bg-[#0a0c10] overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-[450] bg-black/65 backdrop-blur-[1px] flex items-center justify-center gap-2 text-xs font-bold text-white">
            <span className="animate-spin text-base">🔄</span>
            <span>Loading Past + Future radar frames…</span>
          </div>
        )}

        {/* Graceful Offline / API Fallback Banner */}
        {!loading && errorMsg && (
          <div className="absolute inset-x-3 top-3 z-[450] bg-[#121418]/95 border border-[#F05514]/60 rounded-xl px-3.5 py-2.5 shadow-xl flex items-center justify-between gap-2.5">
            <p className="text-[11px] font-semibold text-[#e2e8f0] leading-snug">
              {errorMsg}
            </p>
            <button
              type="button"
              onClick={fetchRadarFrames}
              className="px-2.5 py-1 rounded-lg bg-[#F05514] text-white text-[10.5px] font-black shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Floating Zoom Controls */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col bg-[#121418]/90 border border-[#22262e] rounded-xl overflow-hidden shadow-lg">
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomIn()}
            className="w-8 h-8 text-white hover:text-[#F05514] font-black text-sm border-b border-[#22262e] cursor-pointer flex items-center justify-center"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomOut()}
            className="w-8 h-8 text-white hover:text-[#F05514] font-black text-sm cursor-pointer flex items-center justify-center"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>

        {/* Compact Rain / Mix / Snow Color-Scale Legend Bar */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:right-auto z-[400] bg-black/85 backdrop-blur-md border border-[#22262e] rounded-xl px-2.5 py-1.5 flex items-center justify-between sm:justify-start gap-3 text-[9.5px] font-bold text-[#e2e8f0] pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className="text-[#9ca3af] uppercase tracking-wider text-[8.5px] font-black">
              Rain
            </span>
            <span
              className="w-16 h-2 rounded-full inline-block"
              style={{
                background:
                  'linear-gradient(90deg, #22c55e 0%, #eab308 42%, #F05514 74%, #ef4444 100%)',
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block" />
            <span>Mix</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
            <span>Snow</span>
          </div>
        </div>
      </div>

      {/* AccuWeather-Style Playback & Scrubber Bar */}
      <div className="px-3.5 py-3 bg-[#0e1014] border-t border-[#22262e] flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={frames.length <= 1}
            onClick={() => setIsPlaying((prev) => !prev)}
            className="px-3 py-1.5 rounded-xl bg-[#F05514] hover:bg-[#d9490e] text-white text-xs font-black tracking-wide flex items-center gap-1.5 shrink-0 shadow cursor-pointer disabled:opacity-40 transition-colors"
          >
            <span>{isPlaying ? '⏸' : '▶'}</span>
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <input
              type="range"
              aria-label="Radar timeline scrubber"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={Math.min(frameIndex, Math.max(0, frames.length - 1))}
              disabled={frames.length === 0}
              onChange={(e) => {
                setFrameIndex(parseInt(e.target.value, 10));
                setIsPlaying(false);
              }}
              className="w-full accent-[#F05514] h-1.5 bg-[#22262e] rounded-lg cursor-pointer"
            />
            <div className="flex items-center justify-between text-[9px] font-bold text-[#8b949e] tabular-nums">
              <span>{frames[0]?.timeStr || 'Past'}</span>
              <span className="text-[#F05514] font-black">
                {activeFrame
                  ? `${activeFrame.isFuture ? 'FUTURE FORECAST' : 'PAST RADAR'} · ${activeFrame.timeStr}`
                  : '—'}
              </span>
              <span>{frames[frames.length - 1]?.timeStr || 'Future'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
