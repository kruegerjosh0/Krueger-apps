import { getApps, initializeApp, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Customer,
  FieldNote,
  ExpenseEntry,
  MileageEntry,
  ShoppingItem,
  PriceBookItem,
  SupplyStopPin,
  PrintSettings,
  SystemConstants,
} from '../types';

export const ADMIN_CLOUD_EMAIL = 'krueptg@gmail.com';
export const ESTIMATOR_CLOUD_COLLECTION = 'estimatorData';
export const ESTIMATOR_CLOUD_DOC = 'main';
export const LOCAL_LAST_UPDATED_KEY = 'KMaster_LocalLastUpdated';
export const LAST_CLOUD_SYNC_LABEL_KEY = 'KMaster_LastCloudSync';
export const DEVICE_ID_KEY = 'KMaster_DeviceId';

// Safe byte ceiling below Firestore's 1 MiB (1,048,576 bytes) document limit
const MAX_FIRESTORE_DOC_BYTES = 880_000;

export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);

// Enforce persistent local auth across PWA restarts and device reboots
export const authPersistenceReady: Promise<void> = setPersistence(
  firebaseAuth,
  browserLocalPersistence
).catch((err) => {
  console.warn('Firebase browserLocalPersistence init warning:', err);
});

/**
 * Strict gate: only the authorized Krueger Painting admin email may read or write cloud sync data.
 */
export function isAuthorizedAdminUser(user: User | null | undefined): boolean {
  if (!user?.uid || !user?.email) return false;
  return user.email.trim().toLowerCase() === ADMIN_CLOUD_EMAIL;
}

export function subscribeToCloudAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth, (user) => {
    callback(user);
  });
}

export async function signInAdminWithEmail(email: string, password: string): Promise<User> {
  try {
    await setPersistence(firebaseAuth, browserLocalPersistence);
  } catch (err) {
    console.warn('Could not enforce browserLocalPersistence prior to login:', err);
  }
  const cred = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  return cred.user;
}

export async function sendAdminPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth, email.trim());
}

export async function signOutCloudAdmin(): Promise<void> {
  await signOut(firebaseAuth);
}

export function getLocalLastUpdated(): number {
  try {
    const raw = localStorage.getItem(LOCAL_LAST_UPDATED_KEY);
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function setLocalLastUpdated(timestamp: number): void {
  if (!Number.isFinite(timestamp) || timestamp < 0) return;
  try {
    localStorage.setItem(LOCAL_LAST_UPDATED_KEY, String(Math.floor(timestamp)));
  } catch {
    // Ignore storage quota errors
  }
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = `kp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return 'kp_device';
  }
}

function getDeviceLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/SM-F9|Fold/i.test(ua)) return 'Galaxy Z Fold';
  if (/SM-X|Tab/i.test(ua)) return 'Galaxy Tab';
  if (/Android|iPhone|Mobile/i.test(ua)) return 'Mobile PWA';
  return 'Desktop PWA';
}

function getEstimatorSyncDocRef(userId: string) {
  return doc(firestore, 'users', userId, ESTIMATOR_CLOUD_COLLECTION, ESTIMATOR_CLOUD_DOC);
}

function measureUtf8Bytes(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length * 2;
}

export interface CloudWorkspacePayload {
  customers: Customer[];
  notes: FieldNote[];
  expenses: ExpenseEntry[];
  mileage: MileageEntry[];
  shoppingList: ShoppingItem[];
  priceBook: PriceBookItem[];
  customSupplyPins?: SupplyStopPin[];
  settings?: PrintSettings;
  constants?: SystemConstants;
  lastUpdated: number;
  updatedAt: string;
  deviceLabel: string;
  deviceId?: string;
}

export interface CloudSaveResult {
  saved: boolean;
  lastUpdated: number;
  strippedLargeFiles?: boolean;
}

function stripLargeFileDataUrls(customers: Customer[]): Customer[] {
  return (customers || []).map((customer) => {
    if (!Array.isArray(customer.files) || customer.files.length === 0) return customer;
    return {
      ...customer,
      files: customer.files.map((file) => {
        if (file?.data && file.data.length > 16_000) {
          return {
            ...file,
            data: '',
            omittedFromCloud: true,
          } as typeof file & { omittedFromCloud?: boolean };
        }
        return file;
      }),
    };
  });
}

/**
 * Preserves local binary attachment data on this device if the cloud copy
 * omitted oversized inline image/PDF payloads to stay under Firestore's 1 MiB limit.
 */
export function mergeLocalFileBlobsIntoCloudCustomers(
  cloudCustomers: Customer[],
  localCustomers: Customer[]
): Customer[] {
  if (!Array.isArray(localCustomers) || localCustomers.length === 0) {
    return cloudCustomers;
  }

  const localFileMap = new Map<string, string>();
  for (const c of localCustomers) {
    if (!Array.isArray(c.files)) continue;
    for (const f of c.files) {
      if (f?.id !== undefined && f?.data) {
        localFileMap.set(`${c.id}:${f.id}`, f.data);
      }
    }
  }

  if (localFileMap.size === 0) return cloudCustomers;

  return cloudCustomers.map((c) => {
    if (!Array.isArray(c.files) || c.files.length === 0) return c;
    return {
      ...c,
      files: c.files.map((f) => {
        if ((!f.data || f.data.length === 0) && localFileMap.has(`${c.id}:${f.id}`)) {
          const rest = { ...(f as any) };
          delete rest.omittedFromCloud;
          return {
            ...rest,
            data: localFileMap.get(`${c.id}:${f.id}`)!,
          };
        }
        return f;
      }),
    };
  });
}

function parseCloudDoc(d: Record<string, any>): CloudWorkspacePayload {
  const parsedLastUpdated =
    typeof d.lastUpdated === 'number' && Number.isFinite(d.lastUpdated)
      ? d.lastUpdated
      : d.updatedAt
        ? Date.parse(d.updatedAt) || 0
        : 0;

  return {
    customers: d.customersJson ? JSON.parse(d.customersJson) : [],
    notes: d.notesJson ? JSON.parse(d.notesJson) : [],
    expenses: d.expensesJson ? JSON.parse(d.expensesJson) : [],
    mileage: d.mileageJson ? JSON.parse(d.mileageJson) : [],
    shoppingList: d.shoppingJson ? JSON.parse(d.shoppingJson) : [],
    priceBook: d.priceBookJson ? JSON.parse(d.priceBookJson) : [],
    customSupplyPins: d.customSupplyPinsJson ? JSON.parse(d.customSupplyPinsJson) : undefined,
    settings: d.settingsJson ? JSON.parse(d.settingsJson) : undefined,
    constants: d.constantsJson ? JSON.parse(d.constantsJson) : undefined,
    lastUpdated: parsedLastUpdated,
    updatedAt: d.updatedAt || new Date(parsedLastUpdated || Date.now()).toISOString(),
    deviceLabel: d.deviceLabel || 'Cloud Remote',
    deviceId: d.deviceId,
  };
}

/**
 * Saves contractor estimator data to Firestore at users/${uid}/estimatorData/main.
 * Strict admin gate ensures non-admin or unauthenticated sessions perform zero cloud writes.
 */
export async function saveWorkspaceToCloud(
  userId: string,
  payload: Omit<CloudWorkspacePayload, 'updatedAt' | 'deviceLabel' | 'lastUpdated' | 'deviceId'>,
  lastUpdatedOverride?: number
): Promise<CloudSaveResult> {
  const activeUser = firebaseAuth.currentUser;
  if (!userId || !isAuthorizedAdminUser(activeUser) || activeUser?.uid !== userId) {
    return { saved: false, lastUpdated: lastUpdatedOverride || getLocalLastUpdated() };
  }

  const lastUpdated =
    typeof lastUpdatedOverride === 'number' && lastUpdatedOverride > 0
      ? Math.floor(lastUpdatedOverride)
      : Date.now();
  const nowIso = new Date(lastUpdated).toISOString();
  const deviceLabel = getDeviceLabel();
  const deviceId = getOrCreateDeviceId();

  let customersToSave = payload.customers || [];
  let strippedLargeFiles = false;

  const buildDocData = (customersList: Customer[]) => ({
    userId,
    email: ADMIN_CLOUD_EMAIL,
    lastUpdated,
    updatedAt: nowIso,
    deviceId,
    deviceLabel,
    customersJson: JSON.stringify(customersList),
    notesJson: JSON.stringify(payload.notes || []),
    expensesJson: JSON.stringify(payload.expenses || []),
    mileageJson: JSON.stringify(payload.mileage || []),
    shoppingJson: JSON.stringify(payload.shoppingList || []),
    priceBookJson: JSON.stringify(payload.priceBook || []),
    customSupplyPinsJson: JSON.stringify(payload.customSupplyPins || []),
    settingsJson: JSON.stringify(payload.settings || {}),
    constantsJson: JSON.stringify(payload.constants || {}),
  });

  let docData = buildDocData(customersToSave);
  if (measureUtf8Bytes(JSON.stringify(docData)) > MAX_FIRESTORE_DOC_BYTES) {
    customersToSave = stripLargeFileDataUrls(customersToSave);
    docData = buildDocData(customersToSave);
    strippedLargeFiles = true;
    console.warn('Stripped oversized inline file blobs from cloud sync payload to stay under Firestore 1 MiB limit.');
  }

  const syncDocRef = getEstimatorSyncDocRef(userId);
  await setDoc(syncDocRef, docData, { merge: true });

  return {
    saved: true,
    lastUpdated,
    strippedLargeFiles,
  };
}

/**
 * Loads the latest estimator workspace from users/${uid}/estimatorData/main.
 * Strict admin gate ensures non-admin or unauthenticated sessions perform zero cloud reads.
 */
export async function loadWorkspaceFromCloud(
  userId: string,
  preferServer = false
): Promise<CloudWorkspacePayload | null> {
  const activeUser = firebaseAuth.currentUser;
  if (!userId || !isAuthorizedAdminUser(activeUser) || activeUser?.uid !== userId) {
    return null;
  }

  const syncDocRef = getEstimatorSyncDocRef(userId);
  let snap;
  if (preferServer) {
    try {
      snap = await getDocFromServer(syncDocRef);
    } catch {
      snap = await getDoc(syncDocRef);
    }
  } else {
    snap = await getDoc(syncDocRef);
  }

  if (!snap.exists()) return null;
  return parseCloudDoc(snap.data());
}

/**
 * Optional real-time subscription to users/${uid}/estimatorData/main (strictly gated to admin).
 */
export function subscribeToCloudWorkspace(
  userId: string,
  onRemoteChange: (payload: CloudWorkspacePayload) => void
): () => void {
  const activeUser = firebaseAuth.currentUser;
  if (!userId || !isAuthorizedAdminUser(activeUser) || activeUser?.uid !== userId) {
    return () => {};
  }

  const syncDocRef = getEstimatorSyncDocRef(userId);
  return onSnapshot(
    syncDocRef,
    (snap) => {
      if (!snap.exists()) return;
      try {
        onRemoteChange(parseCloudDoc(snap.data()));
      } catch (err) {
        console.warn('Failed parsing remote workspace snapshot:', err);
      }
    },
    (err) => {
      console.warn('Cloud sync snapshot warning:', err.message);
    }
  );
}

export async function testFirestoreConnection(): Promise<boolean> {
  const activeUser = firebaseAuth.currentUser;
  if (!isAuthorizedAdminUser(activeUser) || !activeUser?.uid) return false;
  try {
    await getDocFromServer(getEstimatorSyncDocRef(activeUser.uid));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return false;
    }
    return true;
  }
}
