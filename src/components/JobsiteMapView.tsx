import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  Customer,
  JobMapStatus,
  MileageEntry,
  RouteStopItem,
  SupplyPinCategory,
  SupplyStopPin,
  SystemConstants,
} from '../types';
import {
  HOME_BASE,
  JOB_MAP_STATUS_META,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  PRESET_SUPPLY_STOPS,
  SUPPLY_CATEGORY_META,
  CustomerMapSummary,
  PinWeatherSummary,
  RouteMileageEstimate,
  buildGoogleMapsMultiStopUrl,
  buildSingleStopMapsUrl,
  estimateFallbackRoute,
  fetchOsrmRoadRoute,
  fetchPinWeatherSummary,
  geocodeAddressWithNominatim,
  getCustomerMapSummary,
  haversineMiles,
  optimizeRouteStops,
  resolveApproxWisconsinCoords,
  sanitizeTelHref,
} from '../utils/mapHelpers';
import { formatScheduledDate, getLocalTodayIso } from '../utils/projectHelpers';

const NEARBY_RADIUS_MILES = 3;
const NEARBY_RADIUS_METERS = NEARBY_RADIUS_MILES * 1609.344;

function getWeatherDotColor(tone: PinWeatherSummary['paintTone']): string {
  if (tone === 'ok') return '#22c55e';
  if (tone === 'warn') return '#facc15';
  return '#ef4444';
}

interface JobsiteMapViewProps {
  customers: Customer[];
  constants: SystemConstants;
  customSupplyPins: SupplyStopPin[];
  onSaveCustomPin: (pin: SupplyStopPin) => void;
  onDeleteCustomPin: (pinId: string) => void;
  onOpenFolder: (customerId: number) => void;
  onUpdateCustomer: (updated: Customer) => void;
  onSaveMileage: (entry: MileageEntry) => void;
  onToast: (msg: string) => void;
}

type SelectedPin =
  | { kind: 'CUSTOMER'; customerId: number }
  | { kind: 'SUPPLY'; pinId: string }
  | { kind: 'HOME' };

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getShortCustomerLabel(name: string): string {
  const trimmed = (name || 'Client').trim();
  if (trimmed.length <= 14) return trimmed;
  const parts = trimmed.split(/\s+/);
  const last = parts[parts.length - 1];
  return last.length <= 14 ? last : `${trimmed.slice(0, 12)}…`;
}

export const JobsiteMapView: React.FC<JobsiteMapViewProps> = ({
  customers,
  constants,
  customSupplyPins,
  onSaveCustomPin,
  onDeleteCustomPin,
  onOpenFolder,
  onUpdateCustomer,
  onSaveMileage,
  onToast,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const radiusLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const geocodedAttemptedRef = useRef<Set<string>>(new Set());

  // Map UI Controls
  const [moneyView, setMoneyView] = useState<boolean>(false);
  const [showSupplyLayer, setShowSupplyLayer] = useState<boolean>(true);
  const [mapStyle, setMapStyle] = useState<'dark' | 'street'>('dark');
  const [statusFilter, setStatusFilter] = useState<'ALL' | JobMapStatus>('ALL');
  const [selectedPin, setSelectedPin] = useState<SelectedPin | null>(null);

  // Live Open-Meteo weather for currently tapped customer pin & exterior/deck map pins
  const [pinWeather, setPinWeather] = useState<PinWeatherSummary | null>(null);
  const [loadingWeather, setLoadingWeather] = useState<boolean>(false);
  const [exteriorWeatherByCustId, setExteriorWeatherByCustId] = useState<
    Record<number, PinWeatherSummary>
  >({});

  // Runtime geocode map for customers whose addresses are geocoded on the fly
  const [resolvedCoords, setResolvedCoords] = useState<
    Record<number, { lat: number; lng: number; isApprox: boolean }>
  >({});
  const [isGeocodingCount, setIsGeocodingCount] = useState<number>(0);

  // Multi-Stop Route Builder state
  const [routeStops, setRouteStops] = useState<RouteStopItem[]>([]);
  const [returnToBase, setReturnToBase] = useState<boolean>(true);
  const [routeEstimate, setRouteEstimate] = useState<RouteMileageEstimate>(() =>
    estimateFallbackRoute([], true)
  );
  const [loadingRoadRoute, setLoadingRoadRoute] = useState<boolean>(false);
  const [quickAddStopValue, setQuickAddStopValue] = useState<string>('');

  // "+ Add Custom Pin" modal state
  const [addPinModalOpen, setAddPinModalOpen] = useState<boolean>(false);
  const [newPinName, setNewPinName] = useState<string>('');
  const [newPinCategory, setNewPinCategory] = useState<SupplyPinCategory>('GAS_STOP');
  const [newPinAddress, setNewPinAddress] = useState<string>('');
  const [newPinPhone, setNewPinPhone] = useState<string>('');
  const [newPinNotes, setNewPinNotes] = useState<string>('');
  const [useMapCenterCoords, setUseMapCenterCoords] = useState<boolean>(false);
  const [savingPin, setSavingPin] = useState<boolean>(false);

  // Combine preset paint stores + user-saved custom pins
  const allSupplyPins = useMemo<SupplyStopPin[]>(() => {
    return [...PRESET_SUPPLY_STOPS, ...customSupplyPins];
  }, [customSupplyPins]);

  // Summarize every customer with status, financials, scope, and coordinates
  const customerSummaries = useMemo<
    Array<CustomerMapSummary & { lat: number; lng: number; isApprox: boolean }>
  >(() => {
    return customers.map((c) => {
      const summary = getCustomerMapSummary(c, constants);
      if (typeof c.lat === 'number' && typeof c.lng === 'number' && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
        return { ...summary, lat: c.lat, lng: c.lng, isApprox: false };
      }
      const runtime = resolvedCoords[c.id];
      if (runtime) {
        return { ...summary, lat: runtime.lat, lng: runtime.lng, isApprox: runtime.isApprox };
      }
      const approx = resolveApproxWisconsinCoords(c.address || '', c.id);
      return { ...summary, lat: approx.lat, lng: approx.lng, isApprox: true };
    });
  }, [customers, constants, resolvedCoords]);

  // Counts per status for filter pills
  const statusCounts = useMemo<Record<JobMapStatus, number>>(() => {
    const counts: Record<JobMapStatus, number> = {
      UNQUOTED: 0,
      QUOTED: 0,
      SCHEDULED: 0,
      COMPLETED: 0,
    };
    customerSummaries.forEach((s) => {
      counts[s.mapStatus] += 1;
    });
    return counts;
  }, [customerSummaries]);

  // Filtered customers currently plotted on the map
  const visibleCustomerPins = useMemo(() => {
    if (statusFilter === 'ALL') return customerSummaries;
    return customerSummaries.filter((s) => s.mapStatus === statusFilter);
  }, [customerSummaries, statusFilter]);

  // Money View aggregate metrics across visible pins
  const moneyRollup = useMemo(() => {
    let totalQuoted = 0;
    let totalDepositsOwed = 0;
    let totalBalancesOwed = 0;
    visibleCustomerPins.forEach((p) => {
      totalQuoted += p.financials.grossTotal;
      if (p.financials.moneyState === 'DEPOSIT_OWED') {
        totalDepositsOwed += p.financials.depositOwed;
      } else if (p.financials.moneyState === 'BALANCE_OWED') {
        totalBalancesOwed += p.financials.balanceDue;
      }
    });
    return { totalQuoted, totalDepositsOwed, totalBalancesOwed };
  }, [visibleCustomerPins]);

  // Background geocode customers that have a street address but no saved lat/lng yet
  useEffect(() => {
    let cancelled = false;
    const toGeocode = customers.filter((c) => {
      const hasCoords = typeof c.lat === 'number' && typeof c.lng === 'number' && Number.isFinite(c.lat) && Number.isFinite(c.lng);
      const addr = (c.address || '').trim();
      const attemptKey = `${c.id}:${addr.toLowerCase()}`;
      return !hasCoords && addr.length >= 5 && !geocodedAttemptedRef.current.has(attemptKey);
    });

    if (toGeocode.length === 0) return;

    const runQueue = async () => {
      setIsGeocodingCount(toGeocode.length);
      for (let i = 0; i < toGeocode.length; i++) {
        if (cancelled) break;
        const cust = toGeocode[i];
        const attemptKey = `${cust.id}:${(cust.address || '').trim().toLowerCase()}`;
        geocodedAttemptedRef.current.add(attemptKey);

        const geo = await geocodeAddressWithNominatim(cust.address);
        if (cancelled) break;

        if (geo) {
          setResolvedCoords((prev) => ({
            ...prev,
            [cust.id]: { lat: geo.lat, lng: geo.lng, isApprox: false },
          }));
          onUpdateCustomer({ ...cust, lat: geo.lat, lng: geo.lng });
        }

        setIsGeocodingCount((prev) => Math.max(0, prev - 1));
        if (i < toGeocode.length - 1) {
          await new Promise((r) => setTimeout(r, 950));
        }
      }
      if (!cancelled) setIsGeocodingCount(0);
    };

    runQueue();
    return () => {
      cancelled = true;
    };
  }, [customers, onUpdateCustomer]);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: MAP_DEFAULT_CENTER,
      zoom: MAP_DEFAULT_ZOOM,
      minZoom: 7,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true,
    });

    const radiusLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    radiusLayerRef.current = radiusLayer;
    markersLayerRef.current = markersLayer;
    routeLayerRef.current = routeLayer;

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(() => map.invalidateSize(), 180);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      radiusLayerRef.current = null;
      markersLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  // Switch between Dark OSM (CSS-filtered OSM) and Street OSM tiles (zero API keys)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      className: mapStyle === 'dark' ? 'dark-osm-tiles' : '',
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
  }, [mapStyle]);

  // Selected customer / supply pin lookup
  const selectedCustomerItem = useMemo(() => {
    if (selectedPin?.kind !== 'CUSTOMER') return null;
    return customerSummaries.find((s) => s.customer.id === selectedPin.customerId) || null;
  }, [selectedPin, customerSummaries]);

  const selectedSupplyPin = useMemo(() => {
    if (selectedPin?.kind !== 'SUPPLY') return null;
    return allSupplyPins.find((p) => p.id === selectedPin.pinId) || null;
  }, [selectedPin, allSupplyPins]);

  // Nearby leads & past clients within 3 miles of the selected customer pin
  const nearbyCustomers = useMemo(() => {
    if (!selectedCustomerItem) return [];
    return customerSummaries
      .filter((other) => other.customer.id !== selectedCustomerItem.customer.id)
      .map((other) => ({
        ...other,
        distanceMiles: haversineMiles(
          selectedCustomerItem.lat,
          selectedCustomerItem.lng,
          other.lat,
          other.lng
        ),
      }))
      .filter((other) => other.distanceMiles <= NEARBY_RADIUS_MILES)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }, [selectedCustomerItem, customerSummaries]);

  const nearbyCustomerIdSet = useMemo(() => {
    return new Set(nearbyCustomers.map((n) => n.customer.id));
  }, [nearbyCustomers]);

  // Draw subtle 3-mile neighbor radius circle around tapped customer pin
  useEffect(() => {
    const radiusLayer = radiusLayerRef.current;
    if (!radiusLayer) return;
    radiusLayer.clearLayers();

    if (!selectedCustomerItem) return;

    L.circle([selectedCustomerItem.lat, selectedCustomerItem.lng], {
      radius: NEARBY_RADIUS_METERS,
      color: '#38bdf8',
      weight: 1.75,
      opacity: 0.78,
      dashArray: '6 5',
      fillColor: '#38bdf8',
      fillOpacity: 0.09,
      interactive: false,
    }).addTo(radiusLayer);
  }, [selectedCustomerItem?.customer.id, selectedCustomerItem?.lat, selectedCustomerItem?.lng]);

  // Fetch Open-Meteo suitability dot data for visible exterior/deck pins (grid-cached 15 min)
  const exteriorPinKey = useMemo(() => {
    return visibleCustomerPins
      .filter((p) => p.isExteriorJob)
      .map((p) => `${p.customer.id}:${p.lat.toFixed(2)},${p.lng.toFixed(2)}`)
      .join('|');
  }, [visibleCustomerPins]);

  useEffect(() => {
    const extPins = visibleCustomerPins.filter((p) => p.isExteriorJob);
    if (extPins.length === 0) return;

    let cancelled = false;
    const run = async () => {
      const updates: Record<number, PinWeatherSummary> = {};
      await Promise.all(
        extPins.map(async (p) => {
          const summary = await fetchPinWeatherSummary(p.lat, p.lng);
          if (summary) {
            updates[p.customer.id] = summary;
          }
        })
      );
      if (!cancelled && Object.keys(updates).length > 0) {
        setExteriorWeatherByCustId((prev) => ({ ...prev, ...updates }));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [exteriorPinKey]);

  // Route stop helpers
  const routeIndexById = useMemo(() => {
    const map = new Map<string, number>();
    routeStops.forEach((s, idx) => map.set(s.id, idx + 1));
    return map;
  }, [routeStops]);

  const toggleStopInRoute = useCallback(
    (stop: RouteStopItem) => {
      setRouteStops((prev) => {
        const exists = prev.some((s) => s.id === stop.id);
        if (exists) {
          onToast(`Removed ${stop.name} from route`);
          return prev.filter((s) => s.id !== stop.id);
        }
        onToast(`Added ${stop.name} (#${prev.length + 1}) to route`);
        return [...prev, stop];
      });
    },
    [onToast]
  );

  // Render markers whenever pins, mode, selection, or route sequence changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    // 1. Home Base Pin at 2119 Barton Ave, West Bend, WI 53090
    const isHomeSelected = selectedPin?.kind === 'HOME';
    const homeIcon = L.divIcon({
      className: 'krueger-map-divicon',
      html: `
        <div style="
          display:inline-flex;align-items:center;gap:4px;
          background:#18181b;color:#facc15;
          border:2px solid ${isHomeSelected ? '#ffffff' : '#facc15'};
          border-radius:9999px;padding:3px 8px;
          font-size:11px;font-weight:900;white-space:nowrap;
          box-shadow:0 3px 12px rgba(0,0,0,0.75);
          transform:translate(-50%,-50%);
        ">
          <span>🏠</span><span>BASE</span>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    const homeMarker = L.marker([HOME_BASE.lat, HOME_BASE.lng], {
      icon: homeIcon,
      zIndexOffset: 900,
    }).addTo(markersLayer);
    homeMarker.on('click', () => setSelectedPin({ kind: 'HOME' }));

    // 2. Supply & Gas Stop Overlay Pins
    if (showSupplyLayer) {
      allSupplyPins.forEach((pin) => {
        const cat = SUPPLY_CATEGORY_META[pin.category];
        const routeStopId = `supply-${pin.id}`;
        const stopNum = routeIndexById.get(routeStopId);
        const isSelected = selectedPin?.kind === 'SUPPLY' && selectedPin.pinId === pin.id;

        const stopBadgeHtml = stopNum
          ? `<span style="background:#06b6d4;color:#04121a;border-radius:9999px;padding:0 5px;font-size:9px;font-weight:900;margin-left:2px;">#${stopNum}</span>`
          : '';

        const supplyIcon = L.divIcon({
          className: 'krueger-map-divicon',
          html: `
            <div style="
              display:inline-flex;align-items:center;gap:3px;
              background:${cat.bg};color:${cat.color};
              border:2px solid ${isSelected ? '#ffffff' : stopNum ? '#06b6d4' : cat.color};
              border-radius:8px;padding:3px 6px;
              font-size:10px;font-weight:800;white-space:nowrap;
              box-shadow:0 2px 10px rgba(0,0,0,0.72);
              transform:translate(-50%,-50%);
            ">
              <span>${cat.icon}</span>
              <span>${escapeHtml(pin.name.split('—')[0].trim().slice(0, 14))}</span>
              ${stopBadgeHtml}
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const marker = L.marker([pin.lat, pin.lng], {
          icon: supplyIcon,
          zIndexOffset: isSelected ? 850 : stopNum ? 700 : 350,
        }).addTo(markersLayer);

        marker.on('click', () => {
          setSelectedPin({ kind: 'SUPPLY', pinId: pin.id });
        });
      });
    }

    // 3. Customer & Jobsite Pins (Status Mode vs Money View)
    visibleCustomerPins.forEach((item) => {
      const { customer, mapStatus, isActiveInProgress, isExteriorJob, financials, lat, lng } = item;
      const meta = JOB_MAP_STATUS_META[mapStatus];
      const routeStopId = `cust-${customer.id}`;
      const stopNum = routeIndexById.get(routeStopId);
      const isSelected = selectedPin?.kind === 'CUSTOMER' && selectedPin.customerId === customer.id;
      const isNearbyNeighbor = nearbyCustomerIdSet.has(customer.id);
      const extWx = isExteriorJob ? exteriorWeatherByCustId[customer.id] : undefined;

      const weatherDotHtml = extWx
        ? (() => {
            const dotColor = getWeatherDotColor(extWx.paintTone);
            const tip = `Exterior Weather: ${extWx.paintBadge} (${extWx.tempF}°F, ${extWx.windMph} mph, ${extWx.rainChancePct}% rain)`;
            return `<span data-weather-dot="${extWx.paintTone}" title="${escapeHtml(tip)}" style="width:8px;height:8px;border-radius:50%;background:${dotColor};border:1.5px solid #09090b;box-shadow:0 0 6px ${dotColor};display:inline-block;flex-shrink:0;"></span>`;
          })()
        : '';

      const stopBadgeHtml = stopNum
        ? `<span style="background:#06b6d4;color:#04121a;border-radius:9999px;padding:0 5px;font-size:9px;font-weight:900;margin-left:3px;">#${stopNum}</span>`
        : '';

      const pinShadow = isNearbyNeighbor
        ? '0 0 0 2.5px #38bdf8, 0 3px 12px rgba(0,0,0,0.85)'
        : '0 3px 12px rgba(0,0,0,0.8)';

      let html = '';

      if (moneyView) {
        let moneyColor = '#94a3b8';
        let pillText = 'Unquoted';
        if (financials.moneyState === 'PAID') {
          moneyColor = '#30d158';
          pillText = `$${financials.grossTotal.toLocaleString()} · Paid`;
        } else if (financials.moneyState === 'DEPOSIT_OWED') {
          moneyColor = '#f59e0b';
          pillText = `$${financials.grossTotal.toLocaleString()} · 50% Dep`;
        } else if (financials.moneyState === 'BALANCE_OWED') {
          moneyColor = '#fb7185';
          pillText = `$${financials.grossTotal.toLocaleString()} · Bal $${financials.balanceDue.toLocaleString()}`;
        }

        html = `
          <div style="
            display:inline-flex;align-items:center;gap:4px;
            background:#0f172a;color:#f8fafc;
            border:2px solid ${isSelected ? '#ffffff' : isNearbyNeighbor ? '#38bdf8' : moneyColor};
            border-radius:9999px;padding:3px 8px;
            font-size:10px;font-weight:900;white-space:nowrap;
            box-shadow:${pinShadow};
            transform:translate(-50%,-50%);
          ">
            <span style="width:7px;height:7px;border-radius:50%;background:${moneyColor};display:inline-block;flex-shrink:0;"></span>
            <span>${escapeHtml(pillText)}</span>
            ${weatherDotHtml}
            ${stopBadgeHtml}
          </div>
        `;
      } else {
        const shortName = getShortCustomerLabel(customer.name);
        const activeDot = isActiveInProgress
          ? `<span style="width:6px;height:6px;border-radius:50%;background:#30d158;box-shadow:0 0 6px #30d158;display:inline-block;"></span>`
          : '';
        html = `
          <div style="
            display:inline-flex;align-items:center;gap:4px;
            background:#111319;color:#f8fafc;
            border:2px solid ${isSelected ? '#ffffff' : isNearbyNeighbor ? '#38bdf8' : stopNum ? '#06b6d4' : meta.color};
            border-radius:9999px;padding:3px 8px;
            font-size:10.5px;font-weight:800;white-space:nowrap;
            box-shadow:${pinShadow};
            transform:translate(-50%,-50%);
          ">
            <span style="width:9px;height:9px;border-radius:50%;background:${meta.color};border:1.5px solid #ffffff;display:inline-block;flex-shrink:0;"></span>
            <span>${escapeHtml(shortName)}</span>
            ${weatherDotHtml}
            ${activeDot}
            ${stopBadgeHtml}
          </div>
        `;
      }

      const icon = L.divIcon({
        className: 'krueger-map-divicon',
        html,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: isSelected ? 950 : isNearbyNeighbor ? 820 : stopNum ? 750 : 500,
      }).addTo(markersLayer);

      marker.on('click', () => {
        setSelectedPin({ kind: 'CUSTOMER', customerId: customer.id });
      });
    });
  }, [
    visibleCustomerPins,
    allSupplyPins,
    showSupplyLayer,
    moneyView,
    selectedPin,
    routeIndexById,
    nearbyCustomerIdSet,
    exteriorWeatherByCustId,
  ]);

  // Compute route mileage & fetch live OSRM road geometry whenever routeStops or returnToBase changes
  useEffect(() => {
    const fallback = estimateFallbackRoute(routeStops, returnToBase);
    setRouteEstimate(fallback);

    if (routeStops.length === 0) {
      setLoadingRoadRoute(false);
      return;
    }

    let cancelled = false;
    setLoadingRoadRoute(true);

    fetchOsrmRoadRoute(routeStops, returnToBase).then((osrmRes) => {
      if (cancelled) return;
      setLoadingRoadRoute(false);
      if (osrmRes) {
        setRouteEstimate(osrmRes);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [routeStops, returnToBase]);

  // Draw route polyline on Leaflet map
  useEffect(() => {
    const routeLayer = routeLayerRef.current;
    if (!routeLayer) return;
    routeLayer.clearLayers();

    if (routeEstimate.geometryLatLngs.length < 2) return;

    // Subtle dark outer halo + bright cyan/amber road line
    L.polyline(routeEstimate.geometryLatLngs, {
      color: '#020617',
      weight: 7,
      opacity: 0.7,
    }).addTo(routeLayer);

    L.polyline(routeEstimate.geometryLatLngs, {
      color: '#22d3ee',
      weight: 4,
      opacity: 0.95,
      dashArray: routeEstimate.isRoadGeometry ? undefined : '8 6',
    }).addTo(routeLayer);
  }, [routeEstimate]);

  // Fetch live Open-Meteo weather when a customer pin is tapped
  useEffect(() => {
    if (!selectedCustomerItem) {
      setPinWeather(null);
      setLoadingWeather(false);
      return;
    }

    let cancelled = false;
    setLoadingWeather(true);
    setPinWeather(null);

    fetchPinWeatherSummary(selectedCustomerItem.lat, selectedCustomerItem.lng).then((w) => {
      if (cancelled) return;
      setLoadingWeather(false);
      setPinWeather(w);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerItem?.customer.id, selectedCustomerItem?.lat, selectedCustomerItem?.lng]);

  // Map navigation actions
  const handleCenterHomeBase = () => {
    mapInstanceRef.current?.setView([HOME_BASE.lat, HOME_BASE.lng], 12, { animate: true });
    setSelectedPin({ kind: 'HOME' });
  };

  const handleFitAllPins = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const pts: [number, number][] = [[HOME_BASE.lat, HOME_BASE.lng]];
    visibleCustomerPins.forEach((c) => pts.push([c.lat, c.lng]));
    if (showSupplyLayer) {
      allSupplyPins.forEach((s) => pts.push([s.lat, s.lng]));
    }
    if (pts.length <= 1) {
      map.setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 13 });
  };

  // Re-geocode a specific customer manually
  const handleReGeocodeCustomer = async (cust: Customer) => {
    if (!cust.address?.trim()) {
      onToast('Add a street address in the customer folder first');
      return;
    }
    onToast('Looking up exact street coordinates...');
    const geo = await geocodeAddressWithNominatim(cust.address);
    if (geo) {
      setResolvedCoords((prev) => ({
        ...prev,
        [cust.id]: { lat: geo.lat, lng: geo.lng, isApprox: false },
      }));
      onUpdateCustomer({ ...cust, lat: geo.lat, lng: geo.lng });
      mapInstanceRef.current?.setView([geo.lat, geo.lng], 13, { animate: true });
      onToast('✔ Pin snapped to exact street address');
    } else {
      onToast('Could not locate street address—check city/zip');
    }
  };

  // Save a new Custom Supply / Gas / Hardware / Storage Pin
  const handleCreateCustomPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newPinName.trim();
    const trimmedAddr = newPinAddress.trim();
    if (!trimmedName) {
      onToast('Enter a stop name first');
      return;
    }

    setSavingPin(true);
    let lat: number;
    let lng: number;

    if (useMapCenterCoords || !trimmedAddr) {
      const center = mapInstanceRef.current?.getCenter();
      lat = center ? center.lat : HOME_BASE.lat;
      lng = center ? center.lng : HOME_BASE.lng;
    } else {
      const geo = await geocodeAddressWithNominatim(trimmedAddr);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      } else {
        const approx = resolveApproxWisconsinCoords(trimmedAddr, Date.now());
        lat = approx.lat;
        lng = approx.lng;
      }
    }

    const newPin: SupplyStopPin = {
      id: `custom-${Date.now()}`,
      name: trimmedName,
      category: newPinCategory,
      address: trimmedAddr || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      lat,
      lng,
      phone: newPinPhone.trim() || undefined,
      notes: newPinNotes.trim() || undefined,
      isPreset: false,
    };

    onSaveCustomPin(newPin);
    setShowSupplyLayer(true);
    setSelectedPin({ kind: 'SUPPLY', pinId: newPin.id });
    mapInstanceRef.current?.setView([lat, lng], 13, { animate: true });

    setNewPinName('');
    setNewPinCategory('GAS_STOP');
    setNewPinAddress('');
    setNewPinPhone('');
    setNewPinNotes('');
    setUseMapCenterCoords(false);
    setSavingPin(false);
    setAddPinModalOpen(false);
    onToast(`✔ Saved custom pin: ${newPin.name}`);
  };

  // Route Builder mutations
  const moveStop = (index: number, delta: -1 | 1) => {
    setRouteStops((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const handleOptimizeRoute = () => {
    if (routeStops.length < 2) return;
    const beforeEst = estimateFallbackRoute(routeStops, returnToBase);
    const beforeMiles = returnToBase ? beforeEst.roundTripMiles : beforeEst.oneWayMiles;
    const sorted = optimizeRouteStops(routeStops, returnToBase);
    const afterEst = estimateFallbackRoute(sorted, returnToBase);
    const afterMiles = returnToBase ? afterEst.roundTripMiles : afterEst.oneWayMiles;
    const savedMiles = Math.max(0, Math.round((beforeMiles - afterMiles) * 10) / 10);
    setRouteStops(sorted);
    onToast(
      savedMiles >= 0.2
        ? `⚡ Sorted fastest ${returnToBase ? 'loop' : 'route'} — saved ~${savedMiles.toFixed(1)} mi`
        : `⚡ Stops sorted into fastest ${returnToBase ? 'loop' : 'sequence'} from Home Base`
    );
  };

  const handleQuickAddStop = (val: string) => {
    setQuickAddStopValue('');
    if (!val) return;
    if (val.startsWith('cust-')) {
      const cid = Number(val.slice(5));
      const found = customerSummaries.find((c) => c.customer.id === cid);
      if (!found) return;
      const stop: RouteStopItem = {
        id: `cust-${found.customer.id}`,
        kind: 'CUSTOMER',
        refId: found.customer.id,
        name: found.customer.name,
        address: found.customer.address || 'Wisconsin Jobsite',
        lat: found.lat,
        lng: found.lng,
        subtitle: JOB_MAP_STATUS_META[found.mapStatus].shortLabel,
      };
      if (!routeIndexById.has(stop.id)) {
        toggleStopInRoute(stop);
      }
    } else if (val.startsWith('supply-')) {
      const pid = val.slice(7);
      const found = allSupplyPins.find((p) => p.id === pid);
      if (!found) return;
      const stop: RouteStopItem = {
        id: `supply-${found.id}`,
        kind: 'SUPPLY',
        refId: found.id,
        name: found.name,
        address: found.address,
        lat: found.lat,
        lng: found.lng,
        subtitle: SUPPLY_CATEGORY_META[found.category].shortLabel,
      };
      if (!routeIndexById.has(stop.id)) {
        toggleStopInRoute(stop);
      }
    }
  };

  const handleLogRouteMileage = () => {
    if (routeStops.length === 0) return;
    const milesToLog = returnToBase
      ? routeEstimate.roundTripMiles
      : routeEstimate.oneWayMiles;
    const stopSequence = [
      HOME_BASE.shortName,
      ...routeStops.map((s) => s.name),
      ...(returnToBase ? [HOME_BASE.shortName] : []),
    ].join(' → ');
    const entry: MileageEntry = {
      id: Date.now(),
      date: getLocalTodayIso(),
      vehicle: 'Work Van / Truck',
      miles: Math.round(milesToLog * 10) / 10,
      purpose: `${returnToBase ? 'Round-trip' : 'One-way'} route: ${stopSequence}`,
    };
    onSaveMileage(entry);
    onToast(`✔ Saved ${entry.miles.toFixed(1)} mi to Mileage Log`);
  };

  const googleMapsRouteUrl = useMemo(
    () => buildGoogleMapsMultiStopUrl(routeStops, returnToBase),
    [routeStops, returnToBase]
  );

  const displayedMiles = returnToBase
    ? routeEstimate.roundTripMiles
    : routeEstimate.oneWayMiles;
  const irsRate = constants.irsRate || 0.67;
  const estTaxDeduction = displayedMiles * irsRate;

  return (
    <div className="space-y-3 pb-24">
      {/* Top Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-sm space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-black uppercase tracking-wide text-[var(--accent)] flex items-center gap-1.5">
              <span>🗺️</span>
              <span>Jobsite Map &amp; Route Board</span>
            </h2>
            <p className="text-[10px] text-[var(--text-muted)]">
              Washington &amp; S. Fond du Lac Counties • Base: {HOME_BASE.address}
              {isGeocodingCount > 0 && (
                <span className="ml-2 text-amber-400 font-bold">
                  • Locating {isGeocodingCount} address{isGeocodingCount > 1 ? 'es' : ''}…
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMapStyle((prev) => (prev === 'dark' ? 'street' : 'dark'))}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
              title="Toggle Dark / Street OpenStreetMap tiles"
            >
              {mapStyle === 'dark' ? '🌙 Dark OSM' : '☀️ Street OSM'}
            </button>
            <button
              type="button"
              onClick={handleCenterHomeBase}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-[var(--surface-subtle)] border border-[var(--border)] text-amber-300 hover:border-amber-400 cursor-pointer"
            >
              🏠 Base
            </button>
            <button
              type="button"
              onClick={handleFitAllPins}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              ⤢ Fit All
            </button>
          </div>
        </div>

        {/* Mode & Layer Toggle Row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Status vs Money View segmented toggle */}
          <div className="inline-flex rounded-xl bg-[var(--bg)] border border-[var(--border)] p-0.5">
            <button
              type="button"
              onClick={() => setMoneyView(false)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-extrabold transition-all cursor-pointer ${
                !moneyView
                  ? 'bg-[var(--accent)] text-white shadow'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              📍 Status Pins
            </button>
            <button
              type="button"
              onClick={() => setMoneyView(true)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-extrabold transition-all cursor-pointer ${
                moneyView
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              💵 Money View
            </button>
          </div>

          {/* Supply & Gas Stops Overlay Toggle */}
          <button
            type="button"
            onClick={() => setShowSupplyLayer((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-extrabold border transition-all cursor-pointer flex items-center gap-1.5 ${
              showSupplyLayer
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-muted)]'
            }`}
          >
            <span>🎨</span>
            <span>Supply &amp; Gas Stops ({allSupplyPins.length})</span>
          </button>

          {/* + Add Custom Pin Button */}
          <button
            type="button"
            onClick={() => setAddPinModalOpen(true)}
            className="px-2.5 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-extrabold bg-[var(--accent-secondary)] text-white shadow hover:opacity-95 active:scale-95 transition-all cursor-pointer"
          >
            + Add Custom Pin
          </button>
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border whitespace-nowrap cursor-pointer transition-all ${
              statusFilter === 'ALL'
                ? 'bg-[var(--text)] text-[var(--bg)] border-[var(--text)]'
                : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)]'
            }`}
          >
            All Jobs ({customerSummaries.length})
          </button>
          {(['UNQUOTED', 'QUOTED', 'SCHEDULED', 'COMPLETED'] as JobMapStatus[]).map((st) => {
            const meta = JOB_MAP_STATUS_META[st];
            const active = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(active ? 'ALL' : st)}
                className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-all"
                style={{
                  backgroundColor: active ? meta.color : 'var(--bg)',
                  color: active ? '#09090b' : 'var(--text)',
                  borderColor: active ? meta.color : 'var(--border)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: active ? '#09090b' : meta.color }}
                />
                <span>
                  {meta.label} ({statusCounts[st]})
                </span>
              </button>
            );
          })}
        </div>

        {/* Money View Rollup Strip */}
        {moneyView && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2 text-center">
              <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
                Visible Quoted
              </div>
              <div className="text-xs sm:text-sm font-black text-[var(--text)]">
                ${moneyRollup.totalQuoted.toLocaleString()}
              </div>
            </div>
            <div className="bg-[var(--bg)] border border-amber-500/40 rounded-xl p-2 text-center">
              <div className="text-[9px] uppercase font-bold text-amber-300">
                50% Deposits Owed
              </div>
              <div className="text-xs sm:text-sm font-black text-amber-400">
                ${moneyRollup.totalDepositsOwed.toLocaleString()}
              </div>
            </div>
            <div className="bg-[var(--bg)] border border-rose-500/40 rounded-xl p-2 text-center">
              <div className="text-[9px] uppercase font-bold text-rose-300">
                Final Balances Owed
              </div>
              <div className="text-xs sm:text-sm font-black text-rose-400">
                ${moneyRollup.totalBalancesOwed.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Dark-Mode Map Container */}
      <div className="relative rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl bg-[#0b0d12]">
        <div
          ref={mapContainerRef}
          className="w-full h-[50vh] sm:h-[56vh] min-h-[340px] max-h-[600px] z-0"
        />

        {/* Empty state hint overlay when zero customers are saved yet */}
        {customers.length === 0 && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[450] bg-slate-950/90 border border-amber-400/50 text-amber-200 px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg whitespace-nowrap">
            No customer folders yet — tap paint stores or add a customer to plot jobsites
          </div>
        )}
      </div>

      {/* Selected Pin Detail Card (rendered below map so the 3-mile ring & pins stay unobstructed) */}
      {selectedPin && (
        <div
          data-selected-pin-card="true"
          className="bg-[#101218] border border-[var(--border)] rounded-2xl p-3.5 shadow-xl"
        >
          {/* CUSTOMER PIN CARD */}
          {selectedCustomerItem && (() => {
            const {
              customer,
              mapStatus,
              isActiveInProgress,
              isExteriorJob,
              financials,
              scopeSummary,
              schedDate,
              lat,
              lng,
              isApprox,
            } = selectedCustomerItem;
            const meta = JOB_MAP_STATUS_META[mapStatus];
            const stopId = `cust-${customer.id}`;
            const routeNum = routeIndexById.get(stopId);
            const telHref = sanitizeTelHref(customer.phone);
            const activeWeather = pinWeather || exteriorWeatherByCustId[customer.id] || null;

            return (
              <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-sm font-black text-white truncate">
                          {customer.name}
                        </h3>
                        <span
                          className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: meta.bgTint, color: meta.textColor, border: `1px solid ${meta.color}` }}
                        >
                          {meta.label}
                        </span>
                        {isExteriorJob && (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-900 text-slate-200 border border-slate-700"
                            title={
                              activeWeather
                                ? `Exterior Weather: ${activeWeather.paintBadge}`
                                : 'Exterior / Deck job'
                            }
                          >
                            {activeWeather && (
                              <span
                                className="w-2 h-2 rounded-full inline-block shrink-0"
                                style={{
                                  backgroundColor: getWeatherDotColor(activeWeather.paintTone),
                                  boxShadow: `0 0 6px ${getWeatherDotColor(activeWeather.paintTone)}`,
                                }}
                              />
                            )}
                            <span>Exterior / Deck</span>
                          </span>
                        )}
                        {isActiveInProgress && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
                            In Progress
                          </span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-slate-300 truncate mt-0.5">
                        📍 {customer.address || 'No street address entered'}
                        {isApprox && customer.address?.trim() && (
                          <button
                            type="button"
                            onClick={() => handleReGeocodeCustomer(customer)}
                            className="ml-1.5 text-amber-400 underline font-bold cursor-pointer"
                          >
                            (~approx · retry pin)
                          </button>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPin(null)}
                      className="text-xs font-bold text-slate-400 hover:text-white px-1.5 py-0.5 cursor-pointer"
                      aria-label="Close pin card"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Scope & Schedule Summary */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-2 text-[11px] text-slate-200 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                        Job Scope
                      </span>
                      {schedDate && (
                        <span className="text-[9.5px] font-bold text-sky-300">
                          📅 {formatScheduledDate(schedDate)}
                        </span>
                      )}
                    </div>
                    <p className="leading-snug line-clamp-2">{scopeSummary}</p>
                  </div>

                  {/* Money + Live Open-Meteo Weather Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {/* Money Status */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[9px] uppercase font-bold text-slate-400">
                          Quote / Payment
                        </div>
                        <div className="text-xs font-black text-white">
                          {financials.grossTotal > 0
                            ? `$${financials.grossTotal.toLocaleString()}`
                            : 'Unquoted'}
                        </div>
                      </div>
                      <span
                        className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded-lg text-right ${
                          financials.moneyState === 'PAID'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : financials.moneyState === 'DEPOSIT_OWED'
                            ? 'bg-amber-500/20 text-amber-300'
                            : financials.moneyState === 'BALANCE_OWED'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {financials.moneyDetailLabel}
                      </span>
                    </div>

                    {/* Live Open-Meteo Weather */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] uppercase font-bold text-slate-400">
                          Live Jobsite Weather
                        </span>
                        {activeWeather && (
                          <span
                            className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                              activeWeather.paintTone === 'ok'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : activeWeather.paintTone === 'warn'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                              style={{ backgroundColor: getWeatherDotColor(activeWeather.paintTone) }}
                            />
                            <span>{activeWeather.paintBadge}</span>
                          </span>
                        )}
                      </div>
                      {loadingWeather && !activeWeather ? (
                        <div className="text-[10.5px] text-slate-400 mt-0.5">
                          Fetching Open-Meteo…
                        </div>
                      ) : activeWeather ? (
                        <div className="text-[11px] font-bold text-slate-100 mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                          <span>🌡️ {activeWeather.tempF}°F</span>
                          <span>💨 {activeWeather.windMph} mph</span>
                          <span>🌧️ {activeWeather.rainChancePct}% rain</span>
                        </div>
                      ) : (
                        <div className="text-[10.5px] text-slate-400 mt-0.5">
                          Weather unavailable offline
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Nearby (Within 3 mi) Neighbor Chips */}
                  <div className="bg-sky-950/35 border border-sky-500/30 rounded-xl px-2.5 py-1.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-sky-300 flex items-center gap-1">
                        <span>📡</span>
                        <span>Nearby (Within 3 mi)</span>
                      </span>
                      <span className="text-[9px] font-bold text-sky-300/80">
                        {nearbyCustomers.length > 0
                          ? `${nearbyCustomers.length} lead${nearbyCustomers.length === 1 ? '' : 's'} / client${nearbyCustomers.length === 1 ? '' : 's'}`
                          : 'None within 3 mi'}
                      </span>
                    </div>
                    {nearbyCustomers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {nearbyCustomers.map((nb) => {
                          const nbMeta = JOB_MAP_STATUS_META[nb.mapStatus];
                          const nbRouteNum = routeIndexById.get(`cust-${nb.customer.id}`);
                          return (
                            <button
                              key={nb.customer.id}
                              type="button"
                              onClick={() => {
                                setSelectedPin({ kind: 'CUSTOMER', customerId: nb.customer.id });
                                mapInstanceRef.current?.panTo([nb.lat, nb.lng], { animate: true });
                              }}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-sky-400/40 text-[10px] font-bold text-slate-100 cursor-pointer transition-all active:scale-95"
                              title={`Focus ${nb.customer.name} (${nb.distanceMiles.toFixed(1)} mi away)`}
                            >
                              <span
                                className="w-2 h-2 rounded-full inline-block shrink-0"
                                style={{ backgroundColor: nbMeta.color }}
                              />
                              <span className="truncate max-w-[110px]">{nb.customer.name}</span>
                              <span className="text-[9px] font-extrabold text-sky-300">
                                {nb.distanceMiles.toFixed(1)} mi
                              </span>
                              {nbRouteNum && (
                                <span className="text-[8.5px] font-black px-1 rounded-full bg-cyan-500 text-slate-950">
                                  #{nbRouteNum}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => onOpenFolder(customer.id)}
                      className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-[var(--accent)] text-white text-[11px] font-extrabold shadow hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                    >
                      📁 Open Customer
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        toggleStopInRoute({
                          id: stopId,
                          kind: 'CUSTOMER',
                          refId: customer.id,
                          name: customer.name,
                          address: customer.address || 'Wisconsin Jobsite',
                          lat,
                          lng,
                          subtitle: meta.shortLabel,
                        })
                      }
                      className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl text-[11px] font-extrabold border transition-all active:scale-95 cursor-pointer ${
                        routeNum
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-sky-600 border-sky-500 text-white hover:bg-sky-500'
                      }`}
                    >
                      {routeNum ? `✓ Stop #${routeNum} (Remove)` : '+ Add to Route'}
                    </button>
                    {telHref && (
                      <a
                        href={telHref}
                        className="py-2 px-2.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-300 text-[11px] font-extrabold hover:border-emerald-400"
                        title={`Call ${customer.name}`}
                      >
                        📞
                      </a>
                    )}
                    <a
                      href={buildSingleStopMapsUrl(customer.address, lat, lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sky-300 text-[11px] font-extrabold hover:border-sky-400"
                      title="Open single-stop Google Maps directions"
                    >
                      🧭
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* SUPPLY / GAS STOP PIN CARD */}
            {selectedSupplyPin && (() => {
              const cat = SUPPLY_CATEGORY_META[selectedSupplyPin.category];
              const stopId = `supply-${selectedSupplyPin.id}`;
              const routeNum = routeIndexById.get(stopId);
              const telHref = sanitizeTelHref(selectedSupplyPin.phone);

              return (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-base">{cat.icon}</span>
                        <h3 className="text-sm font-black text-white truncate">
                          {selectedSupplyPin.name}
                        </h3>
                        <span
                          className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: cat.bg, color: cat.color, border: `1px solid ${cat.color}` }}
                        >
                          {cat.label}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-300 mt-0.5">
                        📍 {selectedSupplyPin.address}
                      </p>
                      {selectedSupplyPin.phone && (
                        <p className="text-[10.5px] text-emerald-300 font-bold mt-0.5">
                          📞 {selectedSupplyPin.phone}
                        </p>
                      )}
                      {selectedSupplyPin.notes && (
                        <p className="text-[10.5px] text-slate-400 mt-1 italic">
                          {selectedSupplyPin.notes}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPin(null)}
                      className="text-xs font-bold text-slate-400 hover:text-white px-1.5 py-0.5 cursor-pointer"
                      aria-label="Close supply card"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {telHref ? (
                      <a
                        href={telHref}
                        className="flex-1 min-w-[110px] py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold text-center shadow transition-all"
                      >
                        📞 Call Store
                      </a>
                    ) : (
                      <span className="flex-1 min-w-[110px] py-2 px-3 rounded-xl bg-slate-800/80 text-slate-500 text-[11px] font-bold text-center border border-slate-700">
                        No Phone Saved
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        toggleStopInRoute({
                          id: stopId,
                          kind: 'SUPPLY',
                          refId: selectedSupplyPin.id,
                          name: selectedSupplyPin.name,
                          address: selectedSupplyPin.address,
                          lat: selectedSupplyPin.lat,
                          lng: selectedSupplyPin.lng,
                          subtitle: cat.shortLabel,
                        })
                      }
                      className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl text-[11px] font-extrabold border transition-all active:scale-95 cursor-pointer ${
                        routeNum
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-amber-500 border-amber-400 text-slate-950 hover:bg-amber-400'
                      }`}
                    >
                      {routeNum ? `✓ Stop #${routeNum} (Remove)` : '+ Add to Route'}
                    </button>

                    {!selectedSupplyPin.isPreset && (
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteCustomPin(selectedSupplyPin.id);
                          setRouteStops((prev) => prev.filter((s) => s.id !== stopId));
                          setSelectedPin(null);
                          onToast(`Deleted custom pin: ${selectedSupplyPin.name}`);
                        }}
                        className="py-2 px-2.5 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[11px] font-extrabold hover:bg-rose-600 hover:text-white cursor-pointer"
                        title="Delete custom pin"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* HOME BASE PIN CARD */}
            {selectedPin.kind === 'HOME' && (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                    <span>🏠</span>
                    <span>{HOME_BASE.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">{HOME_BASE.address}</p>
                  <p className="text-[10px] text-slate-400">
                    Starting &amp; return point for multi-stop route mileage tracking.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPin(null)}
                  className="text-xs font-bold text-slate-400 hover:text-white px-2 py-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
        </div>
      )}

      {/* MULTI-STOP ROUTE BUILDER & MILEAGE CALCULATOR */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-cyan-400 flex items-center gap-1.5">
              <span>🧭</span>
              <span>Multi-Stop Route Builder &amp; Mileage Calculator</span>
            </h3>
            <p className="text-[10px] text-[var(--text-muted)]">
              Tap customer or supply pins on the map (or pick below) to plan stops &amp; track round-trip tax miles
            </p>
          </div>

          <label className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] px-2.5 py-1.5 rounded-xl cursor-pointer select-none">
            <input
              type="checkbox"
              checked={returnToBase}
              onChange={(e) => setReturnToBase(e.target.checked)}
              className="accent-cyan-400"
            />
            <span>Round Trip ↩ Base</span>
          </label>
        </div>

        {/* Start Point + Quick Stop Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 bg-[var(--bg)] border border-amber-500/35 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-sm">🏠</span>
            <div className="min-w-0">
              <div className="text-[9px] uppercase font-extrabold text-amber-400">
                Origin (Home Base)
              </div>
              <div className="text-[11px] font-bold text-[var(--text)] truncate">
                {HOME_BASE.address}
              </div>
            </div>
          </div>

          <select
            value={quickAddStopValue}
            onChange={(e) => handleQuickAddStop(e.target.value)}
            aria-label="Quick add stop to route"
            className="sm:w-64 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-xl px-3 py-2 text-[11px] font-bold outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="">+ Quick Add Stop to Route…</option>
            {customerSummaries.length > 0 && (
              <optgroup label="Customer Jobsites">
                {customerSummaries.map((c) => (
                  <option
                    key={`cust-${c.customer.id}`}
                    value={`cust-${c.customer.id}`}
                    disabled={routeIndexById.has(`cust-${c.customer.id}`)}
                  >
                    {c.customer.name} ({JOB_MAP_STATUS_META[c.mapStatus].shortLabel})
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Supply & Gas Stops">
              {allSupplyPins.map((p) => (
                <option
                  key={`supply-${p.id}`}
                  value={`supply-${p.id}`}
                  disabled={routeIndexById.has(`supply-${p.id}`)}
                >
                  {SUPPLY_CATEGORY_META[p.category].icon} {p.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Ordered Stop List */}
        {routeStops.length === 0 ? (
          <div className="bg-[var(--bg)]/70 border border-dashed border-[var(--border)] rounded-xl p-4 text-center space-y-1">
            <div className="text-xs font-extrabold text-[var(--text)]">
              No stops selected yet
            </div>
            <p className="text-[10.5px] text-[var(--text-muted)]">
              Tap any customer jobsite or paint/gas stop pin on the map and hit{' '}
              <strong className="text-cyan-400">+ Add to Route</strong> to calculate mileage and launch turn-by-turn directions.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {routeStops.map((stop, idx) => (
              <div
                key={stop.id}
                className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-2.5 py-2 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-[var(--text)] truncate flex items-center gap-1.5">
                      <span>{stop.kind === 'CUSTOMER' ? '📍' : '🏪'}</span>
                      <span className="truncate">{stop.name}</span>
                      {stop.subtitle && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-[var(--text-muted)] shrink-0">
                          {stop.subtitle}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">
                      {stop.address}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveStop(idx, -1)}
                    className="w-6 h-6 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[10px] font-black text-[var(--text)] disabled:opacity-30 cursor-pointer"
                    aria-label="Move stop up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === routeStops.length - 1}
                    onClick={() => moveStop(idx, 1)}
                    className="w-6 h-6 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[10px] font-black text-[var(--text)] disabled:opacity-30 cursor-pointer"
                    aria-label="Move stop down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteStops((prev) => prev.filter((s) => s.id !== stop.id))}
                    className="w-6 h-6 rounded-lg bg-rose-950/60 border border-rose-500/40 text-[10px] font-black text-rose-300 hover:bg-rose-600 hover:text-white cursor-pointer"
                    aria-label="Remove stop"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            {returnToBase && (
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[10.5px] font-bold text-amber-300 flex items-center gap-2">
                <span>↩</span>
                <span>Return to Home Base: {HOME_BASE.address}</span>
              </div>
            )}
          </div>
        )}

        {/* Mileage & IRS Tax Summary Tiles */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[var(--bg)] border border-cyan-500/40 rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-bold text-cyan-300">
              {returnToBase ? 'Round-Trip Miles' : 'One-Way Miles'}
            </div>
            <div className="text-sm sm:text-base font-black text-white">
              {displayedMiles.toFixed(1)} mi
            </div>
            <div className="text-[9px] text-[var(--text-muted)]">
              {loadingRoadRoute
                ? 'Calculating road…'
                : routeEstimate.isRoadGeometry
                ? 'OSRM Road'
                : 'Est. Road'}
            </div>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
              Est. Drive Time
            </div>
            <div className="text-sm sm:text-base font-black text-white">
              {routeStops.length > 0 ? `${routeEstimate.estDriveMinutes} min` : '0 min'}
            </div>
            <div className="text-[9px] text-[var(--text-muted)]">
              {routeStops.length} stop{routeStops.length === 1 ? '' : 's'}
            </div>
          </div>

          <div className="bg-[var(--bg)] border border-emerald-500/40 rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-bold text-emerald-300">
              Tax Deduction
            </div>
            <div className="text-sm sm:text-base font-black text-emerald-400">
              ${estTaxDeduction.toFixed(2)}
            </div>
            <div className="text-[9px] text-[var(--text-muted)]">
              {returnToBase ? 'RT' : '1-Way'} @ ${(irsRate).toFixed(2)}/mi
            </div>
          </div>
        </div>

        {/* Route Action Buttons */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {routeStops.length > 0 ? (
              <a
                href={googleMapsRouteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-white font-black text-xs uppercase tracking-wide text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>🗺️</span>
                <span>Launch Route in Google Maps</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="py-2.5 px-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-muted)] font-black text-xs uppercase tracking-wide text-center opacity-60 cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <span>🗺️</span>
                <span>Launch Route in Google Maps</span>
              </button>
            )}

            <button
              type="button"
              disabled={routeStops.length === 0}
              onClick={handleLogRouteMileage}
              className={`py-2.5 px-3.5 rounded-xl font-black text-xs uppercase tracking-wide text-center border transition-all flex items-center justify-center gap-1.5 ${
                routeStops.length > 0
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 hover:bg-emerald-500/30 shadow cursor-pointer active:scale-95'
                  : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text-muted)] opacity-60 cursor-not-allowed'
              }`}
            >
              <span>🚗</span>
              <span>Log Trip Miles</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={routeStops.length < 2}
              onClick={handleOptimizeRoute}
              title={
                routeStops.length < 2
                  ? 'Add at least 2 stops to auto-sort the fastest loop from Home Base'
                  : `Reorder stops for shortest driving ${returnToBase ? 'loop' : 'sequence'} from ${HOME_BASE.address}`
              }
              className={`flex-1 min-w-[170px] py-2 px-3 rounded-xl font-extrabold text-[11px] border transition-all flex items-center justify-center gap-1.5 ${
                routeStops.length >= 2
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 hover:bg-amber-500/30 cursor-pointer active:scale-95'
                  : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text-muted)] opacity-60 cursor-not-allowed'
              }`}
            >
              <span>⚡</span>
              <span>Sort Fastest Loop</span>
            </button>

            {routeStops.length > 0 && (
              <button
                type="button"
                onClick={() => setRouteStops([])}
                className="py-2 px-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-muted)] font-extrabold text-[11px] hover:text-rose-400 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* "+ ADD CUSTOM PIN" MODAL */}
      {addPinModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div>
                <h3 className="font-black text-sm text-[var(--accent)]">
                  + Add Custom Supply / Gas Pin
                </h3>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Save hardware stores, Kwik Trip / gas stops, or storage yards
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddPinModalOpen(false)}
                className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomPin} className="space-y-2.5">
              <div>
                <label className="text-[9px] uppercase font-extrabold text-[var(--text-muted)] block mb-1">
                  Stop Name *
                </label>
                <input
                  type="text"
                  required
                  value={newPinName}
                  onChange={(e) => setNewPinName(e.target.value)}
                  placeholder="e.g. Kwik Trip Barton Ave, Menards West Bend"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="text-[9px] uppercase font-extrabold text-[var(--text-muted)] block mb-1">
                  Category
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(SUPPLY_CATEGORY_META) as SupplyPinCategory[]).map((catKey) => {
                    const meta = SUPPLY_CATEGORY_META[catKey];
                    const active = newPinCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setNewPinCategory(catKey)}
                        className="px-2.5 py-2 rounded-xl text-[11px] font-extrabold border text-left flex items-center gap-1.5 cursor-pointer transition-all"
                        style={{
                          backgroundColor: active ? meta.bg : 'var(--bg)',
                          color: active ? meta.color : 'var(--text-muted)',
                          borderColor: active ? meta.color : 'var(--border)',
                        }}
                      >
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[9px] uppercase font-extrabold text-[var(--text-muted)]">
                    Street Address
                  </label>
                  <label className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useMapCenterCoords}
                      onChange={(e) => setUseMapCenterCoords(e.target.checked)}
                      className="accent-sky-400"
                    />
                    <span>Drop at map center</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={newPinAddress}
                  onChange={(e) => setNewPinAddress(e.target.value)}
                  placeholder="e.g. 1700 N Main St, West Bend, WI 53090"
                  required={!useMapCenterCoords}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="text-[9px] uppercase font-extrabold text-[var(--text-muted)] block mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  value={newPinPhone}
                  onChange={(e) => setNewPinPhone(e.target.value)}
                  placeholder="e.g. (262) 555-0199"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="text-[9px] uppercase font-extrabold text-[var(--text-muted)] block mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newPinNotes}
                  onChange={(e) => setNewPinNotes(e.target.value)}
                  placeholder="e.g. Best diesel prices, pro desk contact, gate code…"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAddPinModalOpen(false)}
                  className="flex-1 py-2 bg-[var(--surface-subtle)] text-[var(--text)] rounded-xl text-xs font-bold border border-[var(--border)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPin}
                  className="flex-1 py-2 bg-[var(--accent-tertiary)] text-white rounded-xl text-xs font-extrabold shadow cursor-pointer disabled:opacity-60"
                >
                  {savingPin ? 'Locating Pin…' : 'Save Pin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
