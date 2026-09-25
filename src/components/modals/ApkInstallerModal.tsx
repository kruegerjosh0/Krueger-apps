import React, { useState, useEffect } from 'react';
import { Smartphone, Download, CheckCircle2, Globe, Shield, ArrowRight, Copy, ExternalLink, X } from 'lucide-react';

interface ApkInstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const ApkInstallerModal: React.FC<ApkInstallerModalProps> = ({ isOpen, onClose, onToast }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    // Detect if already installed / running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  if (!isOpen) return null;

  const currentUrl = window.location.origin;

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        onToast('✔ Installing Krueger Painting OS to your device...');
        setDeferredPrompt(null);
      }
    } else {
      onToast('👉 Tap Chrome/Browser menu (⋮) and select "Install app" or "Add to Home Screen"');
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedUrl(true);
    onToast('✔ App URL copied to clipboard');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#181920] border border-[var(--border)] rounded-2xl max-w-xl w-full p-6 text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Android APK & App Installation</h2>
            <p className="text-xs text-zinc-400">Run Krueger Painting OS as a native Android app</p>
          </div>
        </div>

        {isStandalone ? (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-400">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">
              You are currently running Krueger Painting OS in installed Standalone Native App mode!
            </p>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
            <h3 className="text-sm font-semibold text-blue-300 flex items-center gap-2 mb-1">
              <span>🚀 Option 1: Instant Native Install (PWA - Recommended)</span>
            </h3>
            <p className="text-xs text-zinc-300 mb-3">
              Installs Krueger Painting OS directly to your Android home screen and app drawer. It removes the browser address bar, launches in full screen, has full offline caching, and gives you a 100% native app experience without needing Google Play.
            </p>
            <button
              onClick={handleInstallPwa}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {deferredPrompt ? '1-Tap Install App to This Device' : 'Install to Home Screen / Device'}
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4" />
              Option 2: Generate Standalone .APK File (Google Play / Sideload)
            </h3>
            <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
              If you specifically want a downloadable <strong>.apk file</strong> to install directly onto Android devices or distribute to crew members, our app is fully configured as a <strong>Trusted Web Activity (TWA)</strong>:
            </p>

            <ol className="text-xs text-zinc-300 space-y-2 list-decimal list-inside mb-4">
              <li>
                Copy your live app URL:
                <div className="flex items-center gap-2 mt-1 bg-black/50 p-2 rounded-lg border border-zinc-800">
                  <span className="font-mono text-zinc-300 text-[11px] truncate flex-1">{currentUrl}</span>
                  <button
                    onClick={handleCopyUrl}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] rounded flex items-center gap-1 shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedUrl ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </li>
              <li>
                Open <strong>PWABuilder.com</strong> (Google & Microsoft's official APK packager):
              </li>
              <li>
                Paste your app URL and click <strong>"Build APK"</strong>. PWABuilder bundles the Web Manifest and generates a signed <strong>.apk</strong> file in under 60 seconds!
              </li>
              <li>
                Transfer the generated .apk to your Android phone or tablet and tap to install.
              </li>
            </ol>

            <a
              href={`https://www.pwabuilder.com/?site=${encodeURIComponent(currentUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-semibold rounded-lg transition border border-amber-500/20"
            >
              <span>Open PWABuilder Generator</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Pre-configured PWA Features Included:
            </div>
            <p>• Web App Manifest (`manifest.json`) with custom Krueger Painting app icons</p>
            <p>• Service Worker (`sw.js`) with offline caching for field and truck use</p>
            <p>• Cloud sync via Firebase for multi-device data synchronization</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
