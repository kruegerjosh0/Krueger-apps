import { Customer, JobProject } from '../types';

export const PAINT_SHEEN_OPTIONS = [
  'Flat / Matte',
  'Eggshell',
  'Satin',
  'Semi-Gloss',
  'High-Gloss',
  'Primer / Sealer',
] as const;

export interface PrepCategory {
  id: 'protection' | 'surface';
  label: string;
  icon: string;
  items: readonly string[];
}

export const PREP_CHECKLIST_CATEGORIES: readonly PrepCategory[] = [
  {
    id: 'protection',
    label: 'Protection & Masking',
    icon: '🛡️',
    items: [
      'Mask/tape baseboards',
      'Mask windows & trim',
      'Cover furniture & fixtures',
      'Lay canvas drop cloths',
      'Lay rosin paper / floor protection',
    ],
  },
  {
    id: 'surface',
    label: 'Surface Prep',
    icon: '🔧',
    items: [
      'Patch nail holes & minor drywall',
      'Sand & scuff surfaces',
      'Scrape loose/peeling paint',
      'Caulk trim & gaps',
      'Degrease / wash walls (Spray Nine)',
      'Prime stains / bare spots',
    ],
  },
] as const;

export type PipelineStage = 'ACTIVE' | 'SCHEDULED' | 'PENDING' | 'COMPLETED';

export const PIPELINE_STAGE_META: Record<
  PipelineStage,
  {
    label: string;
    shortLabel: string;
    color: string;
    textColor: string;
    icon: string;
  }
> = {
  ACTIVE: {
    label: 'Active',
    shortLabel: 'Active',
    color: '#30d158',
    textColor: '#ffffff',
    icon: '🎨',
  },
  SCHEDULED: {
    label: 'Scheduled',
    shortLabel: 'Scheduled',
    color: '#0a84ff',
    textColor: '#ffffff',
    icon: '📅',
  },
  PENDING: {
    label: 'Pending',
    shortLabel: 'Pending',
    color: '#f1c40f',
    textColor: '#1a1207',
    icon: '⏳',
  },
  COMPLETED: {
    label: 'Complete / Paid',
    shortLabel: 'Complete / Paid',
    color: '#38bdf8',
    textColor: '#0c1926',
    icon: '✅',
  },
};

export function normalizePipelineStage(rawStatus?: string | null): PipelineStage {
  const upper = (rawStatus || '').trim().toUpperCase();
  if (upper === 'ACTIVE') return 'ACTIVE';
  if (upper === 'SCHEDULED') return 'SCHEDULED';
  if (upper === 'COMPLETED' || upper === 'PAID' || upper === 'COMPLETE / PAID' || upper === 'ARCHIVE' || upper === 'OTHER' || upper === 'DECLINED') {
    return 'COMPLETED';
  }
  return 'PENDING';
}

export function isJobScheduled(job: JobProject): boolean {
  const stage = normalizePipelineStage(job.status);
  if (stage === 'COMPLETED') return false;
  if (stage === 'SCHEDULED') return true;
  return Boolean(job.schedDate && job.schedDate.trim() && stage !== 'ACTIVE');
}

export function getCustomerPipelineStage(customer: Customer): PipelineStage {
  if (customer.statusOverride && customer.statusOverride !== 'AUTO') {
    return normalizePipelineStage(customer.statusOverride);
  }

  const jobs = customer.jobs || [];
  if (jobs.length === 0) {
    return 'PENDING';
  }

  if (jobs.some((j) => normalizePipelineStage(j.status) === 'ACTIVE')) {
    return 'ACTIVE';
  }

  if (jobs.some((j) => isJobScheduled(j))) {
    return 'SCHEDULED';
  }

  if (jobs.some((j) => normalizePipelineStage(j.status) === 'PENDING')) {
    return 'PENDING';
  }

  return 'COMPLETED';
}

/**
 * Safely parses a YYYY-MM-DD date string into local midnight timestamp (avoids UTC shift bugs).
 */
export function parseLocalDateMs(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return new Date(year, month - 1, day).getTime();
    }
  }
  const fallback = Date.parse(trimmed);
  return Number.isNaN(fallback) ? null : fallback;
}

/**
 * Formats YYYY-MM-DD as a clear human-readable date such as "Mon, Nov 24, 2026".
 */
export function formatScheduledDate(dateStr?: string | null): string {
  const ms = parseLocalDateMs(dateStr);
  if (ms === null) return 'Date TBD';
  const d = new Date(ms);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

/**
 * Returns today's date in local YYYY-MM-DD format.
 */
export function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Checks if a checklist bullet item is currently present in a multiline prepScope string.
 */
export function isPrepLineChecked(prepScope: string, item: string): boolean {
  const target = item.trim().toLowerCase();
  return prepScope
    .split('\n')
    .some((line) => line.replace(/^[-•*]\s*/, '').trim().toLowerCase() === target);
}

/**
 * Cleanly toggles a checklist item inside a multiline prepScope string without corrupting custom notes.
 */
export function togglePrepScopeLine(prepScope: string, item: string): string {
  const target = item.trim().toLowerCase();
  const lines = prepScope
    .split('\n')
    .map((l) => l.trimEnd());

  const exists = lines.some(
    (line) => line.replace(/^[-•*]\s*/, '').trim().toLowerCase() === target
  );

  if (exists) {
    return lines
      .filter((line) => line.replace(/^[-•*]\s*/, '').trim().toLowerCase() !== target)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const trimmed = prepScope.trim();
  return trimmed ? `${trimmed}\n- ${item}` : `- ${item}`;
}
