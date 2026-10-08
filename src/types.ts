export interface RoomArea {
  n: string; // Name (e.g. "Living Room 12x15")
  r: number; // Labor price ($)
  og?: string; // Override paint gallons
  ol?: string; // Override labor ($)
  sp?: boolean; // Show paint on estimate
  prod?: string; // Paint product (e.g. "Emerald")
  color?: string; // Color code (e.g. "SW 7015 Repose Gray")
  sheen?: string; // Sheen (e.g. "Satin")
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
  status: 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'OTHER';
  showLaborTotal: boolean;
  internalNotes?: string;
  showOverallTotal: boolean;
  matsIncluded: boolean;
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
  lastActive: number;
  lat?: number;
  lng?: number;
  googleContactId?: string;
  googleContactEtag?: string;
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

export interface WeatherCondition {
  temp: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  weatherCode: number;
  rainProb: number;
  conditionText: string;
  badgeBg: string;
  badgeText: string;
  advice: string;
}

export interface HourlyForecast {
  timeStr: string;
  temp: number;
  rainProb: number;
  windSpeed: number;
}

export interface DailyForecast {
  dateStr: string;
  dayName: string;
  tempMax: number;
  tempMin: number;
  rainProb: number;
  weatherCode: number;
}
