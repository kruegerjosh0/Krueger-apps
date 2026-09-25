import React, { useState } from 'react';
import { SystemConstants } from '../../types';

interface PaintCalcModalProps {
  constants: SystemConstants;
  onClose: () => void;
}

export const PaintCalcModal: React.FC<PaintCalcModalProps> = ({ constants, onClose }) => {
  const [length, setLength] = useState(15);
  const [height, setHeight] = useState(9);
  const [doors, setDoors] = useState(0);
  const [windows, setWindows] = useState(0);
  const [gableBase, setGableBase] = useState(0);
  const [gableHeight, setGableHeight] = useState(0);
  const [spreadRate, setSpreadRate] = useState(constants.spreadRate || 350);

  const baseSqft = length * height;
  const deductions = doors * 20 + windows * 15;
  const gableSqft = 0.5 * gableBase * gableHeight;
  const netSqft = Math.max(0, baseSqft - deductions + gableSqft);
  const galsNeeded = ((netSqft * 2) / spreadRate).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Pro Paint Calculator
            </span>
            <h2 className="text-base font-black text-[var(--text)]">Surface & Gallon Estimator</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Back
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Length / Width (ft)
              </label>
              <input
                type="number"
                value={length || ''}
                onChange={(e) => setLength(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Height (ft)
              </label>
              <input
                type="number"
                value={height || ''}
                onChange={(e) => setHeight(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Doors (-20 sqft ea)
              </label>
              <input
                type="number"
                value={doors || ''}
                onChange={(e) => setDoors(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Windows (-15 sqft ea)
              </label>
              <input
                type="number"
                value={windows || ''}
                onChange={(e) => setWindows(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Gable Base (ft)
              </label>
              <input
                type="number"
                value={gableBase || ''}
                onChange={(e) => setGableBase(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Gable Peak (ft)
              </label>
              <input
                type="number"
                value={gableHeight || ''}
                onChange={(e) => setGableHeight(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block mb-1">
              Spread Rate (2 Full Coats)
            </label>
            <select
              value={spreadRate}
              onChange={(e) => setSpreadRate(parseFloat(e.target.value) || 350)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
            >
              <option value="350">Standard Repaint (350 sqft/gal per coat)</option>
              <option value="200">Rough / Porous Stucco or Brick (200 sqft/gal)</option>
              <option value="400">Ultra-Smooth Finish / Spray (400 sqft/gal)</option>
            </select>
          </div>
        </div>

        {/* Calculation Result */}
        <div className="bg-[var(--bg)] border border-[var(--accent)] rounded-xl p-4 text-center shadow-lg space-y-1">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
            Net Surface Area
          </span>
          <div className="text-2xl font-black text-[var(--accent)]">{netSqft.toFixed(0)} SQ FT</div>
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mt-2">
            Paint Required (2 Full Coats)
          </span>
          <div className="text-xl font-black text-[var(--accent-tertiary)]">{galsNeeded} GALLONS</div>
        </div>
      </div>
    </div>
  );
};
