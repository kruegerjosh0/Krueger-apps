import React, { useState } from 'react';
import { MileageEntry, SystemConstants } from '../../types';

interface MileageModalProps {
  mileage: MileageEntry[];
  constants: SystemConstants;
  onSaveMileage: (entry: MileageEntry) => void;
  onDeleteMileage: (id: number) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const MileageModal: React.FC<MileageModalProps> = ({
  mileage,
  constants,
  onSaveMileage,
  onDeleteMileage,
  onClose,
  onToast,
}) => {
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vehicle, setVehicle] = useState('2004 Ford E350 Van');
  const [startOdo, setStartOdo] = useState<number | ''>('');
  const [endOdo, setEndOdo] = useState<number | ''>('');
  const [flatMiles, setFlatMiles] = useState<number | ''>('');
  const [purpose, setPurpose] = useState('');

  const calcLoggedMiles = (start: number | '', end: number | '') => {
    if (typeof start === 'number' && typeof end === 'number' && end > start) {
      setFlatMiles(parseFloat((end - start).toFixed(1)));
    }
  };

  const handleRecordTrip = () => {
    const milesVal = typeof flatMiles === 'number' ? flatMiles : parseFloat(String(flatMiles)) || 0;
    if (milesVal <= 0) {
      alert('Please enter valid miles.');
      return;
    }
    const entry: MileageEntry = {
      id: Date.now(),
      date,
      vehicle,
      miles: milesVal,
      purpose: purpose.trim() || 'Job site travel & materials',
    };
    onSaveMileage(entry);
    setStartOdo('');
    setEndOdo('');
    setFlatMiles('');
    setPurpose('');
    onToast('✔ Mileage Trip Recorded');
  };

  const filtered = mileage.filter((m) => new Date(m.date).getFullYear() === filterYear);
  let totalMiles = 0;
  filtered.forEach((m) => (totalMiles += m.miles));
  const totalDeduction = Math.round(totalMiles * (constants.irsRate || 0.67));

  const years = Array.from(new Set(mileage.map((m) => new Date(m.date).getFullYear())));
  if (!years.includes(currentYear)) years.push(currentYear);
  years.sort((a, b) => b - a);

  const exportCsv = () => {
    let csv = `data:text/csv;charset=utf-8,Date,Vehicle,Purpose,Total Miles,IRS Deduction ($)\n`;
    filtered.forEach((t) => {
      csv += `"${t.date}","${t.vehicle}","${t.purpose.replace(/"/g, '""')}",${t.miles},${Math.round(
        t.miles * constants.irsRate
      )}\n`;
    });
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `Krueger_Mileage_${filterYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="max-w-2xl w-full mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 my-auto">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent-tertiary)]">
              Mileage & IRS Ledger
            </span>
            <h2 className="text-base font-black text-[var(--text)]">Vehicle Trip Log</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Back
          </button>
        </div>

        {/* Year Filter & Total Deduction */}
        <div className="flex items-center justify-between gap-3">
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(parseInt(e.target.value))}
            className="bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-1.5 text-xs outline-none font-bold"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y} Tax Year
              </option>
            ))}
          </select>

          <div className="flex gap-3 text-right">
            <div>
              <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] block">Total Miles</span>
              <span className="text-base font-black text-[var(--accent)]">{totalMiles.toFixed(1)}</span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] block">
                IRS Deduction ({constants.irsRate * 100}¢/mi)
              </span>
              <span className="text-base font-black text-[var(--accent-tertiary)]">${totalDeduction}</span>
            </div>
          </div>
        </div>

        {/* Entry Form */}
        <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                Vehicle
              </label>
              <select
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="2004 Ford E350 Van">2004 Ford E350 Van</option>
                <option value="2017 Ford Focus SE">2017 Ford Focus SE</option>
                <option value="2024 Chevy Trailblazer LT">2024 Chevy Trailblazer LT</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                Start Odo
              </label>
              <input
                type="number"
                value={startOdo}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                  setStartOdo(val);
                  calcLoggedMiles(val, endOdo);
                }}
                placeholder="142010"
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                End Odo
              </label>
              <input
                type="number"
                value={endOdo}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                  setEndOdo(val);
                  calcLoggedMiles(startOdo, val);
                }}
                placeholder="142028"
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                Trip Miles
              </label>
              <input
                type="number"
                step="0.1"
                value={flatMiles}
                onChange={(e) => setFlatMiles(e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="18.5"
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none font-bold"
              />
            </div>
          </div>

          <div>
            <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
              Business Purpose / Client
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Paint run to Sherwin-Williams & client job site"
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleRecordTrip}
            className="w-full py-2 bg-[var(--accent-tertiary)] hover:opacity-95 text-white font-extrabold text-xs rounded-lg shadow cursor-pointer transition-transform active:scale-95"
          >
            Record Drive
          </button>
        </div>

        {/* Export Button */}
        <button
          type="button"
          onClick={exportCsv}
          className="w-full py-2 bg-[var(--accent-secondary)] text-white font-bold text-xs rounded-lg shadow cursor-pointer"
        >
          Export Mileage CSV
        </button>

        {/* Mileage Log Table */}
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="bg-[var(--bg)] border border-[var(--border)] p-2.5 rounded-lg flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-bold text-[var(--text)]">{m.date}</span>
                <span className="text-[10px] text-[var(--text-muted)] ml-2">[{m.vehicle.split(' ')[1] || 'Van'}]</span>
                <div className="text-[11px] text-[var(--text-muted)]">{m.purpose}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[var(--accent)]">{m.miles.toFixed(1)} mi</span>
                <span className="font-bold text-[var(--accent-tertiary)]">
                  ${Math.round(m.miles * constants.irsRate)}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteMileage(m.id)}
                  className="text-red-500 font-bold px-1.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-6 text-xs text-[var(--text-muted)] bg-[var(--bg)] border border-[var(--border)] rounded-xl">
              No trips recorded for {filterYear}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
