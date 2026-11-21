export interface RoomArea {
  n: string; // Name (e.g. "Living Room 12x15")
  r: number; // Labor price ($)
  og?: string; // Override paint gallons
  ol?: string; // Override labor ($)
  sp?: boolean; // Show paint on estimate
  prod?: string; // Paint product (e.g. "Emerald")
  color?: string; // Color code (e.g. "SW 7015 Repose Gray")
  sheen?: string; // Sheen (e.g. "Satin")
  prep?: string[]; // Room-specific prep & setup checklist items
}

export interface RepairItem {
  d: string; // Description
  h: number; // Hours
}

export interface PaymentEntry {
  date: string;
  amt: number;
}

export interface CustomerFile {
  id: number;
  name: string;
  tag: 'BEFORE' | 'ACTIVE' | 'AFTER' | 'DOC' | 'ESTIMATE' | 'BILL';
  data: string; // Data URL
  isImg: boolean;
  type: string;
}

export interface JobProject {
  id: number;
  title: string;
  date: string;
  status: 'PENDING' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'PAID' | 'ON HOLD' | 'DECLINED' | 'OTHER';
  showLaborTotal: boolean;
  showOverallTotal: boolean;
  matsIncluded: boolean;
  internalNotes?: string;
  paintRate: string;
  repairRate: number;
  disc: number;
  discType: 'PCT' | 'FLAT';
  discLabel: string;
  matVal: number;
  sunVal: number;
  depo: number;
  payments: PaymentEntry[];
  prepScope: string;
  scope: string;
  rooms: RoomArea[];
  repairs: RepairItem[];
  rtMiles: number;
  workDays: number;
  schedDate: string;
  schedEndDate: string;
  clientSig?: string;
  googleEventId?: string;
  googleCalendarEventId?: string;
}

export interface Customer {
  id: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  notes: string;
  statusOverride: string;
  isPinned?: boolean;
  files: CustomerFile[];
  jobs: JobProject[];
  createdAt?: string;
  lastActive: number;
  lat?: number;
  lng?: number;
  googleContactId?: string;
  googleContactEtag?: string;
  calendarSequence?: number;
  lastCalendarSyncedAt?: number;
  calendarUpdatedAt?: number;
}

export interface FieldNote {
  id: number;
  title: string;
  category: string;
  body: string;
  date: string;
}

export interface MileageEntry {
  id: number;
  projId?: number;
  date: string;
  vehicle: string;
  miles: number;
  purpose: string;
}

export interface ExpenseEntry {
  id: number;
  date: string;
  vendor: string;
  category: string;
  amount: number;
}

export interface ShoppingItem {
  id: number;
  name: string;
  qty: string;
  checked: boolean;
}

export interface PriceBookItem {
  id: number;
  name: string;
  supplier: string;
  price: number;
  unit: string;
}

export interface WebPhoto {
  id: number;
  name: string;
  data: string;
}

export interface SystemConstants {
  spreadRate: number;
  repairRate: number;
  irsRate: number;
  paintCostPerGal: number;
}

export interface PrintSettings {
  hdr: string;
  motto: string;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
}

export interface LocationInfo {
  name: string;
  region?: string;
  country?: string;
  lat: number;
  lng: number;
  isGps?: boolean;
}

export type PrecipType = 'NONE' | 'SNOW' | 'FREEZING_RAIN' | 'WINTRY_MIX' | 'RAIN';

export type WorkabilityStatus = 'GO' | 'CAUTION' | 'SNOW_ICE_RISK';

export interface WeatherCondition {
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGusts: number;
  precipitation: number;
  snowfallIn: number;
  weatherCode: number;
  wmoDescription: string;
  rainProb: number;
  precipType: PrecipType;
  precipTypeLabel: string;
  workability: WorkabilityStatus;
  workabilityLabel: string;
  conditionText: string;
  badgeBg: string;
  badgeText: string;
  advice: string;
}

export interface HourlyForecast {
  isoTime: string;
  dayLabel: string;
  timeStr: string;
  temp: number;
  feelsLike: number;
  rainProb: number;
  windSpeed: number;
  windGusts: number;
  snowfallIn: number;
  precipIn: number;
  weatherCode: number;
  precipType: PrecipType;
  precipIcon: string;
}

export interface DailyForecast {
  dateStr: string;
  dayName: string;
  tempMax: number;
  tempMin: number;
  feelsLikeMax: number;
  feelsLikeMin: number;
  rainProb: number;
  snowfallIn: number;
  precipSumIn: number;
  windSpeedMax: number;
  windGustsMax: number;
  weatherCode: number;
  wmoDescription: string;
  precipType: PrecipType;
  precipTypeLabel: string;
  precipIcon: string;
  workability: WorkabilityStatus;
  workabilityLabel: string;
  workabilityHint: string;
}

export interface WinterAdvisoryItem {
  icon: string;
  title: string;
  detail: string;
  tone: 'danger' | 'warn' | 'cold' | 'ok';
}

export interface WinterOutlookSummary {
  snow48hIn: number;
  snow7dIn: number;
  snow10dIn: number;
  snowDaysCount7d: number;
  lowestTemp7d: number;
  lowestFeelsLike7d: number;
  peakGust7d: number;
  freezingNights7d: number;
  hasFreezingRainRisk: boolean;
  severity: 'CLEAR' | 'COLD_WATCH' | 'ADVISORY' | 'STORM_ALERT';
  headline: string;
  advisories: WinterAdvisoryItem[];
  nextSnowEvent?: {
    dayName: string;
    snowfallIn: number;
    precipProb: number;
    windGustsMax: number;
    precipTypeLabel: string;
  };
}

export interface RegionalWeatherSnapshot {
  location: LocationInfo;
  temp: number;
  feelsLike: number;
  windGusts: number;
  snow48hIn: number;
  snow7dIn: number;
  precipType: PrecipType;
  precipTypeLabel: string;
  workability: WorkabilityStatus;
  workabilityLabel: string;
}

