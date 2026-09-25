import React, { useState } from 'react';
import { PrintSettings } from '../types';

interface HeaderProps {
  settings: PrintSettings;
  isBackupDue: boolean;
  onBackup: () => void;
  onRestore: (file: File) => void;
  onOpenNewCustomer: () => void;
  onNavigateTab: (tab: 'dash' | 'sched' | 'weather' | 'notes' | 'tools' | 'email') => void;
  onOpenCalc: () => void;
  onOpenAiAssistant?: () => void;
  onOpenCloudSync?: () => void;
  onOpenApkInstaller?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  isBackupDue,
  onBackup,
  onRestore,
  onOpenNewCustomer,
  onNavigateTab,
  onOpenCalc,
  onOpenAiAssistant,
  onOpenCloudSync,
  onOpenApkInstaller,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[var(--surface)] backdrop-blur-md border-b-2 border-[var(--accent)] px-3 sm:px-4 py-2.5 sm:py-3 shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onOpenAiAssistant}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-[var(--accent)] bg-[var(--surface-subtle)] flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer p-0.5"
            title="Tap to talk with Flip Gemini AI"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" className="w-full h-full">
              <circle cx="150" cy="150" r="142" fill="#121318" />
              <circle cx="150" cy="150" r="136" fill="#f4c430" />
              <circle cx="150" cy="150" r="128" fill="none" stroke="#3b2b1d" strokeWidth="3" />
              <text
                x="150"
                y="125"
                fontFamily="'Impact', 'Arial Black', sans-serif"
                fontSize="25"
                fontWeight="900"
                fill="#231709"
                textAnchor="middle"
                letterSpacing="1"
              >
                KRUEGER
              </text>
              <g transform="translate(48,138) rotate(-22)">
                <path d="M0,35 L16,35 L12,12 L4,12 Z" fill="#b0c4de" />
                <path d="M2,12 L14,12 L11,0 L5,0 Z" fill="#231709" />
              </g>
              <g transform="translate(236,138) rotate(22)">
                <path d="M-16,35 L0,35 L-4,12 L-11,12 Z" fill="#b0c4de" />
                <path d="M-14,12 L-2,12 L-5,0 L-11,0 Z" fill="#231709" />
              </g>
            </svg>
          </button>

          <div>
            <h1 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[var(--accent)] leading-tight">
              Krueger Painting OS
            </h1>
            <span className="text-[9.5px] sm:text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider block">
              {settings.motto || 'Precision & Quality'}
            </span>
          </div>
        </div>

        {/* Center / Right: Floating AI Assistant Bubble */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {onOpenAiAssistant && (
            <button
              type="button"
              onClick={onOpenAiAssistant}
              className="relative flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-black text-xs shadow-lg hover:shadow-amber-500/40 hover:scale-105 active:scale-95 transition-all cursor-pointer ring-2 ring-amber-400/60"
              title="Talk to Flip Gemini AI Assistant (Voice & Chat)"
            >
              <span className="text-sm">✨</span>
              <span className="font-black uppercase tracking-wide">Flip AI</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-black"></span>
              </span>
            </button>
          )}

          {onOpenCloudSync && (
            <button
              type="button"
              onClick={onOpenCloudSync}
              className="px-2 sm:px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-purple-500/40 bg-purple-950/40 text-purple-300 hover:bg-purple-900/60 transition-transform active:scale-95 cursor-pointer flex items-center gap-1"
              title="Cloud Sync & Multi-Device Access"
            >
              <span>☁️</span>
              <span className="hidden md:inline">Sync</span>
            </button>
          )}

          {onOpenApkInstaller && (
            <button
              type="button"
              onClick={onOpenApkInstaller}
              className="px-2 sm:px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-blue-500/40 bg-blue-950/40 text-blue-300 hover:bg-blue-900/60 transition-transform active:scale-95 cursor-pointer flex items-center gap-1"
              title="Install Android App / APK"
            >
              <span>📱</span>
              <span className="hidden md:inline">App</span>
            </button>
          )}

          <button
            type="button"
            onClick={onBackup}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-transform active:scale-95 cursor-pointer ${
              isBackupDue
                ? 'bg-red-600 border-red-600 text-white animate-pulse'
                : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            {isBackupDue ? '⚠️ Backup' : 'Backup'}
          </button>

          <label className="px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-bold border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:border-[var(--accent)] transition-transform active:scale-95 cursor-pointer">
            Restore
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onRestore(e.target.files[0]);
                  e.target.value = '';
                }
              }}
            />
          </label>
        </div>
      </div>
    </header>
  );
};
