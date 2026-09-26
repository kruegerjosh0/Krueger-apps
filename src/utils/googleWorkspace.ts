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

export const GOOGLE_WORKSPACE_SCOPES: string[] = [
  'https://www.googleapis.com/auth/calendar.events',
];

const provider = new GoogleAuthProvider();
GOOGLE_WORKSPACE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
provider.setCustomParameters({
  prompt: 'consent select_account',
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
// GOOGLE CALENDAR DIRECT URL & ICS SYNC (Mobile & Web Universal)
// -------------------------------------------------------------------------
export const createGoogleCalendarUrl = (
  customerName: string,
  job: JobProject,
  address?: string,
  phone?: string
): string => {
  const cleanStart = (job.schedDate || '').trim();
  const sFormatted = cleanStart.replace(/-/g, '');
  const cleanEnd = (job.schedEndDate || job.schedDate || '').trim();
  let eFormatted = sFormatted;

  if (cleanEnd) {
    try {
      const parts = cleanEnd.split('-').map(Number);
      if (parts.length === 3) {
        // Safe local date addition (exclusive next day for all-day events in Google Calendar)
        const d = new Date(parts[0], parts[1] - 1, parts[2] + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        eFormatted = `${y}${m}${day}`;
      } else {
        eFormatted = cleanEnd.replace(/-/g, '');
      }
    } catch {
      eFormatted = cleanEnd.replace(/-/g, '');
    }
  }

  const title = `🎨 Krueger Painting: ${customerName} - ${job.title || 'Painting Project'}`;
  const details = [
    `Client: ${customerName}`,
    phone ? `Phone: ${phone}` : '',
    address ? `Site Address: ${address}` : '',
    `Status: ${job.status}`,
    job.scope ? `\nScope of Work:\n${job.scope}` : '',
    job.prepScope ? `\nPrep Work:\n${job.prepScope}` : '',
    `\nCreated via Krueger Painting OS`,
  ]
    .filter(Boolean)
    .join('\n');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title
  )}&dates=${sFormatted}/${eFormatted}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(
    address || ''
  )}`;
};

export const generateIcsContent = (customers: Customer[]): string => {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Krueger Painting OS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Krueger Painting Schedule',
  ];

  customers.forEach((c) => {
    (c.jobs || []).forEach((j) => {
      if (j.schedDate) {
        const start = j.schedDate.replace(/-/g, '');
        const endDate = j.schedEndDate || j.schedDate;
        let end = start;
        try {
          const d = new Date(endDate + 'T00:00:00');
          d.setDate(d.getDate() + 1);
          end = d.toISOString().split('T')[0].replace(/-/g, '');
        } catch {
          end = endDate.replace(/-/g, '');
        }

        const summary = `🎨 ${c.name} - ${j.title || 'Painting'} (${j.status})`;
        const desc = `Client: ${c.name}\\nPhone: ${c.phone || 'N/A'}\\nStatus: ${j.status}\\nScope: ${
          j.scope ? j.scope.replace(/\n/g, ' ') : 'Painting Project'
        }\\nKrueger Painting OS`;

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:krueger-job-${j.id}-${start}@kruegerpainting.com`);
        lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
        lines.push(`SUMMARY:${summary}`);
        lines.push(`DESCRIPTION:${desc}`);
        if (c.address) lines.push(`LOCATION:${c.address}`);
        lines.push(`DTSTART;VALUE=DATE:${start}`);
        lines.push(`DTEND;VALUE=DATE:${end}`);
        lines.push('STATUS:CONFIRMED');
        lines.push('END:VEVENT');
      }
    });
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
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
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  htmlLink?: string;
  status?: string;
  colorId?: string;
  calendarName?: string;
}

export const fetchGoogleCalendarEvents = async (
  startDate?: string,
  endDate?: string
): Promise<GoogleCalendarEvent[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  // If startDate / endDate provided, ensure wide window to capture all time zones
  let timeMin: string;
  let timeMax: string;

  if (startDate) {
    const dMin = new Date(startDate);
    // Rewind 2 days to avoid time zone / UTC date boundary cutoff
    dMin.setHours(0, 0, 0, 0);
    dMin.setDate(dMin.getDate() - 2);
    timeMin = dMin.toISOString();
  } else {
    const dMin = new Date();
    dMin.setDate(dMin.getDate() - 30);
    timeMin = dMin.toISOString();
  }

  if (endDate) {
    const dMax = new Date(endDate);
    // Forward 3 days to avoid time zone / exclusive bounds cutoff
    dMax.setHours(23, 59, 59, 999);
    dMax.setDate(dMax.getDate() + 3);
    timeMax = dMax.toISOString();
  } else {
    const dMax = new Date();
    dMax.setDate(dMax.getDate() + 90);
    timeMax = dMax.toISOString();
  }

  // Fetch events from a calendar by ID
  const fetchFromCalendar = async (calId: string, calTitle?: string): Promise<GoogleCalendarEvent[]> => {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calId
    )}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(
      timeMax
    )}&singleEvents=true&orderBy=startTime&maxResults=250`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        cachedAccessToken = null;
        notifyListeners(cachedUser, null);
        throw new Error('Google Calendar connection expired. Please reconnect.');
      }
      return [];
    }

    const data = await res.json();
    return ((data.items || []) as any[])
      .filter((ev: any) => ev.status !== 'cancelled' && (ev.summary || ev.description))
      .map((ev: any) => ({
        id: ev.id,
        summary: ev.summary || '(Untitled Event)',
        description: ev.description,
        location: ev.location,
        start: ev.start || {},
        end: ev.end || {},
        htmlLink: ev.htmlLink,
        status: ev.status,
        colorId: ev.colorId,
        calendarName: calTitle || (calId === 'primary' ? 'Primary' : undefined),
      }));
  };

  const primaryEvents = await fetchFromCalendar('primary', 'My Calendar');

  // Also query user's calendar list to include other calendars (work, personal, shared)
  let allEvents = [...primaryEvents];
  try {
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const calendars = (listData.items || []).filter(
        (c: any) => !c.primary && c.selected !== false && c.id
      );
      // Fetch up to 5 non-primary calendars
      for (const cal of calendars.slice(0, 5)) {
        const secondary = await fetchFromCalendar(cal.id, cal.summary);
        allEvents = allEvents.concat(secondary);
      }
    }
  } catch {
    // Primary calendar was already fetched successfully
  }

  // Deduplicate by event id
  const seenIds = new Set<string>();
  const uniqueEvents: GoogleCalendarEvent[] = [];
  for (const ev of allEvents) {
    if (!seenIds.has(ev.id)) {
      seenIds.add(ev.id);
      uniqueEvents.push(ev);
    }
  }

  // Sort by startTime
  uniqueEvents.sort((a, b) => {
    const timeA = a.start?.dateTime || a.start?.date || '';
    const timeB = b.start?.dateTime || b.start?.date || '';
    return timeA.localeCompare(timeB);
  });

  return uniqueEvents;
};

export const createGoogleCalendarEvent = async (event: {
  summary: string;
  description?: string;
  location?: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  startTime?: string; // HH:MM
  endTime?: string;
  allDay?: boolean;
}): Promise<GoogleCalendarEvent> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  let start: any = {};
  let end: any = {};

  if (event.allDay || !event.startTime) {
    start = { date: event.startDate };
    let endD = event.endDate || event.startDate;
    try {
      const d = new Date(endD + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      endD = d.toISOString().split('T')[0];
    } catch {
      endD = event.startDate;
    }
    end = { date: endD };
  } else {
    const startIso = new Date(`${event.startDate}T${event.startTime}:00`).toISOString();
    const endIso = event.endTime
      ? new Date(`${event.endDate || event.startDate}T${event.endTime}:00`).toISOString()
      : new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
    start = { dateTime: startIso };
    end = { dateTime: endIso };
  }

  const payload: any = {
    summary: event.summary,
    description: event.description || '',
    location: event.location || '',
    start,
    end,
    reminders: {
      useDefault: true,
    },
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to create calendar event (${res.status})`);
  }

  return await res.json();
};

export const deleteGoogleCalendarEvent = async (
  eventId: string,
  calendarId = 'primary'
): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to delete calendar event (${res.status})`);
  }
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
