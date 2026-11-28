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

// Firestore single-document limit: 1 MB (1,024 KB = 1,048,576 bytes)
export const FIRESTORE_DOC_LIMIT_KB = 1024;
export const FIRESTORE_DOC_LIMIT_BYTES = FIRESTORE_DOC_LIMIT_KB * 1024;
export const FIRESTORE_WARNING_THRESHOLD_KB = 800;
export const FIRESTORE_WARNING_THRESHOLD_BYTES = FIRESTORE_WARNING_THRESHOLD_KB * 1024;

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

export type CloudWorkspaceInput = Omit<
  CloudWorkspacePayload,
  'updatedAt' | 'deviceLabel' | 'lastUpdated' | 'deviceId'
>;

export interface CloudSaveResult {
  saved: boolean;
  lastUpdated: number;
  payloadBytes: number;
}

/**
 * Strips all legacy `files` and `photos` Base64 arrays from customer & job records
 * before serializing for Firestore cloud sync so binary uploads never bloat the 1 MB document.
 */
export function sanitizeCustomersForCloudSync(customers: Customer[]): Customer[] {
  return (customers || []).map((customer) => {
    const cleaned: Record<string, any> = {
      ...customer,
      files: [],
    };
    delete cleaned.photos;

    if (Array.isArray(cleaned.jobs)) {
      cleaned.jobs = cleaned.jobs.map((job: any) => {
        if (!job || typeof job !== 'object') return job;
        const cleanedJob = { ...job };
        delete cleanedJob.photos;
        delete cleanedJob.files;
        return cleanedJob;
      });
    }

    return cleaned as Customer;
  });
}

/**
 * Builds the exact Firestore document object written to users/${uid}/estimatorData/main.
 * Used both for real writes and for calculating the live Cloud Storage Meter byte size.
 */
export function buildCloudSyncDocData(
  userId: string,
  payload: CloudWorkspaceInput,
  lastUpdated: number
) {
  const sanitizedCustomers = sanitizeCustomersForCloudSync(payload.customers || []);
  const nowIso = new Date(lastUpdated).toISOString();

  return {
    userId,
    email: ADMIN_CLOUD_EMAIL,
    lastUpdated,
    updatedAt: nowIso,
    deviceId: getOrCreateDeviceId(),
    deviceLabel: getDeviceLabel(),
    customersJson: JSON.stringify(sanitizedCustomers),
    notesJson: JSON.stringify(payload.notes || []),
    expensesJson: JSON.stringify(payload.expenses || []),
    mileageJson: JSON.stringify(payload.mileage || []),
    shoppingJson: JSON.stringify(payload.shoppingList || []),
    priceBookJson: JSON.stringify(payload.priceBook || []),
    customSupplyPinsJson: JSON.stringify(payload.customSupplyPins || []),
    settingsJson: JSON.stringify(payload.settings || {}),
    constantsJson: JSON.stringify(payload.constants || {}),
  };
}

/**
 * Calculates the exact serialized UTF-8 byte size of the Firestore cloud sync document
 * using `new Blob([JSON.stringify(docData)]).size`.
 */
export function calculateCloudSyncPayloadBytes(
  payload: CloudWorkspaceInput,
  userId = firebaseAuth.currentUser?.uid || 'admin_preview_uid',
  lastUpdated = getLocalLastUpdated() || Date.now()
): number {
  const docData = buildCloudSyncDocData(userId, payload, lastUpdated);
  const serialized = JSON.stringify(docData);
  if (typeof Blob !== 'undefined') {
    return new Blob([serialized]).size;
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(serialized).length;
  }
  return serialized.length;
}

/**
 * Formats Firestore sync errors into clear, actionable messages—especially
 * for `resource-exhausted` and 1 MB document size-limit errors.
 */
export function formatFirestoreSyncError(err: any, payloadBytes?: number): string {
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '');
  const lowerMsg = message.toLowerCase();

  const isSizeError =
    code === 'resource-exhausted' ||
    code.includes('resource-exhausted') ||
    lowerMsg.includes('resource-exhausted') ||
    lowerMsg.includes('exceeds the maximum allowed size') ||
    lowerMsg.includes('maximum size') ||
    lowerMsg.includes('document too large') ||
    lowerMsg.includes('1,048,576') ||
    lowerMsg.includes('1048576');

  if (isSizeError) {
    const kbText =
      typeof payloadBytes === 'number' && payloadBytes > 0
        ? ` (${Math.round(payloadBytes / 1024).toLocaleString()} KB / 1,024 KB)`
        : '';
    return `Cloud sync limit reached${kbText}: Firestore's 1 MB document limit was exceeded. Archive old projects or export a backup to free space.`;
  }

  if (code === 'permission-denied' || lowerMsg.includes('missing or insufficient permissions')) {
    return 'Cloud sync blocked by Firestore permissions. Ensure your admin account is allowed to access users/{uid}/estimatorData/main.';
  }

  if (code === 'unavailable' || lowerMsg.includes('offline')) {
    return 'Unable to reach cloud database right now. Your changes are safely stored locally.';
  }

  return message || 'Cloud sync failed. Local device storage remains active.';
}

/**
 * Preserves local attachment records only if needed; stripped cloud payloads keep `files: []`.
 */
export function mergeLocalFileBlobsIntoCloudCustomers(
  cloudCustomers: Customer[],
  _localCustomers: Customer[]
): Customer[] {
  return sanitizeCustomersForCloudSync(cloudCustomers);
}

function parseCloudDoc(d: Record<string, any>): CloudWorkspacePayload {
  const parsedLastUpdated =
    typeof d.lastUpdated === 'number' && Number.isFinite(d.lastUpdated)
      ? d.lastUpdated
      : d.updatedAt
        ? Date.parse(d.updatedAt) || 0
        : 0;

  return {
    customers: sanitizeCustomersForCloudSync(d.customersJson ? JSON.parse(d.customersJson) : []),
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
 * Strips all legacy photos/files Base64 arrays, enforces the admin gate, and rejects
 * payloads exceeding Firestore's 1 MB limit with a clear `resource-exhausted` error.
 */
export async function saveWorkspaceToCloud(
  userId: string,
  payload: CloudWorkspaceInput,
  lastUpdatedOverride?: number
): Promise<CloudSaveResult> {
  const activeUser = firebaseAuth.currentUser;
  if (!userId || !isAuthorizedAdminUser(activeUser) || activeUser?.uid !== userId) {
    return {
      saved: false,
      lastUpdated: lastUpdatedOverride || getLocalLastUpdated(),
      payloadBytes: 0,
    };
  }

  const lastUpdated =
    typeof lastUpdatedOverride === 'number' && lastUpdatedOverride > 0
      ? Math.floor(lastUpdatedOverride)
      : Date.now();

  const docData = buildCloudSyncDocData(userId, payload, lastUpdated);
  const serialized = JSON.stringify(docData);
  const payloadBytes =
    typeof Blob !== 'undefined'
      ? new Blob([serialized]).size
      : new TextEncoder().encode(serialized).length;

  if (payloadBytes >= FIRESTORE_DOC_LIMIT_BYTES) {
    const sizeErr: any = new Error(
      `Document exceeds the maximum allowed size of 1,048,576 bytes (${Math.round(payloadBytes / 1024)} KB).`
    );
    sizeErr.code = 'resource-exhausted';
    sizeErr.payloadBytes = payloadBytes;
    throw sizeErr;
  }

  const syncDocRef = getEstimatorSyncDocRef(userId);
  try {
    await setDoc(syncDocRef, docData, { merge: true });
  } catch (err: any) {
    if (err && typeof err === 'object') {
      err.payloadBytes = payloadBytes;
    }
    throw err;
  }

  return {
    saved: true,
    lastUpdated,
    payloadBytes,
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
