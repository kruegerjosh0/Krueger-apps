import React, { useState, useEffect, useRef } from 'react';
import { Customer, JobProject, RoomArea, RepairItem, PaymentEntry, SystemConstants } from '../../types';

interface JobModalProps {
  customer: Customer;
  job?: JobProject | null;
  constants: SystemConstants;
  onClose: () => void;
  onSaveJob: (savedJob: JobProject) => void;
  onToast: (msg: string) => void;
}

export const JobModal: React.FC<JobModalProps> = ({
  customer,
  job,
  constants,
  onClose,
  onSaveJob,
  onToast,
}) => {
  const [title, setTitle] = useState(job?.title || '');
  const [status, setStatus] = useState<JobProject['status']>(job?.status || 'PENDING');
  const [schedDate, setSchedDate] = useState(job?.schedDate || '');
  const [schedEndDate, setSchedEndDate] = useState(job?.schedEndDate || '');

  const [showLaborTotal, setShowLaborTotal] = useState(job?.showLaborTotal ?? true);
  const [showOverallTotal, setShowOverallTotal] = useState(job?.showOverallTotal ?? false);
  const [matsIncluded, setMatsIncluded] = useState(job?.matsIncluded ?? false);

  const [prepScope, setPrepScope] = useState(job?.prepScope || '');
  const [scope, setScope] = useState(job?.scope || '');

  const [rooms, setRooms] = useState<RoomArea[]>(
    job?.rooms && job.rooms.length > 0
      ? job.rooms
      : [{ n: 'Living Room 12x15', r: 350, sp: true, prod: 'Emerald', color: '', sheen: 'Satin' }]
  );

  const [repairs, setRepairs] = useState<RepairItem[]>(job?.repairs || []);

  const [paintRate, setPaintRate] = useState(job?.paintRate || '1.00');
  const [repairRate, setRepairRate] = useState<number>(job?.repairRate || constants.repairRate || 75);

  const [disc, setDisc] = useState<number>(job?.disc || 0);
  const [discType, setDiscType] = useState<'PCT' | 'FLAT'>(job?.discType || 'PCT');
  const [discLabel, setDiscLabel] = useState(job?.discLabel || 'Package Discount');

  const [matVal, setMatVal] = useState<number>(job?.matVal || 0);
  const [sunVal, setSunVal] = useState<number>(job?.sunVal || 0);
  const [paintPricePerGal, setPaintPricePerGal] = useState<number>(constants.paintCostPerGal || 65);
  const [autoCalcCoatings, setAutoCalcCoatings] = useState<boolean>(true);

  const [rtMiles, setRtMiles] = useState<number>(job?.rtMiles || 0);
  const [workDays, setWorkDays] = useState<number>(job?.workDays || 1);

  const [payments, setPayments] = useState<PaymentEntry[]>(job?.payments || []);
  const [clientSig, setClientSig] = useState<string>(job?.clientSig || '');

  // Weather check result for job
  const [weatherAlert, setWeatherAlert] = useState<string | null>(null);
  const [checkingWeather, setCheckingWeather] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    initSignatureCanvas();
  }, []);

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
    ctx.fillText(customer.name.toUpperCase(), 12, 60);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`TIMESTAMP: ${timeStamp}  •  VERIFIED KRUEGER RECORD`, 12, 86);

    const stampData = canvas.toDataURL('image/png');
    setClientSig(stampData);
    if (status === 'PENDING') setStatus('SCHEDULED');
    onToast('✔ Remote Approval Stamp Generated');
  };

  // Helper to get paint gallons for an individual room
  const getRoomPaintGals = (r: RoomArea) => {
    if (r.og && parseFloat(r.og) > 0) {
      return parseFloat(r.og);
    }
    const dimMatch = (r.n || '').toLowerCase().match(/(\d+)\s*[x*]\s*(\d+)/);
    if (dimMatch) {
      const sqft = parseFloat(dimMatch[1]) * parseFloat(dimMatch[2]);
      return Math.ceil((sqft * 2) / (constants.spreadRate || 350));
    }
    return 0;
  };

  // Calculations
  let laborSubtotal = 0;
  let totalSqft = 0;

  rooms.forEach((r) => {
    const rPrice = Math.round(Number(r.r) || 0);
    laborSubtotal += rPrice;

    const dimMatch = (r.n || '').toLowerCase().match(/(\d+)\s*[x*]\s*(\d+)/);
    if (dimMatch) {
      totalSqft += parseFloat(dimMatch[1]) * parseFloat(dimMatch[2]);
    }
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

  let totalPaid = 0;
  payments.forEach((p) => {
    totalPaid += Math.round(Number(p.amt) || 0);
  });
  const balanceDue = Math.max(0, grossTotal - totalPaid);

  const handleAddRoom = () => {
    setRooms([
      ...rooms,
      { n: 'Room / Area', r: 0, sp: true, prod: 'Emerald', color: '', sheen: 'Satin' },
    ]);
  };

  const updateRoom = (index: number, field: keyof RoomArea, val: any) => {
    const updated = [...rooms];
    updated[index] = { ...updated[index], [field]: val };

    // Auto-calculate labor if dimensions match and labor is 0
    if (field === 'n') {
      const dimMatch = (val as string).toLowerCase().match(/(\d+)\s*[x*]\s*(\d+)/);
      if (dimMatch && (!updated[index].r || updated[index].r === 0)) {
        const sqft = parseFloat(dimMatch[1]) * parseFloat(dimMatch[2]);
        const rate = parseFloat(paintRate) || 1.0;
        updated[index].r = Math.round(sqft * rate);
      }
    }
    setRooms(updated);
  };

  const removeRoom = (index: number) => {
    setRooms(rooms.filter((_, i) => i !== index));
  };

  const handleAddRepair = () => {
    setRepairs([...repairs, { d: 'Minor drywall patching / caulking', h: 1 }]);
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
    setStatus('PAID');
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

    const details = `Krueger Painting Project: ${title || 'Interior/Exterior'}\nCustomer: ${customer.name}\nPhone: ${customer.phone || 'N/A'}\nScope:\n${scope || 'Painting'}`;
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      `Krueger Painting: ${customer.name} (${status})`
    )}&dates=${sFormatted}/${eFormatted}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(
      customer.address || ''
    )}`;
    window.open(url, '_blank');
  };

  const handleSave = () => {
    const savedMatVal = matsIncluded
      ? 0
      : autoCalcCoatings
      ? autoCoatingsCost
      : Math.round(matVal);

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
      prepScope,
      scope,
      rooms,
      repairs,
      rtMiles,
      workDays,
      schedDate,
      schedEndDate,
      clientSig,
    };
    onSaveJob(saved);
    onToast('✔ Project Saved');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex flex-col p-2 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="max-w-2xl w-full mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-5 shadow-2xl space-y-3.5 my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#f1c40f]">
              {job ? 'Edit Project & Estimate' : 'New Project & Estimate'}
            </span>
            <h2 className="text-sm sm:text-base font-black text-[var(--text)]">
              {customer.name}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] font-bold text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
            >
              ✕ Back
            </button>
          </div>
        </div>

        {/* Project Title & Status */}
        <div className="space-y-2">
          <div>
            <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
              Project Title / Description
            </label>
            <input
              type="text"
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
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-2 text-xs outline-none"
              >
                <option value="PENDING">Pending</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="PAID">Paid</option>
                <option value="ON HOLD">On Hold</option>
                <option value="DECLINED">Declined</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Start Date
              </label>
              <input
                type="date"
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

        {/* Prep & Scope Accordion */}
        <details open className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between">
            <span>📝 Prep & Scope Notes</span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 space-y-2 border-t border-[var(--border)]">
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

            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Prep Work Notes
              </label>
              <textarea
                rows={2}
                value={prepScope}
                onChange={(e) => setPrepScope(e.target.value)}
                placeholder="Pressure wash siding, scrape loose paint, sand feather edges, prime raw wood with oil..."
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>

            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                General Scope Notes
              </label>
              <textarea
                rows={2}
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
              <span>🛠️ Rooms, Sections & Dimensions ({rooms.length})</span>
            </span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 space-y-3 border-t border-[var(--border)]">

            {rooms.map((room, idx) => (
              <div
                key={idx}
                className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 space-y-2 relative"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-[var(--accent)] uppercase">
                    Area #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRoom(idx)}
                    className="text-red-500 font-bold text-xs"
                  >
                    ✕ Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                      Room / Area Name & Dimensions
                    </label>
                    <input
                      type="text"
                      value={room.n}
                      onChange={(e) => updateRoom(idx, 'n', e.target.value)}
                      placeholder="e.g. Master Bedroom 14x16"
                      className="w-full bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                      Labor Price ($)
                    </label>
                    <input
                      type="number"
                      value={room.r || ''}
                      onChange={(e) => updateRoom(idx, 'r', parseFloat(e.target.value) || 0)}
                      placeholder="Auto"
                      className="w-full bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none font-bold"
                    />
                  </div>
                </div>

                {/* Paint Spec (Product, Color, Sheen) */}
                <div className="grid grid-cols-3 gap-1.5 bg-[var(--surface)] p-2 rounded-md border border-[var(--border)]">
                  <div>
                    <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                      Product
                    </label>
                    <input
                      type="text"
                      value={room.prod || ''}
                      onChange={(e) => updateRoom(idx, 'prod', e.target.value)}
                      placeholder="Emerald"
                      className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded px-1.5 py-1 text-[11px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                      Color
                    </label>
                    <input
                      type="text"
                      value={room.color || ''}
                      onChange={(e) => updateRoom(idx, 'color', e.target.value)}
                      placeholder="SW 7015"
                      className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded px-1.5 py-1 text-[11px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[7.5px] uppercase font-bold text-[var(--text-muted)] block">
                      Sheen
                    </label>
                    <input
                      type="text"
                      value={room.sheen || ''}
                      onChange={(e) => updateRoom(idx, 'sheen', e.target.value)}
                      placeholder="Satin"
                      className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded px-1.5 py-1 text-[11px] outline-none"
                    />
                  </div>
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
            ))}

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
            <span>🔧 Surface Repairs & Carpentry ({repairs.length})</span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="p-3 space-y-2 border-t border-[var(--border)]">
            {repairs.map((rep, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)]">
                <input
                  type="text"
                  value={rep.d}
                  onChange={(e) => updateRepair(idx, 'd', e.target.value)}
                  placeholder="Repair description (e.g. rotted sill replacement)"
                  className="flex-1 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1.5 text-xs outline-none"
                />
                <div className="w-20">
                  <input
                    type="number"
                    value={rep.h || ''}
                    onChange={(e) => updateRepair(idx, 'h', parseFloat(e.target.value) || 0)}
                    placeholder="Hrs"
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1.5 text-xs outline-none text-center font-bold"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRepair(idx)}
                  className="text-red-500 font-bold px-1"
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
                <span>Add Prep or Repair Item</span>
              </button>
            </div>
          </div>
        </details>

        {/* Rates & Discounts */}
        <details open className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl overflow-hidden">
          <summary className="px-3.5 py-2.5 font-bold text-xs text-[var(--text)] cursor-pointer flex justify-between">
            <span>💰 Rates, Coatings & Discounts</span>
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
                  value={paintRate}
                  onChange={(e) => setPaintRate(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                  Repair Rate ($/hr)
                </label>
                <input
                  type="number"
                  value={repairRate}
                  onChange={(e) => setRepairRate(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md px-2.5 py-1.5 text-xs outline-none"
                />
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
                ⚡ Log 50% Deposit
              </button>
              <button
                type="button"
                onClick={markJobPaid}
                className="flex-1 py-1.5 bg-[var(--accent-tertiary)] text-white text-[11px] font-bold rounded-lg cursor-pointer"
              >
                ✔ Mark Paid & Close
              </button>
            </div>

            {payments.map((p, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)]">
                <input
                  type="date"
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
            <span className="text-red-400">Balance Due: ${balanceDue}</span>
          </div>
        </div>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3.5 bg-[var(--accent-tertiary)] hover:opacity-95 text-white font-extrabold uppercase tracking-wider text-xs rounded-xl shadow-lg cursor-pointer transition-transform active:scale-95"
        >
          Save Project / Estimate
        </button>
      </div>
    </div>
  );
};
