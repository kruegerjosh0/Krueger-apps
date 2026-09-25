import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Customer, JobProject, FieldNote } from '../types';

// Initialize Firebase App singleton safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

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
  cb(cachedUser, cachedAccessToken);
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
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        notifyListeners(user, cachedAccessToken);
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token must be acquired via interactive sign-in with popup
        notifyListeners(user, null);
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      notifyListeners(null, null);
      if (onAuthFailure) onAuthFailure();
    }
  });
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
      console.warn('Google Sign-In popup closed by user.');
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

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getCurrentUser = (): User | null => {
  return cachedUser;
};

// -------------------------------------------------------------------------
// GMAIL API INTEGRATION
// -------------------------------------------------------------------------
export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
  timestamp: number;
}

export interface GmailFullMessage extends GmailMessageSummary {
  bodyText: string;
  bodyHtml?: string;
}

export const fetchGmailMessages = async (
  query = '',
  maxResults = 25
): Promise<GmailMessageSummary[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace. Please sign in with Google.');

  const qParam = query ? `&q=${encodeURIComponent(query)}` : '';
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${qParam}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      notifyListeners(cachedUser, null);
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Gmail API error (${res.status})`);
  }

  const listData = await res.json();
  if (!listData.messages || !Array.isArray(listData.messages)) {
    return [];
  }

  // Fetch summary metadata in batches
  const summaries: GmailMessageSummary[] = await Promise.all(
    listData.messages.slice(0, maxResults).map(async (msgItem: { id: string; threadId: string }) => {
      try {
        const metaRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgItem.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!metaRes.ok) return null;
        const msg = await metaRes.json();

        const headers = msg.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const isUnread = Array.isArray(msg.labelIds) && msg.labelIds.includes('UNREAD');
        const timestamp = parseInt(msg.internalDate || '0', 10);

        return {
          id: msg.id,
          threadId: msg.threadId,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject') || '(No Subject)',
          date: getHeader('Date') || new Date(timestamp).toLocaleDateString(),
          snippet: msg.snippet || '',
          isUnread,
          timestamp,
        } as GmailMessageSummary;
      } catch {
        return null;
      }
    })
  );

  return summaries.filter(Boolean) as GmailMessageSummary[];
};

export const fetchGmailMessageDetails = async (messageId: string): Promise<GmailFullMessage> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to fetch email details.');
  }

  const data = await res.json();
  const headers = data.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  // Extract body
  let bodyText = '';
  let bodyHtml = '';

  const extractParts = (part: any) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) {
      try {
        bodyText += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      } catch {}
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      try {
        bodyHtml += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      } catch {}
    }
    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(extractParts);
    }
  };

  extractParts(data.payload);
  if (!bodyText && bodyHtml) {
    // Strip basic HTML tags for fallback text
    bodyText = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (!bodyText) {
    bodyText = data.snippet || '(Empty message body)';
  }

  const isUnread = Array.isArray(data.labelIds) && data.labelIds.includes('UNREAD');
  const timestamp = parseInt(data.internalDate || '0', 10);

  return {
    id: data.id,
    threadId: data.threadId,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject') || '(No Subject)',
    date: getHeader('Date') || new Date(timestamp).toLocaleDateString(),
    snippet: data.snippet || '',
    isUnread,
    timestamp,
    bodyText,
    bodyHtml: bodyHtml || undefined,
  };
};

export const sendGmailMessage = async (params: {
  to: string;
  subject: string;
  body: string;
  replyToThreadId?: string;
}): Promise<{ id: string; threadId: string }> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google Workspace.');

  const { to, subject, body, replyToThreadId } = params;
  if (!to.trim()) throw new Error('Recipient email is required.');

  // Build standard RFC 2822 email format
  const emailLines: string[] = [];
  emailLines.push(`To: ${to.trim()}`);
  emailLines.push(`Subject: ${subject.trim()}`);
  emailLines.push('Content-Type: text/plain; charset=utf-8');
  emailLines.push('MIME-Version: 1.0');
  emailLines.push('');
  emailLines.push(body);

  const rawMessage = emailLines.join('\r\n');
  const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const payload: any = { raw: encodedMessage };
  if (replyToThreadId) {
    payload.threadId = replyToThreadId;
  }

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to send email (${res.status})`);
  }

  return await res.json();
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
