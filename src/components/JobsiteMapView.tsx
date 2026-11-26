import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Customer,
  JobMapStatus,
  SupplyPinCategory,
  SupplyStopPin,
  SystemConstants,
} from '../types';
import {
  FREQUENT_SUPPLY_STOP_CHIPS,
  HOME_BASE,
  JOB_MAP_STATUS_META,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  PRESET_SUPPLY_STOPS,
  SUPPLY_CATEGORY_META,
  CustomerMapSummary,
  DriveFromBaseEstimate,
  PinWeatherSummary,
  PlaceSearchResult,
  buildSingleStopMapsUrl,
  estimateDriveFromBase,
  fetchDriveFromBase,
  fetchPinWeatherSummary,
  geocodeAddressWithNominatim,
  getCustomerMapSummary,
  haversineMiles,
  resolveApproxWisconsinCoords,
  sanitizeTelHref,
  searchPlacesWithNominatim,
} from '../utils/mapHelpers';
import { formatScheduledDate } from '../utils/projectHelpers';

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

type SelectedPin =
  | { kind: 'CUSTOMER'; customerId: number }
  | { kind: 'SUPPLY'; pinId: string }
  | { kind: 'SEARCH'; pin: SearchedPin }
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
  onSilentLogDispatchMileage,
  onToast,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const radiusLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const geocodedAttemptedRef = useRef<Set<string>>(new Set());
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  // Map UI Controls
  const [moneyView, setMoneyView] = useState<boolean>(false);
  const [showSupplyLayer, setShowSupplyLayer] = useState<boolean>(true);
  const [mapStyle, setMapStyle] = useState<'dark' | 'street'>('dark');
  const [statusFilter, setStatusFilter] = useState<'ALL' | JobMapStatus>('ALL');
  const [selectedPin, setSelectedPin] = useState<SelectedPin | null>(null);

  // Universal Search Bar state (Wisconsin-biased Nominatim + local customers/stores)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [nominatimResults, setNominatimResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState<boolean>(false);
  const [droppedSearchPin, setDroppedSearchPin] = useState<SearchedPin | null>(null);

  // Live Drive Distance & ETA from Home Base (2119 Barton Ave) for active pin
  const [activeDriveEstimate, setActiveDriveEstimate] = useState<DriveFromBaseEstimate | null>(null);

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

    mapInstanceRef.current = map;
    radiusLayerRef.current = radiusLayer;
    markersLayerRef.current = markersLayer;

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

  // Selected pin lookups
  const selectedCustomerItem = useMemo(() => {
    if (selectedPin?.kind !== 'CUSTOMER') return null;
    return customerSummaries.find((s) => s.customer.id === selectedPin.customerId) || null;
  }, [selectedPin, customerSummaries]);

  const selectedSupplyPin = useMemo(() => {
    if (selectedPin?.kind !== 'SUPPLY') return null;
    return allSupplyPins.find((p) => p.id === selectedPin.pinId) || null;
  }, [selectedPin, allSupplyPins]);

  const selectedSearchPin = useMemo(() => {
    if (selectedPin?.kind !== 'SEARCH') return null;
    return selectedPin.pin;
  }, [selectedPin]);

  // Coordinates of the currently selected destination (for Drive Distance / ETA from 2119 Barton Ave)
  const activeDestinationCoords = useMemo<{ lat: number; lng: number } | null>(() => {
    if (selectedCustomerItem) {
      return { lat: selectedCustomerItem.lat, lng: selectedCustomerItem.lng };
    }
    if (selectedSupplyPin) {
      return { lat: selectedSupplyPin.lat, lng: selectedSupplyPin.lng };
    }
    if (selectedSearchPin) {
      return { lat: selectedSearchPin.lat, lng: selectedSearchPin.lng };
    }
    return null;
  }, [selectedCustomerItem, selectedSupplyPin, selectedSearchPin]);

  // Immediately estimate + silently upgrade live driving distance & ETA from 2119 Barton Ave
  useEffect(() => {
    if (!activeDestinationCoords) {
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
  }, [activeDestinationCoords?.lat, activeDestinationCoords?.lng]);

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

  // Render map markers whenever pins, mode, selection, or search pin changes
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

    // 2. Supply & Hardware Stop Overlay Pins
    if (showSupplyLayer) {
      allSupplyPins.forEach((pin) => {
        const cat = SUPPLY_CATEGORY_META[pin.category];
        const isSelected = selectedPin?.kind === 'SUPPLY' && selectedPin.pinId === pin.id;

        const supplyIcon = L.divIcon({
          className: 'krueger-map-divicon',
          html: `
            <div style="
              display:inline-flex;align-items:center;gap:3px;
              background:${cat.bg};color:${cat.color};
              border:2px solid ${isSelected ? '#ffffff' : cat.color};
              border-radius:8px;padding:3px 6px;
              font-size:10px;font-weight:800;white-space:nowrap;
              box-shadow:0 2px 10px rgba(0,0,0,0.72);
              transform:translate(-50%,-50%);
            ">
              <span>${cat.icon}</span>
              <span>${escapeHtml(pin.name.split('—')[0].trim().slice(0, 14))}</span>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const marker = L.marker([pin.lat, pin.lng], {
          icon: supplyIcon,
          zIndexOffset: isSelected ? 850 : 350,
        }).addTo(markersLayer);

        marker.on('click', () => {
          setSelectedPin({ kind: 'SUPPLY', pinId: pin.id });
        });
      });
    }

    // 3. Dropped Search Result Pin (if user searched an address or store)
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

    // 4. Customer & Jobsite Pins (Status Mode vs Money View)
    visibleCustomerPins.forEach((item) => {
      const { customer, mapStatus, isActiveInProgress, isExteriorJob, financials, lat, lng } = item;
      const meta = JOB_MAP_STATUS_META[mapStatus];
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
            border:2px solid ${isSelected ? '#ffffff' : isNearbyNeighbor ? '#38bdf8' : meta.color};
            border-radius:9999px;padding:3px 8px;
            font-size:10.5px;font-weight:800;white-space:nowrap;
            box-shadow:${pinShadow};
            transform:translate(-50%,-50%);
          ">
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
        zIndexOffset: isSelected ? 950 : isNearbyNeighbor ? 820 : 500,
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
    nearbyCustomerIdSet,
    exteriorWeatherByCustId,
    droppedSearchPin,
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

  // Search selection handler
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

  // Handle Enter key in search input
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (combinedSearchResults.length > 0) {
      handleSelectSearchResult(combinedSearchResults[0]);
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setIsSearching(true);
    const results = await searchPlacesWithNominatim(q);
    setIsSearching(false);
    setNominatimResults(results);
    if (results.length > 0) {
      handleSelectSearchResult(results[0]);
    } else {
      onToast('No matching WI address or store found');
    }
  };

  // One-tap Frequent Supply Stop chip handler
  const handleSelectFrequentStop = (pinId: string) => {
    const found = allSupplyPins.find((p) => p.id === pinId);
    if (!found) return;
    setShowSupplyLayer(true);
    setDroppedSearchPin(null);
    setSearchDropdownOpen(false);
    setSelectedPin({ kind: 'SUPPLY', pinId: found.id });
    mapInstanceRef.current?.setView([found.lat, found.lng], 13, { animate: true });
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
    visibleCustomerPins.forEach((c) => pts.push([c.lat, c.lng]));
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
      {/* Top Dispatch Search, Frequent Stops & Map Controls */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-sm space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-black uppercase tracking-wide text-[var(--accent)] flex items-center gap-1.5">
              <span>🗺️</span>
              <span>Jobsite Map &amp; Dispatch</span>
            </h2>
            <p className="text-[10px] text-[var(--text-muted)]">
              Base: {HOME_BASE.address}
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

        {/* Universal Store & Address Search Bar (Wisconsin-Biased Nominatim) */}
        <div ref={searchBoxRef} className="relative">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 text-sm text-[var(--text-muted)]">
              🔎
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
              placeholder="Search address, town, or store (e.g. Menards West Bend)…"
              aria-label="Search store, town, or address"
              className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-sky-400 text-[var(--text)] rounded-xl pl-9 pr-16 py-2.5 text-xs font-semibold outline-none shadow-inner"
            />
            {isSearching && (
              <span className="absolute right-9 text-[10px] font-bold text-sky-400 animate-pulse">
                …
              </span>
            )}
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setNominatimResults([]);
                  setSearchDropdownOpen(false);
                }}
                aria-label="Clear search"
                className="absolute right-2.5 px-1.5 py-0.5 rounded-md text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                ✕
              </button>
            )}
          </form>

          {/* Instant Search Dropdown (Top 3–4 Results) */}
          {searchDropdownOpen && searchQuery.trim().length >= 2 && (
            <div
              data-search-dropdown="true"
              className="absolute left-0 right-0 top-full mt-1.5 z-[600] bg-[#101218] border border-sky-500/40 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800/80"
            >
              {combinedSearchResults.length > 0 ? (
                combinedSearchResults.map((res) => {
                  const est = estimateDriveFromBase(res.lat, res.lng);
                  const badgeIcon =
                    res.source === 'CUSTOMER' ? '📍' : res.source === 'SUPPLY' ? '🎨' : '🔎';
                  return (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => handleSelectSearchResult(res)}
                      className="w-full px-3 py-2.5 text-left hover:bg-slate-800/90 flex items-center justify-between gap-2 transition-colors cursor-pointer"
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
                <div className="px-3 py-2.5 text-[11px] text-slate-400">
                  {isSearching
                    ? 'Searching Wisconsin addresses & stores…'
                    : 'No matches yet — press Enter to search'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick "Frequent Stops" Horizontal Chip Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" data-frequent-stops="true">
          {FREQUENT_SUPPLY_STOP_CHIPS.map((chip) => {
            const active = selectedPin?.kind === 'SUPPLY' && selectedPin.pinId === chip.pinId;
            return (
              <button
                key={chip.pinId}
                type="button"
                onClick={() => handleSelectFrequentStop(chip.pinId)}
                className={`px-2.5 py-1.5 rounded-full text-[10.5px] font-extrabold border whitespace-nowrap cursor-pointer transition-all active:scale-95 flex items-center gap-1 shrink-0 ${
                  active
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:border-amber-400/70'
                }`}
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
              </button>
            );
          })}
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

          {/* Supply Stops Overlay Toggle */}
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
            <span>Supply Stops ({allSupplyPins.length})</span>
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
          className="w-full h-[52vh] sm:h-[58vh] min-h-[340px] max-h-[600px] z-0"
        />

        {/* Empty state hint overlay when zero customers are saved yet */}
        {customers.length === 0 && !selectedPin && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[450] bg-slate-950/90 border border-amber-400/50 text-amber-200 px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg whitespace-nowrap">
            Search any store/address above or tap a Frequent Stop chip to dispatch
          </div>
        )}
      </div>

      {/* Clean One-Tap Google Maps Handoff Action Card (rendered cleanly below map) */}
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
            const telHref = sanitizeTelHref(customer.phone);
            const activeWeather = pinWeather || exteriorWeatherByCustId[customer.id] || null;
            const drive = activeDriveEstimate || estimateDriveFromBase(lat, lng);

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
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[10.5px] font-extrabold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2 py-0.5">
                      <span>🚗</span>
                      <span>
                        {drive.oneWayMiles.toFixed(1)} mi • ~{drive.etaMinutes} min from 2119 Barton Ave
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
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Primary Google Maps Handoff + Quick Actions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
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
                    className="flex-1 min-w-[175px] py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-95 text-white text-xs font-black uppercase tracking-wide text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>🧭</span>
                    <span>Open in Google Maps</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => onOpenFolder(customer.id)}
                    className="py-2.5 px-3 rounded-xl bg-[var(--accent)] text-white text-[11px] font-extrabold shadow hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                  >
                    📁 Folder
                  </button>
                  {telHref && (
                    <a
                      href={telHref}
                      className="py-2.5 px-3 rounded-xl bg-slate-800 border border-slate-700 text-emerald-300 text-[11px] font-extrabold hover:border-emerald-400"
                      title={`Call ${customer.name}`}
                    >
                      📞
                    </a>
                  )}
                </div>
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
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[10.5px] font-extrabold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2 py-0.5">
                      <span>🚗</span>
                      <span>
                        {drive.oneWayMiles.toFixed(1)} mi • ~{drive.etaMinutes} min from 2119 Barton Ave
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
                        `supply-${selectedSupplyPin.id}`,
                        selectedSupplyPin.name,
                        selectedSupplyPin.lat,
                        selectedSupplyPin.lng
                      )
                    }
                    className="flex-1 min-w-[175px] py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-95 text-white text-xs font-black uppercase tracking-wide text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>🧭</span>
                    <span>Open in Google Maps</span>
                  </a>

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
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[10.5px] font-extrabold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2 py-0.5">
                      <span>🚗</span>
                      <span>
                        {drive.oneWayMiles.toFixed(1)} mi • ~{drive.etaMinutes} min from 2119 Barton Ave
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
                    className="flex-1 min-w-[175px] py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-95 text-white text-xs font-black uppercase tracking-wide text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>🧭</span>
                    <span>Open in Google Maps</span>
                  </a>
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
          {selectedPin.kind === 'HOME' && (
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <span>🏠</span>
                  <span>{HOME_BASE.name}</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">{HOME_BASE.address}</p>
                <p className="text-[10px] text-slate-400">
                  Home dispatch origin for distance, drive-time ETAs, and background tax mileage.
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
