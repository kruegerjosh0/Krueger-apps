import React, { useState } from 'react';
import { PrintSettings, SystemConstants } from '../../types';

interface SettingsModalProps {
  settings: PrintSettings;
  constants: SystemConstants;
  baseTheme: 'dark' | 'light';
  customLogo?: string | null;
  onUpdateSettings: (settings: PrintSettings) => void;
  onUpdateConstants: (constants: SystemConstants) => void;
  onUpdateTheme: (theme: 'dark' | 'light') => void;
  onPickAccent: (hex: string) => void;
  onUploadLogo: (file: File) => void;
  onRemoveLogo?: () => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  constants,
  baseTheme,
  customLogo,
  onUpdateSettings,
  onUpdateConstants,
  onUpdateTheme,
  onPickAccent,
  onUploadLogo,
  onRemoveLogo,
  onClose,
  onToast,
}) => {
  const [motto, setMotto] = useState(settings.motto || '');
  const [hdr, setHdr] = useState(settings.hdr || '');
  const [t1, setT1] = useState(settings.t1 || '');
  const [t2, setT2] = useState(settings.t2 || '');
  const [t3, setT3] = useState(settings.t3 || '');
  const [t4, setT4] = useState(settings.t4 || '');

  const [spreadRate, setSpreadRate] = useState(constants.spreadRate);
  const [repairRate, setRepairRate] = useState(constants.repairRate);
  const [irsRate, setIrsRate] = useState(constants.irsRate);
  const [paintCost, setPaintCost] = useState(constants.paintCostPerGal);

  const handleSaveAll = () => {
    onUpdateSettings({
      ...settings,
      motto: motto.trim(),
      hdr: hdr.trim(),
      t1: t1.trim(),
      t2: t2.trim(),
      t3: t3.trim(),
      t4: t4.trim(),
    });
    onUpdateConstants({
      spreadRate: Number(spreadRate) || 350,
      repairRate: Number(repairRate) || 75,
      irsRate: Number(irsRate) || 0.67,
      paintCostPerGal: Number(paintCost) || 65,
    });
    onToast('✔ Settings Saved');
    onClose();
  };

  const paletteColors = [
    { hex: '#bf5af2', name: 'Krueger Purple' },
    { hex: '#f1c40f', name: 'Contractor Gold' },
    { hex: '#0a84ff', name: 'Electric Blue' },
    { hex: '#30d158', name: 'Emerald Green' },
    { hex: '#ff9f0a', name: 'Safety Orange' },
    { hex: '#ff453a', name: 'Vibrant Red' },
    { hex: '#38bdf8', name: 'Sky Cyan' },
    { hex: '#ec4899', name: 'Neon Pink' },
    { hex: '#84cc16', name: 'Lime Green' },
    { hex: '#6366f1', name: 'Indigo' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="max-w-2xl w-full mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 my-auto">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Configuration & Branding
            </span>
            <h2 className="text-base font-black text-[var(--text)]">Business Settings & Visual Themes</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Back
          </button>
        </div>

        {/* Base Theme */}
        <div className="bg-[var(--surface-subtle)] p-3.5 rounded-xl border border-[var(--border)] space-y-2">
          <span className="text-[10px] font-bold text-[var(--accent)] uppercase block">
            🌓 Base Background Theme
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onUpdateTheme('dark')}
              className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                baseTheme === 'dark'
                  ? 'bg-black text-white border-[var(--accent)] shadow'
                  : 'bg-black/60 text-gray-400 border-[var(--border)]'
              }`}
            >
              ⬛ Dark Mode (Black)
            </button>
            <button
              type="button"
              onClick={() => onUpdateTheme('light')}
              className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                baseTheme === 'light'
                  ? 'bg-white text-black border-[var(--accent)] shadow'
                  : 'bg-white/70 text-gray-600 border-[var(--border)]'
              }`}
            >
              ⬜ Light Mode (Clean White)
            </button>
          </div>
        </div>

        {/* Multi-Color Accent Mixer */}
        <div className="bg-[var(--surface-subtle)] p-3.5 rounded-xl border border-[var(--border)] space-y-2">
          <span className="text-[10px] font-bold text-[var(--accent)] uppercase block">
            🎨 Multi-Color Accent Mixer (Tap to Assign Primary / Secondary)
          </span>
          <div className="grid grid-cols-5 gap-2">
            {paletteColors.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => onPickAccent(c.hex)}
                style={{ backgroundColor: c.hex }}
                className="h-9 rounded-lg border-2 border-[var(--border)] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                title={c.name}
              />
            ))}
          </div>
        </div>

        {/* Fundamental Constants */}
        <div className="bg-[var(--surface-subtle)] p-3.5 rounded-xl border border-[var(--border)] space-y-2.5">
          <span className="text-[10px] font-bold text-[var(--accent-tertiary)] uppercase block">
            🔢 Fundamental System Numbers & Rates
          </span>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                Paint Spread Rate (SqFt/Gal)
              </label>
              <input
                type="number"
                value={spreadRate}
                onChange={(e) => setSpreadRate(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                Repair Labor Rate ($/hr)
              </label>
              <input
                type="number"
                value={repairRate}
                onChange={(e) => setRepairRate(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                IRS Mileage Deduction Rate ($/mi)
              </label>
              <input
                type="number"
                step="0.01"
                value={irsRate}
                onChange={(e) => setIrsRate(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
                Estimated Paint Cost ($/gal)
              </label>
              <input
                type="number"
                value={paintCost}
                onChange={(e) => setPaintCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
          </div>
        </div>

        {/* Branding & Logo */}
        <div className="bg-[var(--surface-subtle)] p-3.5 rounded-xl border border-[var(--border)] space-y-2.5">
          <span className="text-[10px] font-bold text-[var(--accent)] uppercase block">
            🏢 Business Branding & PDF Policy Terms
          </span>

          {/* Current Logo Preview */}
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {customLogo ? (
                <div className="w-16 h-16 bg-white rounded-lg p-1 border border-gray-700 flex items-center justify-center overflow-hidden shadow-sm">
                  <img
                    src={customLogo}
                    alt="Custom Company Logo"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 bg-[#231709] rounded-full border-2 border-[#f1c40f] flex items-center justify-center text-xl shadow-sm">
                  🎨
                </div>
              )}
              <div>
                <span className="text-xs font-black text-[var(--text)] block">
                  {customLogo ? 'Custom Company Logo Active' : 'Official Krueger Seal Active'}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] block">
                  {customLogo
                    ? 'Applied at top of all vector PDF estimates & bills'
                    : 'Default circular Krueger Painting gold & brown seal'}
                </span>
              </div>
            </div>

            {customLogo && onRemoveLogo && (
              <button
                type="button"
                onClick={onRemoveLogo}
                className="text-xs text-red-400 hover:text-red-300 font-bold px-2 py-1 rounded border border-red-500/30 hover:bg-red-500/10 cursor-pointer"
              >
                Reset to Default
              </button>
            )}
          </div>

          {/* Live Letterhead Preview for Contractor Confidence */}
          <div className="bg-white rounded-xl p-3 border border-gray-300 text-black shadow-inner">
            <div className="text-[9px] font-black uppercase text-gray-500 tracking-wider mb-1.5 flex items-center justify-between">
              <span>PDF Header Preview (As will appear on Estimate/Bill)</span>
              <span className="text-[#f1c40f] bg-black px-1.5 py-0.5 rounded text-[8px] font-bold">Vector PDF Header</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center py-2 border-b border-gray-200">
              {customLogo ? (
                <img
                  src={customLogo}
                  alt="Letterhead Logo"
                  className="max-h-14 max-w-[180px] object-contain mb-1.5"
                />
              ) : (
                <div className="w-12 h-12 rounded-full border-2 border-[#f1c40f] bg-[#231709] flex items-center justify-center text-white text-xs font-black mb-1.5 shadow">
                  KP
                </div>
              )}
              {motto && (
                <div className="text-[11px] font-semibold italic text-gray-700 leading-tight">
                  &ldquo;{motto}&rdquo;
                </div>
              )}
              <div className="text-[10px] font-bold text-gray-900 mt-0.5">
                {hdr || 'N630 Moraine Dr., Campbellsport, WI 53010 | (262) 443-1199'}
              </div>
            </div>
          </div>

          <div>
            <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
              Company Tagline / Motto
            </label>
            <input
              type="text"
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
              placeholder="Precision & Quality"
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
            />
          </div>

          <label className="w-full py-2.5 bg-[#f1c40f] hover:bg-[#e0b40e] text-[#231709] font-black text-xs rounded-xl text-center cursor-pointer shadow-md block transition-transform active:scale-95">
            {customLogo ? '📁 Change / Upload New Logo Image' : '📁 Upload Custom Company Logo (PNG/JPEG)'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onUploadLogo(e.target.files[0]);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
          </label>

          <div>
            <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
              Header Subtext & Address
            </label>
            <input
              type="text"
              value={hdr}
              onChange={(e) => setHdr(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
            />
          </div>

          <div>
            <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
              1. Quality & Material Standards
            </label>
            <textarea
              rows={2}
              value={t1}
              onChange={(e) => setT1(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
            />
          </div>

          <div>
            <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
              2. Payment Policy
            </label>
            <textarea
              rows={2}
              value={t2}
              onChange={(e) => setT2(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
            />
          </div>

          <div>
            <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
              3. Color Selection Policy
            </label>
            <textarea
              rows={2}
              value={t3}
              onChange={(e) => setT3(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
            />
          </div>

          <div>
            <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-0.5">
              4. Exclusions & Warranty
            </label>
            <textarea
              rows={2}
              value={t4}
              onChange={(e) => setT4(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          className="w-full py-3 bg-[var(--accent-tertiary)] hover:opacity-95 text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
        >
          Save All Settings
        </button>
      </div>
    </div>
  );
};
