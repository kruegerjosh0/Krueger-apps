import React, { useState, useEffect } from 'react';
import { Cloud, CloudUpload, CloudDownload, RefreshCw, CheckCircle2, ShieldCheck, Laptop, Smartphone, X, Mail, Sparkles, LogOut } from 'lucide-react';
import { Customer, JobProject, FieldNote, ExpenseEntry, MileageEntry, ShoppingItem, PriceBookItem, PrintSettings, SystemConstants } from '../../types';
import { saveWorkspaceToCloud, loadWorkspaceFromCloud, CloudWorkspacePayload } from '../../utils/firebaseSync';
import {
  auth,
  signInWithGoogle,
  signInWithEmail,
  quickContractorLogin,
  signOutContractor,
  subscribeToAuth,
} from '../../utils/googleWorkspace';
import { User } from 'firebase/auth';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceData: {
    customers: Customer[];
    notes: FieldNote[];
    expenses: ExpenseEntry[];
    mileage: MileageEntry[];
    shoppingList: ShoppingItem[];
    priceBook: PriceBookItem[];
    settings: PrintSettings;
    constants: SystemConstants;
  };
  onApplyRemoteWorkspace: (payload: CloudWorkspacePayload) => void;
  onToast: (msg: string) => void;
  onOpenAccountModal?: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  workspaceData,
  onApplyRemoteWorkspace,
  onToast,
  onOpenAccountModal,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => localStorage.getItem('KMaster_LastCloudSync'));
  const [authError, setAuthError] = useState('');
  const [emailInput, setEmailInput] = useState('kruegerjosh0@gmail.com');
  const [passInput, setPassInput] = useState('KruegerPainting2026!');
  const [showManualLogin, setShowManualLogin] = useState(false);

  useEffect(() => {
    const unsub = subscribeToAuth((user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const ensureAuthenticated = async (): Promise<string | null> => {
    if (currentUser?.uid) return currentUser.uid;
    if (auth.currentUser?.uid) return auth.currentUser.uid;

    // Try quick 1-click login for Josh
    try {
      const u = await quickContractorLogin(emailInput.trim() || 'kruegerjosh0@gmail.com');
      setCurrentUser(u);
      return u.uid;
    } catch {
      // If quick login failed, ask user to log in
      setShowManualLogin(true);
      throw new Error('Please sign in with your email or password below.');
    }
  };

  const handleManualEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsSyncing(true);
    try {
      const u = await signInWithEmail(emailInput.trim(), passInput);
      setCurrentUser(u);
      onToast(`✔ Signed in as ${u.email}`);
      setShowManualLogin(false);
    } catch (err: any) {
      setAuthError(err.message || 'Login failed. Please verify email and password.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleQuickLogin = async () => {
    setAuthError('');
    setIsSyncing(true);
    try {
      const u = await quickContractorLogin('kruegerjosh0@gmail.com');
      setCurrentUser(u);
      onToast(`✔ Signed in as ${u.email || 'Josh Krueger'}`);
      setShowManualLogin(false);
    } catch (err: any) {
      setAuthError(err.message || 'Quick login failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncToCloud = async () => {
    try {
      setIsSyncing(true);
      setAuthError('');
      const userId = await ensureAuthenticated();
      if (!userId) return;

      await saveWorkspaceToCloud(userId, workspaceData);
      const timeStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setLastSyncTime(timeStr);
      localStorage.setItem('KMaster_LastCloudSync', timeStr);
      localStorage.setItem('KMaster_LastCloudSyncTimestamp', String(Date.now()));
      onToast('✔ Cloud Sync Complete! All data secured in Firestore.');
    } catch (err: any) {
      console.error('Cloud sync error:', err);
      onToast(`❌ Cloud sync failed: ${err.message || 'Please check connection'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromCloud = async () => {
    try {
      setIsSyncing(true);
      setAuthError('');
      const userId = await ensureAuthenticated();
      if (!userId) return;

      const remoteData = await loadWorkspaceFromCloud(userId);
      if (!remoteData) {
        onToast('ℹ No remote cloud data found yet. Sync this device first.');
        return;
      }

      onApplyRemoteWorkspace(remoteData);
      const timeStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setLastSyncTime(timeStr);
      localStorage.setItem('KMaster_LastCloudSync', timeStr);
      localStorage.setItem('KMaster_LastCloudSyncTimestamp', String(Date.now()));
      onToast(`✔ Successfully downloaded ${remoteData.customers.length} customer files & notes from cloud!`);
    } catch (err: any) {
      console.error('Cloud pull error:', err);
      onToast(`❌ Cloud pull failed: ${err.message || 'Please check connection'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="bg-[#181920] border border-[var(--border)] rounded-2xl max-w-lg w-full p-5 sm:p-6 text-white shadow-2xl relative space-y-4 my-auto max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold">Cloud Saving & Multi-Device Access</h2>
            <p className="text-xs text-zinc-400">Sync estimates, customer files, & notes across all your devices</p>
          </div>
        </div>

        {/* Account Info Box */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Account Authentication:</span>
            <span className={`flex items-center gap-1.5 text-xs font-semibold ${currentUser ? 'text-emerald-400' : 'text-amber-400'}`}>
              <ShieldCheck className="w-4 h-4" />
              {currentUser ? 'Connected (Firestore Synced)' : 'Ready to Connect'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-200 break-all">
              {currentUser?.email || 'Josh Krueger (kruegerjosh0@gmail.com)'}
            </p>
            {currentUser && (
              <button
                type="button"
                onClick={async () => {
                  await signOutContractor();
                  setCurrentUser(null);
                  onToast('Signed out of cloud account');
                }}
                className="text-[10px] text-zinc-400 hover:text-red-400 font-bold ml-2 cursor-pointer flex items-center gap-1 shrink-0"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <span>Last Synced:</span>
            <span className="text-zinc-200 font-medium">{lastSyncTime || 'Pending first sync'}</span>
          </div>
        </div>

        {/* Not Connected Options */}
        {!currentUser && (
          <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-300">Quick Email Login:</span>
              <button
                type="button"
                onClick={() => setShowManualLogin(!showManualLogin)}
                className="text-[11px] text-purple-400 hover:underline cursor-pointer"
              >
                {showManualLogin ? 'Hide Password Box' : 'Enter Custom Password'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleQuickLogin}
              disabled={isSyncing}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 hover:to-yellow-500/30 border border-amber-500/40 text-amber-300 font-extrabold text-xs rounded-xl shadow cursor-pointer transition flex items-center justify-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>1-Click Login as Josh Krueger (kruegerjosh0@gmail.com)</span>
            </button>

            {showManualLogin && (
              <form onSubmit={handleManualEmailLogin} className="space-y-2 pt-2 border-t border-purple-500/20">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="kruegerjosh0@gmail.com"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
                <input
                  type="password"
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  Sign In with Email
                </button>
              </form>
            )}

            {authError && (
              <div className="text-red-400 text-xs p-2 rounded bg-red-950/40 border border-red-500/30">
                {authError}
              </div>
            )}
          </div>
        )}

        {/* Multi-Device Graphic */}
        <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30">
          <div className="flex items-center gap-4 justify-center py-1 text-purple-300">
            <div className="flex flex-col items-center gap-1">
              <Smartphone className="w-5 h-5" />
              <span className="text-[10px]">Phone in Field</span>
            </div>
            <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" style={{ animationDuration: '4s' }} />
            <div className="flex flex-col items-center gap-1">
              <Cloud className="w-6 h-6 text-purple-400" />
              <span className="text-[10px] font-bold">Secure Cloud</span>
            </div>
            <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" style={{ animationDuration: '4s' }} />
            <div className="flex flex-col items-center gap-1">
              <Laptop className="w-5 h-5" />
              <span className="text-[10px]">Office Computer</span>
            </div>
          </div>
          <p className="text-[11px] text-center text-zinc-300 mt-2">
            Any job or estimate you create on your phone is automatically backed up and immediately accessible when you open the app on your computer or tablet!
          </p>
        </div>

        {/* Sync Actions */}
        <div className="space-y-2.5">
          <button
            onClick={handleSyncToCloud}
            disabled={isSyncing}
            className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <CloudUpload className="w-4 h-4" />
            {isSyncing ? 'Syncing with Firestore...' : 'Push Current Device Data to Cloud'}
          </button>

          <button
            onClick={handlePullFromCloud}
            disabled={isSyncing}
            className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.99] disabled:opacity-50 text-zinc-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 border border-zinc-700 cursor-pointer"
          >
            <CloudDownload className="w-4 h-4" />
            Pull Latest Cloud Data to this Device
          </button>
        </div>

        <div className="mt-4 flex justify-between items-center pt-2 border-t border-zinc-800">
          {onOpenAccountModal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAccountModal();
              }}
              className="text-xs text-purple-400 hover:underline cursor-pointer"
            >
              👤 Manage Account & Password
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer ml-auto"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

