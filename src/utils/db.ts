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
    statusOverride: 'ACTIVE',
    files: [],
    lastActive: Date.now(),
    lat: 43.4253,
    lng: -88.1834,
    jobs: [
      {
        id: 201,
        title: 'Interior Main Floor & Kitchen Repaint',
        date: new Date().toISOString().split('T')[0],
        status: 'ACTIVE',
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
