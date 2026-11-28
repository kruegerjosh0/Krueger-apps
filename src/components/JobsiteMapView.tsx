import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Customer,
  JobMapStatus,
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
  NEAREST_STORE_PRESETS,
  PRESET_SUPPLY_STOPS,
  SUPPLY_CATEGORY_META,
  CustomerMapSummary,
  DriveFromBaseEstimate,
  NearbyStoreResult,
  PinWeatherSummary,
  PlaceSearchResult,
  RouteMileageEstimate,
  RouteOriginPoint,
  buildGoogleMapsMultiStopUrl,
  buildSingleStopMapsUrl,
  estimateDriveBetween,
  estimateDriveFromBase,
  estimateFallbackRoute,
  fetchDriveBetween,
  fetchDriveFromBase,
  fetchOsrmRoadRoute,
  fetchPinWeatherSummary,
  geocodeAddressWithNominatim,
  getCustomerMapSummary,
  haversineMiles,
  resolveApproxWisconsinCoords,
  sanitizeSmsHref,
  sanitizeTelHref,
  searchNearestStoresOverpass,
  searchPlacesWithNominatim,
} from '../utils/mapHelpers';
import { formatScheduledDate } from '../utils/projectHelpers';

const NEARBY_RADIUS_MILES = 3;
const NEARBY_RADIUS_METERS = NEARBY_RADIUS_MILES * 1609.344;
const STORE_SEARCH_RADIUS_MILES = 25;

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
  onSilentLogDispatchMileage: (payload: {
    destKey: string;
    destName: string;
    roundTripMiles: number;
  }) => void;
  onToast: (msg: string) => void;
}

interface SearchedPin {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  subtitle?: string;
}

interface UserGpsLocation {
  lat: number;
  lng: number;
  accuracyMeters: number;
  updatedAt: number;
}

type SelectedPin =
  | { kind: 'CUSTOMER'; customerId: number }
  | { kind: 'SUPPLY'; pinId: string }
  | { kind: 'NEARBY_STORE'; storeId: string }
  | { kind: 'SEARCH'; pin: SearchedPin }
  | { kind: 'HOME' };

type MapStatusFilter = 'ALL_ACTIVE' | JobMapStatus;

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
  onSilentLogDispatchMileage,
  onToast,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const radiusLayerRef = useRef<L.LayerGroup | null>(null);
  const gpsLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const geocodedAttemptedRef = useRef<Set<string>>(new Set());
  const hasAutoCenteredRef = useRef<boolean>(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const storeSearchAbortRef = useRef<AbortController | null>(null);

  // Map UI Controls (Completed gray pins OFF by default via ALL_ACTIVE)
  const [moneyView, setMoneyView] = useState<boolean>(false);
  const [showSupplyLayer, setShowSupplyLayer] = useState<boolean>(false);
  const [mapStyle, setMapStyle] = useState<'dark' | 'street'>('dark');
  const [statusFilter, setStatusFilter] = useState<MapStatusFilter>('ALL_ACTIVE');
  const [selectedPin, setSelectedPin] = useState<SelectedPin | null>(null);
  const [callTextMenuOpen, setCallTextMenuOpen] = useState<boolean>(false);

  // Live GPS Location ("You Are Here") state
  const [userGps, setUserGps] = useState<UserGpsLocation | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);

  // Nearest Store Finder (Overpass API + Nominatim fallback, 25-mile radius)
  const [nearbyStores, setNearbyStores] = useState<NearbyStoreResult[]>([]);
  const [activeStorePreset, setActiveStorePreset] = useState<string | null>(null);
  const [storeSearchSummary, setStoreSearchSummary] = useState<string>('');
  const [isFindingStores, setIsFindingStores] = useState<boolean>(false);

  // Multi-Stop "Plan Day Route" Mode state (supports Jobs AND/OR Stores, starting from GPS or Home Base)
  const [planRouteMode, setPlanRouteMode] = useState<boolean>(false);
  const [plannedStops, setPlannedStops] = useState<RouteStopItem[]>([]);
  const [routeStartMode, setRouteStartMode] = useState<'GPS' | 'HOME'>('HOME');
  const [routeEstimate, setRouteEstimate] = useState<RouteMileageEstimate | null>(null);
  const [isRouting, setIsRouting] = useState<boolean>(false);

  // Nearest Store & Address Search Bar state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [nominatimResults, setNominatimResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState<boolean>(false);
  const [droppedSearchPin, setDroppedSearchPin] = useState<SearchedPin | null>(null);

  // Live Drive Distance & ETA from Home Base AND from Live GPS for active pin
  const [activeDriveEstimate, setActiveDriveEstimate] = useState<DriveFromBaseEstimate | null>(null);
  const [activeGpsDriveEstimate, setActiveGpsDriveEstimate] =
    useState<DriveFromBaseEstimate | null>(null);

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

  // "+ Add Custom Pin" modal state
  const [addPinModalOpen, setAddPinModalOpen] = useState<boolean>(false);
  const [newPinName, setNewPinName] = useState<string>('');
  const [newPinCategory, setNewPinCategory] = useState<SupplyPinCategory>('GAS_STOP');
  const [newPinAddress, setNewPinAddress] = useState<string>('');
  const [newPinPhone, setNewPinPhone] = useState<string>('');
  const [newPinNotes, setNewPinNotes] = useState<string>('');
  const [useMapCenterCoords, setUseMapCenterCoords] = useState<boolean>(false);
  const [savingPin, setSavingPin] = useState<boolean>(false);

  // Reset inline Call/Text tray when switching selected pins
  useEffect(() => {
    setCallTextMenuOpen(false);
  }, [selectedPin]);

  // Combine preset paint/hardware stores + user-saved custom pins
  const allSupplyPins = useMemo<SupplyStopPin[]>(() => {
    return [...PRESET_SUPPLY_STOPS, ...customSupplyPins];
  }, [customSupplyPins]);

  // Summarize every customer with status, financials, scope, and coordinates
  const customerSummaries = useMemo<
    Array<CustomerMapSummary & { lat: number; lng: number; isApprox: boolean }>
  >(() => {
    return customers.map((c) => {
      const summary = getCustomerMapSummary(c, constants);
      if (
        typeof c.lat === 'number' &&
        typeof c.lng === 'number' &&
        Number.isFinite(c.lat) &&
        Number.isFinite(c.lng)
      ) {
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

  const activeJobsCount =
    statusCounts.UNQUOTED + statusCounts.QUOTED + statusCounts.SCHEDULED;

  // Filtered customers currently plotted on the map (ALL_ACTIVE hides Completed by default)
  const visibleCustomerPins = useMemo(() => {
    if (statusFilter === 'ALL_ACTIVE') {
      return customerSummaries.filter((s) => s.mapStatus !== 'COMPLETED');
    }
    return customerSummaries.filter((s) => s.mapStatus === statusFilter);
  }, [customerSummaries, statusFilter]);

  // Keep live GPS distances updated on found nearby stores whenever GPS moves
  const nearbyStoresWithLiveDist = useMemo<NearbyStoreResult[]>(() => {
    const refLat = userGps ? userGps.lat : HOME_BASE.lat;
    const refLng = userGps ? userGps.lng : HOME_BASE.lng;
    return nearbyStores
      .map((st) => ({
        ...st,
        distanceMiles: Math.round(haversineMiles(refLat, refLng, st.lat, st.lng) * 10) / 10,
      }))
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }, [nearbyStores, userGps]);

  // Active start origin for Plan Day Route (My Current GPS or 2119 Barton Ave Home Base)
  const activeRouteOrigin = useMemo<RouteOriginPoint>(() => {
    if (routeStartMode === 'GPS' && userGps) {
      return {
        lat: userGps.lat,
        lng: userGps.lng,
        label: 'My Current Location',
        isGps: true,
      };
    }
    return {
      lat: HOME_BASE.lat,
      lng: HOME_BASE.lng,
      label: HOME_BASE.address,
      address: HOME_BASE.address,
      isGps: false,
    };
  }, [routeStartMode, userGps]);

  // Whether route loops back to origin (Home Base loops round-trip; GPS runs point-to-point)
  const routeReturnToOrigin = !activeRouteOrigin.isGps;

  // Lookup map of stop ID -> 1-based stop order badge (#1, #2, ...)
  const plannedStopIndexById = useMemo(() => {
    const map = new Map<string, number>();
    plannedStops.forEach((s, idx) => map.set(s.id, idx + 1));
    return map;
  }, [plannedStops]);

  const toggleRouteStop = (stop: RouteStopItem) => {
    setPlannedStops((prev) =>
      prev.some((s) => s.id === stop.id)
        ? prev.filter((s) => s.id !== stop.id)
        : [...prev, stop]
    );
  };

  const addStopAndOpenPlanner = (stop: RouteStopItem) => {
    setPlannedStops((prev) => (prev.some((s) => s.id === stop.id) ? prev : [...prev, stop]));
    setPlanRouteMode(true);
    setSelectedPin(null);
    onToast(`Added ${stop.name} to Plan Route`);
  };

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

  // Instant local search matches (customers + supply stores)
  const localSearchMatches = useMemo<PlaceSearchResult[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    const matchesAll = (haystack: string) =>
      tokens.every((tok) => haystack.toLowerCase().includes(tok));

    const out: PlaceSearchResult[] = [];

    for (const s of allSupplyPins) {
      if (matchesAll(`${s.name} ${s.address} ${s.notes || ''}`)) {
        out.push({
          id: `supply-${s.id}`,
          name: s.name,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          source: 'SUPPLY',
          refId: s.id,
          subtitle: SUPPLY_CATEGORY_META[s.category].label,
        });
      }
    }

    for (const c of customerSummaries) {
      if (matchesAll(`${c.customer.name} ${c.customer.address || ''}`)) {
        out.push({
          id: `cust-${c.customer.id}`,
          name: c.customer.name,
          address: c.customer.address || 'Wisconsin Jobsite',
          lat: c.lat,
          lng: c.lng,
          source: 'CUSTOMER',
          refId: c.customer.id,
          subtitle: JOB_MAP_STATUS_META[c.mapStatus].label,
        });
      }
    }

    return out.slice(0, 3);
  }, [searchQuery, allSupplyPins, customerSummaries]);

  // Debounced Nominatim Wisconsin-biased search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setNominatimResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchPlacesWithNominatim(q, controller.signal);
      if (!controller.signal.aborted) {
        setNominatimResults(results);
        setIsSearching(false);
      }
    }, 320);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Combined top 4 deduplicated dropdown results
  const combinedSearchResults = useMemo<PlaceSearchResult[]>(() => {
    const merged: PlaceSearchResult[] = [...localSearchMatches];
    for (const nr of nominatimResults) {
      const isDup = merged.some(
        (m) => haversineMiles(m.lat, m.lng, nr.lat, nr.lng) < 0.08
      );
      if (!isDup) merged.push(nr);
      if (merged.length >= 4) break;
    }
    return merged.slice(0, 4);
  }, [localSearchMatches, nominatimResults]);

  // Close search dropdown on outside tap
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Background geocode customers that have a street address but no saved lat/lng yet
  useEffect(() => {
    let cancelled = false;
    const toGeocode = customers.filter((c) => {
      const hasCoords =
        typeof c.lat === 'number' &&
        typeof c.lng === 'number' &&
        Number.isFinite(c.lat) &&
        Number.isFinite(c.lng);
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
          await new Promise((r) => setTimeout(r, 1050));
        }
      }
      if (!cancelled) setIsGeocodingCount(0);
    };

    runQueue();
    return () => {
      cancelled = true;
    };
  }, [customers, onUpdateCustomer]);

  // Initialize Leaflet Map once (fallback centered on 2119 Barton Ave Home Base)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [HOME_BASE.lat, HOME_BASE.lng],
      zoom: 11,
      minZoom: 7,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true,
    });

    const routeLayer = L.layerGroup().addTo(map);
    const radiusLayer = L.layerGroup().addTo(map);
    const gpsLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    routeLayerRef.current = routeLayer;
    radiusLayerRef.current = radiusLayer;
    gpsLayerRef.current = gpsLayer;
    markersLayerRef.current = markersLayer;

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(() => map.invalidateSize(), 180);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      storeSearchAbortRef.current?.abort();
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      routeLayerRef.current = null;
      radiusLayerRef.current = null;
      gpsLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Render pulsing blue "You Are Here" live GPS marker + accuracy ring
  useEffect(() => {
    const gpsLayer = gpsLayerRef.current;
    if (!gpsLayer) return;
    gpsLayer.clearLayers();

    if (!userGps) return;

    const ringRadiusMeters = Math.min(Math.max(userGps.accuracyMeters || 45, 25), 900);
    L.circle([userGps.lat, userGps.lng], {
      radius: ringRadiusMeters,
      color: '#38bdf8',
      weight: 1.5,
      opacity: 0.75,
      fillColor: '#0ea5e9',
      fillOpacity: 0.16,
      interactive: false,
    }).addTo(gpsLayer);

    const gpsIcon = L.divIcon({
      className: 'krueger-map-divicon',
      html: `
        <div data-gps-you-are-here="true" style="position:relative;width:0;height:0;" title="You Are Here (Live GPS)">
          <span class="krueger-gps-pulse-ring"></span>
          <span style="
            position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            width:16px;height:16px;border-radius:9999px;
            background:#0a84ff;border:3px solid #ffffff;
            box-shadow:0 0 12px rgba(10,132,255,0.95), 0 2px 6px rgba(0,0,0,0.8);
            display:block;
          "></span>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    L.marker([userGps.lat, userGps.lng], {
      icon: gpsIcon,
      zIndexOffset: 1100,
      interactive: false,
    }).addTo(gpsLayer);
  }, [userGps]);

  // Auto-center initial map view on active jobs/leads (falling back to 2119 Barton Ave Home Base)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || hasAutoCenteredRef.current) return;
    hasAutoCenteredRef.current = true;

    const activePins = customerSummaries.filter((s) => s.mapStatus !== 'COMPLETED');
    if (activePins.length === 0) {
      map.setView([HOME_BASE.lat, HOME_BASE.lng], 11, { animate: false });
      return;
    }

    const pts: [number, number][] = [
      [HOME_BASE.lat, HOME_BASE.lng],
      ...activePins.map((p): [number, number] => [p.lat, p.lng]),
    ];
    map.fitBounds(L.latLngBounds(pts), { padding: [38, 38], maxZoom: 13 });
  }, [customerSummaries]);

  // Compute live OSRM road route & draw polyline when in Plan Route mode (supports Jobs & Stores from GPS or Home Base)
  useEffect(() => {
    const routeLayer = routeLayerRef.current;
    if (!planRouteMode || plannedStops.length === 0) {
      setRouteEstimate(null);
      setIsRouting(false);
      routeLayer?.clearLayers();
      return;
    }

    let cancelled = false;
    const immediate = estimateFallbackRoute(plannedStops, routeReturnToOrigin, activeRouteOrigin);
    setRouteEstimate(immediate);
    setIsRouting(true);

    fetchOsrmRoadRoute(plannedStops, routeReturnToOrigin, activeRouteOrigin).then((osrm) => {
      if (cancelled) return;
      setIsRouting(false);
      if (osrm) {
        setRouteEstimate(osrm);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [planRouteMode, plannedStops, routeReturnToOrigin, activeRouteOrigin]);

  useEffect(() => {
    const routeLayer = routeLayerRef.current;
    if (!routeLayer) return;
    routeLayer.clearLayers();

    if (!planRouteMode || !routeEstimate || routeEstimate.geometryLatLngs.length < 2) {
      return;
    }

    L.polyline(routeEstimate.geometryLatLngs, {
      color: '#38bdf8',
      weight: 4,
      opacity: 0.92,
      dashArray: routeEstimate.isRoadGeometry ? undefined : '8 6',
      lineJoin: 'round',
      interactive: false,
    }).addTo(routeLayer);
  }, [planRouteMode, routeEstimate]);

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

  // Selected pin lookups
  const selectedCustomerItem = useMemo(() => {
    if (selectedPin?.kind !== 'CUSTOMER') return null;
    return customerSummaries.find((s) => s.customer.id === selectedPin.customerId) || null;
  }, [selectedPin, customerSummaries]);

  const selectedSupplyPin = useMemo(() => {
    if (selectedPin?.kind !== 'SUPPLY') return null;
    return allSupplyPins.find((p) => p.id === selectedPin.pinId) || null;
  }, [selectedPin, allSupplyPins]);

  const selectedNearbyStore = useMemo(() => {
    if (selectedPin?.kind !== 'NEARBY_STORE') return null;
    return nearbyStoresWithLiveDist.find((s) => s.id === selectedPin.storeId) || null;
  }, [selectedPin, nearbyStoresWithLiveDist]);

  const selectedSearchPin = useMemo(() => {
    if (selectedPin?.kind !== 'SEARCH') return null;
    return selectedPin.pin;
  }, [selectedPin]);

  // Coordinates of the currently selected destination (for Drive Distance / ETA from Home Base & GPS)
  const activeDestinationCoords = useMemo<{ lat: number; lng: number } | null>(() => {
    if (selectedCustomerItem) {
      return { lat: selectedCustomerItem.lat, lng: selectedCustomerItem.lng };
    }
    if (selectedNearbyStore) {
      return { lat: selectedNearbyStore.lat, lng: selectedNearbyStore.lng };
    }
    if (selectedSupplyPin) {
      return { lat: selectedSupplyPin.lat, lng: selectedSupplyPin.lng };
    }
    if (selectedSearchPin) {
      return { lat: selectedSearchPin.lat, lng: selectedSearchPin.lng };
    }
    if (selectedPin?.kind === 'HOME') {
      return { lat: HOME_BASE.lat, lng: HOME_BASE.lng };
    }
    return null;
  }, [selectedCustomerItem, selectedNearbyStore, selectedSupplyPin, selectedSearchPin, selectedPin]);

  // Immediately estimate + silently upgrade live driving distance & ETA from 2119 Barton Ave
  useEffect(() => {
    if (!activeDestinationCoords || selectedPin?.kind === 'HOME') {
      setActiveDriveEstimate(null);
      return;
    }
    let cancelled = false;
    const immediate = estimateDriveFromBase(
      activeDestinationCoords.lat,
      activeDestinationCoords.lng
    );
    setActiveDriveEstimate(immediate);

    fetchDriveFromBase(activeDestinationCoords.lat, activeDestinationCoords.lng).then((res) => {
      if (!cancelled) setActiveDriveEstimate(res);
    });

    return () => {
      cancelled = true;
    };
  }, [activeDestinationCoords?.lat, activeDestinationCoords?.lng, selectedPin?.kind]);

  // Immediately estimate + silently upgrade live driving distance & ETA from My Current GPS Location
  useEffect(() => {
    if (!activeDestinationCoords || !userGps) {
      setActiveGpsDriveEstimate(null);
      return;
    }
    let cancelled = false;
    const immediate = estimateDriveBetween(
      userGps.lat,
      userGps.lng,
      activeDestinationCoords.lat,
      activeDestinationCoords.lng
    );
    setActiveGpsDriveEstimate(immediate);

    fetchDriveBetween(
      userGps.lat,
      userGps.lng,
      activeDestinationCoords.lat,
      activeDestinationCoords.lng
    ).then((res) => {
      if (!cancelled) setActiveGpsDriveEstimate(res);
    });

    return () => {
      cancelled = true;
    };
  }, [userGps?.lat, userGps?.lng, activeDestinationCoords?.lat, activeDestinationCoords?.lng]);

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

  // Render map markers whenever pins, stores, mode, selection, or search pin changes
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

    // 2. Nearest Store Finder Orange Pins (Overpass API / Nominatim results within 25 mi)
    nearbyStoresWithLiveDist.forEach((store) => {
      const stopId = `store-${store.id}`;
      const isSelected = selectedPin?.kind === 'NEARBY_STORE' && selectedPin.storeId === store.id;
      const routeStopOrder = planRouteMode ? plannedStopIndexById.get(stopId) : undefined;
      const routeBadgeHtml =
        routeStopOrder !== undefined
          ? `<span style="min-width:17px;height:17px;padding:0 4px;border-radius:9999px;background:#38bdf8;color:#09090b;font-size:10px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">#${routeStopOrder}</span>`
          : '';
      const shortStoreName =
        store.name.length <= 16 ? store.name : `${store.name.slice(0, 15)}…`;

      const storeIcon = L.divIcon({
        className: 'krueger-map-divicon',
        html: `
          <div data-orange-store-pin="true" style="
            display:inline-flex;align-items:center;gap:4px;
            background:#431407;color:#ffedd5;
            border:2px solid ${routeStopOrder !== undefined ? '#38bdf8' : isSelected ? '#ffffff' : '#f97316'};
            border-radius:10px;padding:3px 7px;
            font-size:10px;font-weight:900;white-space:nowrap;
            box-shadow:${
              routeStopOrder !== undefined
                ? '0 0 0 3px rgba(56,189,248,0.55), 0 4px 14px rgba(0,0,0,0.9)'
                : '0 2px 10px rgba(0,0,0,0.78)'
            };
            transform:translate(-50%,-50%);
          ">
            ${routeBadgeHtml}
            <span style="width:8px;height:8px;border-radius:50%;background:#f97316;border:1.5px solid #ffffff;display:inline-block;flex-shrink:0;"></span>
            <span>${escapeHtml(shortStoreName)}</span>
            <span style="color:#fdba74;font-size:9px;">${store.distanceMiles.toFixed(1)} mi</span>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([store.lat, store.lng], {
        icon: storeIcon,
        zIndexOffset: routeStopOrder !== undefined ? 970 : isSelected ? 940 : 680,
      }).addTo(markersLayer);

      marker.on('click', () => {
        if (planRouteMode) {
          toggleRouteStop({
            id: stopId,
            kind: 'SUPPLY',
            refId: store.id,
            name: store.name,
            address: store.address,
            lat: store.lat,
            lng: store.lng,
            subtitle: store.categoryLabel,
          });
          return;
        }
        setSelectedPin({ kind: 'NEARBY_STORE', storeId: store.id });
      });
    });

    // 3. Saved / Preset Supply & Hardware Stop Overlay Pins (optional toggle)
    if (showSupplyLayer) {
      allSupplyPins.forEach((pin) => {
        const stopId = `supply-${pin.id}`;
        const cat = SUPPLY_CATEGORY_META[pin.category];
        const isSelected = selectedPin?.kind === 'SUPPLY' && selectedPin.pinId === pin.id;
        const routeStopOrder = planRouteMode ? plannedStopIndexById.get(stopId) : undefined;
        const routeBadgeHtml =
          routeStopOrder !== undefined
            ? `<span style="min-width:17px;height:17px;padding:0 4px;border-radius:9999px;background:#38bdf8;color:#09090b;font-size:10px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">#${routeStopOrder}</span>`
            : '';

        const supplyIcon = L.divIcon({
          className: 'krueger-map-divicon',
          html: `
            <div style="
              display:inline-flex;align-items:center;gap:3px;
              background:${cat.bg};color:${cat.color};
              border:2px solid ${routeStopOrder !== undefined ? '#38bdf8' : isSelected ? '#ffffff' : cat.color};
              border-radius:8px;padding:3px 6px;
              font-size:10px;font-weight:800;white-space:nowrap;
              box-shadow:0 2px 10px rgba(0,0,0,0.72);
              transform:translate(-50%,-50%);
            ">
              ${routeBadgeHtml}
              <span>${cat.icon}</span>
              <span>${escapeHtml(pin.name.split('—')[0].trim().slice(0, 14))}</span>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const marker = L.marker([pin.lat, pin.lng], {
          icon: supplyIcon,
          zIndexOffset: routeStopOrder !== undefined ? 965 : isSelected ? 850 : 350,
        }).addTo(markersLayer);

        marker.on('click', () => {
          if (planRouteMode) {
            toggleRouteStop({
              id: stopId,
              kind: 'SUPPLY',
              refId: pin.id,
              name: pin.name,
              address: pin.address,
              lat: pin.lat,
              lng: pin.lng,
              subtitle: cat.label,
            });
            return;
          }
          setSelectedPin({ kind: 'SUPPLY', pinId: pin.id });
        });
      });
    }

    // 4. Dropped Search Result Pin (if user picked an address from search dropdown)
    if (droppedSearchPin) {
      const isSearchSelected = selectedPin?.kind === 'SEARCH';
      const searchIcon = L.divIcon({
        className: 'krueger-map-divicon',
        html: `
          <div style="
            display:inline-flex;align-items:center;gap:4px;
            background:#0c4a6e;color:#f0f9ff;
            border:2px solid ${isSearchSelected ? '#ffffff' : '#38bdf8'};
            border-radius:9999px;padding:4px 9px;
            font-size:10.5px;font-weight:900;white-space:nowrap;
            box-shadow:0 0 0 3px rgba(56,189,248,0.35), 0 4px 14px rgba(0,0,0,0.85);
            transform:translate(-50%,-50%);
          ">
            <span>🔎</span>
            <span>${escapeHtml(droppedSearchPin.name.slice(0, 18))}</span>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const searchMarker = L.marker([droppedSearchPin.lat, droppedSearchPin.lng], {
        icon: searchIcon,
        zIndexOffset: 980,
      }).addTo(markersLayer);

      searchMarker.on('click', () => {
        setSelectedPin({ kind: 'SEARCH', pin: droppedSearchPin });
      });
    }

    // 5. Customer & Jobsite Pins (Status Mode vs Money View + Plan Route stop badges)
    visibleCustomerPins.forEach((item) => {
      const { customer, mapStatus, isActiveInProgress, isExteriorJob, financials, lat, lng } = item;
      const stopId = `cust-${customer.id}`;
      const meta = JOB_MAP_STATUS_META[mapStatus];
      const isSelected = selectedPin?.kind === 'CUSTOMER' && selectedPin.customerId === customer.id;
      const isNearbyNeighbor = nearbyCustomerIdSet.has(customer.id);
      const routeStopOrder = planRouteMode ? plannedStopIndexById.get(stopId) : undefined;
      const extWx = isExteriorJob ? exteriorWeatherByCustId[customer.id] : undefined;

      const weatherDotHtml = extWx
        ? (() => {
            const dotColor = getWeatherDotColor(extWx.paintTone);
            const tip = `Exterior Weather: ${extWx.paintBadge} (${extWx.tempF}°F, ${extWx.windMph} mph, ${extWx.rainChancePct}% rain)`;
            return `<span data-weather-dot="${extWx.paintTone}" title="${escapeHtml(tip)}" style="width:8px;height:8px;border-radius:50%;background:${dotColor};border:1.5px solid #09090b;box-shadow:0 0 6px ${dotColor};display:inline-block;flex-shrink:0;"></span>`;
          })()
        : '';

      const routeBadgeHtml =
        routeStopOrder !== undefined
          ? `<span style="min-width:17px;height:17px;padding:0 4px;border-radius:9999px;background:#38bdf8;color:#09090b;font-size:10px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">#${routeStopOrder}</span>`
          : '';

      const pinShadow =
        routeStopOrder !== undefined
          ? '0 0 0 3px rgba(56,189,248,0.55), 0 4px 14px rgba(0,0,0,0.9)'
          : isNearbyNeighbor
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
            border:2px solid ${routeStopOrder !== undefined ? '#38bdf8' : isSelected ? '#ffffff' : isNearbyNeighbor ? '#38bdf8' : moneyColor};
            border-radius:9999px;padding:3px 8px;
            font-size:10px;font-weight:900;white-space:nowrap;
            box-shadow:${pinShadow};
            transform:translate(-50%,-50%);
          ">
            ${routeBadgeHtml}
            <span style="width:7px;height:7px;border-radius:50%;background:${moneyColor};display:inline-block;flex-shrink:0;"></span>
            <span>${escapeHtml(pillText)}</span>
            ${weatherDotHtml}
          </div>
        `;
      } else {
        const shortName = getShortCustomerLabel(customer.name);
        const activeDot = isActiveInProgress
          ? `<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px #22c55e;display:inline-block;"></span>`
          : '';
        html = `
          <div style="
            display:inline-flex;align-items:center;gap:4px;
            background:#111319;color:#f8fafc;
            border:2px solid ${routeStopOrder !== undefined ? '#38bdf8' : isSelected ? '#ffffff' : isNearbyNeighbor ? '#38bdf8' : meta.color};
            border-radius:9999px;padding:3px 8px;
            font-size:10.5px;font-weight:800;white-space:nowrap;
            box-shadow:${pinShadow};
            transform:translate(-50%,-50%);
          ">
            ${routeBadgeHtml}
            <span style="width:9px;height:9px;border-radius:50%;background:${meta.color};border:1.5px solid #ffffff;display:inline-block;flex-shrink:0;"></span>
            <span>${escapeHtml(shortName)}</span>
            ${weatherDotHtml}
            ${activeDot}
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
        zIndexOffset:
          routeStopOrder !== undefined
            ? 960
            : isSelected
            ? 950
            : isNearbyNeighbor
            ? 820
            : 500,
      }).addTo(markersLayer);

      marker.on('click', () => {
        if (planRouteMode) {
          toggleRouteStop({
            id: stopId,
            kind: 'CUSTOMER',
            refId: customer.id,
            name: customer.name,
            address: customer.address || '',
            lat,
            lng,
            subtitle: meta.label,
          });
          return;
        }
        setSelectedPin({ kind: 'CUSTOMER', customerId: customer.id });
      });
    });
  }, [
    visibleCustomerPins,
    nearbyStoresWithLiveDist,
    allSupplyPins,
    showSupplyLayer,
    moneyView,
    selectedPin,
    nearbyCustomerIdSet,
    exteriorWeatherByCustId,
    droppedSearchPin,
    planRouteMode,
    plannedStopIndexById,
  ]);

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

  // Locate Me (high-accuracy browser Geolocation API — zero paid keys)
  const handleLocateMe = (opts?: { switchRouteStartToGps?: boolean; silentToast?: boolean }) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onToast('GPS geolocation is not supported by this browser');
      return;
    }
    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextGps: UserGpsLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy || 40,
          updatedAt: Date.now(),
        };
        setUserGps(nextGps);
        setIsLocatingGps(false);
        if (opts?.switchRouteStartToGps) {
          setRouteStartMode('GPS');
        }
        const map = mapInstanceRef.current;
        if (map) {
          map.flyTo([nextGps.lat, nextGps.lng], Math.max(map.getZoom(), 13), {
            duration: 0.7,
          });
        }
        if (!opts?.silentToast) {
          onToast('📍 Live GPS locked — showing distances from your location');
        }
      },
      (err) => {
        setIsLocatingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          onToast('Location permission denied — enable GPS in browser settings');
        } else if (err.code === err.TIMEOUT) {
          onToast('GPS request timed out — try again outdoors');
        } else {
          onToast('Unable to read GPS position right now');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
      }
    );
  };

  // Query free OpenStreetMap Overpass API (+ Nominatim fallback) within 25 miles of GPS or Home Base
  const handleFindNearestStores = async (queryText: string, presetId?: string | null) => {
    const q = queryText.trim();
    if (q.length < 2) {
      onToast('Enter a store name (e.g. Sherwin-Williams, Menards, Ace)');
      return;
    }

    storeSearchAbortRef.current?.abort();
    const controller = new AbortController();
    storeSearchAbortRef.current = controller;

    setSearchDropdownOpen(false);
    setDroppedSearchPin(null);
    setActiveStorePreset(presetId ?? null);
    setIsFindingStores(true);

    const centerLat = userGps ? userGps.lat : HOME_BASE.lat;
    const centerLng = userGps ? userGps.lng : HOME_BASE.lng;
    const originLabel = userGps ? 'your GPS' : '2119 Barton Ave';

    const results = await searchNearestStoresOverpass(
      q,
      centerLat,
      centerLng,
      STORE_SEARCH_RADIUS_MILES,
      controller.signal
    );

    if (controller.signal.aborted) return;
    setIsFindingStores(false);

    if (results.length === 0) {
      setNearbyStores([]);
      setStoreSearchSummary(`No "${q}" stores found within ${STORE_SEARCH_RADIUS_MILES} mi of ${originLabel}`);
      onToast(`No "${q}" stores found within ${STORE_SEARCH_RADIUS_MILES} mi`);
      return;
    }

    setNearbyStores(results);
    setStoreSearchSummary(
      `${results.length} nearest "${q}" within ${STORE_SEARCH_RADIUS_MILES} mi of ${originLabel}`
    );

    // Smoothly frame the origin + closest store pins on the map
    const map = mapInstanceRef.current;
    if (map) {
      const topStores = results.slice(0, 6);
      const pts: [number, number][] = [
        [centerLat, centerLng],
        ...topStores.map((s): [number, number] => [s.lat, s.lng]),
      ];
      map.fitBounds(L.latLngBounds(pts), { padding: [42, 42], maxZoom: 13 });
    }
  };

  const handleClearStores = () => {
    storeSearchAbortRef.current?.abort();
    setNearbyStores([]);
    setActiveStorePreset(null);
    setStoreSearchSummary('');
    setIsFindingStores(false);
    if (selectedPin?.kind === 'NEARBY_STORE') {
      setSelectedPin(null);
    }
  };

  // Search dropdown selection handler
  const handleSelectSearchResult = (res: PlaceSearchResult) => {
    setSearchDropdownOpen(false);
    setSearchQuery(res.name);

    if (res.source === 'CUSTOMER' && typeof res.refId === 'number') {
      setDroppedSearchPin(null);
      setSelectedPin({ kind: 'CUSTOMER', customerId: res.refId });
      mapInstanceRef.current?.setView([res.lat, res.lng], 13, { animate: true });
      return;
    }

    if (res.source === 'SUPPLY' && typeof res.refId === 'string') {
      setDroppedSearchPin(null);
      setShowSupplyLayer(true);
      setSelectedPin({ kind: 'SUPPLY', pinId: res.refId });
      mapInstanceRef.current?.setView([res.lat, res.lng], 13, { animate: true });
      return;
    }

    const pin: SearchedPin = {
      id: res.id,
      name: res.name,
      address: res.address,
      lat: res.lat,
      lng: res.lng,
      subtitle: res.subtitle,
    };
    setDroppedSearchPin(pin);
    setSelectedPin({ kind: 'SEARCH', pin });
    mapInstanceRef.current?.setView([pin.lat, pin.lng], 13, { animate: true });
  };

  // Handle Enter / Find button in "Find Nearest Store" bar
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q.length < 2) return;
    await handleFindNearestStores(q, null);
  };

  // Silent background mileage trigger when opening Google Maps (zero popups/toasts)
  const handleOpenGoogleMapsClick = (destKey: string, destName: string, lat: number, lng: number) => {
    const drive = activeDriveEstimate || estimateDriveFromBase(lat, lng);
    onSilentLogDispatchMileage({
      destKey,
      destName,
      roundTripMiles: drive.roundTripMiles,
    });
  };

  // Map navigation actions
  const handleCenterHomeBase = () => {
    mapInstanceRef.current?.setView([HOME_BASE.lat, HOME_BASE.lng], 12, { animate: true });
    setSelectedPin({ kind: 'HOME' });
  };

  const handleFitAllPins = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const pts: [number, number][] = [[HOME_BASE.lat, HOME_BASE.lng]];
    if (userGps) {
      pts.push([userGps.lat, userGps.lng]);
    }
    visibleCustomerPins.forEach((c) => pts.push([c.lat, c.lng]));
    nearbyStoresWithLiveDist.forEach((s) => pts.push([s.lat, s.lng]));
    if (showSupplyLayer) {
      allSupplyPins.forEach((s) => pts.push([s.lat, s.lng]));
    }
    if (droppedSearchPin) {
      pts.push([droppedSearchPin.lat, droppedSearchPin.lng]);
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

  return (
    <div className="space-y-3 pb-24">
      {/* Top Dispatch Controls, Nearest Store Finder & Status Filters */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-sm space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-black uppercase tracking-wide text-[var(--accent)] flex items-center gap-1.5">
              <span>🗺️</span>
              <span>Jobsite Map &amp; Dispatch</span>
            </h2>
            <p className="text-[10px] text-[var(--text-muted)]">
              Base: {HOME_BASE.address}
              {userGps && (
                <span className="ml-2 text-sky-400 font-bold">• 📍 Live GPS Active</span>
              )}
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

        {/* Compact "Find Nearest Store" Search Bar + Preset Chips (Overpass API + Nominatim fallback) */}
        <div ref={searchBoxRef} className="space-y-1.5" data-store-finder="true">
          <div className="relative">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
              <div className="relative flex-1 flex items-center">
                <span className="pointer-events-none absolute left-3 text-sm text-orange-400">
                  🏪
                </span>
                <input
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  value={searchQuery}
                  onFocus={() => setSearchDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchDropdownOpen(true);
                  }}
                  placeholder="Find nearest store (Sherwin-Williams, Menards, Ace) or client…"
                  aria-label="Find nearest store"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-orange-400 text-[var(--text)] rounded-xl pl-9 pr-8 py-2 text-xs font-semibold outline-none shadow-inner"
                />
                {searchQuery.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setNominatimResults([]);
                      setSearchDropdownOpen(false);
                    }}
                    aria-label="Clear search"
                    className="absolute right-2 px-1.5 py-0.5 rounded-md text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isFindingStores || searchQuery.trim().length < 2}
                className="px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 text-xs font-black whitespace-nowrap shadow cursor-pointer transition-all active:scale-95"
              >
                {isFindingStores ? 'Finding…' : 'Find'}
              </button>
            </form>

            {/* Instant Search Dropdown for Clients / Addresses */}
            {searchDropdownOpen && searchQuery.trim().length >= 2 && (
              <div
                data-search-dropdown="true"
                className="absolute left-0 right-0 top-full mt-1.5 z-[600] bg-[#101218] border border-sky-500/40 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800/80"
              >
                <button
                  type="button"
                  onClick={() => handleFindNearestStores(searchQuery, null)}
                  className="w-full px-3 py-2 text-left bg-orange-500/10 hover:bg-orange-500/20 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="text-[11px] font-extrabold text-orange-300 truncate">
                    🏪 Find nearest &ldquo;{searchQuery.trim()}&rdquo; within 25 mi of{' '}
                    {userGps ? 'my GPS' : 'Home Base'}
                  </span>
                  <span className="text-[10px] font-black text-orange-400 shrink-0">Go →</span>
                </button>
                {combinedSearchResults.length > 0 ? (
                  combinedSearchResults.map((res) => {
                    const est = userGps
                      ? estimateDriveBetween(userGps.lat, userGps.lng, res.lat, res.lng)
                      : estimateDriveFromBase(res.lat, res.lng);
                    const badgeIcon =
                      res.source === 'CUSTOMER' ? '📍' : res.source === 'SUPPLY' ? '🎨' : '🔎';
                    return (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => handleSelectSearchResult(res)}
                        className="w-full px-3 py-2 text-left hover:bg-slate-800/90 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="text-sm mt-0.5 shrink-0">{badgeIcon}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-white truncate">
                              {res.name}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {res.address}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10.5px] font-extrabold text-sky-300">
                            {est.oneWayMiles.toFixed(1)} mi
                          </div>
                          <div className="text-[9px] text-slate-400">~{est.etaMinutes} min</div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  isSearching && (
                    <div className="px-3 py-2 text-[11px] text-slate-400">
                      Searching local matches…
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* One-Tap Nearest Store Preset Chips + Clear Stores */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" data-store-chips="true">
            {NEAREST_STORE_PRESETS.map((preset) => {
              const active = activeStorePreset === preset.id && nearbyStores.length > 0;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={isFindingStores}
                  onClick={() => {
                    setSearchQuery(preset.query);
                    handleFindNearestStores(preset.query, preset.id);
                  }}
                  className={`px-2.5 py-1.5 rounded-full text-[10.5px] font-extrabold border whitespace-nowrap cursor-pointer transition-all active:scale-95 flex items-center gap-1 shrink-0 ${
                    active
                      ? 'bg-orange-500 text-slate-950 border-orange-400 shadow'
                      : 'bg-[var(--bg)] text-[var(--text)] border-orange-500/35 hover:border-orange-400'
                  }`}
                >
                  <span>{preset.icon}</span>
                  <span>{preset.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleClearStores}
              disabled={nearbyStores.length === 0 && !storeSearchSummary && !isFindingStores}
              className={`px-2.5 py-1.5 rounded-full text-[10.5px] font-extrabold border whitespace-nowrap transition-all shrink-0 ${
                nearbyStores.length > 0 || storeSearchSummary
                  ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 hover:bg-rose-500/25 cursor-pointer active:scale-95'
                  : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
              }`}
            >
              ✕ Clear Stores
            </button>
          </div>

          {(isFindingStores || storeSearchSummary) && (
            <div className="text-[10px] font-bold text-orange-300 flex items-center justify-between gap-2 px-0.5">
              <span>
                {isFindingStores
                  ? `🔎 Searching OpenStreetMap within ${STORE_SEARCH_RADIUS_MILES} mi of ${
                      userGps ? 'your GPS' : '2119 Barton Ave'
                    }…`
                  : `🟠 ${storeSearchSummary}`}
              </span>
            </div>
          )}
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

          {/* Plan Day Route Mode Toggle */}
          <button
            type="button"
            onClick={() => {
              setPlanRouteMode((prev) => {
                const next = !prev;
                if (next) {
                  setSelectedPin(null);
                  if (userGps) {
                    setRouteStartMode('GPS');
                  }
                }
                return next;
              });
            }}
            className={`px-2.5 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-extrabold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              planRouteMode
                ? 'bg-sky-500 text-slate-950 border-sky-400 shadow'
                : 'bg-[var(--bg)] border-sky-500/45 text-sky-300 hover:border-sky-400'
            }`}
          >
            <span>🛣️</span>
            <span>
              Plan Route{plannedStops.length > 0 ? ` (${plannedStops.length})` : ''}
            </span>
          </button>

          {/* Saved Supply Pins Overlay Toggle */}
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
            <span>Saved Stops ({allSupplyPins.length})</span>
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

        {/* Status Filter Pills (All Active default; Completed Gray OFF by default) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" data-status-filters="true">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL_ACTIVE')}
            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border whitespace-nowrap cursor-pointer transition-all ${
              statusFilter === 'ALL_ACTIVE'
                ? 'bg-[var(--text)] text-[var(--bg)] border-[var(--text)]'
                : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)]'
            }`}
          >
            All Active ({activeJobsCount})
          </button>
          {(['UNQUOTED', 'QUOTED', 'SCHEDULED', 'COMPLETED'] as JobMapStatus[]).map((st) => {
            const meta = JOB_MAP_STATUS_META[st];
            const active = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(active ? 'ALL_ACTIVE' : st)}
                className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-all"
                style={{
                  backgroundColor: active ? meta.color : 'var(--bg)',
                  color: active ? '#09090b' : st === 'COMPLETED' ? '#94a3b8' : 'var(--text)',
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
          className="w-full h-[52vh] sm:h-[58vh] min-h-[340px] max-h-[600px] z-0"
        />

        {/* Plan Route Mode Banner Overlay */}
        {planRouteMode && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[450] bg-slate-950/90 border border-sky-400/60 text-sky-200 px-3 py-1.5 rounded-full text-[10px] font-extrabold shadow-lg whitespace-nowrap">
            🛣️ Tap jobs or stores in order ({plannedStops.length} selected)
          </div>
        )}

        {/* Empty state hint overlay when zero customers are saved yet */}
        {!planRouteMode && customers.length === 0 && nearbyStores.length === 0 && !selectedPin && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[450] bg-slate-950/90 border border-amber-400/50 text-amber-200 px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg whitespace-nowrap">
            Tap Locate Me or pick a Nearest Store chip above
          </div>
        )}

        {/* Floating "Locate Me" Live GPS Crosshair Button */}
        <button
          type="button"
          data-locate-me-btn="true"
          onClick={() => handleLocateMe()}
          disabled={isLocatingGps}
          title="Locate Me (Live GPS)"
          aria-label="Locate Me"
          className={`absolute bottom-7 right-3 z-[450] flex items-center gap-1.5 px-3 py-2 rounded-full border text-[11px] font-black shadow-2xl cursor-pointer transition-all active:scale-95 ${
            userGps
              ? 'bg-sky-500 text-slate-950 border-white shadow-sky-500/40'
              : 'bg-slate-950/92 text-sky-300 border-sky-400/70 hover:bg-slate-900'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-4 h-4 ${isLocatingGps ? 'animate-spin' : ''}`}
          >
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
          <span>{isLocatingGps ? 'Locating…' : 'Locate Me'}</span>
        </button>
      </div>

      {/* Multi-Stop "Plan Day Route" Card (Supports Jobs AND/OR Stores, starting from GPS or Home Base) */}
      {planRouteMode && (
        <div
          data-plan-route-card="true"
          className="bg-[#101218] border border-sky-500/45 rounded-2xl p-3.5 shadow-xl space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-sky-300 flex items-center gap-1.5">
                <span>🛣️</span>
                <span>Plan Day Route</span>
              </h3>
              <p className="text-[10px] text-slate-400 truncate">
                {activeRouteOrigin.isGps
                  ? 'Starts from My Current GPS Location'
                  : `Starts & ends at ${HOME_BASE.address}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {plannedStops.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPlannedStops([])}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setPlanRouteMode(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>

          {/* Start Origin Switcher: My Current GPS vs 2119 Barton Ave Home Base */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase text-slate-400">Start from:</span>
            <button
              type="button"
              onClick={() => {
                if (userGps) {
                  setRouteStartMode('GPS');
                } else {
                  handleLocateMe({ switchRouteStartToGps: true });
                }
              }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border cursor-pointer transition-all ${
                activeRouteOrigin.isGps
                  ? 'bg-sky-500 text-slate-950 border-sky-400 shadow'
                  : 'bg-slate-900 text-sky-300 border-sky-500/40 hover:border-sky-400'
              }`}
            >
              📍 My GPS {userGps ? '' : '(Locate)'}
            </button>
            <button
              type="button"
              onClick={() => setRouteStartMode('HOME')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border cursor-pointer transition-all ${
                !activeRouteOrigin.isGps
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                  : 'bg-slate-900 text-amber-300 border-amber-500/40 hover:border-amber-400'
              }`}
            >
              🏠 2119 Barton Ave
            </button>
          </div>

          {plannedStops.length === 0 ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2.5 text-[11px] text-slate-300">
              Tap customer job pins or orange store pins on the map in visit order. Total mileage and drive time calculate automatically via OSRM.
            </div>
          ) : (
            <>
              {/* Ordered Stops Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold border ${
                    activeRouteOrigin.isGps
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                      : 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                  }`}
                >
                  {activeRouteOrigin.isGps ? '📍 My GPS' : '🏠 Base'}
                </span>
                {plannedStops.map((stop, idx) => (
                  <span
                    key={stop.id}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10.5px] font-bold text-white ${
                      stop.kind === 'SUPPLY'
                        ? 'bg-orange-500/20 border-orange-400/55'
                        : 'bg-sky-500/15 border-sky-400/50'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-sky-400 text-slate-950 text-[9.5px] font-black inline-flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="truncate max-w-[130px]">
                      {stop.kind === 'SUPPLY' ? '🏪 ' : ''}
                      {stop.name}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPlannedStops((prev) => prev.filter((s) => s.id !== stop.id))
                      }
                      aria-label={`Remove ${stop.name} from route`}
                      className="text-slate-300 hover:text-white text-[10px] font-black cursor-pointer"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {routeReturnToOrigin && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-[10px] font-extrabold text-amber-300">
                    ↩ Base
                  </span>
                )}
              </div>

              {/* OSRM Total Mileage & Drive Time Summary */}
              {routeEstimate && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2">
                    <div className="text-[9px] uppercase font-bold text-slate-400">
                      {routeReturnToOrigin ? 'Est. Round-Trip Miles' : 'Est. Total Route Miles'}
                    </div>
                    <div className="text-sm font-black text-sky-300 tabular-nums">
                      {(routeReturnToOrigin
                        ? routeEstimate.roundTripMiles
                        : routeEstimate.oneWayMiles
                      ).toFixed(1)}{' '}
                      mi
                    </div>
                  </div>
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2">
                    <div className="text-[9px] uppercase font-bold text-slate-400">
                      Est. Drive Time {isRouting ? '(routing…)' : routeEstimate.isRoadGeometry ? '(OSRM)' : ''}
                    </div>
                    <div className="text-sm font-black text-emerald-300 tabular-nums">
                      ~{routeEstimate.estDriveMinutes} min
                    </div>
                  </div>
                </div>
              )}

              {/* Primary Multi-Stop Google Maps Launch CTA */}
              <a
                href={buildGoogleMapsMultiStopUrl(
                  plannedStops,
                  routeReturnToOrigin,
                  activeRouteOrigin
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  const milesToLog = routeEstimate
                    ? routeReturnToOrigin
                      ? routeEstimate.roundTripMiles
                      : routeEstimate.oneWayMiles
                    : 0;
                  if (milesToLog > 0) {
                    const stopNames = plannedStops.map((s) => s.name).join(' → ');
                    onSilentLogDispatchMileage({
                      destKey: `route:${plannedStops.map((s) => s.id).join('-')}`,
                      destName: `Day Route (${plannedStops.length} stops: ${stopNames})`,
                      roundTripMiles: milesToLog,
                    });
                  }
                }}
                className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-95 text-white text-xs font-black uppercase tracking-wide text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>🧭</span>
                <span>Open Multi-Stop Route in Maps</span>
              </a>
            </>
          )}
        </div>
      )}

      {/* Clean Action Bottom Card (rendered cleanly below map when not in Plan Route mode) */}
      {!planRouteMode && selectedPin && (
        <div
          data-selected-pin-card="true"
          className="bg-[#101218] border border-[var(--border)] rounded-2xl p-3.5 shadow-xl"
        >
          {/* CUSTOMER PIN CARD */}
          {selectedCustomerItem && (() => {
            const {
              customer,
              primaryJob,
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
            const telHref = sanitizeTelHref(customer.phone);
            const smsHref = sanitizeSmsHref(customer.phone);
            const activeWeather = pinWeather || exteriorWeatherByCustId[customer.id] || null;
            const drive = activeDriveEstimate || estimateDriveFromBase(lat, lng);
            const projectTitle = primaryJob?.title?.trim() || scopeSummary;

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
                        style={{
                          backgroundColor: meta.bgTint,
                          color: meta.textColor,
                          border: `1px solid ${meta.color}`,
                        }}
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
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {userGps && (() => {
                        const gpsDrive =
                          activeGpsDriveEstimate ||
                          estimateDriveBetween(userGps.lat, userGps.lng, lat, lng);
                        return (
                          <span
                            data-gps-distance-badge="true"
                            className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2 py-0.5"
                          >
                            <span>📍</span>
                            <span>
                              {gpsDrive.oneWayMiles.toFixed(1)} mi • ~{gpsDrive.etaMinutes} min from Me
                            </span>
                          </span>
                        );
                      })()}
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2 py-0.5">
                        <span>🏠</span>
                        <span>
                          {drive.oneWayMiles.toFixed(1)} mi • ~{drive.etaMinutes} min from 2119 Barton Ave
                        </span>
                      </span>
                    </div>
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

                {/* Project Title & Scheduled Date */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-2 text-[11px] text-slate-200 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                      Project &amp; Schedule
                    </span>
                    <span className="text-[9.5px] font-bold text-sky-300">
                      {schedDate ? `📅 ${formatScheduledDate(schedDate)}` : 'Not scheduled'}
                    </span>
                  </div>
                  <p className="font-bold text-white leading-snug line-clamp-1">{projectTitle}</p>
                </div>

                {/* Estimate / Bill Total + Live Open-Meteo Weather Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[9px] uppercase font-bold text-slate-400">
                        Estimate / Bill Total
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

                {/* 3 Quick Action Buttons: Navigate | Call / Text | Open Folder */}
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  <a
                    href={buildSingleStopMapsUrl(customer.address, lat, lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      handleOpenGoogleMapsClick(
                        `cust-${customer.id}`,
                        customer.name,
                        lat,
                        lng
                      )
                    }
                    className="py-2.5 px-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-95 text-white text-[11px] font-black text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1"
                  >
                    <span>🧭</span>
                    <span>Navigate</span>
                  </a>

                  <button
                    type="button"
                    disabled={!telHref}
                    onClick={() => setCallTextMenuOpen((prev) => !prev)}
                    className={`py-2.5 px-2 rounded-xl border text-[11px] font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1 ${
                      telHref
                        ? callTextMenuOpen
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 cursor-pointer'
                          : 'bg-slate-800 border-slate-700 text-emerald-300 hover:border-emerald-400 cursor-pointer'
                        : 'bg-slate-900 border-slate-800 text-slate-500 opacity-60 cursor-not-allowed'
                    }`}
                    title={telHref ? `Call or text ${customer.phone}` : 'No phone number saved'}
                  >
                    <span>📞</span>
                    <span>Call / Text</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenFolder(customer.id)}
                    className="py-2.5 px-2 rounded-xl bg-[var(--accent)] text-white text-[11px] font-extrabold shadow hover:opacity-95 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    <span>📁</span>
                    <span>Open Folder</span>
                  </button>
                </div>

                {/* Expandable 1-Tap Native Call & Text Actions */}
                {callTextMenuOpen && telHref && (
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-900/90 border border-emerald-500/35 rounded-xl p-2">
                    <a
                      href={telHref}
                      className="py-2 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-extrabold text-center flex items-center justify-center gap-1.5"
                    >
                      <span>📞</span>
                      <span>Call {customer.phone}</span>
                    </a>
                    <a
                      href={smsHref}
                      className="py-2 px-3 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-extrabold text-center flex items-center justify-center gap-1.5"
                    >
                      <span>💬</span>
                      <span>Text Message</span>
                    </a>
                  </div>
                )}
              </div>
            );
          })()}

          {/* NEAREST STORE FINDER (ORANGE PIN) CARD */}
          {selectedNearbyStore && (() => {
            const driveBase =
              activeDriveEstimate ||
              estimateDriveFromBase(selectedNearbyStore.lat, selectedNearbyStore.lng);
            const gpsDrive = userGps
              ? activeGpsDriveEstimate ||
                estimateDriveBetween(
                  userGps.lat,
                  userGps.lng,
                  selectedNearbyStore.lat,
                  selectedNearbyStore.lng
                )
              : null;
            const telHref = sanitizeTelHref(selectedNearbyStore.phone);
            const stopId = `store-${selectedNearbyStore.id}`;
            const alreadyInRoute = plannedStopIndexById.has(stopId);

            return (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base">🏪</span>
                      <h3 className="text-sm font-black text-white truncate">
                        {selectedNearbyStore.name}
                      </h3>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400/60">
                        {selectedNearbyStore.categoryLabel}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 mt-0.5">
                      📍 {selectedNearbyStore.address}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {gpsDrive && (
                        <span
                          data-gps-distance-badge="true"
                          className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2 py-0.5"
                        >
                          <span>📍</span>
                          <span>
                            {gpsDrive.oneWayMiles.toFixed(1)} mi • ~{gpsDrive.etaMinutes} min from Me
                          </span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2 py-0.5">
                        <span>🏠</span>
                        <span>
                          {driveBase.oneWayMiles.toFixed(1)} mi • ~{driveBase.etaMinutes} min from 2119 Barton Ave
                        </span>
                      </span>
                    </div>
                    {selectedNearbyStore.phone && (
                      <p className="text-[10.5px] text-emerald-300 font-bold mt-1">
                        📞 {selectedNearbyStore.phone}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPin(null)}
                    className="text-xs font-bold text-slate-400 hover:text-white px-1.5 py-0.5 cursor-pointer"
                    aria-label="Close store card"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <a
                    href={buildSingleStopMapsUrl(
                      selectedNearbyStore.address,
                      selectedNearbyStore.lat,
                      selectedNearbyStore.lng
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      handleOpenGoogleMapsClick(
                        stopId,
                        selectedNearbyStore.name,
                        selectedNearbyStore.lat,
                        selectedNearbyStore.lng
                      )
                    }
                    className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-95 text-white text-xs font-black text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>🧭</span>
                    <span>Navigate</span>
                  </a>

                  <button
                    type="button"
                    onClick={() =>
                      addStopAndOpenPlanner({
                        id: stopId,
                        kind: 'SUPPLY',
                        refId: selectedNearbyStore.id,
                        name: selectedNearbyStore.name,
                        address: selectedNearbyStore.address,
                        lat: selectedNearbyStore.lat,
                        lng: selectedNearbyStore.lng,
                        subtitle: selectedNearbyStore.categoryLabel,
                      })
                    }
                    className={`py-2.5 px-3 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                      alreadyInRoute
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                        : 'bg-orange-500/20 border-orange-400 text-orange-200 hover:bg-orange-500/30'
                    }`}
                  >
                    <span>🛣️</span>
                    <span>{alreadyInRoute ? 'In Route ✓' : 'Add to Route'}</span>
                  </button>
                </div>

                {telHref && (
                  <a
                    href={telHref}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600/25 border border-emerald-500/40 hover:bg-emerald-600/35 text-emerald-200 text-xs font-extrabold text-center flex items-center justify-center gap-1.5"
                  >
                    <span>📞</span>
                    <span>Call {selectedNearbyStore.phone}</span>
                  </a>
                )}
              </div>
            );
          })()}

          {/* SUPPLY / HARDWARE STOP PIN CARD */}
          {selectedSupplyPin && (() => {
            const cat = SUPPLY_CATEGORY_META[selectedSupplyPin.category];
            const telHref = sanitizeTelHref(selectedSupplyPin.phone);
            const drive =
              activeDriveEstimate ||
              estimateDriveFromBase(selectedSupplyPin.lat, selectedSupplyPin.lng);
            const gpsDrive = userGps
              ? activeGpsDriveEstimate ||
                estimateDriveBetween(
                  userGps.lat,
                  userGps.lng,
                  selectedSupplyPin.lat,
                  selectedSupplyPin.lng
                )
              : null;
            const stopId = `supply-${selectedSupplyPin.id}`;
            const alreadyInRoute = plannedStopIndexById.has(stopId);

            return (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base">{cat.icon}</span>
                      <h3 className="text-sm font-black text-white truncate">
                        {selectedSupplyPin.name}
                      </h3>
                      <span
                        className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: cat.bg,
                          color: cat.color,
                          border: `1px solid ${cat.color}`,
                        }}
                      >
                        {cat.label}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 mt-0.5">
                      📍 {selectedSupplyPin.address}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {gpsDrive && (
                        <span
                          data-gps-distance-badge="true"
                          className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2 py-0.5"
                        >
                          <span>📍</span>
                          <span>
                            {gpsDrive.oneWayMiles.toFixed(1)} mi • ~{gpsDrive.etaMinutes} min from Me
                          </span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2 py-0.5">
                        <span>🏠</span>
                        <span>
                          {drive.oneWayMiles.toFixed(1)} mi • ~{drive.etaMinutes} min from 2119 Barton Ave
                        </span>
                      </span>
                    </div>
                    {selectedSupplyPin.phone && (
                      <p className="text-[10.5px] text-emerald-300 font-bold mt-1">
                        📞 {selectedSupplyPin.phone}
                      </p>
                    )}
                    {selectedSupplyPin.notes && (
                      <p className="text-[10px] text-slate-400 mt-0.5 italic">
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
                  <a
                    href={buildSingleStopMapsUrl(
                      selectedSupplyPin.address,
                      selectedSupplyPin.lat,
                      selectedSupplyPin.lng
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      handleOpenGoogleMapsClick(
                        stopId,
                        selectedSupplyPin.name,
                        selectedSupplyPin.lat,
                        selectedSupplyPin.lng
                      )
                    }
                    className="flex-1 min-w-[125px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-95 text-white text-xs font-black text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>🧭</span>
                    <span>Navigate</span>
                  </a>

                  <button
                    type="button"
                    onClick={() =>
                      addStopAndOpenPlanner({
                        id: stopId,
                        kind: 'SUPPLY',
                        refId: selectedSupplyPin.id,
                        name: selectedSupplyPin.name,
                        address: selectedSupplyPin.address,
                        lat: selectedSupplyPin.lat,
                        lng: selectedSupplyPin.lng,
                        subtitle: cat.label,
                      })
                    }
                    className="py-2.5 px-3 rounded-xl bg-orange-500/20 border border-orange-400 text-orange-200 text-xs font-extrabold hover:bg-orange-500/30 cursor-pointer transition-all active:scale-95"
                  >
                    🛣️ {alreadyInRoute ? 'In Route ✓' : 'Add to Route'}
                  </button>

                  {telHref && (
                    <a
                      href={telHref}
                      className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold text-center shadow transition-all"
                    >
                      📞 Call
                    </a>
                  )}

                  {!selectedSupplyPin.isPreset && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteCustomPin(selectedSupplyPin.id);
                        setSelectedPin(null);
                        onToast(`Deleted custom pin: ${selectedSupplyPin.name}`);
                      }}
                      className="py-2.5 px-2.5 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[11px] font-extrabold hover:bg-rose-600 hover:text-white cursor-pointer"
                      title="Delete custom pin"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* SEARCHED ADDRESS / STORE PIN CARD */}
          {selectedSearchPin && (() => {
            const drive =
              activeDriveEstimate ||
              estimateDriveFromBase(selectedSearchPin.lat, selectedSearchPin.lng);
            const gpsDrive = userGps
              ? activeGpsDriveEstimate ||
                estimateDriveBetween(
                  userGps.lat,
                  userGps.lng,
                  selectedSearchPin.lat,
                  selectedSearchPin.lng
                )
              : null;
            return (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base">🔎</span>
                      <h3 className="text-sm font-black text-white truncate">
                        {selectedSearchPin.name}
                      </h3>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/50">
                        Search Pin
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 mt-0.5">
                      📍 {selectedSearchPin.address}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {gpsDrive && (
                        <span
                          data-gps-distance-badge="true"
                          className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2 py-0.5"
                        >
                          <span>📍</span>
                          <span>
                            {gpsDrive.oneWayMiles.toFixed(1)} mi • ~{gpsDrive.etaMinutes} min from Me
                          </span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2 py-0.5">
                        <span>🏠</span>
                        <span>
                          {drive.oneWayMiles.toFixed(1)} mi • ~{drive.etaMinutes} min from 2119 Barton Ave
                        </span>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPin(null);
                      setDroppedSearchPin(null);
                    }}
                    className="text-xs font-bold text-slate-400 hover:text-white px-1.5 py-0.5 cursor-pointer"
                    aria-label="Close search pin card"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <a
                    href={buildSingleStopMapsUrl(
                      selectedSearchPin.address,
                      selectedSearchPin.lat,
                      selectedSearchPin.lng
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      handleOpenGoogleMapsClick(
                        `search-${selectedSearchPin.address || selectedSearchPin.name}`,
                        selectedSearchPin.name,
                        selectedSearchPin.lat,
                        selectedSearchPin.lng
                      )
                    }
                    className="flex-1 min-w-[140px] py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-95 text-white text-xs font-black text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>🧭</span>
                    <span>Navigate</span>
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      addStopAndOpenPlanner({
                        id: `search-${selectedSearchPin.id}`,
                        kind: 'SUPPLY',
                        refId: selectedSearchPin.id,
                        name: selectedSearchPin.name,
                        address: selectedSearchPin.address,
                        lat: selectedSearchPin.lat,
                        lng: selectedSearchPin.lng,
                        subtitle: 'Searched Stop',
                      })
                    }
                    className="py-2.5 px-3 rounded-xl bg-orange-500/20 border border-orange-400 text-orange-200 text-xs font-extrabold hover:bg-orange-500/30 cursor-pointer"
                  >
                    🛣️ Add to Route
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewPinName(selectedSearchPin.name);
                      setNewPinAddress(selectedSearchPin.address);
                      setNewPinCategory('HARDWARE');
                      setUseMapCenterCoords(false);
                      setAddPinModalOpen(true);
                    }}
                    className="py-2.5 px-3 rounded-xl bg-slate-800 border border-slate-700 text-amber-300 text-[11px] font-extrabold hover:border-amber-400 cursor-pointer"
                  >
                    + Save Pin
                  </button>
                </div>
              </div>
            );
          })()}

          {/* HOME BASE PIN CARD */}
          {selectedPin.kind === 'HOME' && (() => {
            const gpsDriveHome = userGps
              ? activeGpsDriveEstimate ||
                estimateDriveBetween(userGps.lat, userGps.lng, HOME_BASE.lat, HOME_BASE.lng)
              : null;
            return (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                      <span>🏠</span>
                      <span>{HOME_BASE.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">{HOME_BASE.address}</p>
                    {gpsDriveHome ? (
                      <div
                        data-gps-distance-badge="true"
                        className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-extrabold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2 py-0.5"
                      >
                        <span>📍</span>
                        <span>
                          {gpsDriveHome.oneWayMiles.toFixed(1)} mi • ~{gpsDriveHome.etaMinutes} min from Me
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Home dispatch origin for distance, drive-time ETAs, and background tax mileage.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPin(null)}
                    className="text-xs font-bold text-slate-400 hover:text-white px-2 py-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                {gpsDriveHome && (
                  <a
                    href={buildSingleStopMapsUrl(HOME_BASE.address, HOME_BASE.lat, HOME_BASE.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-slate-950 text-xs font-black text-center shadow flex items-center justify-center gap-1.5"
                  >
                    <span>🧭</span>
                    <span>Navigate to Home Base</span>
                  </a>
                )}
              </div>
            );
          })()}
        </div>
      )}

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
