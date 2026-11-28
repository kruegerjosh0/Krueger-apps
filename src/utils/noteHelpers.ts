import { FieldNote, NoteFolder } from '../types';

export const DEFAULT_NOTE_FOLDERS: NoteFolder[] = [
  { id: 'job-estimate', name: 'Job & Estimate Notes', icon: '🎨', isBuiltIn: true },
  { id: 'supplies-orders', name: 'Supplies & Orders', icon: '🛒', isBuiltIn: true },
  { id: 'business-admin', name: 'Business / Admin', icon: '💼', isBuiltIn: true },
];

export const BUILT_IN_FOLDER_IDS = new Set(DEFAULT_NOTE_FOLDERS.map((f) => f.id));

/**
 * Ensures the 3 built-in starter folders are always present while preserving
 * all custom folders in order without duplicates.
 */
export function normalizeNoteFolders(folders?: NoteFolder[] | null): NoteFolder[] {
  const input = Array.isArray(folders) ? folders : [];
  const byId = new Map<string, NoteFolder>();

  // Always seed built-in starter folders first
  for (const starter of DEFAULT_NOTE_FOLDERS) {
    byId.set(starter.id, { ...starter });
  }

  for (const f of input) {
    if (!f || typeof f.id !== 'string' || !f.id.trim()) continue;
    const cleanName = (f.name || '').trim();
    if (!cleanName) continue;
    if (BUILT_IN_FOLDER_IDS.has(f.id)) {
      byId.set(f.id, {
        ...byId.get(f.id)!,
        name: cleanName,
        isBuiltIn: true,
      });
    } else {
      byId.set(f.id, {
        id: f.id,
        name: cleanName,
        icon: f.icon || '📂',
        isBuiltIn: false,
      });
    }
  }

  return Array.from(byId.values());
}

/**
 * Maps legacy notes (which only had `category`) into the matching starter folder.
 */
export function inferDefaultFolderId(note: Partial<FieldNote>): string {
  if (note.folderId && typeof note.folderId === 'string' && note.folderId.trim()) {
    return note.folderId.trim();
  }
  const cat = (note.category || '').toLowerCase();
  if (cat.includes('material') || cat.includes('suppl') || cat.includes('order')) {
    return 'supplies-orders';
  }
  if (cat.includes('crew') || cat.includes('job') || cat.includes('estimate') || cat.includes('site')) {
    return 'job-estimate';
  }
  return 'business-admin';
}

export function normalizeFieldNote(note: FieldNote, folders?: NoteFolder[]): FieldNote {
  const validFolderIds = new Set((folders || DEFAULT_NOTE_FOLDERS).map((f) => f.id));
  const candidate = inferDefaultFolderId(note);
  const folderId = validFolderIds.has(candidate) ? candidate : DEFAULT_NOTE_FOLDERS[0].id;
  return {
    ...note,
    folderId,
    pinned: Boolean(note.pinned),
    completed: Boolean(note.completed),
    dueAt: typeof note.dueAt === 'string' && note.dueAt.trim() ? note.dueAt.trim() : undefined,
  };
}

/**
 * Parses a local datetime-local string (`YYYY-MM-DDTHH:mm`) or ISO string into local epoch ms.
 */
export function parseNoteDueAtMs(dueAt?: string): number | null {
  if (!dueAt || typeof dueAt !== 'string') return null;
  const trimmed = dueAt.trim();
  if (!trimmed) return null;

  // Match HTML datetime-local format YYYY-MM-DDTHH:mm (or with :ss) as LOCAL wall clock time
  const localMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, y, m, d, hh, mm, ss] = localMatch;
    const dt = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      ss ? Number(ss) : 0,
      0
    );
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export type NoteDueState = 'NONE' | 'COMPLETED' | 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';

export function getNoteDueState(note: FieldNote, nowMs = Date.now()): NoteDueState {
  if (note.completed) return 'COMPLETED';
  const dueMs = parseNoteDueAtMs(note.dueAt);
  if (dueMs === null) return 'NONE';

  if (dueMs <= nowMs) return 'OVERDUE';

  const now = new Date(nowMs);
  const due = new Date(dueMs);
  const sameDay =
    now.getFullYear() === due.getFullYear() &&
    now.getMonth() === due.getMonth() &&
    now.getDate() === due.getDate();

  return sameDay ? 'DUE_TODAY' : 'UPCOMING';
}

/**
 * True when an uncompleted note is Overdue or Due Today (surfaces in Top Priority Strip & nav badge).
 */
export function isNoteActionNeeded(note: FieldNote, nowMs = Date.now()): boolean {
  const state = getNoteDueState(note, nowMs);
  return state === 'OVERDUE' || state === 'DUE_TODAY';
}

/**
 * True when an uncompleted note has reached its due time and should trigger the in-app chime/banner.
 */
export function isNoteAlertDueNow(note: FieldNote, nowMs = Date.now()): boolean {
  if (note.completed) return false;
  const dueMs = parseNoteDueAtMs(note.dueAt);
  if (dueMs === null || dueMs > nowMs) return false;

  if (typeof note.snoozedUntil === 'number' && note.snoozedUntil > nowMs) {
    return false;
  }
  if (typeof note.alertedAt === 'number' && note.alertedAt >= dueMs) {
    // Only re-alert if snoozedUntil has passed and is after alertedAt
    if (!(typeof note.snoozedUntil === 'number' && note.snoozedUntil <= nowMs && note.snoozedUntil > note.alertedAt)) {
      return false;
    }
  }
  return true;
}

export function formatNoteDueLabel(dueAt?: string, nowMs = Date.now()): string {
  const dueMs = parseNoteDueAtMs(dueAt);
  if (dueMs === null) return '';

  const now = new Date(nowMs);
  const due = new Date(dueMs);
  const timeStr = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const dayDiff = Math.round((startOfDue - startOfToday) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) return `Today, ${timeStr}`;
  if (dayDiff === 1) return `Tomorrow, ${timeStr}`;
  if (dayDiff === -1) return `Yesterday, ${timeStr}`;

  const datePart = due.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${datePart}, ${timeStr}`;
}

/**
 * Plays a clean, pleasant two-tone Web Audio reminder chime (offline-first, zero external files).
 */
export function playReminderChime(): void {
  try {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playTone(659.25, 0, 0.24);     // E5
    playTone(880.0, 0.18, 0.36);   // A5
    playTone(1046.5, 0.38, 0.42);  // C6

    setTimeout(() => {
      ctx.close?.().catch?.(() => {});
    }, 1200);
  } catch {
    // Autoplay policy or unsupported environment — silent no-op
  }
}

function escapeIcsText(raw: string): string {
  return String(raw || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function formatIcsLocalDateTime(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}` +
    `T${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}`
  );
}

function formatIcsUtcStamp(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`
  );
}

/**
 * Generates an RFC 5545 single-event .ics string with VALARM (TRIGGER:PT0M)
 * set for the exact local due date & time so Android/Samsung Calendar or Clock
 * triggers a native device alert even when the PWA is closed.
 */
export function buildNoteReminderIcsContent(note: FieldNote, folderName?: string): string | null {
  const dueMs = parseNoteDueAtMs(note.dueAt);
  if (dueMs === null) return null;

  const startDt = new Date(dueMs);
  const endDt = new Date(dueMs + 30 * 60 * 1000);
  const nowDt = new Date();
  const uid = `krueger-note-${note.id}-${dueMs}@kruegerpaintingwi.com`;

  const summary = `🔔 ${note.title || 'Krueger Painting Reminder'}`;
  const descParts: string[] = [];
  if (folderName) descParts.push(`Folder: ${folderName}`);
  if (note.body?.trim()) descParts.push(note.body.trim());
  descParts.push('Created in Krueger Painting OS — Notes');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Krueger Painting OS//Notes Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtcStamp(nowDt)}`,
    `DTSTART:${formatIcsLocalDateTime(startDt)}`,
    `DTEND:${formatIcsLocalDateTime(endDt)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(summary)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadNoteReminderIcs(note: FieldNote, folderName?: string): boolean {
  const ics = buildNoteReminderIcsContent(note, folderName);
  if (!ics) return false;

  const slug = (note.title || 'reminder')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'reminder';
  const filename = `Krueger-Reminder-${slug}.ics`;

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

export interface ChecklistItem {
  lineIndex: number;
  text: string;
  checked: boolean;
}

const CHECKED_PREFIX_RE = /^\s*(?:[-*•]\s*)?\[[xX]\]\s*/;
const UNCHECKED_PREFIX_RE = /^\s*(?:[-*•]\s*)?\[\s?\]\s*/;
const BULLET_PREFIX_RE = /^\s*[-*•]\s+/;

export function parseChecklistItems(body?: string): ChecklistItem[] {
  const lines = String(body || '').split(/\r?\n/);
  const items: ChecklistItem[] = [];

  lines.forEach((raw, idx) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (CHECKED_PREFIX_RE.test(raw)) {
      items.push({
        lineIndex: idx,
        text: raw.replace(CHECKED_PREFIX_RE, '').trim(),
        checked: true,
      });
    } else if (UNCHECKED_PREFIX_RE.test(raw)) {
      items.push({
        lineIndex: idx,
        text: raw.replace(UNCHECKED_PREFIX_RE, '').trim(),
        checked: false,
      });
    } else {
      items.push({
        lineIndex: idx,
        text: raw.replace(BULLET_PREFIX_RE, '').trim(),
        checked: false,
      });
    }
  });

  return items;
}

export function toggleChecklistLine(body: string, lineIndex: number): string {
  const lines = String(body || '').split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) return body;

  const raw = lines[lineIndex];
  if (CHECKED_PREFIX_RE.test(raw)) {
    const clean = raw.replace(CHECKED_PREFIX_RE, '').trim();
    lines[lineIndex] = `- [ ] ${clean}`;
  } else if (UNCHECKED_PREFIX_RE.test(raw)) {
    const clean = raw.replace(UNCHECKED_PREFIX_RE, '').trim();
    lines[lineIndex] = `- [x] ${clean}`;
  } else {
    const clean = raw.replace(BULLET_PREFIX_RE, '').trim();
    lines[lineIndex] = `- [x] ${clean}`;
  }

  return lines.join('\n');
}

export function getChecklistProgress(body?: string): { done: number; total: number } {
  const items = parseChecklistItems(body);
  const done = items.filter((i) => i.checked).length;
  return { done, total: items.length };
}

export function extractLeadContactFromNote(note: FieldNote): {
  name: string;
  phone: string;
  email: string;
  address: string;
} {
  const combined = `${note.title || ''}\n${note.body || ''}`;
  const phoneMatch = combined.match(
    /(?:\+?1[-. ]?)?(?:\(\d{3}\)|\d{3})[-. ]?\d{3}[-. ]?\d{4}/
  );
  const emailMatch = combined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  const addrRe =
    /\b\d{1,6}[ \t]+[A-Za-z0-9. ]{2,40}\b(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Way|Pl|Cir|Hwy|Trl|Trail)\b(?:[, ]+[A-Za-z ]+(?:,[ ]*[A-Z]{2}(?:[ ]+\d{5})?)?)?/i;
  let extractedAddress = '';
  for (const rawLine of combined.split(/\r?\n/)) {
    const lineWithoutPhone = phoneMatch ? rawLine.replace(phoneMatch[0], ' ') : rawLine;
    const match = lineWithoutPhone.match(addrRe);
    if (match) {
      extractedAddress = match[0].trim();
      break;
    }
  }

  const cleanName = (note.title || '')
    .replace(/^(?:lead|call|quote|estimate|follow\s*up)[:\-\s]+/i, '')
    .trim();

  return {
    name: cleanName || 'New Lead',
    phone: phoneMatch ? phoneMatch[0].trim() : '',
    email: emailMatch ? emailMatch[0].trim() : '',
    address: extractedAddress,
  };
}

