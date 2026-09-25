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
