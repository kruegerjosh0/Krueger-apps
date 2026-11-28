import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { Cloud, RefreshCw, LogOut, ShieldCheck, Lock, AlertTriangle } from 'lucide-react';
import { ADMIN_CLOUD_EMAIL } from '../utils/firebaseSync';

export type CloudSyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface CloudSyncAccountProps {
  currentUser: User | null;
  isAuthorizedAdmin: boolean;
  authReady: boolean;
  syncState: CloudSyncState;
  lastSyncLabel: string | null;
  syncError: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
  onForceSync: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const CloudSyncAccountCard: React.FC<CloudSyncAccountProps> = ({
  currentUser,
  isAuthorizedAdmin,
  authReady,
  syncState,
  lastSyncLabel,
  syncError,
  onSignIn,
  onPasswordReset,
  onForceSync,
  onSignOut,
}) => {
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [emailInput, setEmailInput] = useState(ADMIN_CLOUD_EMAIL);
  const [passwordInput, setPasswordInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormNotice(null);

    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail || !passwordInput) {
      setFormError('Please enter both your admin email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await onSignIn(trimmedEmail, passwordInput);
      setPasswordInput('');
      setShowLoginForm(false);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setFormError('Incorrect email or password. Use the same login as kruegerpaintingwi.com.');
      } else if (code === 'auth/too-many-requests') {
        setFormError('Too many failed attempts. Please wait a moment or reset your password.');
      } else if (code === 'auth/network-request-failed') {
        setFormError('No internet connection. Connect to Wi-Fi or cellular data to sign in.');
      } else {
        setFormError(err?.message || 'Sign in failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    setFormError(null);
    setFormNotice(null);
    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail) {
      setFormError('Type your email address above first to send a password reset link.');
      return;
    }
    setSubmitting(true);
    try {
      await onPasswordReset(trimmedEmail);
      setFormNotice('Password reset email sent! Check your inbox or spam folder.');
    } catch (err: any) {
      setFormError(err?.message || 'Could not send password reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  const isSyncing = syncState === 'syncing';

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
              isAuthorizedAdmin
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--accent)]'
            }`}
          >
            <Cloud className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-[var(--text)] leading-tight">
              Cloud Sync Account
            </h3>
            <p className="text-[10px] text-[var(--text-muted)] truncate">
              {!authReady
                ? 'Checking saved session...'
                : isAuthorizedAdmin
                  ? 'Automatic two-way Firestore sync enabled'
                  : 'Local device storage only'}
            </p>
          </div>
        </div>

        <span
          className={`text-[9.5px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${
            isAuthorizedAdmin
              ? syncState === 'offline'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border-[var(--border)]'
          }`}
        >
          {isAuthorizedAdmin ? (syncState === 'offline' ? 'Offline' : 'Active') : 'Local Only'}
        </span>
      </div>

      {/* SIGNED IN AS AUTHORIZED ADMIN */}
      {currentUser && isAuthorizedAdmin && (
        <div className="space-y-2.5">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="break-all">
                Signed in as {ADMIN_CLOUD_EMAIL} &bull; Cloud Sync Active
              </span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)] pl-5">
              {isSyncing
                ? 'Syncing latest changes with cloud...'
                : syncState === 'offline'
                  ? 'Offline — changes saved locally & queued for sync'
                  : lastSyncLabel
                    ? `Last synced ${lastSyncLabel} • Auto-syncs across your phone & tablet`
                    : 'Auto-syncs customers, estimates, final bills, notes & mileage'}
            </div>
          </div>

          {syncError && (
            <div className="flex items-start gap-2 text-[11px] text-red-300 bg-red-950/40 border border-red-500/30 rounded-xl p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
              <span>{syncError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onForceSync}
              disabled={isSyncing}
              className="py-2.5 px-3 bg-[var(--accent)] hover:opacity-95 disabled:opacity-60 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Force Sync Now'}</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              disabled={isSyncing}
              className="py-2.5 px-3 bg-[var(--surface-subtle)] hover:border-red-500/50 hover:text-red-300 disabled:opacity-60 text-[var(--text)] font-bold text-xs rounded-xl border border-[var(--border)] flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* SIGNED IN AS UNAUTHORIZED ACCOUNT (CLOUD STRICTLY DISABLED) */}
      {currentUser && !isAuthorizedAdmin && (
        <div className="space-y-2.5">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>Cloud Sync Restricted to Admin Account</span>
            </div>
            <p className="text-[10.5px] text-[var(--text-muted)] leading-relaxed">
              Signed in as <strong className="text-[var(--text)]">{currentUser.email || 'unknown account'}</strong>. All cloud reads &amp; writes are disabled and this device is using local storage only.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full py-2.5 px-3 bg-[var(--surface-subtle)] hover:border-red-500/50 text-[var(--text)] font-bold text-xs rounded-xl border border-[var(--border)] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      )}

      {/* SIGNED OUT */}
      {!currentUser && (
        <div className="space-y-2.5">
          {!showLoginForm ? (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setFormNotice(null);
                setShowLoginForm(true);
              }}
              className="w-full py-2.5 px-3.5 bg-[#f1c40f] hover:opacity-95 text-[#111111] font-black text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign In to Sync (Admin Account)</span>
            </button>
          ) : (
            <form onSubmit={handleSubmitLogin} className="space-y-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3">
              <div className="text-[10.5px] text-[var(--text-muted)]">
                Use the same Firebase email &amp; password as your <strong className="text-[var(--text)]">kruegerpaintingwi.com</strong> admin portal.
              </div>

              <div>
                <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={ADMIN_CLOUD_EMAIL}
                  autoComplete="username"
                  required
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-2 text-xs outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter admin password"
                  autoComplete="current-password"
                  required
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-2 text-xs outline-none focus:border-[var(--accent)]"
                />
              </div>

              {formError && (
                <div className="text-[11px] text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-2">
                  {formError}
                </div>
              )}

              {formNotice && (
                <div className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2">
                  {formNotice}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowLoginForm(false);
                    setPasswordInput('');
                    setFormError(null);
                    setFormNotice(null);
                  }}
                  disabled={submitting}
                  className="px-3 py-2 bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--text)] font-bold text-xs rounded-lg border border-[var(--border)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-[#f1c40f] hover:opacity-95 disabled:opacity-60 text-[#111111] font-black text-xs rounded-lg shadow cursor-pointer"
                >
                  {submitting ? 'Signing In...' : 'Sign In'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleReset}
                disabled={submitting}
                className="w-full text-[10.5px] text-[var(--accent)] hover:underline text-center pt-0.5 cursor-pointer"
              >
                Forgot Password? Send Reset Email
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
