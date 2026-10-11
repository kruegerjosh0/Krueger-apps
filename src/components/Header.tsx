import React, { useState } from 'react';
import { PrintSettings } from '../types';
import { User } from 'firebase/auth';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface HeaderProps {
  settings: PrintSettings;
  isBackupDue: boolean;
  currentUser?: User | null;
  onBackup: () => void;
  onRestore: (file: File) => void;
  onOpenNewCustomer: () => void;
  onNavigateTab: (tab: 'dash' | 'weather' | 'notes' | 'tools') => void;
  onOpenCalc: () => void;
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
  onOpenCloudSync,
  onOpenAccountModal,
  onOpenApkInstaller,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else if (onOpenApkInstaller) {
      onOpenApkInstaller();
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[var(--surface)] backdrop-blur-md border-b-2 border-[var(--accent)] px-2 sm:px-4 py-2 sm:py-2.5 shadow-lg w-full max-w-full overflow-hidden">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Left: Logo & Brand */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full border-2 border-[var(--accent)] bg-[var(--surface-subtle)] flex items-center justify-center shadow-md p-0.5">
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
          </div>

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
        </div>
      </div>
    </header>
  );
};
