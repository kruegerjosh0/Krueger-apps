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
  collection,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Customer,
  FieldNote,
  NoteFolder,
  ExpenseEntry,
  MileageEntry,
  ShoppingItem,
  PriceBookItem,
  SupplyStopPin,
  PrintSettings,
  SystemConstants,
} from '../types';

export const ADMIN_CLOUD_EMAIL = 'krueptg@gmail.com';

// New Per-Customer Master Architecture paths under users/${uid}/...
export const CUSTOMERS_CLOUD_COLLECTION = 'customers';
export const META_CLOUD_COLLECTION = 'meta';
export const META_APP_STATE_DOC = 'appState';

// Legacy single-document path (used only for automatic one-time migration on first manual sync)
export const LEGACY_ESTIMATOR_CLOUD_COLLECTION = 'estimatorData';
export const LEGACY_ESTIMATOR_CLOUD_DOC = 'main';

export const LOCAL_LAST_UPDATED_KEY = 'KMaster_LocalLastUpdated';
export const LOCAL_META_LAST_UPDATED_KEY = 'KMaster_MetaLastUpdated';
export const LOCAL_CUSTOMER_UPDATED_MAP_KEY = 'KMaster_CustomerUpdatedMap';
export const LOCAL_DELETED_CUSTOMERS_KEY = 'KMaster_DeletedCustomerIds';
export const LOCAL_PENDING_SYNC_STATE_KEY = 'KMaster_PendingSyncState';
export const LAST_CLOUD_SYNC_LABEL_KEY = 'KMaster_LastCloudSync';
export const DEVICE_ID_KEY = 'KMaster_DeviceId';

// Firestore limits: 1 GB (1,024 MB) free tier total, 1 MB (1,024 KB) per single document
export const FIRESTORE_FREE_TIER_MB = 1024;
export const FIRESTORE_FREE_TIER_BYTES = FIRESTORE_FREE_TIER_MB * 1024 * 1024;
export const FIRESTORE_DOC_LIMIT_KB = 1024;
export const FIRESTORE_DOC_LIMIT_BYTES = FIRESTORE_DOC_LIMIT_KB * 1024;
export const FIRESTORE_SINGLE_DOC_WARNING_KB = 800;
export const FIRESTORE_SINGLE_DOC_WARNING_BYTES = FIRESTORE_SINGLE_DOC_WARNING_KB * 1024;

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

export function getLocalMetaLastUpdated(): number {
  try {
    const raw = localStorage.getItem(LOCAL_META_LAST_UPDATED_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Fallback below
  }
  return getLocalLastUpdated();
}

export function setLocalMetaLastUpdated(timestamp: number): void {
  if (!Number.isFinite(timestamp) || timestamp < 0) return;
  try {
    localStorage.setItem(LOCAL_META_LAST_UPDATED_KEY, String(Math.floor(timestamp)));
  } catch {
    // Ignore storage quota errors
  }
}

export function getLocalCustomerUpdatedMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LOCAL_CUSTOMER_UPDATED_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setLocalCustomerUpdatedMap(map: Record<string, number>): void {
  try {
    localStorage.setItem(LOCAL_CUSTOMER_UPDATED_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function getLocalDeletedCustomerMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LOCAL_DELETED_CUSTOMERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setLocalDeletedCustomerMap(map: Record<string, number>): void {
  try {
    // Prune to most recent 250 tombstones so meta doc stays tiny
    const entries = Object.entries(map)
      .filter(([, ts]) => typeof ts === 'number' && Number.isFinite(ts))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 250);
    localStorage.setItem(LOCAL_DELETED_CUSTOMERS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore storage quota errors
  }
}

export interface PendingSyncState {
  customerIds: number[];
  deletedIds: number[];
  metaDirty: boolean;
}

export function loadPendingSyncState(): PendingSyncState {
  try {
    const raw = localStorage.getItem(LOCAL_PENDING_SYNC_STATE_KEY);
    if (!raw) return { customerIds: [], deletedIds: [], metaDirty: false };
    const parsed = JSON.parse(raw);
    return {
      customerIds: Array.isArray(parsed?.customerIds)
        ? parsed.customerIds.filter((n: any) => typeof n === 'number' && Number.isFinite(n))
        : [],
      deletedIds: Array.isArray(parsed?.deletedIds)
        ? parsed.deletedIds.filter((n: any) => typeof n === 'number' && Number.isFinite(n))
        : [],
      metaDirty: Boolean(parsed?.metaDirty),
    };
  } catch {
    return { customerIds: [], deletedIds: [], metaDirty: false };
  }
}

export function savePendingSyncState(state: PendingSyncState): void {
  try {
    localStorage.setItem(LOCAL_PENDING_SYNC_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearPendingSyncState(): void {
  savePendingSyncState({ customerIds: [], deletedIds: [], metaDirty: false });
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

function measureJsonBytes(obj: unknown): number {
  const serialized = JSON.stringify(obj);
  if (typeof Blob !== 'undefined') {
    return new Blob([serialized]).size;
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(serialized).length;
  }
  return serialized.length;
}

function getCustomerDocRef(userId: string, customerId: number | string) {
  return doc(firestore, 'users', userId, CUSTOMERS_CLOUD_COLLECTION, String(customerId));
}

function getCustomersCollectionRef(userId: string) {
  return collection(firestore, 'users', userId, CUSTOMERS_CLOUD_COLLECTION);
}

function getAppMetaDocRef(userId: string) {
  return doc(firestore, 'users', userId, META_CLOUD_COLLECTION, META_APP_STATE_DOC);
}

function getLegacySingleDocRef(userId: string) {
  return doc(
    firestore,
    'users',
    userId,
    LEGACY_ESTIMATOR_CLOUD_COLLECTION,
    LEGACY_ESTIMATOR_CLOUD_DOC
  );
}

export interface CloudAppMetaPayload {
  notes: FieldNote[];
  noteFolders?: NoteFolder[];
  expenses: ExpenseEntry[];
  mileage: MileageEntry[];
  shoppingList: ShoppingItem[];
  priceBook: PriceBookItem[];
  customSupplyPins?: SupplyStopPin[];
  settings?: PrintSettings;
  constants?: SystemConstants;
  deletedCustomerIds?: Record<string, number>;
  lastUpdated: number;
  updatedAt: string;
  deviceLabel: string;
  deviceId?: string;
}

export type CloudAppMetaInput = Omit<
  CloudAppMetaPayload,
  'updatedAt' | 'deviceLabel' | 'lastUpdated' | 'deviceId'
>;

export interface CloudCustomerRecord {
  customer: Customer;
  lastUpdated: number;
  updatedAt: string;
  deviceLabel: string;
  deviceId?: string;
}

export interface CloudWorkspacePayload {
  customers: Customer[];
  notes: FieldNote[];
  noteFolders?: NoteFolder[];
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

export interface MasterCloudLoadResult {
  customerRecords: CloudCustomerRecord[];
  meta: CloudAppMetaPayload | null;
  migratedFromLegacy: boolean;
  migratedCustomerCount: number;
}

export interface MasterCloudStorageStats {
  totalBytes: number;
  customerCount: number;
  metaBytes: number;
  largestCustomerBytes: number;
  largestCustomerName: string | null;
  largestCustomerId: number | null;
  oversizedCustomers: Array<{ id: number; name: string; bytes: number }>;
  metaApproachingLimit: boolean;
}

/**
 * Strips all legacy `files` and `photos` Base64 arrays from a customer record
 * so binary uploads never bloat individual Firestore customer documents.
 */
export function sanitizeCustomerForCloudSync(customer: Customer): Customer {
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
}

export function sanitizeCustomersForCloudSync(customers: Customer[]): Customer[] {
  return (customers || []).map(sanitizeCustomerForCloudSync);
}

/**
 * Builds the exact Firestore document written to users/${uid}/customers/${customer.id}.
 */
export function buildCustomerCloudDocData(
  userId: string,
  customer: Customer,
  lastUpdated: number
) {
  const sanitized = sanitizeCustomerForCloudSync(customer);
  return {
    userId,
    email: ADMIN_CLOUD_EMAIL,
    customerId: sanitized.id,
    name: sanitized.name || '',
    lastUpdated,
    updatedAt: new Date(lastUpdated).toISOString(),
    deviceId: getOrCreateDeviceId(),
    deviceLabel: getDeviceLabel(),
    customerJson: JSON.stringify(sanitized),
  };
}

/**
 * Builds the exact Firestore document written to users/${uid}/meta/appState.
 */
export function buildAppMetaCloudDocData(
  userId: string,
  meta: CloudAppMetaInput,
  lastUpdated: number,
  extra?: { migratedFromLegacyAt?: number }
) {
  const prunedDeleted = Object.fromEntries(
    Object.entries(meta.deletedCustomerIds || {})
      .filter(([, ts]) => typeof ts === 'number' && Number.isFinite(ts))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 250)
  );

  return {
    userId,
    email: ADMIN_CLOUD_EMAIL,
    lastUpdated,
    updatedAt: new Date(lastUpdated).toISOString(),
    deviceId: getOrCreateDeviceId(),
    deviceLabel: getDeviceLabel(),
    notesJson: JSON.stringify(meta.notes || []),
    ...(Array.isArray(meta.noteFolders)
      ? { noteFoldersJson: JSON.stringify(meta.noteFolders) }
      : {}),
    expensesJson: JSON.stringify(meta.expenses || []),
    mileageJson: JSON.stringify(meta.mileage || []),
    shoppingJson: JSON.stringify(meta.shoppingList || []),
    priceBookJson: JSON.stringify(meta.priceBook || []),
    customSupplyPinsJson: JSON.stringify(meta.customSupplyPins || []),
    settingsJson: JSON.stringify(meta.settings || {}),
    constantsJson: JSON.stringify(meta.constants || {}),
    deletedCustomerIds: prunedDeleted,
    ...(extra?.migratedFromLegacyAt ? { migratedFromLegacyAt: extra.migratedFromLegacyAt } : {}),
  };
}

/**
 * Calculates total Master Cloud Storage usage across all per-customer documents
 * plus users/${uid}/meta/appState against Firebase's 1 GB (1,024 MB) free tier,
 * and flags any single customer document approaching 800 KB.
 */
export function calculateMasterCloudStorageStats(
  payload: CloudWorkspaceInput,
  userId = firebaseAuth.currentUser?.uid || 'admin_preview_uid',
  lastUpdated = getLocalLastUpdated() || Date.now()
): MasterCloudStorageStats {
  const customers = payload.customers || [];
  let totalBytes = 0;
  let largestCustomerBytes = 0;
  let largestCustomerName: string | null = null;
  let largestCustomerId: number | null = null;
  const oversizedCustomers: Array<{ id: number; name: string; bytes: number }> = [];

  for (const c of customers) {
    const docBytes = measureJsonBytes(buildCustomerCloudDocData(userId, c, c.lastActive || lastUpdated));
    totalBytes += docBytes;
    if (docBytes > largestCustomerBytes) {
      largestCustomerBytes = docBytes;
      largestCustomerName = c.name || `Customer #${c.id}`;
      largestCustomerId = c.id;
    }
    if (docBytes >= FIRESTORE_SINGLE_DOC_WARNING_BYTES) {
      oversizedCustomers.push({
        id: c.id,
        name: c.name || `Customer #${c.id}`,
        bytes: docBytes,
      });
    }
  }

  oversizedCustomers.sort((a, b) => b.bytes - a.bytes);

  const metaDoc = buildAppMetaCloudDocData(
    userId,
    {
      notes: payload.notes || [],
      noteFolders: payload.noteFolders,
      expenses: payload.expenses || [],
      mileage: payload.mileage || [],
      shoppingList: payload.shoppingList || [],
      priceBook: payload.priceBook || [],
      customSupplyPins: payload.customSupplyPins || [],
      settings: payload.settings,
      constants: payload.constants,
    },
    lastUpdated
  );
  const metaBytes = measureJsonBytes(metaDoc);
  totalBytes += metaBytes;

  return {
    totalBytes,
    customerCount: customers.length,
    metaBytes,
    largestCustomerBytes,
    largestCustomerName,
    largestCustomerId,
    oversizedCustomers,
    metaApproachingLimit: metaBytes >= FIRESTORE_SINGLE_DOC_WARNING_BYTES,
  };
}

/**
 * Formats Firestore sync errors into clear, actionable messages—especially
 * for `resource-exhausted` and per-document 1 MB size-limit errors.
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
    const targetName = err?.customerName ? ` for "${err.customerName}"` : '';
    const kbText =
      typeof payloadBytes === 'number' && payloadBytes > 0
        ? ` (${Math.round(payloadBytes / 1024).toLocaleString()} KB / 1,024 KB)`
        : '';
    return `Single-document 1 MB limit reached${targetName}${kbText}. Split extra projects into a separate folder or export a backup.`;
  }

  if (code === 'permission-denied' || lowerMsg.includes('missing or insufficient permissions')) {
    return 'Cloud sync blocked by Firestore rules. Allow admin access to users/{uid}/customers/{customerId} and users/{uid}/meta/{docId}.';
  }

  if (code === 'unavailable' || lowerMsg.includes('offline')) {
    return 'Unable to reach cloud database right now. Your changes are safely stored locally.';
  }

  return message || 'Cloud sync failed. Local device storage remains active.';
}

function parseCustomerCloudDoc(d: Record<string, any>): CloudCustomerRecord | null {
  try {
    const parsedCustomer: Customer | null = d.customerJson
      ? JSON.parse(d.customerJson)
      : d.id && d.name
        ? (d as Customer)
        : null;
    if (!parsedCustomer || parsedCustomer.id === undefined || parsedCustomer.id === null) {
      return null;
    }
    const sanitized = sanitizeCustomerForCloudSync(parsedCustomer);
    const parsedLastUpdated =
      typeof d.lastUpdated === 'number' && Number.isFinite(d.lastUpdated)
        ? d.lastUpdated
        : d.updatedAt
          ? Date.parse(d.updatedAt) || sanitized.lastActive || 0
          : sanitized.lastActive || 0;

    return {
      customer: sanitized,
      lastUpdated: parsedLastUpdated,
      updatedAt: d.updatedAt || new Date(parsedLastUpdated || Date.now()).toISOString(),
      deviceLabel: d.deviceLabel || 'Cloud Remote',
      deviceId: d.deviceId,
    };
  } catch (err) {
    console.warn('Failed parsing customer cloud document:', err);
    return null;
  }
}

function parseAppMetaCloudDoc(d: Record<string, any>): CloudAppMetaPayload {
  const parsedLastUpdated =
    typeof d.lastUpdated === 'number' && Number.isFinite(d.lastUpdated)
      ? d.lastUpdated
      : d.updatedAt
        ? Date.parse(d.updatedAt) || 0
        : 0;

  return {
    notes: d.notesJson ? JSON.parse(d.notesJson) : [],
    noteFolders: d.noteFoldersJson ? JSON.parse(d.noteFoldersJson) : undefined,
    expenses: d.expensesJson ? JSON.parse(d.expensesJson) : [],
    mileage: d.mileageJson ? JSON.parse(d.mileageJson) : [],
    shoppingList: d.shoppingJson ? JSON.parse(d.shoppingJson) : [],
    priceBook: d.priceBookJson ? JSON.parse(d.priceBookJson) : [],
    customSupplyPins: d.customSupplyPinsJson ? JSON.parse(d.customSupplyPinsJson) : undefined,
    settings: d.settingsJson ? JSON.parse(d.settingsJson) : undefined,
    constants: d.constantsJson ? JSON.parse(d.constantsJson) : undefined,
    deletedCustomerIds:
      d.deletedCustomerIds && typeof d.deletedCustomerIds === 'object'
        ? d.deletedCustomerIds
        : {},
    lastUpdated: parsedLastUpdated,
    updatedAt: d.updatedAt || new Date(parsedLastUpdated || Date.now()).toISOString(),
    deviceLabel: d.deviceLabel || 'Cloud Remote',
    deviceId: d.deviceId,
  };
}

/**
 * Saves a single customer folder document at users/${uid}/customers/${customer.id}.
 */
export async function saveCustomerToCloud(
  userId: string,
  customer: Customer,
  lastUpdatedOverride?: number
): Promise<{ saved: boolean; lastUpdated: number; payloadBytes: number }> {
  const activeUser = firebaseAuth.currentUser;
  if (!userId || !isAuthorizedAdminUser(activeUser) || activeUser?.uid !== userId) {
    return { saved: false, lastUpdated: lastUpdatedOverride || 0, payloadBytes: 0 };
  }

  const lastUpdated =
    typeof lastUpdatedOverride === 'number' && lastUpdatedOverride > 0
      ? Math.floor(lastUpdatedOverride)
      : Date.now();

  const docData = buildCustomerCloudDocData(userId, customer, lastUpdated);
  const payloadBytes = measureJsonBytes(docData);

  if (payloadBytes >= FIRESTORE_DOC_LIMIT_BYTES) {
    const sizeErr: any = new Error(
      `Customer document exceeds Firestore's 1 MB limit (${Math.round(payloadBytes / 1024)} KB).`
    );
    sizeErr.code = 'resource-exhausted';
    sizeErr.payloadBytes = payloadBytes;
    sizeErr.customerName = customer.name || `Customer #${customer.id}`;
    throw sizeErr;
  }

  const ref = getCustomerDocRef(userId, customer.id);
  try {
    await setDoc(ref, docData, { merge: true });
  } catch (err: any) {
    if (err && typeof err === 'object') {
      err.payloadBytes = payloadBytes;
      err.customerName = customer.name || `Customer #${customer.id}`;
    }
    throw err;
  }

  return { saved: true, lastUpdated, payloadBytes };
}

/**
 * Saves global app state (settings, Price Book, notes, mileage, expenses, shopping list, map pins)
 * at users/${uid}/meta/appState.
 */
export async function saveAppMetaToCloud(
  userId: string,
  meta: CloudAppMetaInput,
  lastUpdatedOverride?: number
): Promise<{ saved: boolean; lastUpdated: number; payloadBytes: number }> {
  const activeUser = firebaseAuth.currentUser;
  if (!userId || !isAuthorizedAdminUser(activeUser) || activeUser?.uid !== userId) {
    return { saved: false, lastUpdated: lastUpdatedOverride || 0, payloadBytes: 0 };
  }

  const lastUpdated =
    typeof lastUpdatedOverride === 'number' && lastUpdatedOverride > 0
      ? Math.floor(lastUpdatedOverride)
      : Date.now();

  const docData = buildAppMetaCloudDocData(userId, meta, lastUpdated);
  const payloadBytes = measureJsonBytes(docData);

  if (payloadBytes >= FIRESTORE_DOC_LIMIT_BYTES) {
    const sizeErr: any = new Error(
      `Global app state exceeds Firestore's 1 MB limit (${Math.round(payloadBytes / 1024)} KB).`
    );
    sizeErr.code = 'resource-exhausted';
    sizeErr.payloadBytes = payloadBytes;
    sizeErr.customerName = 'App Settings & Logs';
    throw sizeErr;
  }

  const ref = getAppMetaDocRef(userId);
  try {
    await setDoc(ref, docData, { merge: true });
  } catch (err: any) {
    if (err && typeof err === 'object') {
      err.payloadBytes = payloadBytes;
    }
    throw err;
  }

  return { saved: true, lastUpdated, payloadBytes };
}

/**
 * Explicitly deletes a single customer document from users/${uid}/customers/${customerId}.
 * Only invoked when the user explicitly deletes a customer in the UI.
 */
export async function deleteCustomerFromCloud(
  userId: string,
  customerId: number | string
): Promise<boolean> {
  const activeUser = firebaseAuth.currentUser;
  if (!userId || !isAuthorizedAdminUser(activeUser) || activeUser?.uid !== userId) {
    return false;
  }

  const ref = getCustomerDocRef(userId, customerId);
  await deleteDoc(ref);
  return true;
}

/**
 * Batch-writes multiple customer documents (chunked to stay under Firestore's 500-op batch limit).
 */
export async function saveCustomersBatchToCloud(
  userId: string,
  customers: Array<{ customer: Customer; lastUpdated: number }>
): Promise<number> {
  const activeUser = firebaseAuth.currentUser;
  if (!userId || !isAuthorizedAdminUser(activeUser) || activeUser?.uid !== userId) {
    return 0;
  }
  if (customers.length === 0) return 0;

  const CHUNK_SIZE = 400;
  let written = 0;

  for (let i = 0; i < customers.length; i += CHUNK_SIZE) {
    const chunk = customers.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(firestore);
    for (const item of chunk) {
      const docData = buildCustomerCloudDocData(userId, item.customer, item.lastUpdated);
      const payloadBytes = measureJsonBytes(docData);
      if (payloadBytes >= FIRESTORE_DOC_LIMIT_BYTES) {
        const sizeErr: any = new Error(
          `Customer "${item.customer.name}" exceeds 1 MB single-document limit (${Math.round(payloadBytes / 1024)} KB).`
        );
        sizeErr.code = 'resource-exhausted';
        sizeErr.payloadBytes = payloadBytes;
        sizeErr.customerName = item.customer.name;
        throw sizeErr;
      }
      batch.set(getCustomerDocRef(userId, item.customer.id), docData, { merge: true });
    }
    await batch.commit();
    written += chunk.length;
  }

  return written;
}

/**
 * Loads the complete master customer collection (`users/${uid}/customers`) and global state
 * (`users/${uid}/meta/appState`). If `users/${uid}/customers` is empty and the legacy
 * `users/${uid}/estimatorData/main` document exists, performs an automatic one-time migration
 * into the new per-customer collection without losing any data.
 */
export async function loadMasterCloudWorkspace(
  userId: string,
  preferServer = false
): Promise<MasterCloudLoadResult | null> {
  const activeUser = firebaseAuth.currentUser;
  if (!userId || !isAuthorizedAdminUser(activeUser) || activeUser?.uid !== userId) {
    return null;
  }

  const customersCol = getCustomersCollectionRef(userId);
  const metaRef = getAppMetaDocRef(userId);

  const readCustomersSnap = async () => {
    if (preferServer) {
      try {
        return await getDocsFromServer(customersCol);
      } catch {
        return await getDocs(customersCol);
      }
    }
    return await getDocs(customersCol);
  };

  const readDocSnap = async (ref: ReturnType<typeof doc>) => {
    if (preferServer) {
      try {
        return await getDocFromServer(ref);
      } catch {
        return await getDoc(ref);
      }
    }
    return await getDoc(ref);
  };

  const [customersSnap, metaSnap] = await Promise.all([
    readCustomersSnap(),
    readDocSnap(metaRef),
  ]);

  let meta: CloudAppMetaPayload | null = metaSnap.exists()
    ? parseAppMetaCloudDoc(metaSnap.data())
    : null;

  const customerRecords: CloudCustomerRecord[] = [];
  customersSnap.forEach((docSnap) => {
    const parsed = parseCustomerCloudDoc(docSnap.data());
    if (parsed) {
      customerRecords.push(parsed);
    }
  });

  // Automatic One-Time Migration from legacy users/${uid}/estimatorData/main
  if (customerRecords.length === 0) {
    const legacyRef = getLegacySingleDocRef(userId);
    const legacySnap = await readDocSnap(legacyRef);

    if (legacySnap.exists()) {
      const legacyData = legacySnap.data();
      const legacyTs =
        typeof legacyData.lastUpdated === 'number' && Number.isFinite(legacyData.lastUpdated)
          ? legacyData.lastUpdated
          : legacyData.updatedAt
            ? Date.parse(legacyData.updatedAt) || Date.now()
            : Date.now();

      const legacyCustomers: Customer[] = sanitizeCustomersForCloudSync(
        legacyData.customersJson ? JSON.parse(legacyData.customersJson) : []
      );

      const migratedItems = legacyCustomers.map((c) => ({
        customer: c,
        lastUpdated: Math.max(legacyTs, c.lastActive || 0),
      }));

      if (migratedItems.length > 0) {
        await saveCustomersBatchToCloud(userId, migratedItems);
      }

      const legacyMetaInput: CloudAppMetaInput = {
        notes: legacyData.notesJson ? JSON.parse(legacyData.notesJson) : [],
        expenses: legacyData.expensesJson ? JSON.parse(legacyData.expensesJson) : [],
        mileage: legacyData.mileageJson ? JSON.parse(legacyData.mileageJson) : [],
        shoppingList: legacyData.shoppingJson ? JSON.parse(legacyData.shoppingJson) : [],
        priceBook: legacyData.priceBookJson ? JSON.parse(legacyData.priceBookJson) : [],
        customSupplyPins: legacyData.customSupplyPinsJson
          ? JSON.parse(legacyData.customSupplyPinsJson)
          : [],
        settings: legacyData.settingsJson ? JSON.parse(legacyData.settingsJson) : undefined,
        constants: legacyData.constantsJson ? JSON.parse(legacyData.constantsJson) : undefined,
        deletedCustomerIds: meta?.deletedCustomerIds || {},
      };

      if (!meta || legacyTs > meta.lastUpdated) {
        const metaDocData = buildAppMetaCloudDocData(userId, legacyMetaInput, legacyTs, {
          migratedFromLegacyAt: Date.now(),
        });
        await setDoc(metaRef, metaDocData, { merge: true });
        meta = parseAppMetaCloudDoc(metaDocData);
      }

      const migratedRecords: CloudCustomerRecord[] = migratedItems.map((item) => ({
        customer: item.customer,
        lastUpdated: item.lastUpdated,
        updatedAt: new Date(item.lastUpdated).toISOString(),
        deviceLabel: legacyData.deviceLabel || 'Legacy Migration',
        deviceId: legacyData.deviceId,
      }));

      return {
        customerRecords: migratedRecords,
        meta,
        migratedFromLegacy: true,
        migratedCustomerCount: migratedRecords.length,
      };
    }
  }

  return {
    customerRecords,
    meta,
    migratedFromLegacy: false,
    migratedCustomerCount: 0,
  };
}

// ============================================================================
// Backwards-compatible wrappers (for legacy modal imports)
// ============================================================================

export async function saveWorkspaceToCloud(
  userId: string,
  payload: CloudWorkspaceInput,
  lastUpdatedOverride?: number
): Promise<{ saved: boolean; lastUpdated: number; payloadBytes: number }> {
  const ts =
    typeof lastUpdatedOverride === 'number' && lastUpdatedOverride > 0
      ? Math.floor(lastUpdatedOverride)
      : Date.now();

  const stats = calculateMasterCloudStorageStats(payload, userId, ts);
  await saveCustomersBatchToCloud(
    userId,
    (payload.customers || []).map((c) => ({ customer: c, lastUpdated: ts }))
  );
  await saveAppMetaToCloud(
    userId,
    {
      notes: payload.notes || [],
      expenses: payload.expenses || [],
      mileage: payload.mileage || [],
      shoppingList: payload.shoppingList || [],
      priceBook: payload.priceBook || [],
      customSupplyPins: payload.customSupplyPins || [],
      settings: payload.settings,
      constants: payload.constants,
    },
    ts
  );
  return { saved: true, lastUpdated: ts, payloadBytes: stats.totalBytes };
}

export async function loadWorkspaceFromCloud(
  userId: string,
  preferServer = false
): Promise<CloudWorkspacePayload | null> {
  const master = await loadMasterCloudWorkspace(userId, preferServer);
  if (!master) return null;
  if (master.customerRecords.length === 0 && !master.meta) return null;

  const maxCustomerTs = master.customerRecords.reduce(
    (max, r) => Math.max(max, r.lastUpdated || 0),
    0
  );
  const lastUpdated = Math.max(maxCustomerTs, master.meta?.lastUpdated || 0);

  return {
    customers: master.customerRecords.map((r) => r.customer),
    notes: master.meta?.notes || [],
    expenses: master.meta?.expenses || [],
    mileage: master.meta?.mileage || [],
    shoppingList: master.meta?.shoppingList || [],
    priceBook: master.meta?.priceBook || [],
    customSupplyPins: master.meta?.customSupplyPins,
    settings: master.meta?.settings,
    constants: master.meta?.constants,
    lastUpdated,
    updatedAt: new Date(lastUpdated || Date.now()).toISOString(),
    deviceLabel: master.meta?.deviceLabel || 'Cloud Remote',
    deviceId: master.meta?.deviceId,
  };
}

export async function testFirestoreConnection(): Promise<boolean> {
  const activeUser = firebaseAuth.currentUser;
  if (!isAuthorizedAdminUser(activeUser) || !activeUser?.uid) return false;
  try {
    await getDocFromServer(getAppMetaDocRef(activeUser.uid));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return false;
    }
    return true;
  }
}
