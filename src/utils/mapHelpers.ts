import {
  Customer,
  JobProject,
  JobMapStatus,
  RouteStopItem,
  SupplyPinCategory,
  SupplyStopPin,
  SystemConstants,
} from '../types';
import {
  getCustomerPipelineStage,
  isJobCompletedOrPaid,
  isJobScheduled,
  normalizePipelineStage,
  parseLocalDateMs,
} from './projectHelpers';
import { describeWmoCode } from './weatherService';

export const HOME_BASE = {
  id: 'home-base',
  name: 'Krueger Painting Home Base',
  shortName: 'Home Base',
  address: '2119 Barton Ave, West Bend, WI 53090',
  lat: 43.4437,
  lng: -88.1835,
} as const;

// Centered on Washington & southern Fond du Lac counties, WI
export const MAP_DEFAULT_CENTER: [number, number] = [43.475, -88.215];
export const MAP_DEFAULT_ZOOM = 10;

export const PRESET_SUPPLY_STOPS: SupplyStopPin[] = [
  {
    id: 'preset-sw-wb',
    name: 'Sherwin-Williams — West Bend',
    category: 'PAINT_STORE',
    address: '851 S Main St, West Bend, WI 53095',
    lat: 43.4180,
    lng: -88.1818,
    phone: '(262) 338-8088',
    notes: 'Sherwin-Williams paint store on S Main St, West Bend',
    isPreset: true,
  },
  {
    id: 'preset-hallman-wb',
    name: 'Hallman Lindsay — West Bend',
    category: 'PAINT_STORE',
    address: '822 S Main St, West Bend, WI 53095',
    lat: 43.4184,
    lng: -88.1830,
    phone: '(262) 338-0920',
    notes: 'Local paint counter on S Main St, West Bend',
    isPreset: true,
  },
  {
    id: 'preset-hallman-richfield',
    name: 'Hallman Lindsay — Richfield',
    category: 'PAINT_STORE',
    address: '3010 Helsan Dr, Richfield, WI 53076',
    lat: 43.2557,
    lng: -88.1984,
    phone: '(262) 628-7170',
    notes: 'Hallman Lindsay paint counter near Hwy 164 / I-41',
    isPreset: true,
  },
  {
    id: 'preset-menards-wb',
    name: 'Menards — West Bend',
    category: 'HARDWARE',
    address: '575 W Paradise Dr, West Bend, WI 53095',
    lat: 43.3976,
    lng: -88.1912,
    phone: '(262) 335-2320',
    notes: 'Hardware, sundries, caulk, tape & lumber on W Paradise Dr',
    isPreset: true,
  },
  {
    id: 'preset-fleetfarm-wb',
    name: 'Fleet Farm — West Bend',
    category: 'HARDWARE',
    address: '1637 W Washington St, West Bend, WI 53095',
    lat: 43.4264,
    lng: -88.2036,
    phone: '(262) 334-1993',
    notes: 'Hardware, drop cloths, ladders & supplies on W Washington St',
    isPreset: true,
  },
  {
    id: 'preset-sw-hartford',
    name: 'Sherwin-Williams — Hartford',
    category: 'PAINT_STORE',
    address: '1171 E Sumner St, Hartford, WI 53027',
    lat: 43.3183,
    lng: -88.3616,
    phone: '(262) 673-9310',
    notes: 'Sherwin-Williams paint store on E Sumner St / Hwy 60',
    isPreset: true,
  },
];

export interface FrequentStopChip {
  pinId: string;
  label: string;
  icon: string;
}

export const FREQUENT_SUPPLY_STOP_CHIPS: FrequentStopChip[] = [
  { pinId: 'preset-sw-wb', label: 'Sherwin-Williams WB', icon: '🎨' },
  { pinId: 'preset-hallman-wb', label: 'Hallman Lindsay WB', icon: '🎨' },
  { pinId: 'preset-hallman-richfield', label: 'Hallman Lindsay Richfield', icon: '🎨' },
  { pinId: 'preset-menards-wb', label: 'Menards WB', icon: '🔨' },
  { pinId: 'preset-fleetfarm-wb', label: 'Fleet Farm WB', icon: '🔨' },
];

export const SUPPLY_CATEGORY_META: Record<
  SupplyPinCategory,
  { label: string; shortLabel: string; icon: string; color: string; bg: string }
> = {
  PAINT_STORE: {
    label: 'Paint Counter',
    shortLabel: 'Paint',
    icon: '🎨',
    color: '#facc15',
    bg: '#422006',
  },
  GAS_STOP: {
    label: 'Gas / Kwik Trip',
    shortLabel: 'Gas',
    icon: '⛽',
    color: '#fb923c',
    bg: '#431407',
  },
  HARDWARE: {
    label: 'Hardware Store',
    shortLabel: 'Hardware',
    icon: '🔨',
    color: '#38bdf8',
    bg: '#082f49',
  },
  STORAGE: {
    label: 'Storage / Shop',
    shortLabel: 'Storage',
    icon: '📦',
    color: '#c084fc',
    bg: '#2e1065',
  },
};

export const JOB_MAP_STATUS_META: Record<
  JobMapStatus,
  { label: string; shortLabel: string; color: string; bgTint: string; textColor: string }
> = {
  UNQUOTED: {
    label: 'Leads',
    shortLabel: 'Leads',
    color: '#facc15',
    bgTint: 'rgba(250, 204, 21, 0.18)',
    textColor: '#fde047',
  },
  QUOTED: {
    label: 'Quoted',
    shortLabel: 'Quoted',
    color: '#3b82f6',
    bgTint: 'rgba(59, 130, 246, 0.18)',
    textColor: '#60a5fa',
  },
  SCHEDULED: {
    label: 'Scheduled',
    shortLabel: 'Scheduled',
    color: '#22c55e',
    bgTint: 'rgba(34, 197, 94, 0.18)',
    textColor: '#4ade80',
  },
  COMPLETED: {
    label: 'Completed',
    shortLabel: 'Completed',
    color: '#94a3b8',
    bgTint: 'rgba(148, 163, 184, 0.16)',
    textColor: '#cbd5e1',
  },
};

export interface JobFinancialSummary {
  grossTotal: number;
  totalPaid: number;
  depositTarget: number;
  depositOwed: number;
  balanceDue: number;
  moneyState: 'UNQUOTED' | 'DEPOSIT_OWED' | 'BALANCE_OWED' | 'PAID';
  moneyBadgeLabel: string;
  moneyDetailLabel: string;
}

export function computeJobFinancials(
  job: JobProject,
  constants: SystemConstants
): JobFinancialSummary {
  let laborOnly = 0;
  let computedPaintGals = 0;
  let totalSqft = 0;

  (job.rooms || []).forEach((r) => {
    laborOnly += Math.round(Number(r.r) || 0);
    if (r.og && parseFloat(r.og) > 0) {
      computedPaintGals += parseFloat(r.og);
    } else {
      const dimMatch = (r.n || '').toLowerCase().match(/(\d+)\s*[x*]\s*(\d+)/);
      if (dimMatch) {
        totalSqft += parseFloat(dimMatch[1]) * parseFloat(dimMatch[2]);
      }
    }
  });

  if (totalSqft > 0 && computedPaintGals === 0) {
    computedPaintGals = Math.ceil((totalSqft * 2) / (constants.spreadRate || 350));
  }

  let repHrs = 0;
  (job.repairs || []).forEach((rep) => {
    repHrs += parseFloat(String(rep.h)) || 0;
  });
  const repairRate = job.repairRate || constants.repairRate || 75;
  const repairLaborTotal = Math.round(repHrs * repairRate);

  const dVal = parseFloat(String(job.disc)) || 0;
  const dAmt =
    (job.discType || 'PCT') === 'PCT'
      ? Math.round(laborOnly * (dVal / 100))
      : Math.round(dVal);
  const finalLabor = Math.max(0, laborOnly - dAmt);

  const perGalPrice = Math.round(constants.paintCostPerGal || 65);
  let matCost = 0;
  if (!job.matsIncluded) {
    if (job.matVal && Number(job.matVal) > 0) {
      matCost = Math.round(Number(job.matVal));
    } else if (computedPaintGals > 0) {
      matCost = Math.round(computedPaintGals * perGalPrice);
    }
  }
  const sundriesCost = job.matsIncluded
    ? 0
    : Math.round(parseFloat(String(job.sunVal)) || 0);

  const grossTotal = Math.round(finalLabor + repairLaborTotal + matCost + sundriesCost);

  let totalPaid = 0;
  if (job.payments && job.payments.length > 0) {
    job.payments.forEach((p) => {
      totalPaid += Math.round(Number(p.amt) || 0);
    });
  } else if (job.depo > 0) {
    totalPaid = Math.round(job.depo);
  }

  const depositTarget = Math.round(grossTotal * 0.5);
  const depositOwed = Math.max(0, depositTarget - totalPaid);
  const balanceDue = Math.max(0, grossTotal - totalPaid);

  const isMarkedPaid = (job.status || '').trim().toUpperCase() === 'PAID';

  if (grossTotal <= 0) {
    return {
      grossTotal: 0,
      totalPaid,
      depositTarget: 0,
      depositOwed: 0,
      balanceDue: 0,
      moneyState: 'UNQUOTED',
      moneyBadgeLabel: 'Unquoted',
      moneyDetailLabel: 'No quote priced yet',
    };
  }

  if (balanceDue <= 0 || isMarkedPaid) {
    return {
      grossTotal,
      totalPaid: isMarkedPaid ? Math.max(totalPaid, grossTotal) : totalPaid,
      depositTarget,
      depositOwed: 0,
      balanceDue: 0,
      moneyState: 'PAID',
      moneyBadgeLabel: 'Paid',
      moneyDetailLabel: 'Paid in full',
    };
  }

  const jobIsCompleted = isJobCompletedOrPaid(job.status);
  if (!jobIsCompleted && depositOwed > 0) {
    return {
      grossTotal,
      totalPaid,
      depositTarget,
      depositOwed,
      balanceDue,
      moneyState: 'DEPOSIT_OWED',
      moneyBadgeLabel: `50% Dep`,
      moneyDetailLabel: `50% Deposit Owed ($${depositOwed.toLocaleString()})`,
    };
  }

  return {
    grossTotal,
    totalPaid,
    depositTarget,
    depositOwed: 0,
    balanceDue,
    moneyState: 'BALANCE_OWED',
    moneyBadgeLabel: `Bal $${balanceDue.toLocaleString()}`,
    moneyDetailLabel: `Final Balance Owed ($${balanceDue.toLocaleString()})`,
  };
}

export interface CustomerMapSummary {
  customer: Customer;
  mapStatus: JobMapStatus;
  isActiveInProgress: boolean;
  isExteriorJob: boolean;
  primaryJob: JobProject | null;
  financials: JobFinancialSummary;
  scopeSummary: string;
  schedDate: string;
}

const EXTERIOR_JOB_REGEX =
  /\b(ext(erior)?|deck(s|ing)?|siding|porch|fence|fascia|soffit|stucco|cedar|stain(ing|ed)?|power\s*wash|pressure\s*wash|outdoor|patio|railing|shutters|gable|eaves|garage\s*door|house\s*wash)\b/i;

export function isCustomerExteriorOrDeckJob(customer: Customer): boolean {
  const textParts: string[] = [];
  if (customer.notes) textParts.push(customer.notes);
  (customer.jobs || []).forEach((job) => {
    if (job.title) textParts.push(job.title);
    if (job.scope) textParts.push(job.scope);
    if (job.prepScope) textParts.push(job.prepScope);
    if (job.internalNotes) textParts.push(job.internalNotes);
    (job.rooms || []).forEach((r) => {
      if (r.n) textParts.push(r.n);
      if (r.prod) textParts.push(r.prod);
      if (r.prep && r.prep.length > 0) textParts.push(r.prep.join(' '));
    });
    (job.repairs || []).forEach((rep) => {
      if (rep.d) textParts.push(rep.d);
    });
  });
  return EXTERIOR_JOB_REGEX.test(textParts.join(' '));
}

export function getCustomerMapSummary(
  customer: Customer,
  constants: SystemConstants
): CustomerMapSummary {
  const jobs = customer.jobs || [];
  const stage = getCustomerPipelineStage(customer);

  // Pick the most relevant primary job to display in the pin card
  const primaryJob: JobProject | null =
    jobs.find((j) => normalizePipelineStage(j.status) === 'ACTIVE') ||
    jobs
      .filter((j) => isJobScheduled(j))
      .sort((a, b) => {
        const msA = parseLocalDateMs(a.schedDate) ?? Number.MAX_SAFE_INTEGER;
        const msB = parseLocalDateMs(b.schedDate) ?? Number.MAX_SAFE_INTEGER;
        return msA - msB;
      })[0] ||
    jobs.find((j) => normalizePipelineStage(j.status) === 'PENDING') ||
    jobs[0] ||
    null;

  const financials: JobFinancialSummary = primaryJob
    ? computeJobFinancials(primaryJob, constants)
    : {
        grossTotal: 0,
        totalPaid: 0,
        depositTarget: 0,
        depositOwed: 0,
        balanceDue: 0,
        moneyState: 'UNQUOTED',
        moneyBadgeLabel: 'Unquoted',
        moneyDetailLabel: 'No estimate created yet',
      };

  const isActiveInProgress =
    stage === 'ACTIVE' || jobs.some((j) => normalizePipelineStage(j.status) === 'ACTIVE');

  let mapStatus: JobMapStatus;
  if (stage === 'COMPLETED') {
    mapStatus = 'COMPLETED';
  } else if (stage === 'SCHEDULED' || stage === 'ACTIVE') {
    mapStatus = 'SCHEDULED';
  } else if (!primaryJob || financials.grossTotal <= 0) {
    mapStatus = 'UNQUOTED';
  } else {
    mapStatus = 'QUOTED';
  }

  // Build concise human-readable scope summary
  let scopeSummary = '';
  if (primaryJob) {
    const parts: string[] = [];
    if (primaryJob.title?.trim()) parts.push(primaryJob.title.trim());
    const roomNames = (primaryJob.rooms || [])
      .map((r) => r.n?.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (roomNames.length > 0) {
      const moreCount = (primaryJob.rooms || []).length - roomNames.length;
      parts.push(
        `${roomNames.join(', ')}${moreCount > 0 ? ` +${moreCount} more` : ''}`
      );
    }
    if (primaryJob.scope?.trim()) {
      parts.push(primaryJob.scope.trim().replace(/\s+/g, ' ').slice(0, 110));
    }
    scopeSummary = parts.join(' • ');
  }
  if (!scopeSummary) {
    scopeSummary = customer.notes?.trim()
      ? customer.notes.trim().replace(/\s+/g, ' ').slice(0, 110)
      : 'No scope details logged yet';
  }

  return {
    customer,
    mapStatus,
    isActiveInProgress,
    isExteriorJob: isCustomerExteriorOrDeckJob(customer),
    primaryJob,
    financials,
    scopeSummary,
    schedDate: primaryJob?.schedDate || '',
  };
}

// Local Washington, Fond du Lac, Ozaukee, Waukesha & Dodge County WI town lookup for offline/partial-address fallback
const WI_TOWN_COORDS: Record<string, [number, number]> = {
  'west bend': [43.4253, -88.1834],
  barton: [43.4422, -88.1842],
  campbellsport: [43.6067, -88.2773],
  kewaskum: [43.5197, -88.2273],
  hartford: [43.3178, -88.3787],
  slinger: [43.3328, -88.2848],
  jackson: [43.3247, -88.1695],
  richfield: [43.2589, -88.1981],
  germantown: [43.2314, -88.1101],
  hubertus: [43.2261, -88.2254],
  colgate: [43.1847, -88.2140],
  allenton: [43.4167, -88.3429],
  newburg: [43.4281, -88.0468],
  cedarburg: [43.2967, -87.9876],
  grafton: [43.3197, -87.9534],
  mequon: [43.2364, -87.9845],
  'port washington': [43.3872, -87.8756],
  saukville: [43.3831, -87.9479],
  fredonia: [43.4694, -87.9479],
  'fond du lac': [43.7730, -88.4471],
  eden: [43.6947, -88.3612],
  lomira: [43.5919, -88.4459],
  mayville: [43.4956, -88.5457],
  theresa: [43.5169, -88.4501],
  oakfield: [43.6889, -88.5473],
  'menomonee falls': [43.1789, -88.1173],
  sussex: [43.1333, -88.2209],
  lisbon: [43.1536, -88.2587],
  pewaukee: [43.0806, -88.2623],
  waukesha: [43.0117, -88.2315],
  milwaukee: [43.0389, -87.9065],
};

function deterministicOffset(seed: string | number): [number, number] {
  const str = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const latOff = (((hash & 0xff) / 255) - 0.5) * 0.018;
  const lngOff = ((((hash >>> 8) & 0xff) / 255) - 0.5) * 0.022;
  return [latOff, lngOff];
}

export function resolveApproxWisconsinCoords(
  address: string,
  seedId: string | number
): { lat: number; lng: number; isApprox: boolean } {
  const lower = (address || '').toLowerCase();
  const [dLat, dLng] = deterministicOffset(seedId);

  for (const [town, [tLat, tLng]] of Object.entries(WI_TOWN_COORDS)) {
    if (lower.includes(town)) {
      return { lat: tLat + dLat, lng: tLng + dLng, isApprox: true };
    }
  }

  return {
    lat: 43.435 + dLat * 2.2,
    lng: -88.195 + dLng * 2.2,
    isApprox: true,
  };
}

const GEO_CACHE_KEY = 'KMaster_GeoCache_v1';

function readGeoCache(): Record<string, { lat: number; lng: number }> {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function writeGeoCacheEntry(normalizedAddr: string, lat: number, lng: number) {
  try {
    const cache = readGeoCache();
    cache[normalizedAddr] = { lat, lng };
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore storage quota
  }
}

export async function geocodeAddressWithNominatim(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const cleaned = (address || '').trim();
  if (!cleaned || cleaned.length < 4) return null;

  const normKey = cleaned.toLowerCase().replace(/\s+/g, ' ');
  const cached = readGeoCache()[normKey];
  if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) {
    return cached;
  }

  const hasState = /\b(wi|wisconsin|il|illinois|mn|minnesota|mi|michigan)\b/i.test(cleaned);
  const query = hasState ? cleaned : `${cleaned}, WI`;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        writeGeoCacheEntry(normKey, lat, lng);
        return { lat, lng };
      }
    }
  } catch {
    // Offline or rate-limited
  }
  return null;
}

// Viewbox biasing Nominatim toward Washington, Fond du Lac, Ozaukee, and Waukesha counties, WI
// Format: left (west), top (north), right (east), bottom (south)
export const WI_SERVICE_VIEWBOX = '-88.68,43.90,-87.78,42.90';

export interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  source: 'NOMINATIM' | 'CUSTOMER' | 'SUPPLY';
  refId?: string | number;
  subtitle?: string;
}

function formatNominatimResult(item: any): PlaceSearchResult | null {
  const lat = parseFloat(item?.lat);
  const lng = parseFloat(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const addr = item?.address || {};
  const houseRoad = [addr.house_number, addr.road].filter(Boolean).join(' ').trim();
  const city =
    addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.municipality || '';
  const state = addr.state === 'Wisconsin' ? 'WI' : addr.state || '';
  const postcode = addr.postcode || '';

  const cityStateZip = [city, [state, postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const primaryName =
    (typeof item?.name === 'string' && item.name.trim()) ||
    houseRoad ||
    (typeof item?.display_name === 'string' ? item.display_name.split(',')[0].trim() : 'Location');

  const compactAddress =
    [houseRoad, cityStateZip].filter(Boolean).join(', ') ||
    (typeof item?.display_name === 'string'
      ? item.display_name
          .split(',')
          .slice(0, 4)
          .map((s: string) => s.trim())
          .join(', ')
      : `${lat.toFixed(4)}, ${lng.toFixed(4)}`);

  return {
    id: `nom-${item.place_id || `${lat.toFixed(4)},${lng.toFixed(4)}`}`,
    name: primaryName,
    address: compactAddress,
    lat,
    lng,
    source: 'NOMINATIM',
    subtitle: item?.type ? String(item.type).replace(/_/g, ' ') : undefined,
  };
}

export async function searchPlacesWithNominatim(
  rawQuery: string,
  signal?: AbortSignal
): Promise<PlaceSearchResult[]> {
  const cleaned = (rawQuery || '').trim();
  if (cleaned.length < 2) return [];

  const hasState = /\b(wi|wisconsin|il|illinois|mn|minnesota|mi|michigan)\b/i.test(cleaned);
  const query = hasState ? cleaned : `${cleaned}, WI`;

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=4&countrycodes=us` +
      `&viewbox=${encodeURIComponent(WI_SERVICE_VIEWBOX)}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const results: PlaceSearchResult[] = [];
    for (const item of data) {
      const formatted = formatNominatimResult(item);
      if (formatted) results.push(formatted);
    }
    return results.slice(0, 4);
  } catch {
    return [];
  }
}

export interface PinWeatherSummary {
  tempF: number;
  windMph: number;
  gustsMph: number;
  rainChancePct: number;
  conditionLabel: string;
  paintBadge: string;
  paintTone: 'ok' | 'warn' | 'bad';
  fetchedAt: number;
}

const pinWeatherCache = new Map<string, PinWeatherSummary>();
const WEATHER_TTL_MS = 15 * 60 * 1000;

export async function fetchPinWeatherSummary(
  lat: number,
  lng: number
): Promise<PinWeatherSummary | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = pinWeatherCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < WEATHER_TTL_MS) {
    return cached;
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=temperature_2m,wind_speed_10m,wind_gusts_10m,weather_code,precipitation` +
      `&hourly=precipitation_probability&forecast_days=1&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data?.current;
    if (!cur) return null;

    const tempF = Math.round(Number(cur.temperature_2m ?? 0));
    const windMph = Math.round(Number(cur.wind_speed_10m ?? 0));
    const gustsMph = Math.round(Number(cur.wind_gusts_10m ?? windMph));
    const weatherCode = Number(cur.weather_code ?? 0);
    const curPrecip = Number(cur.precipitation ?? 0);

    // Match current local hour index in hourly.precipitation_probability
    let rainChancePct = 0;
    const hourlyTimes: string[] = data?.hourly?.time || [];
    const hourlyProbs: number[] = data?.hourly?.precipitation_probability || [];
    if (hourlyProbs.length > 0) {
      const curTimePrefix = typeof cur.time === 'string' ? cur.time.slice(0, 13) : '';
      let idx = curTimePrefix
        ? hourlyTimes.findIndex((t) => typeof t === 'string' && t.startsWith(curTimePrefix))
        : -1;
      if (idx < 0) idx = Math.min(new Date().getHours(), hourlyProbs.length - 1);
      // Take max rain probability across current + next 2 hours for practical painting planning
      const slice = hourlyProbs.slice(idx, idx + 3).map((v) => Number(v) || 0);
      rainChancePct = Math.round(Math.max(...slice, 0));
    }

    const conditionLabel = describeWmoCode(weatherCode);

    let paintBadge = 'Good Exterior';
    let paintTone: 'ok' | 'warn' | 'bad' = 'ok';
    if (curPrecip > 0 || rainChancePct >= 50 || tempF < 40 || windMph >= 22) {
      paintBadge = tempF < 40 ? 'Too Cold (Ext)' : curPrecip > 0 || rainChancePct >= 50 ? 'Rain Risk' : 'High Wind';
      paintTone = 'bad';
    } else if (rainChancePct >= 25 || tempF < 50 || windMph >= 15 || gustsMph >= 22) {
      paintBadge = 'Watch Wind/Rain';
      paintTone = 'warn';
    }

    const summary: PinWeatherSummary = {
      tempF,
      windMph,
      gustsMph,
      rainChancePct,
      conditionLabel,
      paintBadge,
      paintTone,
      fetchedAt: Date.now(),
    };

    pinWeatherCache.set(key, summary);
    return summary;
  } catch {
    return null;
  }
}

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.7613;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface RouteOriginPoint {
  lat: number;
  lng: number;
  label: string;
  address?: string;
  isGps?: boolean;
}

export interface RouteMileageEstimate {
  oneWayMiles: number;
  roundTripMiles: number;
  estDriveMinutes: number;
  isRoadGeometry: boolean;
  geometryLatLngs: [number, number][];
}

const WI_ROAD_FACTOR = 1.24;

function resolveOriginPoint(origin?: RouteOriginPoint | null): RouteOriginPoint {
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    return origin;
  }
  return {
    lat: HOME_BASE.lat,
    lng: HOME_BASE.lng,
    label: HOME_BASE.name,
    address: HOME_BASE.address,
    isGps: false,
  };
}

export function estimateFallbackRoute(
  stops: RouteStopItem[],
  returnToOrigin: boolean,
  origin?: RouteOriginPoint | null
): RouteMileageEstimate {
  if (stops.length === 0) {
    return {
      oneWayMiles: 0,
      roundTripMiles: 0,
      estDriveMinutes: 0,
      isRoadGeometry: false,
      geometryLatLngs: [],
    };
  }

  const start = resolveOriginPoint(origin);
  const legs: [number, number][] = [
    [start.lat, start.lng],
    ...stops.map((s): [number, number] => [s.lat, s.lng]),
  ];

  let oneWay = 0;
  for (let i = 0; i < legs.length - 1; i++) {
    oneWay += haversineMiles(legs[i][0], legs[i][1], legs[i + 1][0], legs[i + 1][1]) * WI_ROAD_FACTOR;
  }

  const last = legs[legs.length - 1];
  const returnLeg =
    haversineMiles(last[0], last[1], start.lat, start.lng) * WI_ROAD_FACTOR;
  const roundTrip = oneWay + returnLeg;
  const activeMiles = returnToOrigin ? roundTrip : oneWay;

  const geometryLatLngs: [number, number][] = returnToOrigin
    ? [...legs, [start.lat, start.lng]]
    : legs;

  return {
    oneWayMiles: Math.round(oneWay * 10) / 10,
    roundTripMiles: Math.round(roundTrip * 10) / 10,
    estDriveMinutes: Math.max(1, Math.round((activeMiles / 36) * 60)),
    isRoadGeometry: false,
    geometryLatLngs,
  };
}

export async function fetchOsrmRoadRoute(
  stops: RouteStopItem[],
  returnToOrigin: boolean,
  origin?: RouteOriginPoint | null
): Promise<RouteMileageEstimate | null> {
  if (stops.length === 0) return null;

  const start = resolveOriginPoint(origin);
  const points: [number, number][] = [
    [start.lat, start.lng],
    ...stops.map((s): [number, number] => [s.lat, s.lng]),
    [start.lat, start.lng],
  ];

  const coordStr = points.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || !route.geometry?.coordinates) return null;

    const legs: Array<{ distance: number; duration: number }> = route.legs || [];
    const totalMeters = Number(route.distance || 0);
    const totalSec = Number(route.duration || 0);

    const lastLegMeters = legs.length > 0 ? Number(legs[legs.length - 1].distance || 0) : 0;
    const lastLegSec = legs.length > 0 ? Number(legs[legs.length - 1].duration || 0) : 0;

    const roundTripMiles = Math.round((totalMeters / 1609.344) * 10) / 10;
    const oneWayMiles = Math.round(((totalMeters - lastLegMeters) / 1609.344) * 10) / 10;

    // If not returning to origin, fetch one-way geometry cleanly
    let geometryLatLngs: [number, number][] = (route.geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => [lat, lng]
    );
    let activeSec = totalSec;

    if (!returnToOrigin) {
      activeSec = Math.max(60, totalSec - lastLegSec);
      const oneWayCoordStr = points
        .slice(0, -1)
        .map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`)
        .join(';');
      try {
        const resOneWay = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${oneWayCoordStr}?overview=full&geometries=geojson`
        );
        if (resOneWay.ok) {
          const owData = await resOneWay.json();
          const owCoords = owData?.routes?.[0]?.geometry?.coordinates;
          if (Array.isArray(owCoords)) {
            geometryLatLngs = owCoords.map(([lng, lat]: [number, number]) => [lat, lng]);
          }
        }
      } catch {
        // keep full geometry if secondary call fails
      }
    }

    return {
      oneWayMiles,
      roundTripMiles,
      estDriveMinutes: Math.max(1, Math.round(activeSec / 60)),
      isRoadGeometry: true,
      geometryLatLngs,
    };
  } catch {
    return null;
  }
}

function computeSequenceMiles(
  indices: number[],
  distFromBase: number[],
  distMatrix: number[][],
  returnToBase: boolean
): number {
  if (indices.length === 0) return 0;
  let total = distFromBase[indices[0]];
  for (let i = 0; i < indices.length - 1; i++) {
    total += distMatrix[indices[i]][indices[i + 1]];
  }
  if (returnToBase) {
    total += distFromBase[indices[indices.length - 1]];
  }
  return total;
}

/**
 * Reorders stops into the shortest driving sequence starting from Home Base
 * (`2119 Barton Ave, West Bend, WI 53090`) and optionally returning to Home Base.
 * Uses exact branch-and-bound for up to 9 stops, and nearest-neighbor + 2-opt for larger lists.
 */
export function optimizeRouteStops(
  stops: RouteStopItem[],
  returnToBase = true
): RouteStopItem[] {
  const n = stops.length;
  if (n <= 1) return [...stops];

  // Precompute pairwise distances and distance from Home Base
  const distFromBase = stops.map((s) =>
    haversineMiles(HOME_BASE.lat, HOME_BASE.lng, s.lat, s.lng)
  );
  const distMatrix: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i === j ? 0 : haversineMiles(stops[i].lat, stops[i].lng, stops[j].lat, stops[j].lng)
    )
  );

  // 1. Nearest-neighbor seed from Home Base
  const visitedSeed = new Array<boolean>(n).fill(false);
  let bestOrder: number[] = [];
  let lastIdx = -1;
  for (let step = 0; step < n; step++) {
    let pick = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (visitedSeed[i]) continue;
      const d = lastIdx === -1 ? distFromBase[i] : distMatrix[lastIdx][i];
      if (d < bestD) {
        bestD = d;
        pick = i;
      }
    }
    visitedSeed[pick] = true;
    bestOrder.push(pick);
    lastIdx = pick;
  }

  let bestCost = computeSequenceMiles(bestOrder, distFromBase, distMatrix, returnToBase);

  // 2. For <= 9 stops, exact DFS branch-and-bound guarantees the globally shortest loop/route
  if (n <= 9) {
    const used = new Array<boolean>(n).fill(false);
    const current: number[] = [];

    const dfs = (depth: number, prev: number, costSoFar: number) => {
      if (costSoFar >= bestCost - 1e-6) return;
      if (depth === n) {
        const finalCost = returnToBase ? costSoFar + distFromBase[prev] : costSoFar;
        if (finalCost < bestCost - 1e-6) {
          bestCost = finalCost;
          bestOrder = [...current];
        }
        return;
      }
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        const stepCost = depth === 0 ? distFromBase[i] : distMatrix[prev][i];
        if (costSoFar + stepCost >= bestCost - 1e-6) continue;
        used[i] = true;
        current.push(i);
        dfs(depth + 1, i, costSoFar + stepCost);
        current.pop();
        used[i] = false;
      }
    };

    dfs(0, -1, 0);
    return bestOrder.map((idx) => stops[idx]);
  }

  // 3. For > 9 stops, run 2-opt local improvement swaps
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidate = [
          ...bestOrder.slice(0, i),
          ...bestOrder.slice(i, j + 1).reverse(),
          ...bestOrder.slice(j + 1),
        ];
        const candCost = computeSequenceMiles(candidate, distFromBase, distMatrix, returnToBase);
        if (candCost < bestCost - 1e-6) {
          bestOrder = candidate;
          bestCost = candCost;
          improved = true;
        }
      }
    }
  }

  return bestOrder.map((idx) => stops[idx]);
}

function stopToMapsQuery(stop: RouteStopItem): string {
  const addr = (stop.address || '').trim();
  if (addr.length >= 6) return addr;
  return `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
}

/**
 * Generates an official Google Maps multi-stop driving URL starting from either
 * the user's current GPS location or Home Base (`2119 Barton Ave, West Bend, WI 53090`),
 * compatible with Android/iOS Google Maps apps and web.
 */
export function buildGoogleMapsMultiStopUrl(
  stops: RouteStopItem[],
  returnToOrigin = true,
  origin?: RouteOriginPoint | null
): string {
  const start = resolveOriginPoint(origin);
  const originStr =
    !start.isGps && start.address?.trim()
      ? start.address.trim()
      : `${start.lat.toFixed(5)},${start.lng.toFixed(5)}`;
  const encodedOrigin = encodeURIComponent(originStr);

  if (stops.length === 0) {
    return `https://www.google.com/maps/search/?api=1&query=${encodedOrigin}`;
  }

  if (returnToOrigin) {
    const waypoints = stops.map((s) => encodeURIComponent(stopToMapsQuery(s))).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${encodedOrigin}&waypoints=${waypoints}&travelmode=driving`;
  }

  const destination = encodeURIComponent(stopToMapsQuery(stops[stops.length - 1]));
  const midStops = stops.slice(0, -1);
  const waypointsParam =
    midStops.length > 0
      ? `&waypoints=${midStops.map((s) => encodeURIComponent(stopToMapsQuery(s))).join('|')}`
      : '';

  return `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${destination}${waypointsParam}&travelmode=driving`;
}

export interface DriveFromBaseEstimate {
  oneWayMiles: number;
  roundTripMiles: number;
  etaMinutes: number;
  isRoadData: boolean;
}

const driveBetweenCache = new Map<string, DriveFromBaseEstimate>();

export function estimateDriveBetween(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): DriveFromBaseEstimate {
  const straight = haversineMiles(fromLat, fromLng, toLat, toLng);
  const oneWay = Math.max(0.1, Math.round(straight * WI_ROAD_FACTOR * 10) / 10);
  const roundTrip = Math.round(oneWay * 2 * 10) / 10;
  const etaMinutes = Math.max(1, Math.round((oneWay / 36) * 60));
  return {
    oneWayMiles: oneWay,
    roundTripMiles: roundTrip,
    etaMinutes,
    isRoadData: false,
  };
}

export async function fetchDriveBetween(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<DriveFromBaseEstimate> {
  const key = `${fromLat.toFixed(3)},${fromLng.toFixed(3)}->${toLat.toFixed(4)},${toLng.toFixed(4)}`;
  const cached = driveBetweenCache.get(key);
  if (cached) return cached;

  const fallback = estimateDriveBetween(fromLat, fromLng, toLat, toLng);
  try {
    const coords = `${fromLng.toFixed(5)},${fromLat.toFixed(5)};${toLng.toFixed(5)},${toLat.toFixed(5)}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return fallback;

    const oneWayMiles = Math.max(
      0.1,
      Math.round((Number(route.distance || 0) / 1609.344) * 10) / 10
    );
    const etaMinutes = Math.max(1, Math.round(Number(route.duration || 0) / 60));
    const result: DriveFromBaseEstimate = {
      oneWayMiles,
      roundTripMiles: Math.round(oneWayMiles * 2 * 10) / 10,
      etaMinutes,
      isRoadData: true,
    };
    driveBetweenCache.set(key, result);
    return result;
  } catch {
    return fallback;
  }
}

export function estimateDriveFromBase(lat: number, lng: number): DriveFromBaseEstimate {
  return estimateDriveBetween(HOME_BASE.lat, HOME_BASE.lng, lat, lng);
}

export async function fetchDriveFromBase(
  lat: number,
  lng: number
): Promise<DriveFromBaseEstimate> {
  return fetchDriveBetween(HOME_BASE.lat, HOME_BASE.lng, lat, lng);
}

export interface NearbyStorePreset {
  id: 'sherwin' | 'menards' | 'homedepot' | 'hardware';
  label: string;
  query: string;
  icon: string;
}

export const NEAREST_STORE_PRESETS: NearbyStorePreset[] = [
  { id: 'sherwin', label: 'Sherwin-Williams', query: 'Sherwin-Williams', icon: '🎨' },
  { id: 'menards', label: 'Menards', query: 'Menards', icon: '🛒' },
  { id: 'homedepot', label: 'Home Depot', query: 'Home Depot', icon: '🔨' },
  { id: 'hardware', label: 'Hardware', query: 'Hardware', icon: '🧰' },
];

export interface NearbyStoreResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  phone?: string;
  categoryLabel: string;
  source: 'OVERPASS' | 'NOMINATIM';
}

function escapeOverpassRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&').trim();
}

function formatOsmTagsAddress(tags: Record<string, string | undefined>): string {
  const streetLine = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ').trim();
  const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || '';
  const state = tags['addr:state'] || (city ? 'WI' : '');
  const zip = tags['addr:postcode'] || '';
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ').trim();

  if (streetLine && cityStateZip) return `${streetLine}, ${cityStateZip}`;
  if (streetLine) return `${streetLine}, WI`;
  if (cityStateZip) return cityStateZip;
  if (tags['addr:full']) return tags['addr:full'];
  return 'Wisconsin';
}

function buildOverpassStoreQuery(
  rawQuery: string,
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): string {
  const q = rawQuery.trim().toLowerCase();
  const around = `(around:${Math.round(radiusMeters)},${centerLat.toFixed(5)},${centerLng.toFixed(5)})`;

  let clauses = '';
  if (q.includes('sherwin')) {
    clauses = `
      nwr["name"~"Sherwin[- ]?Williams",i]${around};
      nwr["brand"~"Sherwin[- ]?Williams",i]${around};
    `;
  } else if (q.includes('menards')) {
    clauses = `
      nwr["name"~"Menards",i]${around};
      nwr["brand"~"Menards",i]${around};
    `;
  } else if (q.includes('home depot')) {
    clauses = `
      nwr["name"~"Home Depot",i]${around};
      nwr["brand"~"Home Depot",i]${around};
    `;
  } else if (q === 'hardware' || q === 'hardware store' || q === 'paint') {
    clauses = `
      nwr["shop"~"hardware|paint|doityourself",i]${around};
      nwr["name"~"Ace Hardware|True Value|Fleet Farm|Hardware|Paint|Lowe'?s|Menards|Home Depot|Sherwin",i]${around};
    `;
  } else {
    const escaped = escapeOverpassRegex(rawQuery);
    clauses = `
      nwr["name"~"${escaped}",i]${around};
      nwr["brand"~"${escaped}",i]${around};
    `;
  }

  return `[out:json][timeout:12];(${clauses});out center tags 40;`;
}

function dedupeAndSortStores(
  items: NearbyStoreResult[],
  maxRadiusMiles: number
): NearbyStoreResult[] {
  const sorted = items
    .filter((item) => item.distanceMiles <= maxRadiusMiles + 0.25)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  const deduped: NearbyStoreResult[] = [];
  for (const item of sorted) {
    const isDuplicate = deduped.some(
      (existing) =>
        haversineMiles(existing.lat, existing.lng, item.lat, item.lng) < 0.08
    );
    if (!isDuplicate) {
      deduped.push(item);
    }
    if (deduped.length >= 16) break;
  }
  return deduped;
}

/**
 * Queries the free OpenStreetMap Overpass API within a 25-mile radius of the
 * provided center point (live GPS or Home Base), falling back to a bounded
 * Nominatim local search if Overpass returns empty or times out.
 * Results are deduplicated and sorted closest-to-farthest.
 */
export async function searchNearestStoresOverpass(
  rawQuery: string,
  centerLat: number,
  centerLng: number,
  radiusMiles = 25,
  signal?: AbortSignal
): Promise<NearbyStoreResult[]> {
  const trimmed = rawQuery.trim();
  if (trimmed.length < 2) return [];

  const radiusMeters = Math.round(radiusMiles * 1609.344);
  const overpassQuery = buildOverpassStoreQuery(trimmed, centerLat, centerLng, radiusMeters);

  // 1. Try OpenStreetMap Overpass API first
  try {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 11000);
    const onParentAbort = () => timeoutController.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return [];
      }
      signal.addEventListener('abort', onParentAbort, { once: true });
    }

    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      signal: timeoutController.signal,
    });

    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onParentAbort);

    if (res.ok) {
      const data = await res.json();
      const elements: Array<{
        type: string;
        id: number;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string | undefined>;
      }> = Array.isArray(data?.elements) ? data.elements : [];

      const parsed: NearbyStoreResult[] = [];
      for (const el of elements) {
        const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
        const lng = typeof el.lon === 'number' ? el.lon : el.center?.lon;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const tags = el.tags || {};
        const name = (tags.name || tags.brand || trimmed).trim();
        const address = formatOsmTagsAddress(tags);
        const distanceMiles =
          Math.round(haversineMiles(centerLat, centerLng, lat, lng) * 10) / 10;

        parsed.push({
          id: `osm-${el.type}-${el.id}`,
          name,
          address,
          lat,
          lng,
          distanceMiles,
          phone: tags.phone || tags['contact:phone'],
          categoryLabel: tags.shop
            ? tags.shop.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            : 'Nearby Store',
          source: 'OVERPASS',
        });
      }

      const cleaned = dedupeAndSortStores(parsed, radiusMiles);
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  } catch {
    // Fall through to Nominatim local fallback
  }

  if (signal?.aborted) return [];

  // 2. Fallback: Bounded Nominatim local search (~25-mile viewbox around center)
  try {
    const latDelta = radiusMiles / 69.0;
    const lngDelta = radiusMiles / (69.0 * Math.max(0.3, Math.cos((centerLat * Math.PI) / 180)));
    const left = (centerLng - lngDelta).toFixed(4);
    const right = (centerLng + lngDelta).toFixed(4);
    const top = (centerLat + latDelta).toFixed(4);
    const bottom = (centerLat - latDelta).toFixed(4);

    const searchPhrase =
      trimmed.toLowerCase() === 'hardware' ? 'hardware store' : trimmed;
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=12&addressdetails=1` +
      `&countrycodes=us&viewbox=${left},${top},${right},${bottom}&bounded=1&q=${encodeURIComponent(
        searchPhrase
      )}`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const fallbackResults: NearbyStoreResult[] = [];
    for (const item of data) {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const addr = item.address || {};
      const streetLine = [addr.house_number, addr.road].filter(Boolean).join(' ').trim();
      const city = addr.city || addr.town || addr.village || '';
      const state = addr.state === 'Wisconsin' ? 'WI' : addr.state || 'WI';
      const zip = addr.postcode || '';
      const cleanAddress = streetLine
        ? [streetLine, city, `${state} ${zip}`.trim()].filter(Boolean).join(', ')
        : String(item.display_name || '')
            .split(',')
            .slice(0, 3)
            .map((p: string) => p.trim())
            .filter(Boolean)
            .join(', ');

      const name =
        (item.name && String(item.name).trim()) ||
        String(item.display_name || trimmed).split(',')[0].trim();

      const distanceMiles =
        Math.round(haversineMiles(centerLat, centerLng, lat, lng) * 10) / 10;

      fallbackResults.push({
        id: `nom-store-${item.place_id || `${lat.toFixed(4)}-${lng.toFixed(4)}`}`,
        name,
        address: cleanAddress || 'Wisconsin',
        lat,
        lng,
        distanceMiles,
        categoryLabel: 'Nearby Store',
        source: 'NOMINATIM',
      });
    }

    return dedupeAndSortStores(fallbackResults, radiusMiles);
  } catch {
    return [];
  }
}

export function buildSingleStopMapsUrl(address: string, lat: number, lng: number): string {
  const dest = encodeURIComponent(
    address?.trim() ? address.trim() : `${lat.toFixed(5)},${lng.toFixed(5)}`
  );
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

export function sanitizeTelHref(phone?: string): string {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

export function sanitizeSmsHref(phone?: string): string {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return digits ? `sms:${digits}` : '';
}

