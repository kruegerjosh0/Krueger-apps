import React, { useState, useEffect } from 'react';
import {
  Customer,
  JobProject,
  RoomArea,
  RepairItem,
  FieldNote,
  MileageEntry,
  ExpenseEntry,
  ShoppingItem,
  PriceBookItem,
  WebPhoto,
  PrintSettings,
  SystemConstants,
  LocationInfo,
  WeatherCondition,
} from './types';
import {
  loadRecord,
  saveRecord,
  DEFAULT_PRINT_SETTINGS,
  DEFAULT_SYSTEM_CONSTANTS,
  buildFullBackupPayload,
  getFullBackupFilename,
  parseBackupJson,
  restoreRawStorageEntries,
  runOneTimeDemoDataPurge,
  NormalizedRestorePayload,
} from './utils/db';
import {
  generateEstimateOrBillPdf,
  dataUrlToPdfResult,
  openPdfDirectly,
  downloadPdfFile,
} from './utils/pdfGenerator';
import {
  fetchFullWeather,
  DEFAULT_WISCONSIN_PRESETS,
  getCurrentGpsPosition,
  watchDeviceLocation,
} from './utils/weatherService';

// Main views
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { DashboardView } from './components/DashboardView';
import { WeatherView } from './components/WeatherView';
import { NotesView } from './components/NotesView';
import { ToolsView } from './components/ToolsView';

// Modals
import { CustomerModal } from './components/modals/CustomerModal';
import { FolderViewModal } from './components/modals/FolderViewModal';
import { JobModal } from './components/modals/JobModal';
import { TaxReportModal } from './components/modals/TaxReportModal';
import { PaintCalcModal } from './components/modals/PaintCalcModal';
import { MileageModal } from './components/modals/MileageModal';
import { ExpenseModal } from './components/modals/ExpenseModal';
import { ShoppingListModal } from './components/modals/ShoppingListModal';
import { PriceBookModal } from './components/modals/PriceBookModal';
import { ColorDbModal } from './components/modals/ColorDbModal';
import { RegionalMapModal } from './components/modals/RegionalMapModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { DayPopupModal } from './components/modals/DayPopupModal';
import { ImageViewerModal } from './components/modals/ImageViewerModal';
import { DataBackupModal } from './components/modals/DataBackupModal';
import { LetterheadModal } from './components/modals/LetterheadModal';
import { CalendarSyncModal } from './components/modals/CalendarSyncModal';
import { ShareBusinessCardModal } from './components/modals/ShareBusinessCardModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  GoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from './utils/googleWorkspace';
import {
  hasCalendarRelevantChanges,
  exportSingleCustomerJobIcs,
} from './utils/calendarIcs';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dash');

  // Core Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [mileage, setMileage] = useState<MileageEntry[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [priceBook, setPriceBook] = useState<PriceBookItem[]>([]);
  const [webPhotos, setWebPhotos] = useState<WebPhoto[]>([]);
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [constants, setConstants] = useState<SystemConstants>(DEFAULT_SYSTEM_CONSTANTS);
  const [customLogo, setCustomLogo] = useState<string | null>(null);

  // Theme & Accents
  const [baseTheme, setBaseTheme] = useState<'dark' | 'light'>('dark');
  const [accent1, setAccent1] = useState('#bf5af2');
  const [accent2, setAccent2] = useState('#0a84ff');
  const [accent3, setAccent3] = useState('#30d158');

  // Location & Weather
  const [currentLocation, setCurrentLocation] = useState<LocationInfo>(DEFAULT_WISCONSIN_PRESETS[0]);
  const [currentWeather, setCurrentWeather] = useState<WeatherCondition | null>(null);
  const [isFollowingGps, setIsFollowingGps] = useState<boolean>(false);

  // Backup health
  const [isBackupDue, setIsBackupDue] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modals
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [activeFolderCustomer, setActiveFolderCustomer] = useState<Customer | null>(null);
  const [jobModalCustomer, setJobModalCustomer] = useState<Customer | null>(null);
  const [activeEditingJob, setActiveEditingJob] = useState<JobProject | null>(null);

  const [taxReportOpen, setTaxReportOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [mileageOpen, setMileageOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [priceBookOpen, setPriceBookOpen] = useState(false);
  const [colorDbOpen, setColorDbOpen] = useState(false);
  const [regionalMapOpen, setRegionalMapOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [dayPopupDate, setDayPopupDate] = useState<string | null>(null);
  const [dayPopupJobs, setDayPopupJobs] = useState<
    { customerName: string; customerId: number; job: JobProject; address?: string; phone?: string }[]
  >([]);
  const [dayPopupGoogleEvents, setDayPopupGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);

  const [editingNote, setEditingNote] = useState<FieldNote | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [cloudSyncOpen, setCloudSyncOpen] = useState(false);
  const [letterheadOpen, setLetterheadOpen] = useState(false);
  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false);
  const [shareBusinessCardOpen, setShareBusinessCardOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  // Handle restoring full-state or legacy JSON backup into localStorage, IndexedDB, and live React state
  const handleApplyBackup = async (payload: NormalizedRestorePayload) => {
    let customersCount = 0;
    let settingsGroupsRestored = 0;
    let rawKeysRestored = 0;
    const details: string[] = [];

    if (Array.isArray(payload.customers)) {
      setCustomers(payload.customers);
      await saveRecord('KMaster_C', payload.customers);
      customersCount = payload.customers.length;
      details.push(`${customersCount} customers`);
    }

    if (Array.isArray(payload.notes)) {
      setNotes(payload.notes);
      await saveRecord('KMaster_Notes', payload.notes);
      settingsGroupsRestored += 1;
      details.push(`${payload.notes.length} notes`);
    }

    if (Array.isArray(payload.expenses)) {
      setExpenses(payload.expenses);
      await saveRecord('KMaster_Exp', payload.expenses);
      settingsGroupsRestored += 1;
      details.push(`${payload.expenses.length} expenses`);
    }

    if (Array.isArray(payload.mileage)) {
      setMileage(payload.mileage);
      await saveRecord('KMaster_Mil', payload.mileage);
      settingsGroupsRestored += 1;
      details.push(`${payload.mileage.length} mileage logs`);
    }

    if (Array.isArray(payload.shoppingList)) {
      setShoppingList(payload.shoppingList);
      await saveRecord('KMaster_Shopping', payload.shoppingList);
      settingsGroupsRestored += 1;
      details.push(`${payload.shoppingList.length} shopping items`);
    }

    if (Array.isArray(payload.priceBook)) {
      setPriceBook(payload.priceBook);
      await saveRecord('KMaster_PriceBook', payload.priceBook);
      settingsGroupsRestored += 1;
      details.push(`${payload.priceBook.length} price book items`);
    }

    if (Array.isArray(payload.webPhotos)) {
      setWebPhotos(payload.webPhotos);
      await saveRecord('KMaster_WebPhotos', payload.webPhotos);
      settingsGroupsRestored += 1;
    }

    if (payload.terms) {
      setSettings(payload.terms);
      await saveRecord('KMaster_Settings', payload.terms);
      settingsGroupsRestored += 1;
      details.push('PDF header & contract terms');
    }

    if (payload.constants) {
      setConstants(payload.constants);
      await saveRecord('KMaster_Constants', payload.constants);
      settingsGroupsRestored += 1;
      details.push('custom rates & presets');
    }

    if (payload.hasCustomLogo) {
      setCustomLogo(payload.customLogo ?? null);
      await saveRecord('KMaster_Logo', payload.customLogo ?? null);
      settingsGroupsRestored += 1;
      details.push('company logo');
    }

    if (payload.baseTheme) {
      setBaseTheme(payload.baseTheme);
      applyTheme(payload.baseTheme);
      await saveRecord('KMaster_BaseMode', payload.baseTheme);
      settingsGroupsRestored += 1;
    }

    if (payload.accent1 || payload.accent2 || payload.accent3) {
      const nextA1 = payload.accent1 || accent1;
      const nextA2 = payload.accent2 || accent2;
      const nextA3 = payload.accent3 || accent3;
      setAccent1(nextA1);
      setAccent2(nextA2);
      setAccent3(nextA3);
      applyAccents(nextA1, nextA2, nextA3);
      if (payload.accent1) await saveRecord('KMaster_Accent1', nextA1);
      if (payload.accent2) await saveRecord('KMaster_Accent2', nextA2);
      if (payload.accent3) await saveRecord('KMaster_Accent3', nextA3);
      settingsGroupsRestored += 1;
    }

    if (payload.weatherLocation) {
      setCurrentLocation(payload.weatherLocation);
      await saveRecord('KMaster_WeatherLoc', payload.weatherLocation);
      settingsGroupsRestored += 1;
    }

    if (payload.rawStorage && Object.keys(payload.rawStorage).length > 0) {
      rawKeysRestored = await restoreRawStorageEntries(payload.rawStorage);
    }

    localStorage.setItem('KMaster_LastBackupTS', Date.now().toString());
    setIsBackupDue(false);

    return {
      customersCount,
      settingsGroupsRestored,
      rawKeysRestored,
      details,
    };
  };

  // Initial Load from IDB / LocalStorage
  useEffect(() => {
    const initializeData = async () => {
      const savedTheme = await loadRecord<'dark' | 'light'>('KMaster_BaseMode', 'dark');
      setBaseTheme(savedTheme);
      applyTheme(savedTheme);

      const a1 = await loadRecord<string>('KMaster_Accent1', '#bf5af2');
      const a2 = await loadRecord<string>('KMaster_Accent2', '#0a84ff');
      const a3 = await loadRecord<string>('KMaster_Accent3', '#30d158');
      setAccent1(a1);
      setAccent2(a2);
      setAccent3(a3);
      applyAccents(a1, a2, a3);

      let activeCustomers = await loadRecord<Customer[]>('KMaster_C', []);
      activeCustomers = await runOneTimeDemoDataPurge(activeCustomers);
      let activeNotes = await loadRecord<FieldNote[]>('KMaster_Notes', []);
      let activeExpenses = await loadRecord<ExpenseEntry[]>('KMaster_Exp', []);
      let activeMileage = await loadRecord<MileageEntry[]>('KMaster_Mil', []);
      let activeShopping = await loadRecord<ShoppingItem[]>('KMaster_Shopping', []);
      let activePriceBook = await loadRecord<PriceBookItem[]>('KMaster_PriceBook', []);
      let activeWebPhotos = await loadRecord<WebPhoto[]>('KMaster_WebPhotos', []);
      let activeSettings = await loadRecord<PrintSettings>('KMaster_Settings', DEFAULT_PRINT_SETTINGS);
      let activeConstants = await loadRecord<SystemConstants>('KMaster_Constants', DEFAULT_SYSTEM_CONSTANTS);

      // Check if workspace data was injected into the standalone HTML file on export
      const injectedWorkspace = typeof window !== 'undefined' ? (window as any).__INITIAL_KRUEGER_WORKSPACE__ : null;
      const injectedCustomers = typeof window !== 'undefined' ? (window as any).__INITIAL_KRUEGER_CUSTOMERS__ : null;

      if (activeCustomers.length === 0) {
        if (injectedWorkspace && Array.isArray(injectedWorkspace.customers) && injectedWorkspace.customers.length > 0) {
          activeCustomers = injectedWorkspace.customers;
          saveRecord('KMaster_C', activeCustomers);
          if (Array.isArray(injectedWorkspace.notes)) {
            activeNotes = injectedWorkspace.notes;
            saveRecord('KMaster_Notes', activeNotes);
          }
          if (Array.isArray(injectedWorkspace.expenses)) {
            activeExpenses = injectedWorkspace.expenses;
            saveRecord('KMaster_Exp', activeExpenses);
          }
          if (Array.isArray(injectedWorkspace.mileage)) {
            activeMileage = injectedWorkspace.mileage;
            saveRecord('KMaster_Mil', activeMileage);
          }
          if (Array.isArray(injectedWorkspace.shoppingList)) {
            activeShopping = injectedWorkspace.shoppingList;
            saveRecord('KMaster_Shopping', activeShopping);
          }
          if (Array.isArray(injectedWorkspace.priceBook)) {
            activePriceBook = injectedWorkspace.priceBook;
            saveRecord('KMaster_PriceBook', activePriceBook);
          }
          if (injectedWorkspace.settings && injectedWorkspace.settings.hdr) {
            activeSettings = injectedWorkspace.settings;
            saveRecord('KMaster_Settings', activeSettings);
          }
          if (injectedWorkspace.constants && injectedWorkspace.constants.spreadRate) {
            activeConstants = injectedWorkspace.constants;
            saveRecord('KMaster_Constants', activeConstants);
          }
        } else if (Array.isArray(injectedCustomers) && injectedCustomers.length > 0) {
          activeCustomers = injectedCustomers;
          saveRecord('KMaster_C', activeCustomers);
        }
      }

      setCustomers(activeCustomers);
      setNotes(activeNotes);
      setExpenses(activeExpenses);
      setMileage(activeMileage);
      setShoppingList(activeShopping);
      setPriceBook(activePriceBook);
      setWebPhotos(activeWebPhotos);
      setSettings(activeSettings);
      setConstants(activeConstants);

      const loadedLogo = await loadRecord<string | null>('KMaster_Logo', null);
      if (loadedLogo) {
        setCustomLogo(loadedLogo);
      }

      // Initialize location: prioritize user's current device location, else West Bend / Washington County default
      try {
        const freshGps = await getCurrentGpsPosition();
        setCurrentLocation(freshGps);
        setIsFollowingGps(true);
      } catch {
        const savedLoc = await loadRecord<LocationInfo>('KMaster_WeatherLoc', DEFAULT_WISCONSIN_PRESETS[0]);
        setCurrentLocation(savedLoc);
        setIsFollowingGps(false);
      }
    };

    initializeData();
  }, []);

  // Continuously watch and follow device location in real-time when enabled
  useEffect(() => {
    if (!isFollowingGps) return;

    const unwatch = watchDeviceLocation((newLoc) => {
      setCurrentLocation((prev) => {
        // Update if position changed or wasn't GPS tagged
        if (!prev.isGps || Math.abs(prev.lat - newLoc.lat) > 0.001 || Math.abs(prev.lng - newLoc.lng) > 0.001) {
          return newLoc;
        }
        return prev;
      });
    });

    return () => {
      unwatch();
    };
  }, [isFollowingGps]);

  // Fetch weather when currentLocation updates
  useEffect(() => {
    fetchWeatherForLocation(currentLocation.lat, currentLocation.lng);
    saveRecord('KMaster_WeatherLoc', currentLocation);
  }, [currentLocation]);

  const handleToggleFollowMe = async (follow: boolean) => {
    setIsFollowingGps(follow);
    if (follow) {
      try {
        const freshGps = await getCurrentGpsPosition();
        setCurrentLocation(freshGps);
        showToast(`🛰️ Live GPS Following: ${freshGps.name}`);
      } catch {
        showToast('Device location request active');
      }
    } else {
      showToast(`Fixed location: ${currentLocation.name}`);
    }
  };

  const fetchWeatherForLocation = async (lat: number, lng: number) => {
    try {
      const data = await fetchFullWeather(lat, lng);
      setCurrentWeather(data.current);
    } catch {
      // Offline fallback
    }
  };

  const applyTheme = (theme: 'dark' | 'light') => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  };

  const applyAccents = (a1: string, a2: string, a3: string) => {
    document.documentElement.style.setProperty('--accent', a1);
    document.documentElement.style.setProperty('--accent-secondary', a2);
    document.documentElement.style.setProperty('--accent-tertiary', a3);
  };

  const handleUpdateTheme = (theme: 'dark' | 'light') => {
    setBaseTheme(theme);
    applyTheme(theme);
    saveRecord('KMaster_BaseMode', theme);
    showToast(`Base theme: ${theme}`);
  };

  let accentCycle = 0;
  const handlePickAccent = (hex: string) => {
    accentCycle = (accentCycle + 1) % 3;
    if (accentCycle === 1) {
      setAccent1(hex);
      applyAccents(hex, accent2, accent3);
      saveRecord('KMaster_Accent1', hex);
      showToast('Primary Accent Set');
    } else if (accentCycle === 2) {
      setAccent2(hex);
      applyAccents(accent1, hex, accent3);
      saveRecord('KMaster_Accent2', hex);
      showToast('Secondary Accent Set');
    } else {
      setAccent3(hex);
      applyAccents(accent1, accent2, hex);
      saveRecord('KMaster_Accent3', hex);
      showToast('Tertiary Accent Set');
    }
  };

  // Customers Management
  const handleSaveCustomer = (partial: Partial<Customer>) => {
    const newCust: Customer = {
      id: partial.id || Date.now(),
      name: partial.name || 'Valued Customer',
      address: partial.address || '',
      phone: partial.phone || '',
      email: partial.email || '',
      notes: partial.notes || '',
      statusOverride: partial.statusOverride || 'AUTO',
      isPinned: partial.isPinned || false,
      files: partial.files || [],
      jobs: partial.jobs || [],
      createdAt: partial.createdAt || new Date().toISOString(),
      calendarSequence: partial.calendarSequence ?? 0,
      calendarUpdatedAt: partial.calendarUpdatedAt ?? Date.now(),
      lastActive: Date.now(),
    };
    const updated = [newCust, ...customers];
    setCustomers(updated);
    saveRecord('KMaster_C', updated);
    setCustomerModalOpen(false);
    showToast('✔ Customer Folder Created');
  };

  const handleUpdateCustomer = (updatedCust: Customer) => {
    const prevCust = customers.find((c) => c.id === updatedCust.id);
    let nextCust = updatedCust;
    if (prevCust && hasCalendarRelevantChanges(prevCust, updatedCust)) {
      nextCust = {
        ...updatedCust,
        calendarSequence: (prevCust.calendarSequence ?? 0) + 1,
        calendarUpdatedAt: Date.now(),
      };
    }

    const updatedList = customers.map((c) => (c.id === nextCust.id ? nextCust : c));
    setCustomers(updatedList);
    saveRecord('KMaster_C', updatedList);
    if (activeFolderCustomer?.id === nextCust.id) {
      setActiveFolderCustomer(nextCust);
    }
  };

  const handleDeleteCustomer = (id: number) => {
    const updated = customers.filter((c) => c.id !== id);
    setCustomers(updated);
    saveRecord('KMaster_C', updated);
    setActiveFolderCustomer(null);
    showToast('Customer Folder Deleted');
  };

  const handleTogglePin = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customers.map((c) => (c.id === id ? { ...c, isPinned: !c.isPinned } : c));
    setCustomers(updated);
    saveRecord('KMaster_C', updated);
    showToast('Pinned status updated');
  };

  // Project / Job Management
  const handleSaveJob = (savedJob: JobProject) => {
    if (!jobModalCustomer) return;
    const existingIdx = (jobModalCustomer.jobs || []).findIndex((j) => j.id === savedJob.id);
    let updatedJobs = [...(jobModalCustomer.jobs || [])];
    if (existingIdx > -1) {
      updatedJobs[existingIdx] = savedJob;
    } else {
      updatedJobs.push(savedJob);
    }

    const updatedCust: Customer = {
      ...jobModalCustomer,
      jobs: updatedJobs,
      lastActive: Date.now(),
    };

    handleUpdateCustomer(updatedCust);
    setJobModalCustomer(null);
    setActiveEditingJob(null);
  };

  const handleDeleteJob = (jobId: number) => {
    if (!activeFolderCustomer) return;
    if (confirm('Delete this project?')) {
      const updatedJobs = activeFolderCustomer.jobs.filter((j) => j.id !== jobId);
      const updatedCust = {
        ...activeFolderCustomer,
        jobs: updatedJobs,
      };
      handleUpdateCustomer(updatedCust);
      showToast('Project Deleted');
    }
  };

  // Direct 1-Tap PDF Generation (No Intermediate Preview Modal)
  const handleGenerateDoc = async (
    job: JobProject,
    type: 'ESTIMATE' | 'BILL' | 'MASTER RECORD',
    action: 'OPEN' | 'DOWNLOAD' = 'OPEN'
  ) => {
    const targetCustomer =
      activeFolderCustomer || customers.find((c) => c.jobs?.some((j) => j.id === job.id));
    if (!targetCustomer) return;

    // Pre-open window synchronously on click when opening PDF to avoid mobile/desktop popup blockers
    const preWin = action === 'OPEN' ? window.open('', '_blank') : null;
    showToast(action === 'OPEN' ? 'Opening official PDF...' : 'Downloading official PDF...');

    try {
      const result = await generateEstimateOrBillPdf(
        targetCustomer,
        job,
        type,
        settings,
        constants,
        customLogo || undefined
      );

      if (action === 'DOWNLOAD') {
        downloadPdfFile(result);
        showToast(`✔ Downloaded ${result.fileName}`);
      } else {
        openPdfDirectly(result, preWin);
        showToast(`✔ Opened ${type} PDF`);
      }
    } catch (err) {
      if (preWin && !preWin.closed) preWin.close();
      console.error('PDF error:', err);
      showToast('Failed to generate PDF');
    }
  };

  // Record lastCalendarSyncedAt on exported customers without bumping calendarSequence
  const handleMarkCustomersCalendarSynced = (customerIds: number[], syncedAt: number) => {
    const idSet = new Set<number>(customerIds);
    setCustomers((prev) => {
      const updated = prev.map((c) =>
        idSet.has(c.id)
          ? {
              ...c,
              calendarSequence: c.calendarSequence ?? 0,
              lastCalendarSyncedAt: syncedAt,
            }
          : c
      );
      saveRecord('KMaster_C', updated);
      return updated;
    });

    setActiveFolderCustomer((prevActive) =>
      prevActive && idSet.has(prevActive.id)
        ? {
            ...prevActive,
            calendarSequence: prevActive.calendarSequence ?? 0,
            lastCalendarSyncedAt: syncedAt,
          }
        : prevActive
    );
  };

  // View Document / Saved PDF directly from Customer Files
  const handleViewDocFile = (file: { name: string; data: string; tag?: string }) => {
    if (file.data.startsWith('data:application/pdf') || file.name.toLowerCase().endsWith('.pdf')) {
      const pdfResult = dataUrlToPdfResult(file.data, file.name, 0, 0);
      openPdfDirectly(pdfResult);
    } else {
      setViewerImageUrl(file.data);
    }
  };

  // Schedule Estimate Quick Action
  const handleScheduleEstimate = async (cust: Customer) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = prompt('Enter on-site estimate date (YYYY-MM-DD):', todayStr);
    if (!dateInput) return;
    const timeInput = prompt('Enter estimate appointment time (e.g. 9:00 AM):', '9:00 AM') || '9:00 AM';

    const estJob: JobProject = {
      id: Date.now(),
      title: `On-Site Estimate (${timeInput})`,
      date: new Date().toLocaleDateString(),
      status: 'SCHEDULED',
      showLaborTotal: true,
      showOverallTotal: false,
      matsIncluded: false,
      paintRate: '1.00',
      repairRate: constants.repairRate,
      disc: 0,
      discType: 'PCT',
      discLabel: '',
      matVal: 0,
      sunVal: 0,
      depo: 0,
      payments: [],
      prepScope: '',
      scope: `ON-SITE ESTIMATE APPOINTMENT @ ${timeInput}\nPhone: ${cust.phone || 'N/A'}\nAddress: ${cust.address || 'N/A'}`,
      rooms: [],
      repairs: [],
      rtMiles: 0,
      workDays: 1,
      schedDate: dateInput,
      schedEndDate: dateInput,
      clientSig: '',
    };

    const nextSeq = (cust.calendarSequence ?? 0) + 1;
    const updated: Customer = {
      ...cust,
      jobs: [...(cust.jobs || []), estJob],
      calendarSequence: nextSeq,
      calendarUpdatedAt: Date.now(),
      lastActive: Date.now(),
    };
    handleUpdateCustomer(updated);
    showToast('✔ Estimate Scheduled!');

    if (confirm('Estimate scheduled! Export .ICS calendar event to add to your phone calendar now?')) {
      const res = await exportSingleCustomerJobIcs(updated, estJob);
      if (res.exportedCount > 0) {
        handleMarkCustomersCalendarSynced([updated.id], Date.now());
        showToast('✔ Exported Estimate .ICS to Calendar');
      }
    }
  };

  // Before & After Collage
  const handleGenerateBeforeAfterCollage = (cust: Customer) => {
    const beforeFiles = (cust.files || []).filter((f) => f.tag === 'BEFORE' && f.isImg);
    const afterFiles = (cust.files || []).filter((f) => f.tag === 'AFTER' && f.isImg);

    if (beforeFiles.length === 0 || afterFiles.length === 0) {
      alert('Please upload at least one BEFORE photo and one AFTER photo in the file cabinet first.');
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 1600;
    canvas.height = 1000;

    const bImg = new Image();
    const aImg = new Image();
    bImg.onload = () => {
      aImg.onload = () => {
        ctx.fillStyle = '#07080a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(0, 0, canvas.width, 100);
        ctx.fillStyle = '#000';
        ctx.font = '900 42px sans-serif';
        ctx.fillText('KRUEGER PAINTING • SHOWCASE', 40, 65);

        ctx.drawImage(bImg, 30, 125, 740, 750);
        ctx.drawImage(aImg, 830, 125, 740, 750);

        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(785, 125, 30, 750);

        ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
        ctx.fillRect(50, 150, 160, 50);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('BEFORE', 80, 183);

        ctx.fillStyle = 'rgba(48, 209, 88, 0.95)';
        ctx.fillRect(850, 150, 160, 50);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('AFTER', 885, 183);

        ctx.fillStyle = '#121318';
        ctx.fillRect(0, 900, canvas.width, 100);
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText(`CLIENT: ${cust.name.toUpperCase()}`, 40, 960);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText('📞 (262) 443-1199', 1250, 960);

        const dataUrl = canvas.toDataURL('image/png', 1.0);
        const link = document.createElement('a');
        link.download = `Krueger_Showcase_${cust.name.replace(/\s+/g, '_')}.png`;
        link.href = dataUrl;
        link.click();
        showToast('✔ Showcase Card Downloaded');
      };
      aImg.src = afterFiles[afterFiles.length - 1].data;
    };
    bImg.src = beforeFiles[beforeFiles.length - 1].data;
  };

  // Calendar .ICS Export & Google Calendar Sync
  const handleExportAllJobsIcs = async () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Krueger Painting OS//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Krueger Painting Schedule',
    ];

    let count = 0;
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

          icsContent.push('BEGIN:VEVENT');
          icsContent.push(`UID:krueger-${j.id}-${start}@kruegerpainting.com`);
          icsContent.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
          icsContent.push(`SUMMARY:🎨 Krueger Painting - ${c.name} (${j.status})`);
          icsContent.push(
            `DESCRIPTION:Client: ${c.name}\\nPhone: ${c.phone || 'N/A'}\\nStatus: ${j.status}\\nScope: ${
              j.scope ? j.scope.replace(/\n/g, ' ') : 'Painting Project'
            }\\nKrueger Painting OS`
          );
          if (c.address) icsContent.push(`LOCATION:${c.address}`);
          icsContent.push(`DTSTART;VALUE=DATE:${start}`);
          icsContent.push(`DTEND;VALUE=DATE:${end}`);
          icsContent.push('STATUS:CONFIRMED');
          icsContent.push('END:VEVENT');
          count++;
        }
      });
    });
    icsContent.push('END:VCALENDAR');

    if (count === 0) {
      alert('No scheduled jobs found with start dates to export.');
      return;
    }

    const icsString = icsContent.join('\r\n');

    // On mobile devices, attempt native share to Google Calendar
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const file = new File([icsString], 'Krueger_Schedule_Sync.ics', { type: 'text/calendar' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Krueger Painting Schedule',
            text: `Import ${count} scheduled jobs into Google Calendar`,
            files: [file],
          });
          showToast('✔ Opened Calendar Import on Device');
          return;
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Native calendar share error:', err);
        }
      }
    }

    // Direct download fallback
    const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Krueger_Schedule_Sync.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✔ Calendar Sync (.ICS) Downloaded');
  };

  // Full-State Portable Backup & Smart Restore
  const handleBackup = async () => {
    const payload = await buildFullBackupPayload({
      customers,
      notes,
      expenses,
      mileage,
      shoppingList,
      priceBook,
      webPhotos,
      terms: settings,
      constants,
      customLogo,
      baseTheme,
      accent1,
      accent2,
      accent3,
      weatherLocation: currentLocation,
    });
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = getFullBackupFilename();
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    localStorage.setItem('KMaster_LastBackupTS', Date.now().toString());
    setIsBackupDue(false);
    showToast(`✔ Full Backup Downloaded (${filename})`);
  };

  const handleRestore = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        const normalized = parseBackupJson(parsed);
        if (!normalized) {
          alert('Invalid backup file.');
          return;
        }
        const summary = await handleApplyBackup(normalized);
        const totalSettings = summary.settingsGroupsRestored + summary.rawKeysRestored;
        showToast(
          `✔ Restored ${summary.customersCount} customers & ${totalSettings} settings/data groups!`
        );
      } catch {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  // Field Notes Helpers
  const handleSaveNote = (noteData: Partial<FieldNote>) => {
    const dateStr = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    let updated: FieldNote[];
    if (editingNote) {
      updated = notes.map((n) =>
        n.id === editingNote.id ? { ...n, ...noteData, date: dateStr } as FieldNote : n
      );
    } else {
      const newN: FieldNote = {
        id: Date.now(),
        title: noteData.title || 'Untitled Note',
        category: noteData.category || 'General Reminder',
        body: noteData.body || '',
        date: dateStr,
      };
      updated = [newN, ...notes];
    }
    setNotes(updated);
    saveRecord('KMaster_Notes', updated);
    setNoteModalOpen(false);
    setEditingNote(null);
    showToast('✔ Note Saved');
  };

  const handleDeleteNote = (id: number) => {
    if (confirm('Delete this note?')) {
      const updated = notes.filter((n) => n.id !== id);
      setNotes(updated);
      saveRecord('KMaster_Notes', updated);
      showToast('Note Deleted');
    }
  };

  const handleShareNote = async (note: FieldNote) => {
    const text = `[${note.category}] ${note.title}\n\n${note.body}\n\n- Krueger Painting Field Notes`;
    if (navigator.share) {
      try {
        await navigator.share({ title: note.title, text });
      } catch {
        // Cancelled
      }
    } else {
      navigator.clipboard.writeText(text);
      showToast('✔ Note Copied to Clipboard');
    }
  };

  const handleSendNoteToEstimator = (note: FieldNote) => {
    // Parse rooms from note text (e.g. 14x16, 12 by 15)
    const proposedRooms: RoomArea[] = [];
    const dimRegex = /(?:(\w+)\s+)?(\d+)\s*(?:x|by|\*)\s*(\d+)/gi;
    let match: RegExpExecArray | null;
    while ((match = dimRegex.exec(note.body)) !== null) {
      const roomLabel = match[1] ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : 'Area';
      const w = parseInt(match[2], 10);
      const l = parseInt(match[3], 10);
      const sqft = w * l;
      const gals = Math.max(1, Math.ceil((sqft * 2) / (constants.spreadRate || 350)));
      const labor = Math.round(sqft * 1.05);
      proposedRooms.push({
        n: `${roomLabel} ${w}x${l}`,
        r: labor,
        og: String(gals),
        prod: 'Emerald',
        sheen: 'Satin',
        sp: true,
      });
    }

    const proposedRepairs: RepairItem[] = [];
    const repMatch = note.body.toLowerCase().match(/(\d+)\s*(?:hours?|hrs?)/);
    if (repMatch) {
      proposedRepairs.push({
        d: 'Surface prep & repairs from notes',
        h: parseInt(repMatch[1], 10),
      });
    }

    const custName = prompt(
      'Enter client name to create estimate for:',
      note.title.replace(/walkthrough|note|estimate/gi, '').trim() || 'Client Estimate'
    );
    if (!custName || !custName.trim()) return;

    const newCustId = Date.now();
    const newJob: JobProject = {
      id: newCustId + 1,
      title: note.title || 'Estimate from Field Notes',
      date: new Date().toLocaleDateString(),
      status: 'PENDING',
      showLaborTotal: true,
      showOverallTotal: false,
      matsIncluded: false,
      paintRate: '1.00',
      repairRate: constants.repairRate,
      disc: 0,
      discType: 'PCT',
      discLabel: '',
      matVal: 0,
      sunVal: 0,
      depo: 0,
      payments: [],
      prepScope: '',
      scope: note.body,
      rooms: proposedRooms,
      repairs: proposedRepairs,
      rtMiles: 0,
      workDays: 1,
      schedDate: '',
      schedEndDate: '',
      clientSig: '',
    };

    const newCust: Customer = {
      id: newCustId,
      name: custName.trim(),
      phone: '',
      email: '',
      address: '',
      jobs: [newJob],
      files: [],
      notes: note.body,
      statusOverride: 'AUTO',
      lastActive: Date.now(),
    };

    handleSaveCustomer(newCust);
    setJobModalCustomer(newCust);
    setActiveEditingJob(newJob);
    showToast('✔ Opened in Estimator Tool with your notes!');
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-200">
      {/* Toast Banner */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--surface)] border border-[var(--accent)] text-[var(--text)] px-4 py-2 rounded-full text-xs font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toastMsg}
        </div>
      )}

      {/* Top Header */}
      <Header
        settings={settings}
        isBackupDue={isBackupDue}
        onBackup={handleBackup}
        onRestore={handleRestore}
        onOpenNewCustomer={() => setCustomerModalOpen(true)}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onOpenCalc={() => setCalcOpen(true)}
        onOpenCloudSync={() => setCloudSyncOpen(true)}
      />

      {/* Main Tab Content */}
      <main className="p-2 sm:p-4 max-w-4xl mx-auto w-full overflow-x-hidden">
        {activeTab === 'dash' && (
          <DashboardView
            customers={customers}
            currentLocation={currentLocation}
            currentWeather={currentWeather}
            isFollowingGps={isFollowingGps}
            onToggleFollowMe={handleToggleFollowMe}
            onOpenWeatherHub={() => setActiveTab('weather')}
            onOpenNewCustomer={() => setCustomerModalOpen(true)}
            onOpenFolder={(cId) => {
              const c = customers.find((x) => x.id === cId);
              if (c) setActiveFolderCustomer(c);
            }}
            onTogglePin={handleTogglePin}
          />
        )}

        {activeTab === 'weather' && (
          <WeatherView
            currentLocation={currentLocation}
            isFollowingGps={isFollowingGps}
            onToggleFollowMe={handleToggleFollowMe}
            onLocationChange={(loc) => {
              setCurrentLocation(loc);
              showToast(`Weather location: ${loc.name}`);
            }}
          />
        )}

        {activeTab === 'notes' && (
          <NotesView
            notes={notes}
            constants={constants}
            onOpenNoteModal={(note) => {
              setEditingNote(note || null);
              setNoteModalOpen(true);
            }}
            onDeleteNote={handleDeleteNote}
            onShareNote={handleShareNote}
            onSendNoteToEstimator={handleSendNoteToEstimator}
            onSaveNote={handleSaveNote}
            onToast={showToast}
          />
        )}

        {activeTab === 'tools' && (
          <ToolsView
            onOpenBusinessCard={() => setShareBusinessCardOpen(true)}
            onOpenLetterhead={() => setLetterheadOpen(true)}
            onOpenTaxReport={() => setTaxReportOpen(true)}
            onOpenCalc={() => setCalcOpen(true)}
            onOpenPriceBook={() => setPriceBookOpen(true)}
            onOpenColorDb={() => setColorDbOpen(true)}
            onOpenMileage={() => setMileageOpen(true)}
            onOpenExpenses={() => setExpenseOpen(true)}
            onOpenShoppingList={() => setShoppingListOpen(true)}
            onOpenRegionalMap={() => setRegionalMapOpen(true)}
            onSyncCalendar={() => setCalendarSyncOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenCloudSync={() => setCloudSyncOpen(true)}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* MODALS */}

      {/* Customer Modal */}
      {customerModalOpen && (
        <CustomerModal
          key="new-customer-modal"
          onClose={() => setCustomerModalOpen(false)}
          onSaveCustomer={handleSaveCustomer}
        />
      )}

      {/* Customer Folder View Modal (Base Cabinet Drawer) */}
      {activeFolderCustomer && (
        <FolderViewModal
          key={activeFolderCustomer.id}
          customer={activeFolderCustomer}
          onClose={() => setActiveFolderCustomer(null)}
          onUpdateCustomer={handleUpdateCustomer}
          onDeleteCustomer={handleDeleteCustomer}
          onOpenJobModal={(job) => {
            setJobModalCustomer(activeFolderCustomer);
            setActiveEditingJob(job || null);
          }}
          onDeleteJob={handleDeleteJob}
          onGenerateDoc={handleGenerateDoc}
          onViewImage={setViewerImageUrl}
          onViewDocFile={handleViewDocFile}
          onGenerateCollage={() => handleGenerateBeforeAfterCollage(activeFolderCustomer)}
          onScheduleEstimate={() => handleScheduleEstimate(activeFolderCustomer)}
          onShareBusinessCard={() => setShareBusinessCardOpen(true)}
          onMarkCalendarSynced={(cId, ts) => handleMarkCustomersCalendarSynced([cId], ts)}
          onToast={showToast}
        />
      )}

      {/* Job / Estimate Editor Modal (Overlay Stack Layer 2) */}
      {jobModalCustomer && (
        <JobModal
          key={`${jobModalCustomer.id}-${activeEditingJob?.id ?? 'new'}`}
          customer={jobModalCustomer}
          job={activeEditingJob}
          constants={constants}
          onClose={() => {
            setJobModalCustomer(null);
            setActiveEditingJob(null);
          }}
          onSaveJob={handleSaveJob}
          onShareBusinessCard={() => setShareBusinessCardOpen(true)}
          onToast={showToast}
        />
      )}

      {/* Note Editor Modal */}
      {noteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-3.5 sm:p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <h3 className="font-extrabold text-sm text-[var(--accent)]">
                {editingNote ? 'Edit Field Note' : 'New Field Note'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setNoteModalOpen(false);
                  setEditingNote(null);
                }}
                className="text-xs font-bold text-[var(--text-muted)]"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const titleVal = (form.elements.namedItem('noteTitle') as HTMLInputElement).value;
                const catVal = (form.elements.namedItem('noteCat') as HTMLSelectElement).value;
                const bodyVal = (form.elements.namedItem('noteBody') as HTMLTextAreaElement).value;
                handleSaveNote({ title: titleVal, category: catVal, body: bodyVal });
              }}
              className="space-y-2.5"
            >
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                  Title / Subject
                </label>
                <input
                  name="noteTitle"
                  defaultValue={editingNote?.title || ''}
                  placeholder="e.g. Paint Run for Sherwin-Williams"
                  required
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                  Category
                </label>
                <select
                  name="noteCat"
                  defaultValue={editingNote?.category || 'General Reminder'}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
                >
                  <option value="General Reminder">General Reminder</option>
                  <option value="Material Run">Material Run</option>
                  <option value="Crew Instruction">Crew Instruction</option>
                  <option value="Job Site Idea">Job Site Idea</option>
                </select>
              </div>

              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                  Note Body
                </label>
                <textarea
                  name="noteBody"
                  rows={5}
                  defaultValue={editingNote?.body || ''}
                  placeholder="Write details..."
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setNoteModalOpen(false);
                    setEditingNote(null);
                  }}
                  className="flex-1 py-2 bg-[var(--surface-subtle)] text-[var(--text)] rounded-lg text-xs font-bold border border-[var(--border)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[var(--accent-tertiary)] text-white rounded-lg text-xs font-bold shadow cursor-pointer"
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tax Report Modal */}
      {taxReportOpen && (
        <TaxReportModal
          customers={customers}
          expenses={expenses}
          mileage={mileage}
          constants={constants}
          onClose={() => setTaxReportOpen(false)}
        />
      )}

      {/* Paint Calculator Modal */}
      {calcOpen && <PaintCalcModal constants={constants} onClose={() => setCalcOpen(false)} />}

      {/* Mileage Modal */}
      {mileageOpen && (
        <MileageModal
          mileage={mileage}
          constants={constants}
          onSaveMileage={(entry) => {
            const updated = [entry, ...mileage];
            setMileage(updated);
            saveRecord('KMaster_Mil', updated);
          }}
          onDeleteMileage={(id) => {
            const updated = mileage.filter((m) => m.id !== id);
            setMileage(updated);
            saveRecord('KMaster_Mil', updated);
          }}
          onClose={() => setMileageOpen(false)}
          onToast={showToast}
        />
      )}

      {/* Expenses Modal */}
      {expenseOpen && (
        <ExpenseModal
          expenses={expenses}
          onSaveExpense={(entry) => {
            const updated = [entry, ...expenses];
            setExpenses(updated);
            saveRecord('KMaster_Exp', updated);
          }}
          onDeleteExpense={(id) => {
            const updated = expenses.filter((e) => e.id !== id);
            setExpenses(updated);
            saveRecord('KMaster_Exp', updated);
          }}
          onClose={() => setExpenseOpen(false)}
          onToast={showToast}
        />
      )}

      {/* Shopping List Modal */}
      {shoppingListOpen && (
        <ShoppingListModal
          items={shoppingList}
          onAddItem={(item) => {
            const updated = [{ id: Date.now(), name: item.name, qty: item.qty, checked: false }, ...shoppingList];
            setShoppingList(updated);
            saveRecord('KMaster_Shopping', updated);
          }}
          onToggleItem={(id) => {
            const updated = shoppingList.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
            setShoppingList(updated);
            saveRecord('KMaster_Shopping', updated);
          }}
          onDeleteItem={(id) => {
            const updated = shoppingList.filter((i) => i.id !== id);
            setShoppingList(updated);
            saveRecord('KMaster_Shopping', updated);
          }}
          onClose={() => setShoppingListOpen(false)}
          onToast={showToast}
        />
      )}

      {/* Price Book Modal */}
      {priceBookOpen && (
        <PriceBookModal
          priceBook={priceBook}
          onSaveItem={(item) => {
            const updated = [item, ...priceBook];
            setPriceBook(updated);
            saveRecord('KMaster_PriceBook', updated);
          }}
          onDeleteItem={(id) => {
            const updated = priceBook.filter((i) => i.id !== id);
            setPriceBook(updated);
            saveRecord('KMaster_PriceBook', updated);
          }}
          onClose={() => setPriceBookOpen(false)}
          onToast={showToast}
        />
      )}

      {/* Color DB Modal */}
      {colorDbOpen && <ColorDbModal customers={customers} onClose={() => setColorDbOpen(false)} />}

      {/* Regional Map Modal */}
      {regionalMapOpen && (
        <RegionalMapModal
          customers={customers}
          onOpenFolder={(cId) => {
            const c = customers.find((x) => x.id === cId);
            if (c) setActiveFolderCustomer(c);
          }}
          onClose={() => setRegionalMapOpen(false)}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          constants={constants}
          baseTheme={baseTheme}
          customLogo={customLogo}
          onUpdateSettings={(newSettings) => {
            setSettings(newSettings);
            saveRecord('KMaster_Settings', newSettings);
          }}
          onUpdateConstants={(newConstants) => {
            setConstants(newConstants);
            saveRecord('KMaster_Constants', newConstants);
          }}
          onUpdateTheme={handleUpdateTheme}
          onPickAccent={handlePickAccent}
          onUploadLogo={(file) => {
            const reader = new FileReader();
            reader.onload = () => {
              const rawData = reader.result as string;
              // Clip uploaded logo onto a high-DPI transparent circular PNG (zero white bounding box on black PDF headers)
              const img = new Image();
              img.onload = () => {
                const size = 600;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.clearRect(0, 0, size, size);
                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';
                  ctx.save();
                  ctx.beginPath();
                  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
                  ctx.closePath();
                  ctx.clip();
                  const minDim = Math.min(img.width, img.height);
                  const sx = (img.width - minDim) / 2;
                  const sy = (img.height - minDim) / 2;
                  ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
                  ctx.restore();
                }
                const pngDataUrl = canvas.toDataURL('image/png');

                setCustomLogo(pngDataUrl);
                saveRecord('KMaster_Logo', pngDataUrl);
                showToast('✔ Circular Transparent Logo Saved & Applied to PDFs');
              };
              img.onerror = () => {
                setCustomLogo(rawData);
                saveRecord('KMaster_Logo', rawData);
                showToast('✔ Custom Logo Saved');
              };
              img.src = rawData;
            };
            reader.readAsDataURL(file);
          }}
          onRemoveLogo={() => {
            setCustomLogo(null);
            saveRecord('KMaster_Logo', null);
            showToast('Logo reset to official Krueger seal');
          }}
          onClose={() => setSettingsOpen(false)}
          onToast={showToast}
          onOpenDataBackup={() => setCloudSyncOpen(true)}
        />
      )}

      {/* Day Agenda Popup Modal */}
      {dayPopupDate && (
        <DayPopupModal
          dateStr={dayPopupDate}
          jobs={dayPopupJobs}
          googleEvents={dayPopupGoogleEvents}
          onOpenFolder={(cId) => {
            setDayPopupDate(null);
            const c = customers.find((x) => x.id === cId);
            if (c) setActiveFolderCustomer(c);
          }}
          onDeleteGoogleEvent={async (eventId, summary) => {
            try {
              await deleteGoogleCalendarEvent(eventId);
              setDayPopupGoogleEvents((prev) => prev.filter((e) => e.id !== eventId));
              showToast(`✔ Deleted "${summary}" from Google Calendar`);
            } catch (err: any) {
              showToast(`Failed to delete event: ${err.message}`);
            }
          }}
          onClose={() => {
            setDayPopupDate(null);
            setDayPopupGoogleEvents([]);
          }}
        />
      )}

      {/* Image Viewer Modal */}
      {viewerImageUrl && (
        <ImageViewerModal
          imageUrl={viewerImageUrl}
          onClose={() => setViewerImageUrl(null)}
          onToast={showToast}
        />
      )}

      {/* Database Backup & Restore Modal (Full-State Portable JSON) */}
      <DataBackupModal
        isOpen={cloudSyncOpen}
        onClose={() => setCloudSyncOpen(false)}
        workspaceData={{
          customers,
          notes,
          expenses,
          mileage,
          shoppingList,
          priceBook,
          webPhotos,
          terms: settings,
          constants,
          customLogo,
          baseTheme,
          accent1,
          accent2,
          accent3,
          weatherLocation: currentLocation,
        }}
        onApplyBackup={handleApplyBackup}
        onToast={showToast}
      />

      {/* Blank Business Letterhead PDF Modal */}
      {letterheadOpen && (
        <LetterheadModal
          settings={settings}
          customLogo={customLogo}
          onClose={() => setLetterheadOpen(false)}
          onToast={showToast}
        />
      )}

      {/* Zero-Auth Weekly .ICS Calendar Sync Modal */}
      {calendarSyncOpen && (
        <CalendarSyncModal
          customers={customers}
          onMarkCustomersCalendarSynced={handleMarkCustomersCalendarSynced}
          onClose={() => setCalendarSyncOpen(false)}
          onToast={showToast}
        />
      )}

      {/* On-Demand Digital Business Card & Owner .vcf Share Modal */}
      {shareBusinessCardOpen && (
        <ShareBusinessCardModal
          onClose={() => setShareBusinessCardOpen(false)}
          onToast={showToast}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
