import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInAnonymously,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Customer, JobProject, FieldNote } from '../types';

// Initialize Firebase App singleton safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const GOOGLE_WORKSPACE_SCOPES: string[] = [];

const provider = new GoogleAuthProvider();
GOOGLE_WORKSPACE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to track sign-in state
let isSigningIn = false;
// In-memory access token cache (cleared on signout, never stored in localStorage per security rules)
let cachedAccessToken: string | null = null;
let cachedUser: User | null = null;

// Auth state listeners
type AuthCallback = (user: User | null, token: string | null) => void;
const authListeners: Set<AuthCallback> = new Set();

export const subscribeToAuth = (cb: AuthCallback) => {
  authListeners.add(cb);
  cb(cachedUser || auth.currentUser, cachedAccessToken);
  return () => {
    authListeners.delete(cb);
  };
};

const notifyListeners = (user: User | null, token: string | null) => {
  cachedUser = user;
  cachedAccessToken = token;
  authListeners.forEach((cb) => cb(user, token));
};

// Initialize auth listener on application start
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      notifyListeners(user, cachedAccessToken);
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      notifyListeners(null, null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Sign in with Email and Password (Firebase Auth)
 * Completely unrestricted by Google OAuth verification or iframe popups.
 */
export const signInWithEmail = async (email: string, pass: string): Promise<User> => {
  try {
    isSigningIn = true;
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    notifyListeners(cred.user, null);
    return cred.user;
  } catch (error: any) {
    console.error('Email sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Register a new contractor account with Email and Password
 */
export const signUpWithEmail = async (email: string, pass: string): Promise<User> => {
  try {
    isSigningIn = true;
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    notifyListeners(cred.user, null);
    return cred.user;
  } catch (error: any) {
    console.error('Email registration error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Send password reset email
 */
export const resetPassword = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(auth, email.trim());
};

/**
 * Quick 1-Click login for Josh Krueger (kruegerjosh0@gmail.com)
 * Tries sign in first, creates account if first time, or falls back gracefully so user is never locked out.
 */
export const quickContractorLogin = async (customEmail = 'kruegerjosh0@gmail.com'): Promise<User> => {
  const defaultPass = 'KruegerPainting2026!';
  try {
    return await signInWithEmail(customEmail, defaultPass);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
      try {
        return await signUpWithEmail(customEmail, defaultPass);
      } catch (signupErr: any) {
        if (signupErr?.code === 'auth/operation-not-allowed') {
          try {
            const anon = await signInAnonymously(auth);
            notifyListeners(anon.user, null);
            return anon.user;
          } catch {}
        }
        throw signupErr;
      }
    } else if (err?.code === 'auth/operation-not-allowed') {
      try {
        const anon = await signInAnonymously(auth);
        notifyListeners(anon.user, null);
        return anon.user;
      } catch {}
    }
    throw err;
  }
};

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google authorization completed, but no access token was returned.');
    }

    cachedAccessToken = credential.accessToken;
    notifyListeners(result.user, cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
      console.warn('Google Sign-In popup closed by user or blocked by browser.');
    } else if (error?.code === 'auth/popup-blocked') {
      console.warn('Google Sign-In popup was blocked by browser.');
    } else {
      console.error('Google Sign-In Error:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const signOutGoogle = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
  notifyListeners(null, null);
};

export const signOutContractor = signOutGoogle;

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getCurrentUser = (): User | null => {
  return cachedUser || auth.currentUser;
};

// -------------------------------------------------------------------------
// GOOGLE CALENDAR API INTEGRATION
// -------------------------------------------------------------------------
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  htmlLink?: string;
}

export const fetchGoogleCalendarEvents = async (
  startDate?: string,
  endDate?: string
): Promise<GoogleCalendarEvent[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  const now = new Date();
  const timeMin = startDate
    ? new Date(startDate).toISOString()
    : new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const timeMax = endDate
    ? new Date(endDate).toISOString()
    : new Date(now.getFullYear(), now.getMonth() + 3, 28).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    timeMin
  )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Calendar fetch failed (${res.status})`);
  }

  const data = await res.json();
  return (data.items || []) as GoogleCalendarEvent[];
};

export const syncJobToGoogleCalendar = async (
  customer: Customer,
  job: JobProject
): Promise<GoogleCalendarEvent> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  if (!job.schedDate) {
    throw new Error('This job does not have a scheduled start date.');
  }

  // Format start and end date (all-day event or date string YYYY-MM-DD)
  const startDateStr = job.schedDate;
  // If end date exists, set it, else next day for all-day event
  let endDateStr = job.schedEndDate || job.schedDate;

  // For all-day events, Google Calendar requires end date to be exclusive (next day)
  try {
    const d = new Date(endDateStr);
    d.setDate(d.getDate() + 1);
    endDateStr = d.toISOString().split('T')[0];
  } catch {
    // keep as is
  }

  const summary = `🎨 ${customer.name} - ${job.title || 'Painting Project'}`;
  const descriptionParts: string[] = [
    `Krueger Painting Project: ${job.title}`,
    `Status: ${job.status}`,
    `Client: ${customer.name}`,
    `Phone: ${customer.phone || 'N/A'}`,
    `Address: ${customer.address || 'Job Site'}`,
    '',
    'Scope of Work:',
    job.scope || '2 Full Coats Premium Latex Coatings',
    '',
    job.prepScope ? `Prep Work:\n${job.prepScope}\n` : '',
    `Estimated Work Days: ${job.workDays || 1}`,
  ];

  const eventPayload = {
    summary,
    location: customer.address || '',
    description: descriptionParts.join('\n'),
    start: {
      date: startDateStr,
    },
    end: {
      date: endDateStr,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 120 }, // 2 hours before
      ],
    },
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventPayload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to create calendar event (${res.status})`);
  }

  return await res.json();
};

// -------------------------------------------------------------------------
// GOOGLE CONTACTS (PEOPLE API) INTEGRATION
// -------------------------------------------------------------------------
export interface GoogleContactPerson {
  resourceName: string;
  etag: string;
  displayName: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export const fetchGoogleContacts = async (pageSize = 100): Promise<GoogleContactPerson[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  const url = `https://people.googleapis.com/v1/people/me/connections?pageSize=${pageSize}&personFields=names,emailAddresses,phoneNumbers,postalAddresses,biographies`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to fetch contacts (${res.status})`);
  }

  const data = await res.json();
  const connections = data.connections || [];

  return connections.map((c: any) => {
    const name = c.names?.[0]?.displayName || 'Unnamed Contact';
    const email = c.emailAddresses?.[0]?.value || '';
    const phone = c.phoneNumbers?.[0]?.value || '';
    const address = c.postalAddresses?.[0]?.formattedValue || '';
    const notes = c.biographies?.[0]?.value || '';

    return {
      resourceName: c.resourceName,
      etag: c.etag,
      displayName: name,
      email,
      phone,
      address,
      notes,
    };
  });
};

export const createGoogleContact = async (customer: {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}): Promise<GoogleContactPerson> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  const parts = customer.name.trim().split(' ');
  const givenName = parts[0] || 'Client';
  const familyName = parts.slice(1).join(' ') || '';

  const contactPayload: any = {
    names: [
      {
        givenName,
        familyName,
        displayName: customer.name,
      },
    ],
  };

  if (customer.email?.trim()) {
    contactPayload.emailAddresses = [{ value: customer.email.trim(), type: 'work' }];
  }

  if (customer.phone?.trim()) {
    contactPayload.phoneNumbers = [{ value: customer.phone.trim(), type: 'mobile' }];
  }

  if (customer.address?.trim()) {
    contactPayload.postalAddresses = [
      {
        formattedValue: customer.address.trim(),
        type: 'work',
      },
    ];
  }

  if (customer.notes?.trim()) {
    contactPayload.biographies = [{ value: customer.notes.trim(), contentType: 'TEXT_PLAIN' }];
  }

  const res = await fetch('https://people.googleapis.com/v1/people:createContact', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(contactPayload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to create contact (${res.status})`);
  }

  const data = await res.json();
  return {
    resourceName: data.resourceName,
    etag: data.etag,
    displayName: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes,
  };
};

export const updateGoogleContact = async (
  resourceName: string,
  etag: string,
  customer: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
  }
): Promise<GoogleContactPerson> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  const parts = customer.name.trim().split(' ');
  const givenName = parts[0] || 'Client';
  const familyName = parts.slice(1).join(' ') || '';

  const contactPayload: any = {
    etag,
    names: [
      {
        givenName,
        familyName,
        displayName: customer.name,
      },
    ],
    emailAddresses: customer.email ? [{ value: customer.email.trim(), type: 'work' }] : [],
    phoneNumbers: customer.phone ? [{ value: customer.phone.trim(), type: 'mobile' }] : [],
    postalAddresses: customer.address ? [{ formattedValue: customer.address.trim(), type: 'work' }] : [],
    biographies: customer.notes ? [{ value: customer.notes.trim(), contentType: 'TEXT_PLAIN' }] : [],
  };

  const updateMask = 'names,emailAddresses,phoneNumbers,postalAddresses,biographies';
  const res = await fetch(
    `https://people.googleapis.com/v1/${resourceName}:updateContact?updatePersonFields=${updateMask}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contactPayload),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to update contact (${res.status})`);
  }

  const data = await res.json();
  return {
    resourceName: data.resourceName,
    etag: data.etag,
    displayName: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes,
  };
};
