import React, { useState } from 'react';
import { Cloud, CloudUpload, CloudDownload, RefreshCw, CheckCircle2, ShieldCheck, Laptop, Smartphone, X } from 'lucide-react';
import { Customer, JobProject, FieldNote, ExpenseEntry, MileageEntry, ShoppingItem, PriceBookItem, PrintSettings, SystemConstants } from '../../types';
import { saveWorkspaceToCloud, loadWorkspaceFromCloud, CloudWorkspacePayload } from '../../utils/firebaseSync';
import { auth, signInWithGoogle } from '../../utils/googleWorkspace';

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
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  workspaceData,
  onApplyRemoteWorkspace,
  onToast,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => localStorage.getItem('KMaster_LastCloudSync'));

  if (!isOpen) return null;

  const currentUser = auth.currentUser;

  const handleSyncToCloud = async () => {
    try {
      setIsSyncing(true);
      let userId = currentUser?.uid;

      if (!userId) {
        const res = await signInWithGoogle();
        userId = res.user.uid;
      }

      await saveWorkspaceToCloud(userId, workspaceData);
      const timeStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setLastSyncTime(timeStr);
      localStorage.setItem('KMaster_LastCloudSync', timeStr);
      onToast('✔ Cloud Sync Complete! All data secured in Firestore.');
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        onToast('ℹ Sign-in cancelled');
      } else if (err?.code === 'auth/popup-blocked') {
        onToast('⚠️ Pop-up was blocked by browser');
      } else {
        console.error('Cloud sync error:', err);
        onToast(`❌ Cloud sync failed: ${err.message || 'Please check connection'}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromCloud = async () => {
    try {
      setIsSyncing(true);
      let userId = currentUser?.uid;

      if (!userId) {
        const res = await signInWithGoogle();
        userId = res.user.uid;
      }

      const remoteData = await loadWorkspaceFromCloud(userId);
      if (!remoteData) {
        onToast('ℹ No remote cloud data found yet. Sync this device first.');
        return;
      }

      onApplyRemoteWorkspace(remoteData);
      const timeStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setLastSyncTime(timeStr);
      localStorage.setItem('KMaster_LastCloudSync', timeStr);
      onToast(`✔ Successfully downloaded ${remoteData.customers.length} customer files & notes from cloud!`);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        onToast('ℹ Sign-in cancelled');
      } else if (err?.code === 'auth/popup-blocked') {
        onToast('⚠️ Pop-up was blocked by browser');
      } else {
        console.error('Cloud pull error:', err);
        onToast(`❌ Cloud pull failed: ${err.message || 'Please check connection'}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-[#181920] border border-[var(--border)] rounded-2xl max-w-lg w-full p-6 text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Cloud Saving & Multi-Device Access</h2>
            <p className="text-xs text-zinc-400">Sync estimates, customer files, & notes across all your devices</p>
          </div>
        </div>

        {/* Account Info */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-400">Google & Firebase Account:</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              {currentUser ? 'Connected' : 'Ready to Connect'}
            </span>
          </div>
          <p className="text-sm font-semibold text-zinc-200">
            {currentUser?.email || 'Josh Krueger (kruegerjosh0@gmail.com)'}
          </p>
          <div className="mt-2 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <span>Last Synced:</span>
            <span className="text-zinc-200 font-medium">{lastSyncTime || 'Pending first sync'}</span>
          </div>
        </div>

        {/* Multi-Device Graphic / Explanation */}
        <div className="mb-5 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
          <div className="flex items-center gap-4 justify-center py-2 text-purple-300">
            <div className="flex flex-col items-center gap-1">
              <Smartphone className="w-6 h-6" />
              <span className="text-[11px]">Phone in Field</span>
            </div>
            <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" style={{ animationDuration: '4s' }} />
            <div className="flex flex-col items-center gap-1">
              <Cloud className="w-7 h-7 text-purple-400" />
              <span className="text-[11px] font-bold">Secure Cloud</span>
            </div>
            <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" style={{ animationDuration: '4s' }} />
            <div className="flex flex-col items-center gap-1">
              <Laptop className="w-6 h-6" />
              <span className="text-[11px]">Office Computer</span>
            </div>
          </div>
          <p className="text-xs text-center text-zinc-300 mt-2">
            Any job or estimate you create on your phone is automatically backed up and immediately accessible when you open the app on your computer or tablet!
          </p>
        </div>

        {/* Sync Actions */}
        <div className="space-y-3">
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

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold rounded-xl transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
