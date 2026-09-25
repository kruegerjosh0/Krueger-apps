import { getFirestore, doc, setDoc, getDoc, onSnapshot, getDocFromServer } from 'firebase/firestore';
import { getApps, initializeApp, getApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Customer,
  FieldNote,
  ExpenseEntry,
  MileageEntry,
  ShoppingItem,
  PriceBookItem,
  PrintSettings,
  SystemConstants,
} from '../types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firestore = getFirestore(app);

// Test Firestore connection per Firebase Skill guidelines
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(firestore, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore is in offline mode or network unreachable.');
      return false;
    }
    // Test document might not exist, but if it didn't throw offline error, connection is fine
    return true;
  }
}

export interface CloudWorkspacePayload {
  customers: Customer[];
  notes: FieldNote[];
  expenses: ExpenseEntry[];
  mileage: MileageEntry[];
  shoppingList: ShoppingItem[];
  priceBook: PriceBookItem[];
  settings: PrintSettings;
  constants: SystemConstants;
  updatedAt: string;
  deviceLabel: string;
}

/**
 * Saves all contractor data to Firestore cloud under the authenticated user's ID
 */
export async function saveWorkspaceToCloud(
  userId: string,
  payload: Omit<CloudWorkspacePayload, 'updatedAt' | 'deviceLabel'>
): Promise<void> {
  if (!userId) return;

  const syncDocRef = doc(firestore, 'users', userId, 'sync', 'current');
  const now = new Date().toISOString();
  const deviceLabel = navigator.userAgent.includes('Mobile') ? 'Mobile Phone' : 'Contractor Workstation';

  const docData = {
    userId,
    customersJson: JSON.stringify(payload.customers || []),
    notesJson: JSON.stringify(payload.notes || []),
    expensesJson: JSON.stringify(payload.expenses || []),
    mileageJson: JSON.stringify(payload.mileage || []),
    shoppingJson: JSON.stringify(payload.shoppingList || []),
    priceBookJson: JSON.stringify(payload.priceBook || []),
    settingsJson: JSON.stringify(payload.settings || {}),
    constantsJson: JSON.stringify(payload.constants || {}),
    deviceLabel,
    updatedAt: now,
  };

  await setDoc(syncDocRef, docData, { merge: true });
}

/**
 * Loads the latest workspace state from Firestore
 */
export async function loadWorkspaceFromCloud(userId: string): Promise<CloudWorkspacePayload | null> {
  if (!userId) return null;

  try {
    const syncDocRef = doc(firestore, 'users', userId, 'sync', 'current');
    const snap = await getDoc(syncDocRef);
    if (!snap.exists()) return null;

    const d = snap.data();
    return {
      customers: d.customersJson ? JSON.parse(d.customersJson) : [],
      notes: d.notesJson ? JSON.parse(d.notesJson) : [],
      expenses: d.expensesJson ? JSON.parse(d.expensesJson) : [],
      mileage: d.mileageJson ? JSON.parse(d.mileageJson) : [],
      shoppingList: d.shoppingJson ? JSON.parse(d.shoppingJson) : [],
      priceBook: d.priceBookJson ? JSON.parse(d.priceBookJson) : [],
      settings: d.settingsJson ? JSON.parse(d.settingsJson) : undefined,
      constants: d.constantsJson ? JSON.parse(d.constantsJson) : undefined,
      updatedAt: d.updatedAt || new Date().toISOString(),
      deviceLabel: d.deviceLabel || 'Cloud Remote',
    };
  } catch (err) {
    console.error('Failed to load cloud workspace:', err);
    return null;
  }
}

/**
 * Subscribes to real-time changes made from any device connected to this account
 */
export function subscribeToCloudWorkspace(
  userId: string,
  onRemoteChange: (payload: CloudWorkspacePayload) => void
): () => void {
  if (!userId) return () => {};

  const syncDocRef = doc(firestore, 'users', userId, 'sync', 'current');
  return onSnapshot(
    syncDocRef,
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      try {
        const payload: CloudWorkspacePayload = {
          customers: d.customersJson ? JSON.parse(d.customersJson) : [],
          notes: d.notesJson ? JSON.parse(d.notesJson) : [],
          expenses: d.expensesJson ? JSON.parse(d.expensesJson) : [],
          mileage: d.mileageJson ? JSON.parse(d.mileageJson) : [],
          shoppingList: d.shoppingJson ? JSON.parse(d.shoppingJson) : [],
          priceBook: d.priceBookJson ? JSON.parse(d.priceBookJson) : [],
          settings: d.settingsJson ? JSON.parse(d.settingsJson) : undefined,
          constants: d.constantsJson ? JSON.parse(d.constantsJson) : undefined,
          updatedAt: d.updatedAt || new Date().toISOString(),
          deviceLabel: d.deviceLabel || 'Other Device',
        };
        onRemoteChange(payload);
      } catch (err) {
        console.warn('Failed parsing remote workspace snapshot:', err);
      }
    },
    (err) => {
      console.warn('Cloud sync snapshot warning:', err.message);
    }
  );
}
