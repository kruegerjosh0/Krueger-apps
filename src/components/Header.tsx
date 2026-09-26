import React, { useState } from 'react';
import { PrintSettings } from '../types';
import { User } from 'firebase/auth';

interface HeaderProps {
  settings: PrintSettings;
  isBackupDue: boolean;
  currentUser?: User | null;
  onBackup: () => void;
  onRestore: (file: File) => void;
  onOpenNewCustomer: () => void;
  onNavigateTab: (tab: 'dash' | 'sched' | 'weather' | 'notes' | 'tools') => void;
  onOpenCalc: () => void;
  onOpenAiAssistant?: () => void;
  onOpenCloudSync?: () => void;
  onOpenAccountModal?: () => void;
  onOpenApkInstaller?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  isBackupDue,
  currentUser,
  onBackup,
  onRestore,
  onOpenNewCustomer,
  onNavigateTab,
  onOpenCalc,
  onOpenAiAssistant,
  onOpenCloudSync,
  onOpenAccountModal,
  onOpenApkInstaller,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[var(--surface)] backdrop-blur-md border-b-2 border-[var(--accent)] px-2 sm:px-4 py-2 sm:py-2.5 shadow-lg w-full max-w-full overflow-hidden">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Left: Logo & Brand */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenAiAssistant}
            className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full border-2 border-[var(--accent)] bg-[var(--surface-subtle)] flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer p-0.5"
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

          <div className="min-w-0 truncate">
            <h1 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-[var(--accent)] leading-tight truncate">
              Krueger Painting
            </h1>
            <span className="text-[9px] sm:text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider truncate block">
              {settings.motto || 'OS'}
            </span>
          </div>
        </div>

        {/* Center / Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {onOpenAiAssistant && (
            <button
              type="button"
              onClick={onOpenAiAssistant}
              className="relative flex items-center gap-1 px-2 sm:px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-black text-[11px] sm:text-xs shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer ring-1.5 sm:ring-2 ring-amber-400/60"
              title="Talk to Flip Gemini AI Assistant"
            >
              <span className="text-xs sm:text-sm">✨</span>
              <span className="font-black uppercase tracking-wide text-[10px] sm:text-xs">Flip</span>
              <span className="flex h-1.5 w-1.5 sm:h-2 sm:w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-black"></span>
              </span>
            </button>
          )}

          {/* Account Login Button */}
          {onOpenAccountModal && (
            <button
              type="button"
              onClick={onOpenAccountModal}
              className={`px-1.5 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold border transition-transform active:scale-95 cursor-pointer flex items-center gap-1 ${
                currentUser
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60'
                  : 'border-purple-500/40 bg-purple-950/40 text-purple-300 hover:bg-purple-900/60'
              }`}
              title={currentUser ? `Signed in as ${currentUser.email || 'Josh Krueger'}` : 'Sign in'}
            >
              <span className="text-xs">👤</span>
              <span className="hidden md:inline font-bold">
                {currentUser ? (currentUser.email ? currentUser.email.split('@')[0] : 'Logged In') : 'Login'}
              </span>
              {currentUser && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
            </button>
          )}

          {/* Backup Button (visible on screens >= 370px) */}
          {onOpenCloudSync && (
            <button
              type="button"
              onClick={onOpenCloudSync}
              className="hidden min-[370px]:flex px-1.5 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-transform active:scale-95 cursor-pointer items-center gap-1"
              title="Backup & Restore Data (Phone & Google Drive)"
            >
              <span>💾</span>
              <span className="hidden lg:inline">Backup</span>
            </button>
          )}

          {/* App Button (visible on tablet/desktop) */}
          {onOpenApkInstaller && (
            <button
              type="button"
              onClick={onOpenApkInstaller}
              className="hidden sm:flex px-2 sm:px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-blue-500/40 bg-blue-950/40 text-blue-300 hover:bg-blue-900/60 transition-transform active:scale-95 cursor-pointer items-center gap-1"
              title="Install Android App / APK"
            >
              <span>📱</span>
              <span className="hidden lg:inline">App</span>
            </button>
          )}

          {/* Backup Button (visible on tablet/desktop) */}
          <button
            type="button"
            onClick={onBackup}
            className={`hidden sm:inline-flex px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-transform active:scale-95 cursor-pointer ${
              isBackupDue
                ? 'bg-red-600 border-red-600 text-white animate-pulse'
                : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            {isBackupDue ? '⚠️ Backup' : 'Backup'}
          </button>

          {/* Restore Button (visible on tablet/desktop) */}
          <label className="hidden sm:inline-flex px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-bold border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:border-[var(--accent)] transition-transform active:scale-95 cursor-pointer">
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

          {/* Mobile Overflow Menu Button (< sm / folded phones) */}
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="px-2 py-1.5 rounded-lg text-xs font-bold border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
              title="More Options"
            >
              ⋯
            </button>

            {mobileMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-40 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl p-1.5 z-50 space-y-1 animate-in fade-in">
                {onOpenCloudSync && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenCloudSync();
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-purple-300 hover:bg-[var(--surface-subtle)] rounded-lg flex items-center gap-1.5"
                  >
                    <span>☁️</span>
                    <span>Cloud Sync</span>
                  </button>
                )}
                {onOpenApkInstaller && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenApkInstaller();
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-blue-300 hover:bg-[var(--surface-subtle)] rounded-lg flex items-center gap-1.5"
                  >
                    <span>📱</span>
                    <span>Android APK App</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onBackup();
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-subtle)] rounded-lg flex items-center gap-1.5"
                >
                  <span>💾</span>
                  <span>Backup System</span>
                </button>
                <label className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-subtle)] rounded-lg flex items-center gap-1.5 cursor-pointer">
                  <span>📂</span>
                  <span>Restore Backup</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      setMobileMenuOpen(false);
                      if (e.target.files && e.target.files[0]) {
                        onRestore(e.target.files[0]);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
