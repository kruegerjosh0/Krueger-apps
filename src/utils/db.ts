import {
  Customer,
  FieldNote,
  MileageEntry,
  ExpenseEntry,
  ShoppingItem,
  PriceBookItem,
  WebPhoto,
  SystemConstants,
  PrintSettings,
  LocationInfo,
} from '../types';

const DB_NAME = 'KruegerOS_OfflineDB_v2';
const STORE_NAME = 'store';

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  hdr: 'N630 Moraine Dr., Campbellsport, WI 53010 | (262) 443-1199',
  motto: 'Precision & Quality',
  t1: 'Krueger Painting uses high-quality coatings and prep work for lasting finishes. Standard projects include full two-coat application.',
  t2: 'A 50% deposit is requested on the first day to initiate work. The remaining balance is due upon physical completion.',
  t3: 'Final color selections must be provided by the homeowner before the start date. Assistance available upon request.',
  t4: 'Warranty excludes damage caused by structural settling or moisture issues. Unforeseen issues will be discussed immediately.',
};

export const DEFAULT_SYSTEM_CONSTANTS: SystemConstants = {
  spreadRate: 350,
  repairRate: 75,
  irsRate: 0.67,
  paintCostPerGal: 65,
};

export const DEFAULT_STARTER_CUSTOMERS: Customer[] = [
  {
    id: 1710000001,
    name: 'John & Sarah Miller',
    phone: '(262) 443-1199',
    email: 'miller.westbend@gmail.com',
    address: '1425 Main St, West Bend, WI 53095',
    notes: 'Gate code 4192. Golden retriever is friendly. Homeowner prefers Sherwin-Williams Emerald Satin.',
    statusOverride: 'SCHEDULED',
    files: [],
    lastActive: Date.now(),
    lat: 43.4253,
    lng: -88.1834,
    jobs: [
      {
        id: 201,
        title: 'Interior Main Floor & Kitchen Repaint',
        date: new Date().toISOString().split('T')[0],
        status: 'SCHEDULED',
        showLaborTotal: true,
        showOverallTotal: true,
        matsIncluded: false,
        paintRate: '65',
        repairRate: 75,
        disc: 0,
        discType: 'PCT',
        discLabel: 'Discount',
        matVal: 285,
        sunVal: 45,
        depo: 500,
        payments: [],
        rtMiles: 12,
        workDays: 3,
        schedDate: new Date().toISOString().split('T')[0],
        schedEndDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        prepScope: 'Fill nail holes, sand drywall patches smooth, spot prime with PVA primer, caulk window casings.',
        scope: 'Apply 2 full coats Sherwin-Williams Emerald latex satin on all walls and ceilings.',
        rooms: [
          { n: 'Living Room 16x20', r: 950, og: '4', prod: 'Emerald', sheen: 'Satin', color: 'SW 7015 Repose Gray', sp: true },
          { n: 'Kitchen & Dining 14x18', r: 750, og: '3', prod: 'Emerald', sheen: 'Satin', color: 'SW 7015 Repose Gray', sp: true },
          { n: 'Entryway & Hallway', r: 450, og: '2', prod: 'Emerald', sheen: 'Semi-Gloss', color: 'SW 7005 Pure White', sp: true },
        ],
        repairs: [
          { d: 'Repair drywall crack over archway & sand flush', h: 2 },
          { d: 'Scrape and feather patch peeling paint near patio door', h: 1 },
        ],
      },
    ],
  },
  {
    id: 1710000002,
    name: 'Robert & Linda Hansen',
    phone: '(262) 338-8920',
    email: 'hansen.cedarburg@outlook.com',
    address: 'W64 N721 Washington Ave, Cedarburg, WI 53012',
    notes: 'Exterior repaint scheduled for mid-summer. Call 24 hours prior to pressure washing.',
    statusOverride: 'SCHEDULED',
    files: [],
    lastActive: Date.now(),
    lat: 43.2964,
    lng: -87.9876,
    jobs: [
      {
        id: 202,
        title: 'Exterior Siding, Fascia & Trim Coating',
        date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        status: 'SCHEDULED',
        showLaborTotal: true,
        showOverallTotal: true,
        matsIncluded: false,
        paintRate: '75',
        repairRate: 75,
        disc: 50,
        discType: 'FLAT',
        discLabel: 'Repeat Client Courtesy',
        matVal: 480,
        sunVal: 65,
        depo: 1000,
        payments: [],
        rtMiles: 24,
        workDays: 5,
        schedDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        schedEndDate: new Date(Date.now() + 86400000 * 8).toISOString().split('T')[0],
        prepScope: 'Full pressure wash, scrape loose coatings, spot prime bare cedar siding with exterior oil primer.',
        scope: '2 full coats Duration Exterior coating on all cedar siding, fascia boards, soffits, and window trim.',
        rooms: [
          { n: 'Cedar Siding All Elevations', r: 2400, og: '12', prod: 'Duration Exterior', sheen: 'Low Lustre', color: 'SW 7048 Urbane Bronze', sp: true },
          { n: 'Trim, Fascia & Soffits', r: 850, og: '4', prod: 'Duration Exterior', sheen: 'Semi-Gloss', color: 'SW 7008 Alabaster', sp: true },
        ],
        repairs: [
          { d: 'Replace rotted fascia corner piece on south gable', h: 3 },
        ],
      },
    ],
  },
  {
    id: 1710000003,
    name: 'David Krause',
    phone: '(262) 677-2241',
    email: 'dkrause.jackson@wi.rr.com',
    address: 'N168 W20110 Main St, Jackson, WI 53037',
    notes: 'Walked property on Tuesday. Awaiting insurance approval for water damage repair in upstairs bath.',
    statusOverride: 'PENDING',
    files: [],
    lastActive: Date.now(),
    lat: 43.3236,
    lng: -88.1698,
    jobs: [
      {
        id: 203,
        title: 'Upstairs Master Bath Water Stain Prep & Paint',
        date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        status: 'PENDING',
        showLaborTotal: true,
        showOverallTotal: true,
        matsIncluded: false,
        paintRate: '65',
        repairRate: 75,
        disc: 0,
        discType: 'PCT',
        discLabel: 'Discount',
        matVal: 110,
        sunVal: 20,
        depo: 0,
        payments: [],
        rtMiles: 16,
        workDays: 1,
        schedDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        schedEndDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        prepScope: 'Seal water stain with Zinsser B-I-N shellac primer, tape fixtures and vanities.',
        scope: 'Apply 2 coats moisture-resistant satin finish on bathroom walls and ceiling.',
        rooms: [
          { n: 'Master Bath Walls & Ceiling', r: 520, og: '2', prod: 'Emerald', sheen: 'Satin', color: 'SW 6204 Sea Salt', sp: true },
        ],
        repairs: [
          { d: 'Shellac prime water stains & skim drywall seam', h: 1.5 },
        ],
      },
    ],
  },
];

let dbInstance: IDBDatabase | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, 3);
      request.onerror = () => {
        console.warn('IndexedDB failed to open, falling back to localStorage');
        resolve(null as any);
      };
      request.onsuccess = (e: any) => {
        dbInstance = e.target.result;
        resolve(dbInstance!);
      };
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
    } catch {
      resolve(null as any);
    }
  });
}

export async function saveRecord<T>(key: string, value: T): Promise<void> {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`LocalStorage quota exceeded for ${key}`, err);
  }

  const db = await openDatabase();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, value });
  } catch (err) {
    console.warn('IDB write failed', err);
  }
}

export async function loadRecord<T>(key: string, defaultValue: T): Promise<T> {
  const db = await openDatabase();
  if (db) {
    try {
      const result = await new Promise<T | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      });
      if (result !== null && result !== undefined) return result;
    } catch {
      // Fallback
    }
  }

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as T;
  } catch {
    // Ignore parse error
  }

  return defaultValue;
}

export function generateDailyBackupJson(data: Record<string, any>): string {
  return JSON.stringify(data, null, 2);
}

const STRUCTURED_CORE_KEYS = new Set<string>([
  'KMaster_C',
  'KMaster_Notes',
  'KMaster_Exp',
  'KMaster_Mil',
  'KMaster_Shopping',
  'KMaster_PriceBook',
  'KMaster_WebPhotos',
  'KMaster_Settings',
  'KMaster_Constants',
  'KMaster_Logo',
  'KMaster_BaseMode',
  'KMaster_Accent1',
  'KMaster_Accent2',
  'KMaster_Accent3',
  'KMaster_WeatherLoc',
]);

const isSensitiveAuthKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return (
    lower.startsWith('firebase:') ||
    lower.includes('accesstoken') ||
    lower.includes('oauth') ||
    lower.includes('credential')
  );
};

/**
 * Reads all stored records from KruegerOS_OfflineDB_v2 IndexedDB store.
 */
export async function readAllIndexedDbRecords(): Promise<Record<string, any>> {
  const records: Record<string, any> = {};
  const db = await openDatabase();
  if (!db) return records;

  try {
    const allItems = await new Promise<Array<{ key: string; value: any }>>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });

    for (const item of allItems) {
      if (item && typeof item.key === 'string' && !isSensitiveAuthKey(item.key)) {
        records[item.key] = item.value;
      }
    }
  } catch (err) {
    console.warn('Could not enumerate IndexedDB records:', err);
  }

  return records;
}

/**
 * Reads any remaining app-specific keys from localStorage and IndexedDB
 * (excluding core keys already explicitly structured in customers/settings/terms).
 */
export async function readRemainingAppStorage(): Promise<{
  localStorage: Record<string, any>;
  indexedDB: Record<string, any>;
}> {
  const lsSnapshot: Record<string, any> = {};
  if (typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || STRUCTURED_CORE_KEYS.has(key) || isSensitiveAuthKey(key)) continue;
        const raw = localStorage.getItem(key);
        if (raw === null) continue;
        try {
          lsSnapshot[key] = JSON.parse(raw);
        } catch {
          lsSnapshot[key] = raw;
        }
      }
    } catch (err) {
      console.warn('Could not enumerate localStorage keys:', err);
    }
  }

  const allIdb = await readAllIndexedDbRecords();
  const idbSnapshot: Record<string, any> = {};
  for (const [key, val] of Object.entries(allIdb)) {
    if (!STRUCTURED_CORE_KEYS.has(key) && !isSensitiveAuthKey(key)) {
      idbSnapshot[key] = val;
    }
  }

  return {
    localStorage: lsSnapshot,
    indexedDB: idbSnapshot,
  };
}

export interface WorkspaceStateSnapshot {
  customers: Customer[];
  notes: FieldNote[];
  expenses: ExpenseEntry[];
  mileage: MileageEntry[];
  shoppingList: ShoppingItem[];
  priceBook: PriceBookItem[];
  webPhotos?: WebPhoto[];
  terms: PrintSettings;
  constants: SystemConstants;
  customLogo?: string | null;
  baseTheme?: 'dark' | 'light';
  accent1?: string;
  accent2?: string;
  accent3?: string;
  weatherLocation?: LocationInfo;
}

export interface FullBackupSettingsSection {
  spreadRate: number;
  repairRate: number;
  irsRate: number;
  paintCostPerGal: number;
  baseTheme: 'dark' | 'light';
  accent1: string;
  accent2: string;
  accent3: string;
  weatherLocation?: LocationInfo;
  customLogo?: string | null;
  notes: FieldNote[];
  expenses: ExpenseEntry[];
  mileage: MileageEntry[];
  shoppingList: ShoppingItem[];
  priceBook: PriceBookItem[];
  webPhotos: WebPhoto[];
}

export interface FullBackupPayload {
  version: '2.0';
  appName: 'Krueger Painting OS';
  exportedAt: string;
  customers: Customer[];
  settings: FullBackupSettingsSection;
  terms: PrintSettings;
  rawStorage: {
    localStorage: Record<string, any>;
    indexedDB: Record<string, any>;
  };
}

export interface NormalizedRestorePayload {
  format: 'full-v2' | 'legacy-object' | 'legacy-customers-array';
  customers?: Customer[];
  notes?: FieldNote[];
  expenses?: ExpenseEntry[];
  mileage?: MileageEntry[];
  shoppingList?: ShoppingItem[];
  priceBook?: PriceBookItem[];
  webPhotos?: WebPhoto[];
  terms?: PrintSettings;
  constants?: SystemConstants;
  customLogo?: string | null;
  hasCustomLogo?: boolean;
  baseTheme?: 'dark' | 'light';
  accent1?: string;
  accent2?: string;
  accent3?: string;
  weatherLocation?: LocationInfo;
  rawStorage?: Record<string, any>;
}

/**
 * Generates the standardized portable full-backup filename using local date:
 * KruegerPainting_FullBackup_YYYY-MM-DD.json
 */
export function getFullBackupFilename(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `KruegerPainting_FullBackup_${y}-${m}-${d}.json`;
}

/**
 * Captures the ENTIRE app state into a single structured FullBackupPayload (v2.0),
 * including customers/jobs, all customized rates/presets/databases, PDF terms, logo,
 * theme/accents, and any remaining localStorage / KruegerOS_OfflineDB_v2 keys.
 */
export async function buildFullBackupPayload(
  state: WorkspaceStateSnapshot
): Promise<FullBackupPayload> {
  const rawStorage = await readRemainingAppStorage();

  return {
    version: '2.0',
    appName: 'Krueger Painting OS',
    exportedAt: new Date().toISOString(),
    customers: state.customers || [],
    settings: {
      spreadRate: state.constants?.spreadRate ?? DEFAULT_SYSTEM_CONSTANTS.spreadRate,
      repairRate: state.constants?.repairRate ?? DEFAULT_SYSTEM_CONSTANTS.repairRate,
      irsRate: state.constants?.irsRate ?? DEFAULT_SYSTEM_CONSTANTS.irsRate,
      paintCostPerGal: state.constants?.paintCostPerGal ?? DEFAULT_SYSTEM_CONSTANTS.paintCostPerGal,
      baseTheme: state.baseTheme || 'dark',
      accent1: state.accent1 || '#bf5af2',
      accent2: state.accent2 || '#0a84ff',
      accent3: state.accent3 || '#30d158',
      weatherLocation: state.weatherLocation,
      customLogo: state.customLogo ?? null,
      notes: state.notes || [],
      expenses: state.expenses || [],
      mileage: state.mileage || [],
      shoppingList: state.shoppingList || [],
      priceBook: state.priceBook || [],
      webPhotos: state.webPhotos || [],
    },
    terms: {
      hdr: state.terms?.hdr ?? DEFAULT_PRINT_SETTINGS.hdr,
      motto: state.terms?.motto ?? DEFAULT_PRINT_SETTINGS.motto,
      t1: state.terms?.t1 ?? DEFAULT_PRINT_SETTINGS.t1,
      t2: state.terms?.t2 ?? DEFAULT_PRINT_SETTINGS.t2,
      t3: state.terms?.t3 ?? DEFAULT_PRINT_SETTINGS.t3,
      t4: state.terms?.t4 ?? DEFAULT_PRINT_SETTINGS.t4,
    },
    rawStorage,
  };
}

const looksLikePrintTerms = (obj: any): obj is PrintSettings =>
  Boolean(
    obj &&
      typeof obj === 'object' &&
      ('hdr' in obj || 'motto' in obj || 't1' in obj || 't2' in obj || 't3' in obj || 't4' in obj)
  );

const looksLikeRatesObject = (obj: any): boolean =>
  Boolean(
    obj &&
      typeof obj === 'object' &&
      ('spreadRate' in obj || 'repairRate' in obj || 'irsRate' in obj || 'paintCostPerGal' in obj)
  );

/**
 * Smart parser supporting:
 * 1) Full-state v2.0 backups ({ version, exportedAt, customers, settings, terms, rawStorage })
 * 2) Previous v2.0 wrapped backups ({ version, data: { customers, notes, settings, constants, ... } })
 * 3) Legacy flat backups ({ customers | c, notes, exp, mil, shopping, settings, constants })
 * 4) Legacy customer-only JSON arrays ([ { id, name, jobs, ... }, ... ])
 */
export function parseBackupJson(parsed: unknown): NormalizedRestorePayload | null {
  // Format A: Legacy customer-only JSON array
  if (Array.isArray(parsed)) {
    const looksValid =
      parsed.length === 0 ||
      parsed.some(
        (item) => item && typeof item === 'object' && ('name' in item || 'jobs' in item || 'id' in item)
      );
    if (!looksValid) return null;
    return {
      format: 'legacy-customers-array',
      customers: parsed as Customer[],
    };
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const root = parsed as Record<string, any>;
  // Unwrap legacy `{ data: { ... } }` envelope if present
  const src: Record<string, any> =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : root;

  const isNewFullV2 =
    Boolean(src.terms && typeof src.terms === 'object') ||
    Boolean(src.rawStorage && typeof src.rawStorage === 'object') ||
    looksLikeRatesObject(src.settings);

  const result: NormalizedRestorePayload = {
    format: isNewFullV2 ? 'full-v2' : 'legacy-object',
  };

  // 1. Customers
  const rawCustomers = Array.isArray(src.customers)
    ? src.customers
    : Array.isArray(src.c)
    ? src.c
    : undefined;
  if (rawCustomers) result.customers = rawCustomers;

  // 2. Settings (rates, preferences, databases) vs legacy settings (PrintSettings)
  const sObj = src.settings && typeof src.settings === 'object' ? src.settings : null;

  if (src.terms && looksLikePrintTerms(src.terms)) {
    result.terms = { ...DEFAULT_PRINT_SETTINGS, ...src.terms };
  } else if (sObj && looksLikePrintTerms(sObj)) {
    result.terms = { ...DEFAULT_PRINT_SETTINGS, ...sObj };
  }

  // Rates / SystemConstants
  const cObj =
    src.constants && looksLikeRatesObject(src.constants)
      ? src.constants
      : sObj && looksLikeRatesObject(sObj)
      ? sObj
      : null;

  if (cObj) {
    result.constants = {
      spreadRate: Number(cObj.spreadRate) || DEFAULT_SYSTEM_CONSTANTS.spreadRate,
      repairRate: Number(cObj.repairRate) || DEFAULT_SYSTEM_CONSTANTS.repairRate,
      irsRate: Number(cObj.irsRate) || DEFAULT_SYSTEM_CONSTANTS.irsRate,
      paintCostPerGal: Number(cObj.paintCostPerGal) || DEFAULT_SYSTEM_CONSTANTS.paintCostPerGal,
    };
  }

  // Secondary datasets (can live inside `settings` in full-v2 OR at top-level in legacy backups)
  const pickArray = <T,>(...candidates: unknown[]): T[] | undefined => {
    for (const cand of candidates) {
      if (Array.isArray(cand)) return cand as T[];
    }
    return undefined;
  };

  result.notes = pickArray<FieldNote>(sObj?.notes, src.notes);
  result.expenses = pickArray<ExpenseEntry>(sObj?.expenses, src.expenses, src.exp);
  result.mileage = pickArray<MileageEntry>(sObj?.mileage, src.mileage, src.mil);
  result.shoppingList = pickArray<ShoppingItem>(
    sObj?.shoppingList,
    src.shoppingList,
    src.shopping
  );
  result.priceBook = pickArray<PriceBookItem>(sObj?.priceBook, src.priceBook);
  result.webPhotos = pickArray<WebPhoto>(sObj?.webPhotos, src.webPhotos);

  // Theme, accents, logo, weather location
  const themeCandidate = sObj?.baseTheme ?? src.baseTheme;
  if (themeCandidate === 'dark' || themeCandidate === 'light') {
    result.baseTheme = themeCandidate;
  }
  if (typeof (sObj?.accent1 ?? src.accent1) === 'string') result.accent1 = sObj?.accent1 ?? src.accent1;
  if (typeof (sObj?.accent2 ?? src.accent2) === 'string') result.accent2 = sObj?.accent2 ?? src.accent2;
  if (typeof (sObj?.accent3 ?? src.accent3) === 'string') result.accent3 = sObj?.accent3 ?? src.accent3;

  const locCandidate = sObj?.weatherLocation ?? src.weatherLocation;
  if (locCandidate && typeof locCandidate === 'object' && typeof locCandidate.lat === 'number') {
    result.weatherLocation = locCandidate as LocationInfo;
  }

  if (sObj && 'customLogo' in sObj) {
    result.hasCustomLogo = true;
    result.customLogo = sObj.customLogo ?? null;
  } else if ('customLogo' in src) {
    result.hasCustomLogo = true;
    result.customLogo = src.customLogo ?? null;
  }

  // 3. Remaining rawStorage keys (merge localStorage + indexedDB snapshots cleanly)
  const rawStorageSource = src.rawStorage ?? root.rawStorage;
  if (rawStorageSource && typeof rawStorageSource === 'object') {
    const mergedRaw: Record<string, any> = {};
    if (
      rawStorageSource.localStorage &&
      typeof rawStorageSource.localStorage === 'object'
    ) {
      Object.assign(mergedRaw, rawStorageSource.localStorage);
    }
    if (
      rawStorageSource.indexedDB &&
      typeof rawStorageSource.indexedDB === 'object'
    ) {
      Object.assign(mergedRaw, rawStorageSource.indexedDB);
    }
    // Also support flat rawStorage maps
    for (const [k, v] of Object.entries(rawStorageSource)) {
      if (k !== 'localStorage' && k !== 'indexedDB') {
        mergedRaw[k] = v;
      }
    }
    if (Object.keys(mergedRaw).length > 0) {
      result.rawStorage = mergedRaw;
    }
  }

  // Validate that at least one recognized Krueger data field exists
  const hasAnyValidData = Boolean(
    result.customers !== undefined ||
      result.notes !== undefined ||
      result.expenses !== undefined ||
      result.mileage !== undefined ||
      result.shoppingList !== undefined ||
      result.priceBook !== undefined ||
      result.terms !== undefined ||
      result.constants !== undefined ||
      result.rawStorage !== undefined
  );

  return hasAnyValidData ? result : null;
}

/**
 * Writes remaining rawStorage keys back into both localStorage and KruegerOS_OfflineDB_v2 IndexedDB.
 */
export async function restoreRawStorageEntries(
  rawStorage: Record<string, any>
): Promise<number> {
  let restoredCount = 0;
  for (const [key, value] of Object.entries(rawStorage)) {
    if (!key || STRUCTURED_CORE_KEYS.has(key) || isSensitiveAuthKey(key)) continue;
    await saveRecord(key, value);
    restoredCount += 1;
  }
  return restoredCount;
}

