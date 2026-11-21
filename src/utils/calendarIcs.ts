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

function escapeIcsText(raw?: string | null): string {
  return (raw || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

/**
 * RFC 5545 line folding (max 75 octets per line, continuation lines prefixed with a single space).
 */
function foldIcsLine(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let idx = 0;
  let limit = 74;
  while (idx < line.length) {
    let end = Math.min(idx + limit, line.length);
    if (end < line.length && line[end - 1] === '\\') {
      end -= 1;
    }
    chunks.push(idx === 0 ? line.slice(idx, end) : ' ' + line.slice(idx, end));
    idx = end;
    limit = 73;
  }
  return chunks.join('\r\n');
}

function formatDateCompact(isoDate: string): string {
  return (isoDate || '').trim().replace(/-/g, '').slice(0, 8);
}

function addDaysToIsoDate(isoDate: string, daysToAdd: number): string {
  const match = (isoDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  d.setDate(d.getDate() + daysToAdd);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatUtcDtstamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Attempts to parse an appointment clock time (e.g. "9:00 AM", "2:30 PM") from a job title
 * such as "On-Site Estimate (9:00 AM)" so timed appointments get exact DTSTART/DTEND times.
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
      (j) => isJobEligibleForScheduledList(customer, j) && Boolean(j.schedDate?.trim())
    );

    // Track if a single customer has multiple distinct jobs on the exact same date
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
        sortMs: parseLocalDateMs(job.schedDate) ?? Number.MAX_SAFE_INTEGER,
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
 * Builds an RFC 5545 VEVENT block for a single scheduled job entry with persistent UID & SEQUENCE.
 */
function buildVeventLines(entry: ScheduledCalendarEntry, dtstamp: string): string[] {
  const { customer, job, uid, sequence } = entry;
  const startIso = (job.schedDate || '').trim();
  const endIso = (job.schedEndDate || job.schedDate || '').trim();
  const startCompact = formatDateCompact(startIso);

  const summary = `Krueger Painting — ${(customer.name || 'Client').trim()}`;

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

  const pad = (n: number) => String(n).padStart(2, '0');
  const parsedTime = startIso === endIso ? extractAppointmentTime(job.title) : null;

  let dtStartLine: string;
  let dtEndLine: string;
  if (parsedTime) {
    const endHour = Math.min(23, parsedTime.hour24 + 1);
    dtStartLine = `DTSTART:${startCompact}T${pad(parsedTime.hour24)}${pad(parsedTime.minute)}00`;
    dtEndLine = `DTEND:${startCompact}T${pad(endHour)}${pad(parsedTime.minute)}00`;
  } else {
    // Standard RFC 5545 all-day event (DTEND is exclusive -> add 1 day to inclusive end date)
    const endExclusive = formatDateCompact(addDaysToIsoDate(endIso, 1));
    dtStartLine = `DTSTART;VALUE=DATE:${startCompact}`;
    dtEndLine = `DTEND;VALUE=DATE:${endExclusive}`;
  }

  const lines: string[] = [
    'BEGIN:VEVENT',
    foldIcsLine(`UID:${uid}`),
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${dtstamp}`,
    dtStartLine,
    dtEndLine,
    foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`),
  ];

  if (customer.address && customer.address.trim()) {
    lines.push(foldIcsLine(`LOCATION:${escapeIcsText(customer.address.trim())}`));
  }

  if (descParts.length > 0) {
    lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`));
  }

  lines.push('STATUS:CONFIRMED');
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Generates a complete, RFC 5545 compliant .ics calendar file string from one or more entries.
 */
export function buildIcsCalendarFile(entries: ScheduledCalendarEntry[]): string {
  const dtstamp = formatUtcDtstamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Krueger Painting OS//Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Krueger Painting Schedule',
  ];

  entries.forEach((entry) => {
    lines.push(...buildVeventLines(entry, dtstamp));
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Opens the native mobile share sheet or downloads the generated .ics file directly.
 */
export async function deliverIcsCalendarFile(
  icsContent: string,
  fileName: string,
  shareTitle: string,
  shareText: string
): Promise<'SHARED' | 'DOWNLOADED'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const file = new File([icsContent], fileName, { type: 'text/calendar' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          files: [file],
        });
        return 'SHARED';
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'SHARED';
    }
  }

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
 * Builds and exports a single customer's scheduled job(s) into a duplicate-proof .ics file.
 */
export async function exportSingleCustomerJobIcs(
  customer: Customer,
  targetJob?: JobProject
): Promise<{
  exportedCount: number;
  outcome: 'SHARED' | 'DOWNLOADED';
  fileName: string;
}> {
  const allCustEntries = collectScheduledCalendarEntries([customer]);
  const selectedEntries = targetJob
    ? allCustEntries.filter((e) => e.job.id === targetJob.id)
    : allCustEntries;

  if (selectedEntries.length === 0) {
    return { exportedCount: 0, outcome: 'DOWNLOADED', fileName: '' };
  }

  const icsContent = buildIcsCalendarFile(selectedEntries);
  const safeName = (customer.name || 'Client').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const dateTag = formatDateCompact(selectedEntries[0].job.schedDate);
  const fileName = `Krueger_${safeName}_${dateTag}.ics`;

  const outcome = await deliverIcsCalendarFile(
    icsContent,
    fileName,
    `Krueger Painting — ${customer.name}`,
    `Add or update ${customer.name} in your calendar`
  );

  return { exportedCount: selectedEntries.length, outcome, fileName };
}
