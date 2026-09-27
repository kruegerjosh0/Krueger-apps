import React, { useState } from 'react';
import { Smartphone, Download, CheckCircle2, Shield, Copy, ExternalLink, X, HelpCircle, Check } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface ApkInstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const ApkInstallerModal: React.FC<ApkInstallerModalProps> = ({ isOpen, onClose, onToast }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        onToast('✔ Installing Krueger Painting OS to your home screen!');
        onClose();
        return;
      }
    }
    // If not installable via one-click prompt (or already prompted), show the visual guide
    setShowGuide(true);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedUrl(true);
    onToast('✔ App URL copied to clipboard');
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#181920] border border-[var(--border)] rounded-2xl max-w-xl w-full p-4 sm:p-6 text-white shadow-2xl relative my-auto">
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4 sm:mb-5">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold">Install Krueger Painting OS</h2>
            <p className="text-xs text-zinc-400">Run as a native app on your phone, tablet, or PC</p>
          </div>
        </div>

        {/* Status: Already installed */}
        {isInstalled ? (
          <div className="mb-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-400">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">App is Installed & Running in Standalone Mode!</p>
              <p className="text-xs text-emerald-300/80 mt-0.5">
                Krueger Painting OS is active on this device with full offline caching and home screen access.
              </p>
            </div>
          </div>
        ) : (
          /* OPTION 1: 1-Tap PWA Install */
          <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-amber-500/15 via-yellow-500/10 to-amber-600/15 border border-amber-500/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <span>⭐ Recommended</span>
              </span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                100% Offline Capable
              </span>
            </div>

            <h3 className="text-sm sm:text-base font-bold text-white mb-1">
              Add to Home Screen / Install Native App
            </h3>
            <p className="text-xs text-zinc-300 mb-3.5 leading-relaxed">
              Installs Krueger Painting OS directly to your home screen with its own icon. Hides the browser address bar, launches in full screen, and works offline on job sites.
            </p>

            <button
              onClick={handleInstallClick}
              className="w-full py-3 px-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-400 text-black text-sm font-black rounded-xl transition flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-98"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isInstallable ? 'Install App to Home Screen' : 'Install / Add to Home Screen'}
              </span>
            </button>

            {/* Visual Guide (shown if browser requires manual menu tap) */}
            {(!isInstallable || showGuide) && (
              <div className="mt-3.5 pt-3.5 border-t border-amber-500/20 space-y-2 text-xs">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" />
                  <span>How to install in Chrome / Safari in 5 seconds:</span>
                </div>

                {isIOS ? (
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-200 bg-black/40 p-2.5 rounded-lg border border-zinc-800">
                    <li>Tap the <strong>Share</strong> button (square with arrow ↑) at the bottom of Safari.</li>
                    <li>Scroll down and tap <strong>"Add to Home Screen"</strong> (➕).</li>
                    <li>Tap <strong>"Add"</strong> in the top right.</li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-200 bg-black/40 p-2.5 rounded-lg border border-zinc-800">
                    <li>Tap Chrome's menu: the <strong>3 vertical dots (⋮)</strong> in the top-right corner.</li>
                    <li>Tap <strong className="text-amber-300">"Install app"</strong> or <strong className="text-amber-300">"Add to Home screen"</strong>.</li>
                    <li>Tap <strong>"Install"</strong> — the Krueger Painting app icon will appear directly on your home screen!</li>
                  </ol>
                )}
              </div>
            )}
          </div>
        )}

        {/* Why downloading raw files caused code view explanation */}
        <div className="mb-4 p-3 rounded-xl bg-black/40 border border-zinc-800 text-[11px] text-zinc-300 leading-relaxed">
          <p className="font-bold text-amber-400 mb-1">
            💡 Why did downloading a file previously show code on your screen?
          </p>
          <p>
            When downloading raw HTML files to a phone, Android tries to open them using a basic text/code viewer instead of launching them as an active web application. Installing directly via <strong>Chrome menu (⋮) ➔ Install app</strong> avoids file downloads entirely and creates a real, fast home-screen app that saves all your jobs and customer data!
          </p>
        </div>

        {/* Option 2: PWABuilder .APK generation */}
        <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Need a standalone .APK file for sideloading?</span>
            </h4>
          </div>
          <p className="text-[11px] text-zinc-400">
            You can generate a signed Android APK in 60 seconds with PWABuilder (official Google & Microsoft tool):
          </p>
          <div className="flex items-center gap-2 bg-black/60 p-2 rounded-lg border border-zinc-800">
            <span className="font-mono text-zinc-300 text-[10.5px] truncate flex-1">{currentUrl}</span>
            <button
              onClick={handleCopyUrl}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded flex items-center gap-1 shrink-0 cursor-pointer"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>
          <a
            href={`https://www.pwabuilder.com/?site=${encodeURIComponent(currentUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-blue-300 text-xs font-bold rounded-lg transition border border-blue-500/20 cursor-pointer"
          >
            <span>Open PWABuilder.com</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
