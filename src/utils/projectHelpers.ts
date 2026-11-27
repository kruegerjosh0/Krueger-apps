import { Customer, JobProject, ProjectDocumentSnapshot, RoomArea, SystemConstants } from '../types';

export const PAINT_PRODUCT_OPTIONS = [
  'Sherwin-Williams Emerald',
  'Sherwin-Williams Duration',
  'Sherwin-Williams SuperPaint',
  'Sherwin-Williams Cashmere',
  'Sherwin-Williams ProClassic',
  'Sherwin-Williams ProMar 200',
  'Hallman Lindsay Earthcoat',
  'Hallman Lindsay PureHide',
  'Hallman Lindsay Weatherguard',
  'Benjamin Moore Regal Select',
  'Benjamin Moore Aura',
  'Zinsser B-I-N Primer',
  'Kilz 2 / Stain-Blocking Primer',
] as const;

export const PAINT_SHEEN_OPTIONS = [
  'Flat / Matte',
  'Eggshell',
  'Satin',
  'Semi-Gloss',
  'High-Gloss',
  'Primer / Sealer',
] as const;

export const SURFACE_REPAIR_PRESETS: readonly { label: string; desc: string; defaultHours: number }[] = [
  { label: 'Drywall Patching', desc: 'Drywall patching, taping, skim & sand smooth', defaultHours: 2 },
  { label: 'Scrape & Sand Exterior', desc: 'Scrape loose/peeling paint & feather-sand edges', defaultHours: 3 },
  { label: 'Trim & Gap Caulking', desc: 'Caulk trim seams, nail holes & open gaps', defaultHours: 1.5 },
  { label: 'Stain / Spot Priming', desc: 'Spot-prime water stains & bare wood/drywall', defaultHours: 1.5 },
  { label: 'Pressure Wash Prep', desc: 'Exterior pressure wash & mildew removal', defaultHours: 2.5 },
  { label: 'Wood Rot / Carpentry', desc: 'Rotted wood trim / sill repair & replacement', defaultHours: 3 },
] as const;

export function cleanOptionalSpec(val?: string | null): string {
  if (val === null || val === undefined) return '';
  const trimmed = String(val).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'undefined' || lower === 'null') return '';
  return trimmed;
}

export function computeRoomSqft(room: Pick<RoomArea, 'n' | 'len' | 'wid' | 'hgt'>): number {
  const len = Number(room.len) || 0;
  const wid = Number(room.wid) || 0;
  const hgt = Number(room.hgt) || 0;

  if (len > 0 && wid > 0) {
    if (hgt > 0) {
      return Math.round(2 * (len + wid) * hgt);
    }
    return Math.round(len * wid);
  }

  const nameStr = (room.n || '').toLowerCase();
  const dim3 = nameStr.match(/(\d+(?:\.\d+)?)\s*[x*]\s*(\d+(?:\.\d+)?)\s*[x*]\s*(\d+(?:\.\d+)?)/);
  if (dim3) {
    const l = parseFloat(dim3[1]);
    const w = parseFloat(dim3[2]);
    const h = parseFloat(dim3[3]);
    if (l > 0 && w > 0 && h > 0) return Math.round(2 * (l + w) * h);
  }

  const dim2 = nameStr.match(/(\d+(?:\.\d+)?)\s*[x*]\s*(\d+(?:\.\d+)?)/);
  if (dim2) {
    const l = parseFloat(dim2[1]);
    const w = parseFloat(dim2[2]);
    if (l > 0 && w > 0) return Math.round(l * w);
  }

  return 0;
}

export function computeRoomGallons(room: RoomArea, spreadRate = 350): number {
  if (room.og && parseFloat(room.og) > 0) {
    return parseFloat(room.og);
  }
  const sqft = computeRoomSqft(room);
  if (sqft > 0) {
    return Math.max(1, Math.ceil((sqft * 2) / (spreadRate || 350)));
  }
  return 0;
}

export interface ParsedAddressParts {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export function parseAddressParts(rawAddress?: string | null): ParsedAddressParts {
  const raw = (rawAddress || '').trim();
  if (!raw) return { street: '', city: '', state: 'WI', zip: '' };

  let zip = '';
  let state = 'WI';
  let remaining = raw;

  const zipMatch = remaining.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    zip = zipMatch[1];
    remaining = remaining.replace(zipMatch[0], '').trim();
  }

  const stateMatch = remaining.match(/(?:,\s*|\s+)(WI|Wisconsin|IL|MN|MI|IA)\s*$/i);
  if (stateMatch) {
    const st = stateMatch[1].toUpperCase();
    state = st === 'WISCONSIN' ? 'WI' : st;
    remaining = remaining.slice(0, stateMatch.index).trim().replace(/,+$/, '').trim();
  }

  const commaParts = remaining
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (commaParts.length >= 2) {
    return {
      street: commaParts.slice(0, -1).join(', '),
      city: commaParts[commaParts.length - 1],
      state,
      zip,
    };
  }

  return {
    street: commaParts[0] || '',
    city: '',
    state,
    zip,
  };
}

export function formatAddressParts(parts: ParsedAddressParts): string {
  const street = (parts.street || '').trim();
  const city = (parts.city || '').trim();
  const state = (parts.state || '').trim();
  const zip = (parts.zip || '').trim();

  const stateZip = [state && (city || zip || street) ? state : '', zip].filter(Boolean).join(' ');
  return [street, city, stateZip].filter(Boolean).join(', ');
}

export interface PrepChecklistOption {
  label: string;
  scopeText: string;
}

export interface PrepCategory {
  id: 'protection' | 'surface';
  label: string;
  icon: string;
  items: readonly PrepChecklistOption[];
}

export const PREP_CHECKLIST_CATEGORIES: readonly PrepCategory[] = [
  {
    id: 'protection',
    label: 'Protection & Masking',
    icon: '🛡️',
    items: [
      {
        label: 'Mask/tape baseboards',
        scopeText: '- Tape and mask all baseboards and trim edges for clean paint lines',
      },
      {
        label: 'Mask windows & trim',
        scopeText: '- Mask and protect all windows, casings, and adjacent trim surfaces',
      },
      {
        label: 'Cover furniture & fixtures',
        scopeText: '- Cover all furniture, cabinetry, and fixtures with new plastic sheeting',
      },
      {
        label: 'Lay canvas drop cloths',
        scopeText: '- Cover all floors and walkways with heavy-duty canvas drop cloths',
      },
      {
        label: 'Lay rosin paper / floor protection',
        scopeText: '- Protect hard flooring and high-traffic paths with rosin paper and tape',
      },
    ],
  },
  {
    id: 'surface',
    label: 'Surface Prep',
    icon: '🔧',
    items: [
      {
        label: 'Patch nail holes & minor drywall',
        scopeText: '- Patch all nail holes, dings, and minor drywall imperfections, sand smooth, and spot-prime',
      },
      {
        label: 'Full drywall patch process',
        scopeText:
          '- Drywall Patches: Cut/replace damaged drywall as needed, apply drywall tape to joints, apply two coats of drywall compound (sanding smooth between coats), and apply matching texture to blend with existing surface',
      },
      {
        label: 'Sand & scuff surfaces',
        scopeText: '- Scuff-sand all glossy or previously painted surfaces to ensure proper paint adhesion',
      },
      {
        label: 'Scrape loose/peeling paint',
        scopeText: '- Scrape and feather-sand all loose or peeling paint areas necessary to ensure proper bonding',
      },
      {
        label: 'Caulk trim & gaps',
        scopeText: '- Caulk all open gaps, trim seams, and minor cracks with paintable elastomeric caulk',
      },
      {
        label: 'Degrease / wash walls (Spray Nine)',
        scopeText: '- Clean and degrease soiled walls and high-touch surfaces (Spray Nine) prior to coating',
      },
      {
        label: 'Prime stains / bare spots',
        scopeText:
          '- Spot-prime all water stains, bare wood/drywall, and patched areas with appropriate bonding/stain-blocking primer',
      },
      {
        label: 'Pressure wash exterior',
        scopeText: '- Pressure wash exterior surfaces to remove dirt, chalking, and mildew in preparation for coating',
      },
    ],
  },
] as const;

export const ALL_PREP_CHECKLIST_OPTIONS: readonly PrepChecklistOption[] =
  PREP_CHECKLIST_CATEGORIES.flatMap((category) => category.items);

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

export function isJobCompletedOrPaid(rawStatus?: string | null): boolean {
  const upper = (rawStatus || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return (
    upper === 'COMPLETE' ||
    upper === 'COMPLETED' ||
    upper === 'PAID' ||
    upper === 'COMPLETE / PAID' ||
    upper === 'COMPLETE/PAID' ||
    upper === 'COMPLETED / PAID' ||
    upper === 'COMPLETED/PAID' ||
    upper === 'ARCHIVE' ||
    upper === 'DECLINED'
  );
}

export function normalizePipelineStage(rawStatus?: string | null): PipelineStage {
  const upper = (rawStatus || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (upper === 'ACTIVE') return 'ACTIVE';
  if (upper === 'SCHEDULED') return 'SCHEDULED';
  if (isJobCompletedOrPaid(upper) || upper === 'OTHER') {
    return 'COMPLETED';
  }
  return 'PENDING';
}

export function isJobScheduled(job: JobProject): boolean {
  if (isJobCompletedOrPaid(job.status)) return false;
  const stage = normalizePipelineStage(job.status);
  if (stage === 'COMPLETED') return false;
  if (stage === 'SCHEDULED') return true;
  if (stage === 'ACTIVE' && Boolean(job.schedDate && job.schedDate.trim())) return true;
  return false;
}

/**
 * Strictly determines whether a job should appear in the Scheduled Jobs Quick List
 * and Google Calendar scheduled sync (never includes Complete, Completed, Paid, or Complete / Paid).
 */
export function isJobEligibleForScheduledList(customer: Customer, job: JobProject): boolean {
  if (isJobCompletedOrPaid(job.status)) return false;
  if (
    customer.statusOverride &&
    customer.statusOverride !== 'AUTO' &&
    isJobCompletedOrPaid(customer.statusOverride)
  ) {
    return false;
  }
  const jobStage = normalizePipelineStage(job.status);
  if (jobStage === 'COMPLETED') return false;
  if (jobStage === 'SCHEDULED') return true;
  if (jobStage === 'ACTIVE' && Boolean(job.schedDate && job.schedDate.trim())) return true;
  return false;
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

function normalizePrepLine(line: string): string {
  return line
    .replace(/^[-•*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getOptionMatchTargets(option: PrepChecklistOption | string): Set<string> {
  if (typeof option === 'string') {
    const matched = ALL_PREP_CHECKLIST_OPTIONS.find(
      (opt) =>
        normalizePrepLine(opt.label) === normalizePrepLine(option) ||
        normalizePrepLine(opt.scopeText) === normalizePrepLine(option)
    );
    if (matched) {
      return new Set([normalizePrepLine(matched.scopeText), normalizePrepLine(matched.label)]);
    }
    return new Set([normalizePrepLine(option)]);
  }
  return new Set([normalizePrepLine(option.scopeText), normalizePrepLine(option.label)]);
}

/**
 * Checks if a checklist option's descriptive estimate line (or legacy short label)
 * is currently present in a multiline prepScope string.
 */
export function isPrepLineChecked(prepScope: string, option: PrepChecklistOption | string): boolean {
  const targets = getOptionMatchTargets(option);
  return prepScope
    .split('\n')
    .some((line) => targets.has(normalizePrepLine(line)));
}

/**
 * Cleanly toggles a checklist option's descriptive scope line inside a multiline prepScope string
 * without corrupting any custom manual notes.
 */
export function togglePrepScopeLine(
  prepScope: string,
  option: PrepChecklistOption | string
): string {
  const targets = getOptionMatchTargets(option);
  const scopeTextToInsert =
    typeof option === 'string'
      ? ALL_PREP_CHECKLIST_OPTIONS.find(
          (opt) => normalizePrepLine(opt.label) === normalizePrepLine(option)
        )?.scopeText || (option.trim().startsWith('-') ? option.trim() : `- ${option.trim()}`)
      : option.scopeText;

  const lines = prepScope.split('\n').map((l) => l.trimEnd());
  const exists = lines.some((line) => targets.has(normalizePrepLine(line)));

  if (exists) {
    return lines
      .filter((line) => !targets.has(normalizePrepLine(line)))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const trimmed = prepScope.trim();
  return trimmed ? `${trimmed}\n${scopeTextToInsert}` : scopeTextToInsert;
}

/**
 * Returns true if at least one quick-tap checklist option is present in prepScope.
 */
export function hasAnyCheckedPrepLine(prepScope: string): boolean {
  return ALL_PREP_CHECKLIST_OPTIONS.some((opt) => isPrepLineChecked(prepScope, opt));
}

/**
 * Removes all quick-tap checklist lines from prepScope while preserving any
 * custom text typed manually by the contractor.
 */
export function clearChecklistPrepLines(prepScope: string): string {
  const allTargets = new Set<string>();
  ALL_PREP_CHECKLIST_OPTIONS.forEach((opt) => {
    allTargets.add(normalizePrepLine(opt.scopeText));
    allTargets.add(normalizePrepLine(opt.label));
  });

  return prepScope
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((line) => !allTargets.has(normalizePrepLine(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Resolves a stored room-level prep label to its full client-ready description (without leading dash)
 * for professional PDF output, falling back to the raw string for custom items.
 */
export function resolvePrepOptionScopeText(labelOrText: string): string {
  const norm = normalizePrepLine(labelOrText);
  const matched = ALL_PREP_CHECKLIST_OPTIONS.find(
    (opt) => normalizePrepLine(opt.label) === norm || normalizePrepLine(opt.scopeText) === norm
  );
  if (matched) {
    return matched.scopeText.replace(/^[-•*]\s*/, '').trim();
  }
  return labelOrText.replace(/^[-•*]\s*/, '').trim();
}

export function createBlankRoomArea(): RoomArea {
  return {
    n: '',
    r: 0,
    len: undefined,
    wid: undefined,
    hgt: undefined,
    manualPrice: false,
    og: '',
    sp: true,
    prod: '',
    color: '',
    sheen: '',
    prep: [],
  };
}

export function deepCloneRoomArea(r: RoomArea): RoomArea {
  return {
    ...r,
    prod: cleanOptionalSpec(r.prod),
    sheen: cleanOptionalSpec(r.sheen),
    color: cleanOptionalSpec(r.color),
    prep: Array.isArray(r.prep) ? [...r.prep] : [],
  };
}

export function deepCloneDocumentSnapshot(
  snap: ProjectDocumentSnapshot
): ProjectDocumentSnapshot {
  return {
    showLaborTotal: snap.showLaborTotal ?? true,
    showOverallTotal: snap.showOverallTotal ?? false,
    matsIncluded: snap.matsIncluded ?? false,
    internalNotes: snap.internalNotes || '',
    paintRate: snap.paintRate || '1.00',
    repairRate: Number(snap.repairRate) || 75,
    disc: Number(snap.disc) || 0,
    discType: snap.discType || 'PCT',
    discLabel: snap.discLabel || '',
    matVal: Number(snap.matVal) || 0,
    sunVal: Number(snap.sunVal) || 0,
    depo: Number(snap.depo) || 0,
    payments: Array.isArray(snap.payments) ? snap.payments.map((p) => ({ ...p })) : [],
    prepScope: snap.prepScope || '',
    scope: snap.scope || '',
    rooms:
      Array.isArray(snap.rooms) && snap.rooms.length > 0
        ? snap.rooms.map(deepCloneRoomArea)
        : [createBlankRoomArea()],
    repairs: Array.isArray(snap.repairs) ? snap.repairs.map((rep) => ({ ...rep })) : [],
    updatedAt: snap.updatedAt,
  };
}

export function createBlankDocumentSnapshot(defaultRepairRate = 75): ProjectDocumentSnapshot {
  return {
    showLaborTotal: true,
    showOverallTotal: false,
    matsIncluded: false,
    internalNotes: '',
    paintRate: '1.00',
    repairRate: defaultRepairRate || 75,
    disc: 0,
    discType: 'PCT',
    discLabel: '',
    matVal: 0,
    sunVal: 0,
    depo: 0,
    payments: [],
    prepScope: '',
    scope: '',
    rooms: [createBlankRoomArea()],
    repairs: [],
  };
}

/**
 * Extracts a project's Estimate snapshot. For legacy saved projects that do not yet
 * have an explicit `estimate` property, seamlessly maps their existing top-level fields.
 */
export function getEstimateSnapshot(job: JobProject): ProjectDocumentSnapshot {
  if (job.estimate) {
    return deepCloneDocumentSnapshot(job.estimate);
  }
  return deepCloneDocumentSnapshot({
    showLaborTotal: job.showLaborTotal ?? true,
    showOverallTotal: job.showOverallTotal ?? false,
    matsIncluded: job.matsIncluded ?? false,
    internalNotes: job.internalNotes || '',
    paintRate: job.paintRate || '1.00',
    repairRate: Number(job.repairRate) || 75,
    disc: Number(job.disc) || 0,
    discType: job.discType || 'PCT',
    discLabel: job.discLabel || '',
    matVal: Number(job.matVal) || 0,
    sunVal: Number(job.sunVal) || 0,
    depo: Number(job.depo) || 0,
    payments: Array.isArray(job.payments) ? job.payments : [],
    prepScope: job.prepScope || '',
    scope: job.scope || '',
    rooms: Array.isArray(job.rooms) ? job.rooms : [],
    repairs: Array.isArray(job.repairs) ? job.repairs : [],
  });
}

/**
 * Returns a deep clone of `job.finalBill` if created, or `null` otherwise.
 */
export function getFinalBillSnapshot(job: JobProject): ProjectDocumentSnapshot | null {
  return job.finalBill ? deepCloneDocumentSnapshot(job.finalBill) : null;
}

export function hasFinalBill(job: JobProject): boolean {
  return Boolean(job.finalBill);
}

/**
 * Normalizes a legacy project record so `estimate` is explicitly populated
 * and `finalBill` defaults to `null` if undefined.
 */
export function normalizeLegacyJob(job: JobProject): JobProject {
  const estimate = getEstimateSnapshot(job);
  const finalBill = getFinalBillSnapshot(job);
  return {
    ...job,
    estimate,
    finalBill,
  };
}

export interface SnapshotTotals {
  laborSubtotal: number;
  repairLaborTotal: number;
  discountAmount: number;
  matCost: number;
  sundriesCost: number;
  grossTotal: number;
  totalPaid: number;
  balanceDue: number;
  computedPaintGals: number;
}

export function computeSnapshotTotals(
  snap: ProjectDocumentSnapshot,
  constants?: Partial<SystemConstants>
): SnapshotTotals {
  const spreadRate = constants?.spreadRate || 350;
  const perGalPrice = Math.round(constants?.paintCostPerGal || 65);
  const repairRate = Math.round(snap.repairRate || constants?.repairRate || 75);

  let laborSubtotal = 0;
  let computedPaintGals = 0;
  (snap.rooms || []).forEach((r) => {
    laborSubtotal += Math.round(Number(r.r) || 0);
    computedPaintGals += computeRoomGallons(r, spreadRate);
  });

  let repHrs = 0;
  (snap.repairs || []).forEach((rep) => {
    repHrs += parseFloat(String(rep.h)) || 0;
  });
  const repairLaborTotal = Math.round(repHrs * repairRate);

  const dVal = parseFloat(String(snap.disc)) || 0;
  const discountAmount =
    (snap.discType || 'PCT') === 'PCT'
      ? Math.round(laborSubtotal * (dVal / 100))
      : Math.round(dVal);
  const finalLabor = laborSubtotal - discountAmount;

  let matCost = 0;
  if (!snap.matsIncluded) {
    if (snap.matVal && Number(snap.matVal) > 0) {
      matCost = Math.round(Number(snap.matVal));
    } else if (computedPaintGals > 0) {
      matCost = Math.round(computedPaintGals * perGalPrice);
    }
  }
  const sundriesCost = snap.matsIncluded ? 0 : Math.round(parseFloat(String(snap.sunVal)) || 0);
  const grossTotal = Math.round(finalLabor + repairLaborTotal + matCost + sundriesCost);

  let totalPaid = 0;
  if (snap.payments && snap.payments.length > 0) {
    snap.payments.forEach((p) => {
      totalPaid += Math.round(Number(p.amt) || 0);
    });
  } else if (snap.depo > 0) {
    totalPaid = Math.round(snap.depo);
  }
  const balanceDue = Math.max(0, grossTotal - totalPaid);

  return {
    laborSubtotal,
    repairLaborTotal,
    discountAmount,
    matCost,
    sundriesCost,
    grossTotal,
    totalPaid,
    balanceDue,
    computedPaintGals,
  };
}

/**
 * Projects the appropriate independent snapshot (`estimate` vs `finalBill`) onto a JobProject
 * object before passing it into the PDF renderer so Estimate PDFs always render `project.estimate`
 * and Final Bill PDFs always render `project.finalBill`.
 */
export function applySnapshotToJobForPdf(
  job: JobProject,
  type: 'ESTIMATE' | 'BILL' | 'MASTER RECORD'
): JobProject {
  const snap =
    type === 'ESTIMATE'
      ? getEstimateSnapshot(job)
      : getFinalBillSnapshot(job) || getEstimateSnapshot(job);

  return {
    ...job,
    showLaborTotal: snap.showLaborTotal,
    showOverallTotal: snap.showOverallTotal,
    matsIncluded: snap.matsIncluded,
    internalNotes: snap.internalNotes || '',
    paintRate: snap.paintRate,
    repairRate: snap.repairRate,
    disc: snap.disc,
    discType: snap.discType,
    discLabel: snap.discLabel,
    matVal: snap.matVal,
    sunVal: snap.sunVal,
    depo: snap.depo,
    payments: snap.payments,
    prepScope: snap.prepScope,
    scope: snap.scope,
    rooms: snap.rooms,
    repairs: snap.repairs,
  };
}

/**
 * Creates a deep copy of a project under the same customer named `"[Project Name] (Copy)"`,
 * resetting `finalBill` to `null`, clearing payments/schedule/signature, and setting status to `DRAFT`
 * ("Draft / Unquoted") so existing room dimensions, prep tasks, and scope can be reused cleanly.
 */
export function duplicateJobProject(source: JobProject): JobProject {
  const estCopy = getEstimateSnapshot(source);
  estCopy.payments = [];
  estCopy.depo = 0;
  estCopy.updatedAt = new Date().toISOString();

  const baseTitle = (source.title || 'Project').trim();
  const copyTitle = `${baseTitle} (Copy)`;

  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    title: copyTitle,
    date: new Date().toLocaleDateString(),
    status: 'DRAFT',
    showLaborTotal: estCopy.showLaborTotal,
    showOverallTotal: estCopy.showOverallTotal,
    matsIncluded: estCopy.matsIncluded,
    internalNotes: estCopy.internalNotes || '',
    paintRate: estCopy.paintRate,
    repairRate: estCopy.repairRate,
    disc: estCopy.disc,
    discType: estCopy.discType,
    discLabel: estCopy.discLabel,
    matVal: estCopy.matVal,
    sunVal: estCopy.sunVal,
    depo: 0,
    payments: [],
    prepScope: estCopy.prepScope,
    scope: estCopy.scope,
    rooms: estCopy.rooms,
    repairs: estCopy.repairs,
    rtMiles: source.rtMiles || 0,
    workDays: source.workDays || 1,
    schedDate: '',
    schedEndDate: '',
    clientSig: '',
    estimate: estCopy,
    finalBill: null,
  };
}


