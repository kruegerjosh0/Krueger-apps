import React, { useState, useEffect, useRef } from 'react';
import { Customer, JobProject, RoomArea, RepairItem, PaymentEntry, SystemConstants } from '../../types';
import {
  PAINT_PRODUCT_OPTIONS,
  PAINT_SHEEN_OPTIONS,
  PREP_CHECKLIST_CATEGORIES,
  SURFACE_REPAIR_PRESETS,
  normalizePipelineStage,
  isPrepLineChecked,
  togglePrepScopeLine,
  hasAnyCheckedPrepLine,
  clearChecklistPrepLines,
  cleanOptionalSpec,
  computeRoomSqft,
  computeRoomGallons,
  parseAddressParts,
  formatAddressParts,
} from '../../utils/projectHelpers';
import {
  HOME_BASE,
  haversineMiles,
  resolveApproxWisconsinCoords,
} from '../../utils/mapHelpers';

interface JobModalProps {
  customer: Customer;
  customers?: Customer[];
  job?: JobProject | null;
  constants: SystemConstants;
  onClose: () => void;
  onSelectCustomer?: (customer: Customer) => void;
  onUpdateCustomer?: (updatedCustomer: Customer) => void;
  onSaveJob: (savedJob: JobProject) => void;
  onShareBusinessCard?: () => void;
  onToast: (msg: string) => void;
}

const createBlankRoom = (): RoomArea => ({
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
});

const sanitizeRoom = (r: RoomArea): RoomArea => ({
  ...r,
  prod: cleanOptionalSpec(r.prod),
  sheen: cleanOptionalSpec(r.sheen),
  color: cleanOptionalSpec(r.color),
  prep: Array.isArray(r.prep) ? [...r.prep] : [],
});

const estimateRoundTripMilesFromHomeBase = (
  address: string,
  lat?: number,
  lng?: number
): number => {
  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    const oneWay = haversineMiles(HOME_BASE.lat, HOME_BASE.lng, lat, lng) * 1.24;
    return Math.max(0, Math.round(oneWay * 2 * 10) / 10);
  }
  const trimmed = (address || '').trim();
  if (!trimmed) return 0;
  const approx = resolveApproxWisconsinCoords(trimmed, trimmed);
  if (!approx) return 0;
  const oneWay = haversineMiles(HOME_BASE.lat, HOME_BASE.lng, approx.lat, approx.lng) * 1.24;
  return Math.max(0, Math.round(oneWay * 2 * 10) / 10);
};

export const JobModal: React.FC<JobModalProps> = ({
  customer,
  customers = [],
  job,
  constants,
  onClose,
  onSelectCustomer,
  onUpdateCustomer,
  onSaveJob,
  onShareBusinessCard,
  onToast,
}) => {
  // Auto-populated customer / lead contact state
  const initialAddr = parseAddressParts(customer.address);
  const [clientName, setClientName] = useState(customer.name || '');
  const [clientPhone, setClientPhone] = useState(customer.phone || '');
  const [clientEmail, setClientEmail] = useState(customer.email || '');
  const [clientStreet, setClientStreet] = useState(initialAddr.street);
  const [clientCity, setClientCity] = useState(initialAddr.city);
  const [clientZip, setClientZip] = useState(initialAddr.zip);

  const [title, setTitle] = useState(job?.title || '');
  const [status, setStatus] = useState<JobProject['status']>(
    job?.status ? normalizePipelineStage(job.status) : 'PENDING'
  );
  const [schedDate, setSchedDate] = useState(job?.schedDate || '');
  const [schedEndDate, setSchedEndDate] = useState(job?.schedEndDate || '');

  const [showLaborTotal, setShowLaborTotal] = useState(job?.showLaborTotal ?? true);
  const [showOverallTotal, setShowOverallTotal] = useState(job?.showOverallTotal ?? false);
  const [matsIncluded, setMatsIncluded] = useState(job?.matsIncluded ?? false);

  const [internalNotes, setInternalNotes] = useState(job?.internalNotes || '');
  const [prepScope, setPrepScope] = useState(job?.prepScope || '');
  const [scope, setScope] = useState(job?.scope || '');

  const [rooms, setRooms] = useState<RoomArea[]>(
    job?.rooms && job.rooms.length > 0
      ? job.rooms.map(sanitizeRoom)
      : [createBlankRoom()]
  );
  const [customProductMode, setCustomProductMode] = useState<Record<number, boolean>>({});

  const [repairs, setRepairs] = useState<RepairItem[]>(
    job?.repairs ? job.repairs.map((rep) => ({ ...rep })) : []
  );

  const [paintRate, setPaintRate] = useState(job?.paintRate || '1.00');
  const [repairRate, setRepairRate] = useState<number>(job?.repairRate || constants.repairRate || 75);

  const [disc, setDisc] = useState<number>(job?.disc || 0);
  const [discType, setDiscType] = useState<'PCT' | 'FLAT'>(job?.discType || 'PCT');
  const [discLabel, setDiscLabel] = useState(job?.discLabel || '');

  const [matVal, setMatVal] = useState<number>(job?.matVal || 0);
  const [sunVal, setSunVal] = useState<number>(job?.sunVal || 0);
  const [paintPricePerGal, setPaintPricePerGal] = useState<number>(constants.paintCostPerGal || 65);
  const [autoCalcCoatings, setAutoCalcCoatings] = useState<boolean>(true);

  const initialAutoMiles =
    job?.rtMiles && job.rtMiles > 0
      ? job.rtMiles
      : estimateRoundTripMilesFromHomeBase(customer.address, customer.lat, customer.lng);
  const [rtMiles, setRtMiles] = useState<number>(initialAutoMiles);
  const [manualMiles, setManualMiles] = useState<boolean>(Boolean(job?.rtMiles && job.rtMiles > 0));
  const [workDays, setWorkDays] = useState<number>(job?.workDays || 1);

  const [payments, setPayments] = useState<PaymentEntry[]>(
    job?.payments ? job.payments.map((p) => ({ ...p })) : []
  );
  const [clientSig, setClientSig] = useState<string>(job?.clientSig || '');
  const [expandedRoomPrep, setExpandedRoomPrep] = useState<Record<number, boolean>>({});

  // Weather check result for job
  const [weatherAlert, setWeatherAlert] = useState<string | null>(null);
  const [checkingWeather, setCheckingWeather] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Populate client contact fields and reset project state when switching customer or opening a different project
  useEffect(() => {
    const parsedAddr = parseAddressParts(customer.address);
    setClientName(customer.name || '');
    setClientPhone(customer.phone || '');
    setClientEmail(customer.email || '');
    setClientStreet(parsedAddr.street);
    setClientCity(parsedAddr.city);
    setClientZip(parsedAddr.zip);

    setTitle(job?.title || '');
    setStatus(job?.status ? normalizePipelineStage(job.status) : 'PENDING');
    setSchedDate(job?.schedDate || '');
    setSchedEndDate(job?.schedEndDate || '');
    setShowLaborTotal(job?.showLaborTotal ?? true);
    setShowOverallTotal(job?.showOverallTotal ?? false);
    setMatsIncluded(job?.matsIncluded ?? false);
    setInternalNotes(job?.internalNotes || '');
    setPrepScope(job?.prepScope || '');
    setScope(job?.scope || '');
    setRooms(
      job?.rooms && job.rooms.length > 0
        ? job.rooms.map(sanitizeRoom)
        : [createBlankRoom()]
    );
    setCustomProductMode({});
    setRepairs(job?.repairs ? job.repairs.map((rep) => ({ ...rep })) : []);
    setPaintRate(job?.paintRate || '1.00');
    setRepairRate(job?.repairRate || constants.repairRate || 75);
    setDisc(job?.disc || 0);
    setDiscType(job?.discType || 'PCT');
    setDiscLabel(job?.discLabel || '');
    setMatVal(job?.matVal || 0);
    setSunVal(job?.sunVal || 0);
    setPaintPricePerGal(constants.paintCostPerGal || 65);
    setAutoCalcCoatings(true);
    const autoRt =
      job?.rtMiles && job.rtMiles > 0
        ? job.rtMiles
        : estimateRoundTripMilesFromHomeBase(customer.address, customer.lat, customer.lng);
    setRtMiles(autoRt);
    setManualMiles(Boolean(job?.rtMiles && job.rtMiles > 0));
    setWorkDays(job?.workDays || 1);
    setPayments(job?.payments ? job.payments.map((p) => ({ ...p })) : []);
    setClientSig(job?.clientSig || '');
    setExpandedRoomPrep({});
    setWeatherAlert(null);
    initSignatureCanvas();
  }, [customer.id, job?.id]);

  // Auto-update round-trip mileage from 2119 Barton Ave whenever address changes (unless manually overridden)
  useEffect(() => {
    if (manualMiles) return;
    const combinedAddr = formatAddressParts({
      street: clientStreet,
      city: clientCity,
      state: clientStreet || clientCity || clientZip ? 'WI' : '',
      zip: clientZip,
    });
    const useCoords = combinedAddr === (customer.address || '').trim();
    const nextMiles = estimateRoundTripMilesFromHomeBase(
      combinedAddr,
      useCoords ? customer.lat : undefined,
      useCoords ? customer.lng : undefined
    );
    setRtMiles(nextMiles);
  }, [clientStreet, clientCity, clientZip, manualMiles, customer.address, customer.lat, customer.lng]);

  const handleSelectExistingCustomer = (selectedIdStr: string) => {
    const selectedId = Number(selectedIdStr);
    const picked = customers.find((c) => c.id === selectedId);
    if (!picked) return;

    const parsed = parseAddressParts(picked.address);
    setClientName(picked.name || '');
    setClientPhone(picked.phone || '');
    setClientEmail(picked.email || '');
    setClientStreet(parsed.street);
    setClientCity(parsed.city);
    setClientZip(parsed.zip);
    setManualMiles(false);
    setRtMiles(estimateRoundTripMilesFromHomeBase(picked.address, picked.lat, picked.lng));
    if (onSelectCustomer && picked.id !== customer.id) {
      onSelectCustomer(picked);
    }
    onToast(`✔ Autofilled contact & mileage for ${picked.name}`);
  };

  const initSignatureCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
  };

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleStartDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handleDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasCoords(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const handleStopDraw = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setClientSig('');
    onToast('Signature cleared');
  };

  const lockInPersonSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setClientSig(dataUrl);
    if (status === 'PENDING') setStatus('SCHEDULED');
    onToast('✔ In-Person Signature Locked & Job Scheduled');
  };

  const lockRemoteApproval = () => {
    const timeStamp = new Date().toLocaleString();
    const canvas = document.createElement('canvas');
    canvas.width = 460;
    canvas.height = 110;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 460, 110);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 456, 106);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('ELECTRONICALLY AUTHORIZED VIA EMAIL/SMS BY:', 12, 26);

    ctx.fillStyle = '#bf5af2';
    ctx.font = 'bold 20px monospace';
    ctx.fillText((clientName || customer.name).toUpperCase(), 12, 60);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`TIMESTAMP: ${timeStamp}  •  VERIFIED KRUEGER RECORD`, 12, 86);

    const stampData = canvas.toDataURL('image/png');
    setClientSig(stampData);
    if (status === 'PENDING') setStatus('SCHEDULED');
    onToast('✔ Remote Approval Stamp Generated');
  };

  // Helper to get paint gallons for an individual room (supports LxWxH, LxW, and name dimensions)
  const getRoomPaintGals = (r: RoomArea) => computeRoomGallons(r, constants.spreadRate || 350);

  // Calculations
  let laborSubtotal = 0;
  let totalSqft = 0;

  rooms.forEach((r) => {
    const rPrice = Math.round(Number(r.r) || 0);
    laborSubtotal += rPrice;
    totalSqft += computeRoomSqft(r);
  });

  const totalPaintGals = rooms.reduce((sum, r) => sum + getRoomPaintGals(r), 0);
  const autoCoatingsCost = Math.round(totalPaintGals * paintPricePerGal);

  let repairHoursTotal = 0;
  repairs.forEach((rep) => {
    repairHoursTotal += parseFloat(String(rep.h)) || 0;
  });
  const repairLaborSubtotal = Math.round(repairHoursTotal * repairRate);

  const discountAmount =
    discType === 'PCT' ? Math.round(laborSubtotal * (disc / 100)) : Math.round(disc);

  const effectiveMatCost = matsIncluded
    ? 0
    : autoCalcCoatings
    ? autoCoatingsCost
    : Math.round(matVal);
  const effectiveSunCost = matsIncluded ? 0 : Math.round(sunVal);

  const grossTotal = Math.round(
    laborSubtotal - discountAmount + repairLaborSubtotal + effectiveMatCost + effectiveSunCost
  );
  const fiftyPercentDeposit = Math.round(grossTotal * 0.5);
  const totalTripMiles = Math.round(rtMiles * Math.max(1, workDays) * 10) / 10;
  const estMileageDeduction = (totalTripMiles * (constants.irsRate || 0.67)).toFixed(2);

  let totalPaid = 0;
  payments.forEach((p) => {
    totalPaid += Math.round(Number(p.amt) || 0);
  });
  const balanceDue = Math.max(0, grossTotal - totalPaid);

  const handleAddRoom = () => {
    setRooms([...rooms, createBlankRoom()]);
  };

  const handlePaintRateChange = (nextRateStr: string) => {
    setPaintRate(nextRateStr);
    const rate = parseFloat(nextRateStr);
    if (!Number.isFinite(rate) || rate <= 0) return;

    // Auto-recalculate labor on all non-manually-overridden rooms that have dimensions
    setRooms((prev) =>
      prev.map((room) => {
        if (room.manualPrice) return room;
        const sqft = computeRoomSqft(room);
        if (sqft > 0) {
          return { ...room, r: Math.round(sqft * rate) };
        }
        return room;
      })
    );
  };

  const updateRoom = (index: number, field: keyof RoomArea, val: any) => {
    const updated = [...rooms];
    const currentRoom = { ...updated[index], [field]: val };
    const rate = parseFloat(paintRate) || 1.0;

    if (field === 'r') {
      const numericVal = typeof val === 'number' ? val : parseFloat(val) || 0;
      if (numericVal > 0) {
        currentRoom.r = numericVal;
        currentRoom.manualPrice = true;
      } else {
        // Clearing manual labor price restores automatic dimension × rate calculation
        currentRoom.manualPrice = false;
        const sqft = computeRoomSqft(currentRoom);
        currentRoom.r = sqft > 0 ? Math.round(sqft * rate) : 0;
      }
    } else if (field === 'len' || field === 'wid' || field === 'hgt') {
      const parsed = val === '' || val === undefined ? undefined : parseFloat(String(val));
      currentRoom[field] = parsed && parsed > 0 ? parsed : undefined;
      if (!currentRoom.manualPrice) {
        const sqft = computeRoomSqft(currentRoom);
        currentRoom.r = sqft > 0 ? Math.round(sqft * rate) : 0;
      }
    } else if (field === 'n') {
      // Sync dimensions typed inline (e.g. "14x16" or "14x16x9") and recalculate unless manually overridden
      const str = String(val || '').toLowerCase();
      const dim3 = str.match(/(\d+(?:\.\d+)?)\s*[x*]\s*(\d+(?:\.\d+)?)\s*[x*]\s*(\d+(?:\.\d+)?)/);
      const dim2 = str.match(/(\d+(?:\.\d+)?)\s*[x*]\s*(\d+(?:\.\d+)?)/);
      if (dim3) {
        currentRoom.len = parseFloat(dim3[1]);
        currentRoom.wid = parseFloat(dim3[2]);
        currentRoom.hgt = parseFloat(dim3[3]);
      } else if (dim2) {
        currentRoom.len = parseFloat(dim2[1]);
        currentRoom.wid = parseFloat(dim2[2]);
      }
      if (!currentRoom.manualPrice) {
        const sqft = computeRoomSqft(currentRoom);
        if (sqft > 0) {
          currentRoom.r = Math.round(sqft * rate);
        }
      }
    }

    updated[index] = currentRoom;
    setRooms(updated);
  };

  const toggleRoomPrepItem = (roomIndex: number, item: string) => {
    const updated = [...rooms];
    const currentPrep = Array.isArray(updated[roomIndex].prep) ? updated[roomIndex].prep! : [];
    const exists = currentPrep.includes(item);
    updated[roomIndex] = {
      ...updated[roomIndex],
      prep: exists ? currentPrep.filter((p) => p !== item) : [...currentPrep, item],
    };
    setRooms(updated);
  };

  const clearRoomPrepItems = (roomIndex: number) => {
    const updated = [...rooms];
    updated[roomIndex] = { ...updated[roomIndex], prep: [] };
    setRooms(updated);
  };

  const removeRoom = (index: number) => {
    setRooms(rooms.filter((_, i) => i !== index));
  };

  const handleAddRepair = () => {
    if (!repairRate || repairRate <= 0) {
      setRepairRate(constants.repairRate || 75);
    }
    setRepairs([...repairs, { d: '', h: 1 }]);
  };

  const handleAddPresetRepair = (preset: { desc: string; defaultHours: number }) => {
    if (!repairRate || repairRate <= 0) {
      setRepairRate(constants.repairRate || 75);
    }
    setRepairs([...repairs, { d: preset.desc, h: preset.defaultHours }]);
    onToast(`✔ Added ${preset.desc} (${preset.defaultHours} hrs @ $${repairRate || constants.repairRate || 75}/hr)`);
  };

  const updateRepair = (index: number, field: keyof RepairItem, val: any) => {
    const updated = [...repairs];
    updated[index] = { ...updated[index], [field]: val };
    setRepairs(updated);
  };

  const removeRepair = (index: number) => {
    setRepairs(repairs.filter((_, i) => i !== index));
  };

  const handleAddPayment = () => {
    setPayments([
      ...payments,
      { date: new Date().toISOString().split('T')[0], amt: 0 },
    ]);
  };

  const logFiftyPercentDeposit = () => {
    if (grossTotal <= 0) {
      alert('Calculate project totals before logging a deposit.');
      return;
    }
    const half = Math.round(grossTotal * 0.5);
    setPayments([
      ...payments,
      { date: new Date().toISOString().split('T')[0], amt: half },
    ]);
    onToast(`✔ 50% Deposit ($${half}) Logged`);
  };

  const markJobPaid = () => {
    if (balanceDue > 0) {
      setPayments([
        ...payments,
        { date: new Date().toISOString().split('T')[0], amt: balanceDue },
      ]);
    }
    setStatus('COMPLETED');
    onToast('✔ Job Marked as Paid in Full');
  };

  const checkWeatherForJob = async () => {
    if (!schedDate) {
      alert('Please specify a Start Date first.');
      return;
    }
    setCheckingWeather(true);
    setWeatherAlert(null);

    const lat = customer.lat || 43.4253; // Default West Bend area
    const lng = customer.lng || -88.1834;

    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=auto`
      );
      const data = await res.json();
      if (data?.daily?.time) {
        const idx = data.daily.time.indexOf(schedDate);
        if (idx > -1) {
          const rainProb = data.daily.precipitation_probability_max[idx] || 0;
          const maxTemp = Math.round((data.daily.temperature_2m_max[idx] * 9) / 5 + 32);
          const minTemp = Math.round((data.daily.temperature_2m_min[idx] * 9) / 5 + 32);
          const isRain = rainProb >= 30;
          setWeatherAlert(
            `${isRain ? '🌧️ Rain Risk Detected' : '☀️ Clear Spray Forecast'} (${schedDate}): High ${maxTemp}°F / Low ${minTemp}°F with ${rainProb}% rain probability.`
          );
        } else {
          setWeatherAlert(`Date ${schedDate} is beyond the 14-day live forecast window.`);
        }
      }
    } catch {
      setWeatherAlert('Could not load forecast data. Please check internet connection.');
    } finally {
      setCheckingWeather(false);
    }
  };

  const exportToGoogleCalendar = () => {
    if (!schedDate) {
      alert('Set a scheduled start date first.');
      return;
    }
    const sFormatted = schedDate.replace(/-/g, '');
    const endDate = schedEndDate || schedDate;
    const eDateObj = new Date(endDate + 'T00:00:00');
    eDateObj.setDate(eDateObj.getDate() + 1);
    const eFormatted = eDateObj.toISOString().split('T')[0].replace(/-/g, '');

    const combinedAddress = formatAddressParts({
      street: clientStreet,
      city: clientCity,
      state: clientStreet || clientCity || clientZip ? 'WI' : '',
      zip: clientZip,
    });
    const details = `Krueger Painting Project: ${title || 'Interior/Exterior'}\nCustomer: ${clientName || customer.name}\nPhone: ${clientPhone || customer.phone || 'N/A'}\nScope:\n${scope || 'Painting'}`;
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      `Krueger Painting: ${clientName || customer.name} (${status})`
    )}&dates=${sFormatted}/${eFormatted}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(
      combinedAddress || customer.address || ''
    )}`;
    window.open(url, '_blank');
  };

  const handleSave = () => {
    // Persist any updated client contact fields back to the customer record
    const combinedAddress = formatAddressParts({
      street: clientStreet,
      city: clientCity,
      state: clientStreet || clientCity || clientZip ? 'WI' : '',
      zip: clientZip,
    });
    if (
      onUpdateCustomer &&
      (clientName.trim() !== (customer.name || '') ||
        clientPhone.trim() !== (customer.phone || '') ||
        clientEmail.trim() !== (customer.email || '') ||
        combinedAddress !== (customer.address || ''))
    ) {
      onUpdateCustomer({
        ...customer,
        name: clientName.trim() || customer.name,
        phone: clientPhone.trim(),
        email: clientEmail.trim(),
        address: combinedAddress,
        lastActive: Date.now(),
      });
    }

    const savedMatVal = matsIncluded
      ? 0
      : autoCalcCoatings
      ? autoCoatingsCost
      : Math.round(matVal);

    const cleanedRooms = rooms.map((r) => ({
      ...r,
      prod: cleanOptionalSpec(r.prod),
      sheen: cleanOptionalSpec(r.sheen),
      color: cleanOptionalSpec(r.color),
    }));

    const saved: JobProject = {
      id: job?.id || Date.now(),
      title: title.trim() || 'General Scope Project',
      date: job?.date || new Date().toLocaleDateString(),
      status,
      showLaborTotal,
      showOverallTotal,
      matsIncluded,
      paintRate,
      repairRate,
      disc,
      discType,
      discLabel,
      matVal: savedMatVal,
      sunVal,
      depo: 0,
      payments,
      internalNotes,
      prepScope,
      scope,
      rooms: cleanedRooms,
      repairs,
      rtMiles,
      workDays,
      schedDate,
      schedEndDate,
      clientSig,
      googleEventId: job?.googleEventId,
      googleCalendarEventId: job?.googleCalendarEventId,
    };
    onSaveJob(saved);
    onToast('✔ Project Saved');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex flex-col p-2 sm:p-5 overflow-y-auto animate-in fade-in">
      <form
        autoComplete="on"
        onSubmit={(e) => e.preventDefault()}
        className="max-w-2xl w-full mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-5 shadow-2xl space-y-3.5 my-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#f1c40f]">
              {job ? 'Edit Project & Estimate' : 'New Project & Estimate'}
            </span>
            <h2 className="text-sm sm:text-base font-black text-[var(--text)]">
              {clientName || customer.name}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {onShareBusinessCard && (
              <button
                type="button"
                onClick={onShareBusinessCard}
                className="bg-[#111111] hover:bg-[#1c1d25] border border-[#f1c40f]/70 text-[#f1c40f] font-extrabold text-[10.5px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center gap-1"
                title="Share Joshua Krueger — Krueger Painting business card or .vcf"
              >
                <span>💼</span>
                <span>Share Business Card</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] font-bold text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
            >
              ✕ Back
            </button>
          </div>
        </div>

        {/* Client / Lead Selection & Contact Autofill */}
        <details open={!job} className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between items-center">
            <span className="flex items-center gap-1.5 truncate">
              <span>👤</span>
              <span className="truncate">
                Client &amp; Job Site Contact
                {clientCity ? ` • ${clientCity}` : ''}
              </span>
            </span>
            <span className="text-[10px] shrink-0">▼</span>
          </summary>
          <div className="p-3 space-y-2 border-t border-[var(--border)]">
            {customers.length > 0 && (
              <div>
                <label
                  htmlFor="estimate-customer-select"
                  className="text-[8.5px] uppercase font-bold text-[#f1c40f] tracking-wider block mb-0.5"
                >
                  Select Existing Customer / Lead (Autofills Contact &amp; Mileage)
                </label>
                <select
                  id="estimate-customer-select"
                  value={customer.id}
                  onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded-lg px-2.5 py-2 text-xs font-semibold outline-none cursor-pointer"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.address ? ` — ${c.address}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  Client Name
                </label>
                <input
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client full name"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  Phone
                </label>
                <input
                  name="tel"
                  type="tel"
                  autoComplete="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(262) 000-0000"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="name@email.com"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_0.65fr] gap-2">
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  Street Address
                </label>
                <input
                  name="street-address"
                  type="text"
                  autoComplete="street-address"
                  value={clientStreet}
                  onChange={(e) => {
                    setClientStreet(e.target.value);
                    setManualMiles(false);
                  }}
                  placeholder="1425 Main St"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  City / Town
                </label>
                <input
                  name="city"
                  type="text"
                  autoComplete="address-level2"
                  value={clientCity}
                  onChange={(e) => {
                    setClientCity(e.target.value);
                    setManualMiles(false);
                  }}
                  placeholder="West Bend"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  Zip Code
                </label>
                <input
                  name="postal-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={clientZip}
                  onChange={(e) => {
                    setClientZip(e.target.value);
                    setManualMiles(false);
                  }}
                  placeholder="53095"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
            </div>
          </div>
        </details>

        {/* Project Title & Status */}
        <div className="space-y-2">
          <div>
            <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
              Project Title / Description
            </label>
            <input
              type="text"
              autoComplete="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Living Room, Hallway & Kitchen Repaint"
              className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Status
              </label>
              <select
                autoComplete="off"
                value={status}
                onChange={(e) => setStatus(e.target.value as JobProject['status'])}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-2 text-xs outline-none"
              >
                <option value="ACTIVE">Active</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="PENDING">Pending</option>
                <option value="COMPLETED">Complete / Paid</option>
              </select>
            </div>

            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Start Date
              </label>
              <input
                type="date"
                autoComplete="off"
                value={schedDate}
                onChange={(e) => setSchedDate(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2 py-2 text-xs outline-none"
              />
            </div>

            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                End Date
              </label>
              <input
                type="date"
                autoComplete="off"
                value={schedEndDate}
                onChange={(e) => setSchedEndDate(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2 py-2 text-xs outline-none"
              />
            </div>
          </div>

          {/* Cal & Weather Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={exportToGoogleCalendar}
              className="py-1.5 bg-[var(--accent-secondary)] text-white text-[11px] font-bold rounded-lg shadow cursor-pointer transition-transform active:scale-95"
            >
              📅 Add to Google Calendar
            </button>
            <button
              type="button"
              onClick={checkWeatherForJob}
              disabled={checkingWeather}
              className="py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold rounded-lg shadow cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
            >
              {checkingWeather ? 'Checking...' : '🌦️ Check Job Weather'}
            </button>
          </div>

          {weatherAlert && (
            <div className="bg-[var(--surface-subtle)] border border-[var(--border)] text-xs p-2.5 rounded-lg text-[var(--accent)] font-semibold leading-relaxed">
              {weatherAlert}
            </div>
          )}
        </div>

        {/* Internal Notes Accordion */}
        <details open className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between">
            <span>🔒 Internal Notes (Not on PDF)</span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 border-t border-[var(--border)]">
            <textarea
              rows={3}
              autoComplete="off"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Private notes about the job, materials, client, or things you don't want on the formal estimate/bill..."
              className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
            />
          </div>
        </details>

        {/* Prep & Scope Accordion */}
        <details open className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between">
            <span>📝 Job Prep &amp; Scope Notes</span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 space-y-3 border-t border-[var(--border)]">
            <div className="flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text)] font-semibold">
                <input
                  type="checkbox"
                  checked={showLaborTotal}
                  onChange={(e) => setShowLaborTotal(e.target.checked)}
                />
                <span>Show Labor Total on Estimate</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--accent-secondary)] font-semibold">
                <input
                  type="checkbox"
                  checked={showOverallTotal}
                  onChange={(e) => setShowOverallTotal(e.target.checked)}
                />
                <span>Show Overall Total on Estimate PDF</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--accent-tertiary)] font-semibold">
                <input
                  type="checkbox"
                  checked={matsIncluded}
                  onChange={(e) => setMatsIncluded(e.target.checked)}
                />
                <span>Materials Included in Scope/Labor Price</span>
              </label>
            </div>

            {/* Structured Multi-Select Categorized Job Prep & Setup Checklist */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[9px] uppercase font-extrabold text-[#f1c40f] tracking-wider">
                  Quick-Tap Job Prep &amp; Setup Checklist
                </label>
                {hasAnyCheckedPrepLine(prepScope) && (
                  <button
                    type="button"
                    onClick={() => setPrepScope((prev) => clearChecklistPrepLines(prev))}
                    className="text-[9.5px] font-bold text-red-400 hover:underline cursor-pointer"
                    title="Remove quick-tap checklist lines while keeping custom notes"
                  >
                    Clear Prep
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {PREP_CHECKLIST_CATEGORIES.map((category) => (
                  <div
                    key={category.id}
                    className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 space-y-1.5"
                  >
                    <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                      <span>{category.icon}</span>
                      <span>{category.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {category.items.map((prepOption) => {
                        const checked = isPrepLineChecked(prepScope, prepOption);
                        return (
                          <button
                            key={prepOption.label}
                            type="button"
                            title={prepOption.scopeText}
                            onClick={() => setPrepScope((prev) => togglePrepScopeLine(prev, prepOption))}
                            className={`text-[10.5px] px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                              checked
                                ? 'bg-[#f1c40f] text-[#231709] border-[#f1c40f] font-black shadow-xs'
                                : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:border-[#f1c40f]/60 font-semibold'
                            }`}
                          >
                            <span>{checked ? '✓' : '+'}</span>
                            <span>{prepOption.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <textarea
                rows={5}
                autoComplete="off"
                value={prepScope}
                onChange={(e) => setPrepScope(e.target.value)}
                placeholder="Selected prep scope lines appear here — or type custom prep notes..."
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg p-2.5 text-xs leading-relaxed outline-none"
              />
            </div>

            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                General Scope Notes
              </label>
              <textarea
                rows={2}
                autoComplete="off"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="Apply 2 full coats of latex satin on walls, semi-gloss on baseboards and doors..."
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
          </div>
        </details>

        {/* Areas & Rooms Itemization */}
        <details open className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between items-center">
            <span className="flex items-center gap-2">
              <span>🛠️ Rooms, Sections &amp; Dimensions ({rooms.length})</span>
            </span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 space-y-3 border-t border-[var(--border)]">

            {rooms.map((room, idx) => {
              const selectedRoomPrep = Array.isArray(room.prep) ? room.prep : [];
              const isRoomPrepOpen = !!expandedRoomPrep[idx];
              const roomSqft = computeRoomSqft(room);
              const cleanProd = cleanOptionalSpec(room.prod);
              const cleanSheen = cleanOptionalSpec(room.sheen);
              const hasCustomLegacyProd =
                Boolean(cleanProd) &&
                !(PAINT_PRODUCT_OPTIONS as readonly string[]).includes(cleanProd);
              const isCustomProdActive = Boolean(customProductMode[idx]);
              const hasCustomLegacySheen =
                Boolean(cleanSheen) &&
                !(PAINT_SHEEN_OPTIONS as readonly string[]).includes(cleanSheen);

              return (
                <div
                  key={idx}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 space-y-2.5 relative"
                >
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[var(--accent)] uppercase">
                        Area #{idx + 1}
                      </span>
                      {roomSqft > 0 && (
                        <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-[#f1c40f] border border-[#f1c40f]/30 tabular-nums">
                          {roomSqft} sq ft
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRoom(idx)}
                      className="text-red-500 font-bold text-xs cursor-pointer"
                    >
                      ✕ Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                        Room / Area Name &amp; Dimensions
                      </label>
                      <input
                        type="text"
                        autoComplete="off"
                        value={room.n}
                        onChange={(e) => updateRoom(idx, 'n', e.target.value)}
                        placeholder="e.g. Master Bedroom 14x16"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] flex items-center justify-between mb-0.5">
                        <span>Labor Price ($)</span>
                        <span className="text-[8px] font-semibold text-[var(--accent)]">
                          {room.manualPrice ? 'Manual' : roomSqft > 0 ? `Auto @ $${paintRate}/sf` : 'Auto'}
                        </span>
                      </label>
                      <input
                        type="number"
                        autoComplete="off"
                        value={room.r || ''}
                        onChange={(e) =>
                          updateRoom(
                            idx,
                            'r',
                            e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                          )
                        }
                        placeholder="Auto"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none font-bold"
                      />
                    </div>
                  </div>

                  {/* Structured Room Dimensions (Length x Width x Height) -> Auto Sq Ft, Labor & Gallons */}
                  <div className="grid grid-cols-3 gap-1.5 bg-[var(--surface)] p-2 rounded-md border border-[var(--border)]">
                    <div>
                      <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                        Length (ft)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        autoComplete="off"
                        value={room.len ?? ''}
                        onChange={(e) => updateRoom(idx, 'len', e.target.value)}
                        placeholder="e.g. 14"
                        className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded px-2 py-1 text-[11px] outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                        Width (ft)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        autoComplete="off"
                        value={room.wid ?? ''}
                        onChange={(e) => updateRoom(idx, 'wid', e.target.value)}
                        placeholder="e.g. 16"
                        className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded px-2 py-1 text-[11px] outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                        Height (ft, opt.)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        autoComplete="off"
                        value={room.hgt ?? ''}
                        onChange={(e) => updateRoom(idx, 'hgt', e.target.value)}
                        placeholder="e.g. 9"
                        className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded px-2 py-1 text-[11px] outline-none font-bold"
                      />
                    </div>
                  </div>

                  {/* Paint Spec (Blank-by-Default Product Dropdown, Color, Blank-by-Default Sheen Dropdown) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 bg-[var(--surface)] p-2 rounded-md border border-[var(--border)]">
                    <div>
                      <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                        Product
                      </label>
                      {!isCustomProdActive ? (
                        <select
                          autoComplete="off"
                          value={cleanProd}
                          onChange={(e) => {
                            if (e.target.value === '__CUSTOM__') {
                              setCustomProductMode((prev) => ({ ...prev, [idx]: true }));
                              updateRoom(idx, 'prod', '');
                            } else {
                              updateRoom(idx, 'prod', e.target.value);
                            }
                          }}
                          className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded px-2 py-1.5 text-[11px] outline-none font-semibold cursor-pointer"
                        >
                          <option value="">Select Product...</option>
                          {PAINT_PRODUCT_OPTIONS.map((prodOpt) => (
                            <option key={prodOpt} value={prodOpt}>
                              {prodOpt}
                            </option>
                          ))}
                          {hasCustomLegacyProd && cleanProd && (
                            <option value={cleanProd}>{cleanProd}</option>
                          )}
                          <option value="__CUSTOM__">Other / Custom...</option>
                        </select>
                      ) : (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            autoComplete="off"
                            value={cleanProd}
                            onChange={(e) => updateRoom(idx, 'prod', e.target.value)}
                            placeholder="Type product..."
                            className="flex-1 min-w-0 bg-[var(--bg)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded px-2 py-1.5 text-[11px] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setCustomProductMode((prev) => ({ ...prev, [idx]: false }))
                            }
                            className="px-1.5 bg-[var(--surface-subtle)] border border-[var(--border)] rounded text-[10px] font-bold text-[var(--text-muted)] cursor-pointer"
                            title="Back to product dropdown"
                          >
                            ↩
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                        Color
                      </label>
                      <input
                        type="text"
                        autoComplete="off"
                        value={room.color || ''}
                        onChange={(e) => updateRoom(idx, 'color', e.target.value)}
                        placeholder="e.g. SW 7015"
                        className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1.5 text-[11px] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                        Sheen
                      </label>
                      <select
                        autoComplete="off"
                        value={cleanSheen}
                        onChange={(e) => updateRoom(idx, 'sheen', e.target.value)}
                        className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded px-2 py-1.5 text-[11px] outline-none font-semibold cursor-pointer"
                      >
                        <option value="">Select Sheen...</option>
                        {PAINT_SHEEN_OPTIONS.map((sheenOpt) => (
                          <option key={sheenOpt} value={sheenOpt}>
                            {sheenOpt}
                          </option>
                        ))}
                        {hasCustomLegacySheen && cleanSheen && (
                          <option value={cleanSheen}>{cleanSheen}</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Per-Room Prep & Setup Process Checklist */}
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRoomPrep((prev) => ({ ...prev, [idx]: !prev[idx] }))
                      }
                      className="w-full px-2.5 py-2 flex items-center justify-between text-left hover:bg-[var(--border)]/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#f1c40f]">
                          🧰 Room Prep &amp; Setup Checklist
                        </span>
                        {selectedRoomPrep.length > 0 && (
                          <span className="bg-[#2c2317] text-[#f1c40f] border border-[#f1c40f]/40 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                            {selectedRoomPrep.length} selected
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-[var(--text-muted)]">
                        {isRoomPrepOpen ? '▲ Hide' : '▼ Select'}
                      </span>
                    </button>

                    {/* Compact preview of selected items when collapsed */}
                    {!isRoomPrepOpen && selectedRoomPrep.length > 0 && (
                      <div className="px-2.5 pb-2 flex flex-wrap gap-1">
                        {selectedRoomPrep.map((item) => (
                          <span
                            key={item}
                            className="text-[9.5px] font-bold bg-[#2c2317] text-[#f1c40f] border border-[#f1c40f]/30 px-1.5 py-0.5 rounded"
                          >
                            ✓ {item}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expanded 2-category fast-tap multi-select checklist */}
                    {isRoomPrepOpen && (
                      <div className="p-2.5 border-t border-[var(--border)] space-y-2.5 bg-[var(--bg)]/60">
                        {PREP_CHECKLIST_CATEGORIES.map((category) => (
                          <div key={category.id} className="space-y-1.5">
                            <div className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                              <span>{category.icon}</span>
                              <span>{category.label}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {category.items.map((prepOption) => {
                                const isSelected = selectedRoomPrep.includes(prepOption.label);
                                return (
                                  <button
                                    key={prepOption.label}
                                    type="button"
                                    title={prepOption.scopeText}
                                    onClick={() => toggleRoomPrepItem(idx, prepOption.label)}
                                    className={`text-[10px] px-2 py-1 rounded-md border transition-all cursor-pointer flex items-center gap-1 active:scale-95 ${
                                      isSelected
                                        ? 'bg-[#f1c40f] text-[#231709] border-[#f1c40f] font-black'
                                        : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:border-[#f1c40f]/60 font-semibold'
                                    }`}
                                  >
                                    <span>{isSelected ? '✓' : '+'}</span>
                                    <span>{prepOption.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        {selectedRoomPrep.length > 0 && (
                          <div className="flex justify-end pt-1 border-t border-[var(--border)]/60">
                            <button
                              type="button"
                              onClick={() => clearRoomPrepItems(idx)}
                              className="text-[9.5px] font-bold text-red-400 hover:underline cursor-pointer"
                            >
                              Clear room prep ({selectedRoomPrep.length})
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Overrides */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                        Override Paint (Gals)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        autoComplete="off"
                        value={room.og || ''}
                        onChange={(e) => updateRoom(idx, 'og', e.target.value)}
                        placeholder="Auto"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-xs outline-none font-bold"
                      />
                      <div className="text-[9.5px] font-bold text-[var(--accent)] mt-0.5">
                        Paint Needed: {getRoomPaintGals(room)} Gal (2 coats)
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-3">
                      <input
                        type="checkbox"
                        checked={room.sp !== false}
                        onChange={(e) => updateRoom(idx, 'sp', e.target.checked)}
                      />
                      <span className="text-[10px] text-[var(--text-muted)]">Show paint on estimate</span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div>
              <button
                type="button"
                onClick={handleAddRoom}
                className="w-full py-2.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-dashed border-[var(--border)] rounded-xl text-xs font-bold text-[var(--accent)] cursor-pointer flex items-center justify-center gap-1.5 transition-transform active:scale-95"
              >
                <span>➕</span>
                <span>Add Room or Section</span>
              </button>
            </div>

            {/* DEDICATED LIVE PAINT TOTALER & MULTIPLIER (Directly in Rooms Section) */}
            <div className="bg-[#121318] border-2 border-[#f1c40f] rounded-xl p-3.5 space-y-2.5 mt-3 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-[#f1c40f] tracking-wide flex items-center gap-1.5">
                  <span>🎨</span>
                  <span>Paint &amp; Gallons Totaler (All Rooms)</span>
                </span>
                <span className="text-[10px] font-bold text-white bg-[#2c2317] border border-[#f1c40f]/40 px-2 py-0.5 rounded">
                  2 Full Coats
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-[#1c1d25] p-3 rounded-lg border border-[var(--border)] items-center text-center">
                <div>
                  <span className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block">
                    Total Gallons
                  </span>
                  <span className="text-base font-black text-[#f1c40f]">
                    {totalPaintGals} Gal
                  </span>
                </div>

                <div>
                  <label className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                    Price ($/gal)
                  </label>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs font-bold text-[var(--text)]">$</span>
                    <input
                      type="number"
                      value={paintPricePerGal}
                      onChange={(e) => setPaintPricePerGal(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-[#121318] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs font-bold text-[var(--text)] outline-none text-center focus:border-[#f1c40f]"
                    />
                  </div>
                </div>

                <div>
                  <span className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block">
                    Coatings Total
                  </span>
                  <span className="text-base font-black text-[#30d158]">
                    {matsIncluded ? 'INCLUDED' : `$${autoCoatingsCost}`}
                  </span>
                </div>
              </div>

              {/* Toggles & Options */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border)] text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={autoCalcCoatings}
                    onChange={(e) => setAutoCalcCoatings(e.target.checked)}
                    className="w-4 h-4 rounded text-[#f1c40f]"
                  />
                  <span>Multiply &amp; Add to Project Total</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[#30d158]">
                  <input
                    type="checkbox"
                    checked={matsIncluded}
                    onChange={(e) => setMatsIncluded(e.target.checked)}
                    className="w-4 h-4 rounded text-[#30d158]"
                  />
                  <span>Materials Included in Scope ($0)</span>
                </label>
              </div>

              <div className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                {matsIncluded ? (
                  <span className="text-[#30d158] font-semibold">
                    ✔ Materials marked as INCLUDED in labor/scope price ($0 added to bill).
                  </span>
                ) : (
                  <span>
                    <b>Formula:</b> {totalPaintGals} gallons × ${paintPricePerGal}/gal ={' '}
                    <b className="text-[#30d158]">${autoCoatingsCost}</b> totaled and added to estimate!
                  </span>
                )}
              </div>
            </div>
          </div>
        </details>

        {/* Repairs Accordion */}
        <details className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between">
            <span>🔧 Surface Repairs &amp; Carpentry ({repairs.length})</span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 space-y-2.5 border-t border-[var(--border)]">
            {/* Quick Surface / Prep Task Presets (Autofills description, default hours & repair rate) */}
            <div className="space-y-1">
              <span className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
                Quick-Add Surface / Prep Task (@ ${repairRate}/hr)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SURFACE_REPAIR_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleAddPresetRepair(preset)}
                    className="text-[10px] px-2 py-1 rounded-md border bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:border-[#f1c40f] font-semibold cursor-pointer active:scale-95 transition-all"
                  >
                    + {preset.label} ({preset.defaultHours}h)
                  </button>
                ))}
              </div>
            </div>

            {repairs.map((rep, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)]">
                <input
                  type="text"
                  autoComplete="off"
                  value={rep.d}
                  onChange={(e) => updateRepair(idx, 'd', e.target.value)}
                  placeholder="Repair description (e.g. rotted sill replacement)"
                  className="flex-1 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1.5 text-xs outline-none"
                />
                <div className="w-20">
                  <input
                    type="number"
                    step="0.5"
                    autoComplete="off"
                    value={rep.h || ''}
                    onChange={(e) => updateRepair(idx, 'h', parseFloat(e.target.value) || 0)}
                    placeholder="Hrs"
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1.5 text-xs outline-none text-center font-bold"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRepair(idx)}
                  className="text-red-500 font-bold px-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}

            <div>
              <button
                type="button"
                onClick={handleAddRepair}
                className="w-full py-2 bg-[var(--surface)] hover:bg-[var(--border)] border border-dashed border-[var(--border)] rounded-lg text-xs font-bold text-[var(--accent)] cursor-pointer flex items-center justify-center gap-1 transition-transform active:scale-95"
              >
                <span>➕</span>
                <span>Add Custom Prep or Repair Item</span>
              </button>
            </div>
          </div>
        </details>

        {/* Rates & Discounts */}
        <details open className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between">
            <span>💰 Rates, Coatings, Mileage &amp; Discounts</span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 space-y-3 border-t border-[var(--border)]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  Labor Rate ($/sqft)
                </label>
                <input
                  type="number"
                  step="0.05"
                  autoComplete="off"
                  value={paintRate}
                  onChange={(e) => handlePaintRateChange(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  Repair Rate ($/hr)
                </label>
                <input
                  type="number"
                  autoComplete="off"
                  value={repairRate}
                  onChange={(e) => setRepairRate(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
            </div>

            {/* Auto Round-Trip Mileage from 2119 Barton Ave, West Bend, WI 53090 */}
            <div className="bg-[var(--bg)] p-2.5 rounded-lg border border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-bold text-[var(--accent-secondary)] uppercase tracking-wider">
                  🚗 Mileage from {HOME_BASE.address}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const combinedAddr = formatAddressParts({
                      street: clientStreet,
                      city: clientCity,
                      state: clientStreet || clientCity || clientZip ? 'WI' : '',
                      zip: clientZip,
                    });
                    const recalced = estimateRoundTripMilesFromHomeBase(
                      combinedAddr,
                      combinedAddr === (customer.address || '').trim() ? customer.lat : undefined,
                      combinedAddr === (customer.address || '').trim() ? customer.lng : undefined
                    );
                    setManualMiles(false);
                    setRtMiles(recalced);
                    onToast(`✔ Round-trip mileage updated: ${recalced} mi`);
                  }}
                  className="text-[9.5px] font-bold text-[#f1c40f] hover:underline cursor-pointer shrink-0"
                >
                  ↻ Recalc
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                    Round-Trip (mi)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    autoComplete="off"
                    value={rtMiles || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setRtMiles(val);
                      setManualMiles(val > 0);
                    }}
                    placeholder="Auto"
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-xs outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                    Est. Work Days
                  </label>
                  <input
                    type="number"
                    min="1"
                    autoComplete="off"
                    value={workDays || 1}
                    onChange={(e) => setWorkDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-xs outline-none font-bold"
                  />
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-center">
                  <span className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                    IRS Est. ({totalTripMiles} mi)
                  </span>
                  <span className="text-xs font-black text-[var(--accent-tertiary)]">
                    ${estMileageDeduction}
                  </span>
                </div>
              </div>
            </div>

            {/* Discount Customization */}
            <div className="bg-[var(--bg)] p-2.5 rounded-lg border border-[var(--border)]">
              <span className="text-[9px] font-bold text-[var(--accent)] uppercase block mb-1">
                Discount Customization
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                    Reason
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={discLabel}
                    onChange={(e) => setDiscLabel(e.target.value)}
                    placeholder="Package Discount"
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                    Type
                  </label>
                  <select
                    autoComplete="off"
                    value={discType}
                    onChange={(e) => setDiscType(e.target.value as any)}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-xs outline-none"
                  >
                    <option value="PCT">% Off</option>
                    <option value="FLAT">$ Off</option>
                  </select>
                </div>
                <div>
                  <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                    Amount
                  </label>
                  <input
                    type="number"
                    autoComplete="off"
                    value={disc}
                    onChange={(e) => setDisc(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-xs outline-none font-bold"
                  />
                </div>
              </div>
            </div>

            {/* DEDICATED PAINT & COATINGS AUTO-TOTALER */}
            <div className="bg-[var(--bg)] border-2 border-[var(--accent)] rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-[var(--accent)] tracking-wider flex items-center gap-1.5">
                  <span>🎨</span>
                  <span>Paint &amp; Coatings Auto-Totaler</span>
                </span>
                <label className="text-[10px] font-bold text-[var(--text)] flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCalcCoatings}
                    onChange={(e) => setAutoCalcCoatings(e.target.checked)}
                    className="w-4 h-4 rounded text-[var(--accent)]"
                  />
                  <span>Auto-Multiply (Gallons × Price)</span>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-[var(--surface)] p-2.5 rounded-lg border border-[var(--border)] items-center text-center">
                <div>
                  <span className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block">
                    Total Paint (All Rooms)
                  </span>
                  <span className="text-sm font-black text-[var(--accent)]">{totalPaintGals} Gal</span>
                </div>
                <div>
                  <label className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                    Paint Price ($/gal)
                  </label>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs font-bold text-[var(--text)]">$</span>
                    <input
                      type="number"
                      autoComplete="off"
                      value={paintPricePerGal}
                      onChange={(e) => setPaintPricePerGal(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs font-bold text-[var(--text)] outline-none text-center"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[8.5px] uppercase font-bold text-[var(--text-muted)] block">
                    Coatings Total
                  </span>
                  <span className="text-sm font-black text-[var(--accent-tertiary)]">
                    {matsIncluded ? 'INCLUDED' : `$${autoCoatingsCost}`}
                  </span>
                </div>
              </div>

              {!autoCalcCoatings && !matsIncluded && (
                <div>
                  <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                    Manual Coatings Override ($)
                  </label>
                  <input
                    type="number"
                    autoComplete="off"
                    value={matVal}
                    onChange={(e) => setMatVal(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none font-bold"
                  />
                </div>
              )}

              <div className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                {matsIncluded ? (
                  <span className="text-[var(--accent-tertiary)] font-bold">
                    ✔ Materials marked as INCLUDED in labor/scope price ($0 added to customer bill).
                  </span>
                ) : (
                  <span>
                    <b>Formula:</b> {totalPaintGals} gallons × ${paintPricePerGal}/gal ={' '}
                    <b className="text-[var(--accent-tertiary)]">${autoCoatingsCost}</b> automatically calculated and added to project total!
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  Sundries &amp; Prep Supplies ($)
                </label>
                <input
                  type="number"
                  autoComplete="off"
                  disabled={matsIncluded}
                  value={sunVal}
                  onChange={(e) => setSunVal(parseFloat(e.target.value) || 0)}
                  placeholder="Tape, plastic, sandpaper, caulk..."
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none disabled:opacity-40"
                />
              </div>
            </div>
          </div>
        </details>

        {/* Payments Ledger */}
        <details className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between">
            <span>💳 Payments Ledger ({payments.length})</span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 space-y-2 border-t border-[var(--border)]">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={logFiftyPercentDeposit}
                className="flex-1 py-1.5 bg-[var(--accent-secondary)] text-white text-[11px] font-bold rounded-lg cursor-pointer"
              >
                ⚡ Log 50% Deposit (${fiftyPercentDeposit})
              </button>
              <button
                type="button"
                onClick={markJobPaid}
                className="flex-1 py-1.5 bg-[var(--accent-tertiary)] text-white text-[11px] font-bold rounded-lg cursor-pointer"
              >
                ✔ Mark Paid &amp; Close
              </button>
            </div>

            {payments.map((p, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)]">
                <input
                  type="date"
                  autoComplete="off"
                  value={p.date}
                  onChange={(e) => {
                    const updated = [...payments];
                    updated[idx].date = e.target.value;
                    setPayments(updated);
                  }}
                  className="bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-xs outline-none"
                />
                <input
                  type="number"
                  autoComplete="off"
                  value={p.amt || ''}
                  onChange={(e) => {
                    const updated = [...payments];
                    updated[idx].amt = parseFloat(e.target.value) || 0;
                    setPayments(updated);
                  }}
                  placeholder="Amount"
                  className="flex-1 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-xs outline-none font-bold"
                />
                <button
                  type="button"
                  onClick={() => setPayments(payments.filter((_, i) => i !== idx))}
                  className="text-red-500 font-bold px-1"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddPayment}
              className="w-full py-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-dashed border-[var(--border)] rounded-lg text-xs font-bold text-[var(--accent)] cursor-pointer"
            >
              + Custom Payment Row
            </button>
          </div>
        </details>

        {/* Client Digital Signature & Authorization */}
        <details className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between">
            <span>✍️ Client Signature Approval</span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 space-y-2.5 border-t border-[var(--border)]">
            <div className="bg-[#07080a] border border-[var(--border)] rounded-xl p-2 text-center">
              <canvas
                ref={canvasRef}
                width={360}
                height={120}
                onMouseDown={handleStartDraw}
                onMouseMove={handleDraw}
                onMouseUp={handleStopDraw}
                onTouchStart={handleStartDraw}
                onTouchMove={handleDraw}
                onTouchEnd={handleStopDraw}
                className="w-full h-28 touch-none bg-black rounded-lg cursor-crosshair"
              />
              <div className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                Sign with finger or stylus above
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearSignature}
                className="py-1.5 px-3 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] font-bold text-xs rounded-lg cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={lockInPersonSignature}
                className="flex-1 py-1.5 bg-[var(--accent-tertiary)] text-white font-bold text-xs rounded-lg cursor-pointer"
              >
                ✔ Lock In-Person Signature
              </button>
            </div>

            <button
              type="button"
              onClick={lockRemoteApproval}
              className="w-full py-2 bg-[var(--accent-secondary)] text-white font-bold text-xs rounded-lg cursor-pointer"
            >
              📧 Mark Electronically Approved (Remote Email / SMS)
            </button>

            {clientSig && (
              <div className="bg-white p-2 rounded-lg text-center border border-[var(--border)]">
                <img src={clientSig} alt="Client Signature" className="max-h-12 mx-auto" />
                <span className="text-[9px] text-green-700 font-bold block mt-1">
                  ✔ Signature Verified in Project File
                </span>
              </div>
            )}
          </div>
        </details>

        {/* Totals Summary Card */}
        <div className="bg-[#121318] border-2 border-[#f1c40f] rounded-xl p-3 sm:p-4 text-center shadow-lg space-y-2">
          <div className="text-[11px] sm:text-xs uppercase font-extrabold text-[#f1c40f] tracking-wider">
            Project Estimate Summary
          </div>
          <div className="text-3xl sm:text-4xl font-black text-white">
            ${grossTotal}
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs font-bold">
            <span className="text-gray-300">
              Paint: {totalPaintGals} Gal ({matsIncluded ? 'INCLUDED' : `$${effectiveMatCost}`})
            </span>
            <span className="text-gray-500 hidden min-[360px]:inline">•</span>
            <span className="text-[#f1c40f]">
              50% First-Day Deposit: ${fiftyPercentDeposit}
            </span>
            <span className="text-gray-500 hidden min-[360px]:inline">•</span>
            <span className="text-red-400">Balance Due: ${balanceDue}</span>
          </div>
          {(totalSqft > 0 || rtMiles > 0) && (
            <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-0.5 text-[10px] font-semibold text-gray-400">
              {totalSqft > 0 && <span>Total Area: {totalSqft} sq ft</span>}
              {rtMiles > 0 && (
                <span>
                  Mileage: {rtMiles} mi RT ({totalTripMiles} mi total)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3.5 bg-[var(--accent-tertiary)] hover:opacity-95 text-white font-extrabold uppercase tracking-wider text-xs rounded-xl shadow-lg cursor-pointer transition-transform active:scale-95"
        >
          Save Project / Estimate
        </button>
      </form>
    </div>
  );
};
