import React, { useState } from 'react';
import { PrintSettings, SystemConstants } from '../../types';
import { CloudSyncAccountCard, CloudSyncAccountProps } from '../CloudSyncAccountCard';

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
  onOpenDataBackup?: () => void;
  cloudSync?: CloudSyncAccountProps;
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
  onOpenDataBackup,
  cloudSync,
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

        {/* Cloud Sync Account */}
        {cloudSync && <CloudSyncAccountCard {...cloudSync} />}

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
                <div className="w-16 h-16 bg-[#111111] rounded-full border-2 border-[#f1c40f] flex items-center justify-center overflow-hidden shadow-sm">
                  <img
                    src={customLogo}
                    alt="Custom Company Logo"
                    style={{ borderRadius: '50%', background: 'transparent' }}
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 bg-[#111111] rounded-full border-2 border-[#f1c40f] flex items-center justify-center text-xl shadow-sm">
                  🎨
                </div>
              )}
              <div>
                <span className="text-xs font-black text-[var(--text)] block">
                  {customLogo ? 'Custom Company Logo Active' : 'Official Krueger Seal Active'}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] block">
                  {customLogo
                    ? 'Circular transparent PNG applied on #111111 black PDF headers'
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

          {/* Live Black & Yellow PDF Header Preview */}
          <div className="bg-[#111111] rounded-xl p-3 border-y-4 border-[#f1c40f] text-white shadow-inner">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {customLogo ? (
                  <img
                    src={customLogo}
                    alt="Letterhead Logo"
                    style={{ borderRadius: '50%', background: 'transparent' }}
                    className="w-12 h-12 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full border-2 border-[#f1c40f] bg-[#231709] flex items-center justify-center text-[#f1c40f] text-xs font-black shrink-0">
                    KP
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-black text-[#f1c40f] tracking-wide truncate">
                    KRUEGER PAINTING
                  </div>
                  {motto && (
                    <div className="text-[9.5px] italic text-gray-300 truncate">
                      &ldquo;{motto}&rdquo;
                    </div>
                  )}
                  <div className="text-[8.5px] text-gray-400 truncate">
                    {(hdr || 'N630 Moraine Dr., Campbellsport, WI 53010').split('|')[0].trim()}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 leading-tight">
                <div className="text-[9.5px] font-black text-[#f1c40f]">(262) 443-1199</div>
                <div className="text-[8.5px] text-white">krueptg@gmail.com</div>
                <div className="text-[8.5px] font-bold text-[#f1c40f]">kruegerpaintingwi.com</div>
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
              Header Subtext &amp; Address
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
              1. Quality &amp; Material Standards
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
              4. Exclusions &amp; Warranty
            </label>
            <textarea
              rows={2}
              value={t4}
              onChange={(e) => setT4(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
            />
          </div>
        </div>

        {/* Simplified JSON Data Backup */}
        {onOpenDataBackup && (
          <div className="bg-[var(--surface-subtle)] p-3.5 rounded-xl border border-[var(--border)] space-y-2">
            <span className="text-[10px] font-bold text-[var(--accent)] uppercase block">
              💾 Backup &amp; Restore Data (.JSON)
            </span>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Download or restore your complete customer and project database as a .JSON file.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDataBackup();
              }}
              className="w-full py-2.5 px-3.5 bg-[#f1c40f] hover:opacity-95 text-[#111111] font-black text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-98"
            >
              <span>💾</span>
              <span>Open Backup &amp; Restore (.JSON)</span>
            </button>
          </div>
        )}

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
