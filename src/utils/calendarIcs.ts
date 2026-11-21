import { Customer, JobProject } from '../types';
import { isJobEligibleForScheduledList, parseLocalDateMs } from './projectHelpers';

export interface ScheduledCalendarEntry {
  customer: Customer;
  job: JobProject;
  uid: string;
  sequence: number;
  sortMs: number;
  syncStatus: 'NEW' | 'UPDATED' | 'SYNCED';
}

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function utf8ByteLength(str: string): number {
  if (utf8Encoder) return utf8Encoder.encode(str).length;
  return unescape(encodeURIComponent(str)).length;
}

function escapeIcsText(raw?: string | null): string {
  return (raw || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

/**
 * Strict RFC 5545 UTF-8 octet-safe line folding:
 * - Every line is strictly <= 75 UTF-8 bytes (74 on first line, 73 + leading space on continuations)
 * - Never splits multi-byte Unicode code points (emojis, em-dashes)
 * - Never splits inside a backslash escape sequence (\n, \,, \;)
 */
function foldIcsLine(line: string): string {
  if (utf8ByteLength(line) <= 74) return line;

  const chars = Array.from(line);
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  let maxBytes = 74;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const chBytes = utf8ByteLength(ch);

    if (currentBytes + chBytes > maxBytes && current.length > 0) {
      // Avoid breaking right after an escape backslash
      if (current.endsWith('\\') && current.length > 1) {
        chunks.push(chunks.length === 0 ? current.slice(0, -1) : ' ' + current.slice(0, -1));
        current = '\\' + ch;
        currentBytes = 1 + chBytes;
      } else {
        chunks.push(chunks.length === 0 ? current : ' ' + current);
        current = ch;
        currentBytes = chBytes;
      }
      maxBytes = 73;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }

  if (current.length > 0) {
    chunks.push(chunks.length === 0 ? current : ' ' + current);
  }

  return chunks.join('\r\n');
}

/**
 * Normalizes any date string (YYYY-MM-DD, MM/DD/YYYY, etc.) into strict local YYYY-MM-DD.
 * Returns empty string if invalid so malformed DTSTART/DTEND lines can never be emitted.
 */
export function normalizeToStrictIsoDate(rawDate?: string | null): string {
  if (!rawDate) return '';
  const trimmed = rawDate.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const ms = parseLocalDateMs(trimmed);
  if (ms === null) return '';
  const dt = new Date(ms);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateCompact(isoDate: string): string {
  const strict = normalizeToStrictIsoDate(isoDate);
  return strict ? strict.replace(/-/g, '') : '';
}

function addDaysToIsoDate(isoDate: string, daysToAdd: number): string {
  const strict = normalizeToStrictIsoDate(isoDate);
  if (!strict) return '';
  const [y, m, d] = strict.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + daysToAdd);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
}

function formatUtcDtstamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Parses an appointment clock time (e.g. "9:00 AM", "2:30 PM") from a job title
 * such as "On-Site Estimate (9:00 AM)" so timed appointments get clean local YYYYMMDDTHHMMSS timestamps.
 */
function extractAppointmentTime(title?: string): { hour24: number; minute: number } | null {
  if (!title) return null;
  const m = title.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return { hour24: hour, minute };
}

function buildEventDescriptionText(customer: Customer, job: JobProject): string {
  const descParts: string[] = [];
  if (job.title && job.title.trim()) {
    descParts.push(`Project: ${job.title.trim()}`);
  }
  if (customer.phone && customer.phone.trim()) {
    descParts.push(`Phone: ${customer.phone.trim()}`);
  }
  if (customer.email && customer.email.trim()) {
    descParts.push(`Email: ${customer.email.trim()}`);
  }
  if (job.prepScope && job.prepScope.trim()) {
    descParts.push('');
    descParts.push('Prep & Setup:');
    descParts.push(job.prepScope.trim());
  }
  if (job.scope && job.scope.trim()) {
    descParts.push('');
    descParts.push('Scope Notes:');
    descParts.push(job.scope.trim());
  }
  return descParts.join('\n');
}

/**
 * Deterministic, persistent UID per customer & scheduled date so importing an updated .ics
 * into Google/Apple Calendar overwrites the existing event in place without creating duplicates.
 */
export function buildJobCalendarUid(
  customerId: number,
  schedDate: string,
  disambiguateJobId?: number
): string {
  const yyyymmdd = formatDateCompact(schedDate);
  if (disambiguateJobId !== undefined) {
    return `krueger-job-${customerId}-${yyyymmdd}-${disambiguateJobId}@kruegerpaintingwi.com`;
  }
  return `krueger-job-${customerId}-${yyyymmdd}@kruegerpaintingwi.com`;
}

/**
 * Builds a direct "Open in Google Calendar" template URL that opens natively in the
 * Google Calendar app on Android/iOS or web without downloading any file.
 */
export function buildGoogleCalendarTemplateUrl(customer: Customer, job: JobProject): string {
  const startIso = normalizeToStrictIsoDate(job.schedDate);
  if (!startIso) return 'https://calendar.google.com/calendar/render?action=TEMPLATE';

  const rawEndIso = normalizeToStrictIsoDate(job.schedEndDate);
  const effectiveEndIso = rawEndIso && rawEndIso >= startIso ? rawEndIso : startIso;
  const startCompact = formatDateCompact(startIso);

  const summary = `Krueger Painting — ${(customer.name || 'Client').trim()}`;
  const details = buildEventDescriptionText(customer, job);
  const location = (customer.address || '').trim();

  const pad = (n: number) => String(n).padStart(2, '0');
  const parsedTime = startIso === effectiveEndIso ? extractAppointmentTime(job.title) : null;

  let datesParam: string;
  if (parsedTime) {
    const startH = parsedTime.hour24;
    const endH = startH < 23 ? startH + 1 : 23;
    const endMin = startH < 23 ? parsedTime.minute : 59;
    datesParam = `${startCompact}T${pad(startH)}${pad(parsedTime.minute)}00/${startCompact}T${pad(
      endH
    )}${pad(endMin)}00`;
  } else {
    const endExclusive = formatDateCompact(addDaysToIsoDate(effectiveEndIso, 1));
    datesParam = `${startCompact}/${endExclusive}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: datesParam,
  });
  if (location) params.set('location', location);
  if (details) params.set('details', details);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Detects whether a customer edit changed any calendar-relevant field
 * (scheduled date/end date, address, phone, email, name, or job title/scope/prep/status).
 */
export function hasCalendarRelevantChanges(prev: Customer, next: Customer): boolean {
  if (
    (prev.name || '').trim() !== (next.name || '').trim() ||
    (prev.address || '').trim() !== (next.address || '').trim() ||
    (prev.phone || '').trim() !== (next.phone || '').trim() ||
    (prev.email || '').trim() !== (next.email || '').trim() ||
    (prev.statusOverride || '') !== (next.statusOverride || '')
  ) {
    return true;
  }

  const prevJobs = prev.jobs || [];
  const nextJobs = next.jobs || [];
  if (prevJobs.length !== nextJobs.length) return true;

  const prevMap = new Map<number, JobProject>(prevJobs.map((j) => [j.id, j]));
  for (const nj of nextJobs) {
    const pj = prevMap.get(nj.id);
    if (!pj) return true;
    if (
      (pj.schedDate || '').trim() !== (nj.schedDate || '').trim() ||
      (pj.schedEndDate || '').trim() !== (nj.schedEndDate || '').trim() ||
      (pj.title || '').trim() !== (nj.title || '').trim() ||
      (pj.scope || '').trim() !== (nj.scope || '').trim() ||
      (pj.prepScope || '').trim() !== (nj.prepScope || '').trim() ||
      (pj.status || '') !== (nj.status || '') ||
      (pj.workDays || 1) !== (nj.workDays || 1)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Determines a customer's calendar sync state:
 * - NEW: Never exported to calendar yet
 * - UPDATED: Calendar-relevant fields were edited after lastCalendarSyncedAt
 * - SYNCED: Up to date with last export
 */
export function getCustomerCalendarSyncStatus(customer: Customer): 'NEW' | 'UPDATED' | 'SYNCED' {
  if (!customer.lastCalendarSyncedAt) return 'NEW';
  const lastModified = customer.calendarUpdatedAt ?? 0;
  if (lastModified > customer.lastCalendarSyncedAt) return 'UPDATED';
  return 'SYNCED';
}

/**
 * Collects all eligible scheduled jobs with valid start dates in strict chronological order,
 * assigning deterministic UIDs and reading each customer's persistent SEQUENCE counter.
 */
export function collectScheduledCalendarEntries(customers: Customer[]): ScheduledCalendarEntry[] {
  const entries: ScheduledCalendarEntry[] = [];

  customers.forEach((customer) => {
    const eligibleDatedJobs = (customer.jobs || []).filter(
      (j) =>
        isJobEligibleForScheduledList(customer, j) && Boolean(normalizeToStrictIsoDate(j.schedDate))
    );

    const dateCounts = new Map<string, number>();
    eligibleDatedJobs.forEach((j) => {
      const k = formatDateCompact(j.schedDate);
      dateCounts.set(k, (dateCounts.get(k) || 0) + 1);
    });

    const syncStatus = getCustomerCalendarSyncStatus(customer);
    const sequence = customer.calendarSequence ?? 0;

    eligibleDatedJobs.forEach((job) => {
      const dateKey = formatDateCompact(job.schedDate);
      const needsDisambig = (dateCounts.get(dateKey) || 0) > 1;
      const uid = buildJobCalendarUid(
        customer.id,
        job.schedDate,
        needsDisambig ? job.id : undefined
      );

      entries.push({
        customer,
        job,
        uid,
        sequence,
        sortMs: parseLocalDateMs(normalizeToStrictIsoDate(job.schedDate)) ?? Number.MAX_SAFE_INTEGER,
        syncStatus,
      });
    });
  });

  entries.sort((a, b) => {
    if (a.sortMs !== b.sortMs) return a.sortMs - b.sortMs;
    return (a.customer.name || '').localeCompare(b.customer.name || '');
  });

  return entries;
}

/**
 * Builds a strict RFC 5545 VEVENT block compatible with Android Google Calendar,
 * Apple Calendar, and Google Calendar Web Import.
 */
function buildVeventLines(entry: ScheduledCalendarEntry, dtstamp: string): string[] {
  const { customer, job, uid, sequence } = entry;
  const startIso = normalizeToStrictIsoDate(job.schedDate);
  if (!startIso) return [];

  const rawEndIso = normalizeToStrictIsoDate(job.schedEndDate);
  // Guarantee DTEND is strictly after DTSTART (prevents Android "Unable to launch event")
  const effectiveEndIso = rawEndIso && rawEndIso >= startIso ? rawEndIso : startIso;
  const startCompact = formatDateCompact(startIso);

  const summary = `Krueger Painting — ${(customer.name || 'Client').trim()}`;
  const description = buildEventDescriptionText(customer, job);

  const pad = (n: number) => String(n).padStart(2, '0');
  const parsedTime = startIso === effectiveEndIso ? extractAppointmentTime(job.title) : null;

  let dtStartLine: string;
  let dtEndLine: string;
  let transpLine = 'TRANSP:OPAQUE';

  if (parsedTime) {
    const startH = parsedTime.hour24;
    const endH = startH < 23 ? startH + 1 : 23;
    const endMin = startH < 23 ? parsedTime.minute : 59;
    dtStartLine = `DTSTART:${startCompact}T${pad(startH)}${pad(parsedTime.minute)}00`;
    dtEndLine = `DTEND:${startCompact}T${pad(endH)}${pad(endMin)}00`;
  } else {
    const endExclusive = formatDateCompact(addDaysToIsoDate(effectiveEndIso, 1));
    dtStartLine = `DTSTART;VALUE=DATE:${startCompact}`;
    dtEndLine = `DTEND;VALUE=DATE:${endExclusive}`;
    transpLine = 'TRANSP:TRANSPARENT';
  }

  const lines: string[] = [
    'BEGIN:VEVENT',
    foldIcsLine(`UID:${uid}`),
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${dtstamp}`,
    `LAST-MODIFIED:${dtstamp}`,
    dtStartLine,
    dtEndLine,
    foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`),
  ];

  if (customer.address && customer.address.trim()) {
    lines.push(foldIcsLine(`LOCATION:${escapeIcsText(customer.address.trim())}`));
  }

  if (description) {
    lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`));
  }

  lines.push('STATUS:CONFIRMED');
  lines.push(transpLine);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Generates a strict RFC 5545 UTF-8 .ics calendar file string using CRLF (\r\n) line endings.
 */
export function buildIcsCalendarFile(entries: ScheduledCalendarEntry[]): string {
  const dtstamp = formatUtcDtstamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Krueger Painting OS//Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  entries.forEach((entry) => {
    lines.push(...buildVeventLines(entry, dtstamp));
  });

  lines.push('END:VCALENDAR');
  // Strictly CRLF line endings everywhere
  return lines.join('\r\n') + '\r\n';
}

/**
 * Downloads the generated .ics file directly with strict UTF-8 text/calendar MIME type
 * (direct download avoids Android Web Share MIME mangling that causes "Unable to launch event").
 */
export async function deliverIcsCalendarFile(
  icsContent: string,
  fileName: string
): Promise<'DOWNLOADED'> {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'DOWNLOADED';
}

/**
 * Exports a clean SINGLE-VEVENT .ics file for one customer job so Android Google Calendar
 * opens it natively without rejecting multi-event files.
 */
export async function exportSingleCustomerJobIcs(
  customer: Customer,
  targetJob?: JobProject
): Promise<{
  exportedCount: number;
  outcome: 'DOWNLOADED';
  fileName: string;
}> {
  const allCustEntries = collectScheduledCalendarEntries([customer]);
  const chosenEntry = targetJob
    ? allCustEntries.find((e) => e.job.id === targetJob.id)
    : allCustEntries[0];

  if (!chosenEntry) {
    return { exportedCount: 0, outcome: 'DOWNLOADED', fileName: '' };
  }

  // Strictly single-VEVENT .ics for native Android Calendar compatibility
  const icsContent = buildIcsCalendarFile([chosenEntry]);
  const safeName = (customer.name || 'Client')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const dateTag = formatDateCompact(chosenEntry.job.schedDate);
  const fileName = `Krueger_${safeName}_${dateTag}.ics`;

  const outcome = await deliverIcsCalendarFile(icsContent, fileName);

  return { exportedCount: 1, outcome, fileName };
}
