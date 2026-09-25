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
  generateDailyBackupJson,
} from './utils/db';
import { generateEstimateOrBillPdf, GeneratedPdfResult } from './utils/pdfGenerator';
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
import { CalendarView } from './components/CalendarView';
import { NotesView } from './components/NotesView';
import { ToolsView } from './components/ToolsView';

// Modals
import { PdfPreviewModal } from './components/modals/PdfPreviewModal';
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
import { WebPhotoModal } from './components/modals/WebPhotoModal';
import { RegionalMapModal } from './components/modals/RegionalMapModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { DayPopupModal } from './components/modals/DayPopupModal';
import { ImageViewerModal } from './components/modals/ImageViewerModal';
import { AiAssistantModal, AiAction } from './components/modals/AiAssistantModal';
import { CloudSyncModal } from './components/modals/CloudSyncModal';
import { AccountLoginModal } from './components/modals/AccountLoginModal';
import { ApkInstallerModal } from './components/modals/ApkInstallerModal';
import {
  testFirestoreConnection,
  subscribeToCloudWorkspace,
  saveWorkspaceToCloud,
  CloudWorkspacePayload,
} from './utils/firebaseSync';
import { subscribeToAuth, auth } from './utils/googleWorkspace';

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
  const [isFollowingGps, setIsFollowingGps] = useState<boolean>(true);

  // Backup health
  const [isBackupDue, setIsBackupDue] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modals
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [activeFolderCustomer, setActiveFolderCustomer] = useState<Customer | null>(null);
  const [jobModalCustomer, setJobModalCustomer] = useState<Customer | null>(null);
  const [activeEditingJob, setActiveEditingJob] = useState<JobProject | null>(null);

  const [pdfPreviewResult, setPdfPreviewResult] = useState<GeneratedPdfResult | null>(null);
  const [pdfPreviewCustomer, setPdfPreviewCustomer] = useState<Customer | null>(null);

  const [taxReportOpen, setTaxReportOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [mileageOpen, setMileageOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [priceBookOpen, setPriceBookOpen] = useState(false);
  const [colorDbOpen, setColorDbOpen] = useState(false);
  const [webPhotosOpen, setWebPhotosOpen] = useState(false);
  const [regionalMapOpen, setRegionalMapOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [dayPopupDate, setDayPopupDate] = useState<string | null>(null);
  const [dayPopupJobs, setDayPopupJobs] = useState<
    { customerName: string; customerId: number; job: JobProject }[]
  >([]);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);

  const [editingNote, setEditingNote] = useState<FieldNote | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [cloudSyncOpen, setCloudSyncOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [apkInstallerOpen, setApkInstallerOpen] = useState(false);
  const [cloudUser, setCloudUser] = useState<any>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  // Test Firestore connection on app mount
  useEffect(() => {
    testFirestoreConnection().catch(() => {});
  }, []);

  // Listen to Google/Firebase auth and subscribe to real-time Cloud Sync
  useEffect(() => {
    const unsubAuth = subscribeToAuth((user) => {
      setCloudUser(user);
    });
    return () => unsubAuth();
  }, []);

  // Subscribe to real-time cloud data updates from other devices
  useEffect(() => {
    if (!cloudUser?.uid) return;

    const unsubSync = subscribeToCloudWorkspace(cloudUser.uid, (remotePayload) => {
      // Check if remote data is newer than local
      const lastLocalSync = localStorage.getItem('KMaster_LastCloudSyncTimestamp') || '0';
      const remoteTs = new Date(remotePayload.updatedAt).getTime();

      if (remoteTs > parseInt(lastLocalSync, 10)) {
        handleApplyRemoteWorkspace(remotePayload);
        localStorage.setItem('KMaster_LastCloudSyncTimestamp', remoteTs.toString());
        showToast(`☁️ Synced changes from ${remotePayload.deviceLabel}`);
      }
    });

    return () => unsubSync();
  }, [cloudUser?.uid]);

  const handleApplyRemoteWorkspace = (payload: CloudWorkspacePayload) => {
    if (payload.customers && Array.isArray(payload.customers)) {
      setCustomers(payload.customers);
      saveRecord('KMaster_C', payload.customers);
    }
    if (payload.notes && Array.isArray(payload.notes)) {
      setNotes(payload.notes);
      saveRecord('KMaster_Notes', payload.notes);
    }
    if (payload.expenses && Array.isArray(payload.expenses)) {
      setExpenses(payload.expenses);
      saveRecord('KMaster_Exp', payload.expenses);
    }
    if (payload.mileage && Array.isArray(payload.mileage)) {
      setMileage(payload.mileage);
      saveRecord('KMaster_Mil', payload.mileage);
    }
    if (payload.shoppingList && Array.isArray(payload.shoppingList)) {
      setShoppingList(payload.shoppingList);
      saveRecord('KMaster_Shopping', payload.shoppingList);
    }
    if (payload.priceBook && Array.isArray(payload.priceBook)) {
      setPriceBook(payload.priceBook);
      saveRecord('KMaster_PriceBook', payload.priceBook);
    }
    if (payload.settings && payload.settings.hdr) {
      setSettings(payload.settings);
      saveRecord('KMaster_Settings', payload.settings);
    }
    if (payload.constants && payload.constants.spreadRate) {
      setConstants(payload.constants);
      saveRecord('KMaster_Constants', payload.constants);
    }
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

      const loadedCustomers = await loadRecord<Customer[]>('KMaster_C', []);
      setCustomers(loadedCustomers);

      const loadedNotes = await loadRecord<FieldNote[]>('KMaster_Notes', []);
      setNotes(loadedNotes);

      const loadedExpenses = await loadRecord<ExpenseEntry[]>('KMaster_Exp', []);
      setExpenses(loadedExpenses);

      const loadedMileage = await loadRecord<MileageEntry[]>('KMaster_Mil', []);
      setMileage(loadedMileage);

      const loadedShopping = await loadRecord<ShoppingItem[]>('KMaster_Shopping', []);
      setShoppingList(loadedShopping);

      const loadedPriceBook = await loadRecord<PriceBookItem[]>('KMaster_PriceBook', []);
      setPriceBook(loadedPriceBook);

      const loadedWebPhotos = await loadRecord<WebPhoto[]>('KMaster_WebPhotos', []);
      setWebPhotos(loadedWebPhotos);

      const loadedSettings = await loadRecord<PrintSettings>('KMaster_Settings', DEFAULT_PRINT_SETTINGS);
      setSettings(loadedSettings);

      const loadedConstants = await loadRecord<SystemConstants>('KMaster_Constants', DEFAULT_SYSTEM_CONSTANTS);
      setConstants(loadedConstants);

      const loadedLogo = await loadRecord<string | null>('KMaster_Logo', null);
      if (loadedLogo) {
        setCustomLogo(loadedLogo);
      }

      // Initialize location: prioritize user's current device location
      try {
        const freshGps = await getCurrentGpsPosition();
        setCurrentLocation(freshGps);
      } catch {
        const savedLoc = await loadRecord<LocationInfo>('KMaster_WeatherLoc', DEFAULT_WISCONSIN_PRESETS[0]);
        setCurrentLocation(savedLoc);
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
      id: Date.now(),
      name: partial.name || 'Valued Customer',
      address: partial.address || '',
      phone: partial.phone || '',
      email: partial.email || '',
      notes: '',
      statusOverride: 'AUTO',
      isPinned: false,
      files: [],
      jobs: [],
      lastActive: Date.now(),
    };
    const updated = [newCust, ...customers];
    setCustomers(updated);
    saveRecord('KMaster_C', updated);
    setCustomerModalOpen(false);
    showToast('✔ Customer Folder Created');
  };

  const handleUpdateCustomer = (updatedCust: Customer) => {
    const updatedList = customers.map((c) => (c.id === updatedCust.id ? updatedCust : c));
    setCustomers(updatedList);
    saveRecord('KMaster_C', updatedList);
    if (activeFolderCustomer?.id === updatedCust.id) {
      setActiveFolderCustomer(updatedCust);
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

  // PDF Document Generation
  const handleGenerateDoc = async (job: JobProject, type: 'ESTIMATE' | 'BILL' | 'MASTER RECORD') => {
    const targetCustomer = activeFolderCustomer || customers.find((c) => c.jobs?.some((j) => j.id === job.id));
    if (!targetCustomer) return;

    showToast('Rendering official PDF...');
    try {
      const result = await generateEstimateOrBillPdf(
        targetCustomer,
        job,
        type,
        settings,
        constants,
        customLogo || undefined
      );
      setPdfPreviewResult(result);
      setPdfPreviewCustomer(targetCustomer);
      showToast(`✔ ${type} PDF Generated`);
    } catch (err) {
      console.error('PDF error:', err);
      showToast('Failed to generate PDF');
    }
  };

  // Save PDF to Customer Files
  const handleArchivePdfToCustomer = (fileData: { name: string; data: string; tag: 'ESTIMATE' | 'BILL' }) => {
    if (!pdfPreviewCustomer) return;
    const newFile = {
      id: Date.now(),
      name: fileData.name,
      tag: fileData.tag,
      data: fileData.data,
      isImg: false,
      type: 'application/pdf',
    };
    const updatedCust = {
      ...pdfPreviewCustomer,
      files: [...(pdfPreviewCustomer.files || []), newFile],
    };
    handleUpdateCustomer(updatedCust);
  };

  // Schedule Estimate Quick Action
  const handleScheduleEstimate = (cust: Customer) => {
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

    const updated = {
      ...cust,
      jobs: [...(cust.jobs || []), estJob],
      lastActive: Date.now(),
    };
    handleUpdateCustomer(updated);
    showToast('✔ Estimate Scheduled!');

    if (confirm('Estimate scheduled! Open Google Calendar to add this appointment to your phone?')) {
      const sFormatted = dateInput.replace(/-/g, '');
      const details = `Krueger Painting Estimate for ${cust.name}\nTime: ${timeInput}\nPhone: ${cust.phone || ''}`;
      window.open(
        `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
          `Estimate: ${cust.name} (${timeInput})`
        )}&dates=${sFormatted}/${sFormatted}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(
          cust.address || ''
        )}`,
        '_blank'
      );
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

  // Calendar .ICS Export
  const handleExportAllJobsIcs = () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Krueger Painting OS//EN',
      'CALSCALE:GREGORIAN',
    ];

    let count = 0;
    customers.forEach((c) => {
      (c.jobs || []).forEach((j) => {
        if (j.schedDate) {
          const start = j.schedDate.replace(/-/g, '');
          const end = (j.schedEndDate || j.schedDate).replace(/-/g, '');
          icsContent.push('BEGIN:VEVENT');
          icsContent.push(`SUMMARY:Krueger Painting - ${c.name} (${j.status})`);
          icsContent.push(`DESCRIPTION:Scope: ${j.scope ? j.scope.replace(/\n/g, ' ') : 'Painting Project'}\\nPhone: ${c.phone || 'N/A'}`);
          icsContent.push(`LOCATION:${c.address || ''}`);
          icsContent.push(`DTSTART;VALUE=DATE:${start}`);
          icsContent.push(`DTEND;VALUE=DATE:${end}`);
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

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Krueger_Schedule_Sync.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✔ Calendar Sync Exported');
  };

  // Backup & Restore
  const handleBackup = () => {
    const dataObj = {
      customers,
      notes,
      expenses,
      mileage,
      shoppingList,
      priceBook,
      webPhotos,
      settings,
      constants,
      date: new Date().toISOString(),
    };
    const jsonStr = generateDailyBackupJson(dataObj);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Krueger_OS_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    localStorage.setItem('KMaster_LastBackupTS', Date.now().toString());
    setIsBackupDue(false);
    showToast('✔ Full Backup Downloaded');
  };

  const handleRestore = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed.customers || parsed.c) {
          const restoredCusts = parsed.customers || parsed.c;
          setCustomers(restoredCusts);
          saveRecord('KMaster_C', restoredCusts);
        }
        if (parsed.notes) {
          setNotes(parsed.notes);
          saveRecord('KMaster_Notes', parsed.notes);
        }
        if (parsed.expenses || parsed.exp) {
          const exp = parsed.expenses || parsed.exp;
          setExpenses(exp);
          saveRecord('KMaster_Exp', exp);
        }
        if (parsed.mileage || parsed.mil) {
          const mil = parsed.mileage || parsed.mil;
          setMileage(mil);
          saveRecord('KMaster_Mil', mil);
        }
        if (parsed.shopping || parsed.shoppingList) {
          const shop = parsed.shopping || parsed.shoppingList;
          setShoppingList(shop);
          saveRecord('KMaster_Shopping', shop);
        }
        if (parsed.priceBook) {
          setPriceBook(parsed.priceBook);
          saveRecord('KMaster_PriceBook', parsed.priceBook);
        }
        if (parsed.webPhotos) {
          setWebPhotos(parsed.webPhotos);
          saveRecord('KMaster_WebPhotos', parsed.webPhotos);
        }
        if (parsed.settings) {
          setSettings(parsed.settings);
          saveRecord('KMaster_Settings', parsed.settings);
        }
        if (parsed.constants) {
          setConstants(parsed.constants);
          saveRecord('KMaster_Constants', parsed.constants);
        }

        localStorage.setItem('KMaster_LastBackupTS', Date.now().toString());
        setIsBackupDue(false);
        showToast('✔ Restored Successfully');
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

  // Universal AI Assistant Actions Executor (Flip AI Brain)
  const handleExecuteAiActions = (actions: AiAction[]) => {
    if (!Array.isArray(actions) || actions.length === 0) return;

    actions.forEach((act) => {
      if (!act || !act.type) return;

      if (act.type === 'create_customer_estimate') {
        const custName = (act.customerName || 'New Client Walkthrough').trim();
        const existingCust = customers.find(
          (c) => c.name.toLowerCase() === custName.toLowerCase()
        );
        const newCustId = existingCust ? existingCust.id : Date.now();

        const roomsList: RoomArea[] = Array.isArray(act.rooms) && act.rooms.length > 0
          ? act.rooms.map((r: any) => ({
              n: r.n || 'Main Area',
              r: Number(r.r) || 350,
              og: String(r.og || '2'),
              prod: r.prod || 'Emerald',
              sheen: r.sheen || 'Satin',
              color: r.color || '',
              sp: true,
            }))
          : [
              {
                n: act.roomName || 'Living Room / Main Area',
                r: 350,
                og: '2',
                prod: 'Emerald',
                sheen: 'Satin',
                color: '',
                sp: true,
              },
            ];

        const repairsList: RepairItem[] = Array.isArray(act.repairs)
          ? act.repairs.map((rep: any) => ({
              d: rep.d || 'Drywall patch & prep',
              h: Number(rep.h) || 1,
            }))
          : [];

        const newJob: JobProject = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          title: act.jobTitle || 'Interior Painting Estimate',
          date: new Date().toLocaleDateString(),
          status: 'PENDING',
          showLaborTotal: true,
          showOverallTotal: false,
          matsIncluded: false,
          paintRate: '1.00',
          repairRate: constants.repairRate || 75,
          disc: 0,
          discType: 'PCT',
          discLabel: '',
          matVal: 0,
          sunVal: 0,
          depo: 0,
          payments: [],
          prepScope: act.prepScope || 'Mask floors & trim, caulk gaps, patch holes, spot-prime bare drywall.',
          scope: act.scope || 'Apply 2 coats of premium latex paint with professional brush and roll technique.',
          rooms: roomsList,
          repairs: repairsList,
          rtMiles: 0,
          workDays: 1,
          schedDate: '',
          schedEndDate: '',
          clientSig: '',
        };

        if (existingCust) {
          const updatedCust: Customer = {
            ...existingCust,
            jobs: [newJob, ...(existingCust.jobs || [])],
            lastActive: Date.now(),
          };
          const updatedList = customers.map((c) => (c.id === updatedCust.id ? updatedCust : c));
          setCustomers(updatedList);
          saveRecord('KMaster_C', updatedList);
          setJobModalCustomer(updatedCust);
          setActiveEditingJob(newJob);
        } else {
          const newCust: Customer = {
            id: newCustId,
            name: custName,
            address: act.address || '',
            phone: act.phone || '',
            email: act.email || '',
            jobs: [newJob],
            files: [],
            notes: act.notes || 'Created via Flip AI voice assistant',
            statusOverride: 'AUTO',
            isPinned: false,
            lastActive: Date.now(),
          };
          const updatedList = [newCust, ...customers];
          setCustomers(updatedList);
          saveRecord('KMaster_C', updatedList);
          setJobModalCustomer(newCust);
          setActiveEditingJob(newJob);
        }
        showToast(`✔ Created estimate for ${custName}!`);
      } else if (act.type === 'add_note') {
        const newNote: FieldNote = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          title: act.title || 'Note from Flip AI',
          body: act.body || '',
          category: act.category || 'General Reminder',
          date: new Date().toLocaleDateString(),
        };
        setNotes((prev) => {
          const updated = [newNote, ...prev];
          saveRecord('KMaster_Notes', updated);
          return updated;
        });
        showToast(`📝 Saved Note: "${newNote.title}"`);
      } else if (act.type === 'add_shopping_items' && Array.isArray(act.items)) {
        const newItems: ShoppingItem[] = act.items.map((item: any) => ({
          id: Date.now() + Math.floor(Math.random() * 10000),
          name: item.name ? (item.store ? `${item.name} (${item.store})` : item.name) : 'Painting Supply',
          qty: String(item.qty || '1'),
          checked: false,
        }));
        setShoppingList((prev) => {
          const updated = [...prev, ...newItems];
          saveRecord('KMaster_Shopping', updated);
          return updated;
        });
        showToast(`🛒 Added ${newItems.length} item${newItems.length > 1 ? 's' : ''} to Shopping List`);
      } else if (act.type === 'log_expense') {
        const newExp: ExpenseEntry = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          date: new Date().toISOString().split('T')[0],
          vendor: act.vendor || 'Supplier',
          category: act.category || 'Materials',
          amount: Number(act.amount) || 0,
        };
        setExpenses((prev) => {
          const updated = [newExp, ...prev];
          saveRecord('KMaster_Exp', updated);
          return updated;
        });
        showToast(`💵 Logged $${newExp.amount.toFixed(2)} at ${newExp.vendor}`);
      } else if (act.type === 'log_mileage') {
        const newMil: MileageEntry = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          date: new Date().toISOString().split('T')[0],
          purpose: act.purpose || 'Job site estimate',
          miles: Number(act.miles) || 0,
          vehicle: 'Work Van',
        };
        setMileage((prev) => {
          const updated = [newMil, ...prev];
          saveRecord('KMaster_Mil', updated);
          return updated;
        });
        showToast(`🚗 Logged ${newMil.miles} miles for ${newMil.purpose}`);
      } else if (act.type === 'navigate') {
        const target = (act.target || '').toLowerCase();
        if (['dash', 'sched', 'weather', 'notes', 'tools'].includes(target)) {
          setActiveTab(target as TabType);
        } else if (target === 'calculator' || target === 'calc') {
          setCalcOpen(true);
        } else if (target === 'tax_report' || target === 'tax') {
          setTaxReportOpen(true);
        } else if (target === 'price_book' || target === 'pricebook') {
          setPriceBookOpen(true);
        } else if (target === 'mileage') {
          setMileageOpen(true);
        } else if (target === 'expenses' || target === 'expense') {
          setExpenseOpen(true);
        } else if (target === 'shopping' || target === 'shopping_list') {
          setShoppingListOpen(true);
        } else if (target === 'color_db' || target === 'paint_db') {
          setColorDbOpen(true);
        } else if (target === 'settings') {
          setSettingsOpen(true);
        } else if (target === 'cloud_sync') {
          setCloudSyncOpen(true);
        }
      }
    });
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
        onOpenAiAssistant={() => setAiAssistantOpen(true)}
        onOpenCloudSync={() => setCloudSyncOpen(true)}
        onOpenApkInstaller={() => setApkInstallerOpen(true)}
      />

      {/* Main Tab Content */}
      <main className="p-4 max-w-4xl mx-auto">
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

        {activeTab === 'sched' && (
          <CalendarView
            customers={customers}
            onOpenFolder={(cId) => {
              const c = customers.find((x) => x.id === cId);
              if (c) setActiveFolderCustomer(c);
            }}
            onOpenDayPopup={(dateStr, dayJobs) => {
              setDayPopupDate(dateStr);
              setDayPopupJobs(dayJobs);
            }}
            onExportAllJobsIcs={handleExportAllJobsIcs}
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
            onOpenTaxReport={() => setTaxReportOpen(true)}
            onOpenCalc={() => setCalcOpen(true)}
            onOpenPriceBook={() => setPriceBookOpen(true)}
            onOpenColorDb={() => setColorDbOpen(true)}
            onOpenMileage={() => setMileageOpen(true)}
            onOpenExpenses={() => setExpenseOpen(true)}
            onOpenShoppingList={() => setShoppingListOpen(true)}
            onOpenWebPhotos={() => setWebPhotosOpen(true)}
            onOpenRegionalMap={() => setRegionalMapOpen(true)}
            onSyncCalendar={handleExportAllJobsIcs}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenCloudSync={() => setCloudSyncOpen(true)}
            onOpenApkInstaller={() => setApkInstallerOpen(true)}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* MODALS */}

      {/* True PDF Preview Modal */}
      {pdfPreviewResult && (
        <PdfPreviewModal
          pdfResult={pdfPreviewResult}
          customer={pdfPreviewCustomer}
          onClose={() => {
            setPdfPreviewResult(null);
            setPdfPreviewCustomer(null);
          }}
          onSaveToCustomerFiles={handleArchivePdfToCustomer}
          onToast={showToast}
        />
      )}

      {/* Customer Modal */}
      {customerModalOpen && (
        <CustomerModal
          onClose={() => setCustomerModalOpen(false)}
          onSaveCustomer={handleSaveCustomer}
        />
      )}

      {/* Customer Folder View Modal */}
      {activeFolderCustomer && (
        <FolderViewModal
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
          onGenerateCollage={() => handleGenerateBeforeAfterCollage(activeFolderCustomer)}
          onScheduleEstimate={() => handleScheduleEstimate(activeFolderCustomer)}
          onToast={showToast}
        />
      )}

      {/* Job / Estimate Editor Modal */}
      {jobModalCustomer && (
        <JobModal
          customer={jobModalCustomer}
          job={activeEditingJob}
          constants={constants}
          onClose={() => {
            setJobModalCustomer(null);
            setActiveEditingJob(null);
          }}
          onSaveJob={handleSaveJob}
          onToast={showToast}
        />
      )}

      {/* Note Editor Modal */}
      {noteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-3">
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

      {/* Web Photos Modal */}
      {webPhotosOpen && (
        <WebPhotoModal
          photos={webPhotos}
          onUploadPhoto={(file) => {
            const reader = new FileReader();
            reader.onload = () => {
              const newPhoto = {
                id: Date.now(),
                name: file.name,
                data: reader.result as string,
              };
              const updated = [newPhoto, ...webPhotos];
              setWebPhotos(updated);
              saveRecord('KMaster_WebPhotos', updated);
              showToast('✔ Web Photo Added');
            };
            reader.readAsDataURL(file);
          }}
          onDeletePhoto={(id) => {
            const updated = webPhotos.filter((p) => p.id !== id);
            setWebPhotos(updated);
            saveRecord('KMaster_WebPhotos', updated);
            showToast('Photo Deleted');
          }}
          onClose={() => setWebPhotosOpen(false)}
          onToast={showToast}
        />
      )}

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
              // Normalize image via Canvas to standard high-res PNG (prevents PDF jsPDF encoding errors and storage quota issues)
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxDim = 800; // Crisp high-DPI resolution for vector PDF print
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                  if (w > h) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                  } else {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                  }
                }
                canvas.width = w;
                canvas.height = h;
                ctx?.drawImage(img, 0, 0, w, h);
                const pngDataUrl = canvas.toDataURL('image/png');

                setCustomLogo(pngDataUrl);
                saveRecord('KMaster_Logo', pngDataUrl);
                showToast('✔ Custom Logo Saved & Applied to PDFs');
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
        />
      )}

      {/* Universal Flip Gemini AI Assistant Modal */}
      {aiAssistantOpen && (
        <AiAssistantModal
          isOpen={aiAssistantOpen}
          onClose={() => setAiAssistantOpen(false)}
          customers={customers}
          notes={notes}
          expenses={expenses}
          mileage={mileage}
          shoppingList={shoppingList}
          constants={constants}
          currentTab={activeTab}
          weatherLocation={currentLocation?.name || 'West Bend, WI'}
          onExecuteActions={handleExecuteAiActions}
          onToast={showToast}
        />
      )}

      {/* Day Agenda Popup Modal */}
      {dayPopupDate && (
        <DayPopupModal
          dateStr={dayPopupDate}
          jobs={dayPopupJobs}
          onOpenFolder={(cId) => {
            setDayPopupDate(null);
            const c = customers.find((x) => x.id === cId);
            if (c) setActiveFolderCustomer(c);
          }}
          onClose={() => setDayPopupDate(null)}
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

      {/* Cloud Sync & Cross-Device Modal */}
      <CloudSyncModal
        isOpen={cloudSyncOpen}
        onClose={() => setCloudSyncOpen(false)}
        workspaceData={{
          customers,
          notes,
          expenses,
          mileage,
          shoppingList,
          priceBook,
          settings,
          constants,
        }}
        onApplyRemoteWorkspace={handleApplyRemoteWorkspace}
        onToast={showToast}
      />

      {/* Install as APK / PWA Mobile Modal */}
      <ApkInstallerModal
        isOpen={apkInstallerOpen}
        onClose={() => setApkInstallerOpen(false)}
        onToast={showToast}
      />
    </div>
  );
}
