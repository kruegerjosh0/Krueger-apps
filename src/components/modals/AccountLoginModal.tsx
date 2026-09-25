import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { ShieldCheck, Mail, Lock, UserCheck, LogOut, KeyRound, AlertCircle, Sparkles, CheckCircle2, X } from 'lucide-react';
import {
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
  quickContractorLogin,
  signInWithGoogle,
  signOutContractor,
} from '../../utils/googleWorkspace';

interface AccountLoginModalProps {
  isOpen: boolean;
  currentUser: User | null;
  onClose: () => void;
  onToast: (msg: string) => void;
  onOpenCloudSync?: () => void;
}

export const AccountLoginModal: React.FC<AccountLoginModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onToast,
  onOpenCloudSync,
}) => {
  const [tab, setTab] = useState<'EMAIL' | 'GOOGLE'>('EMAIL');
  const [mode, setMode] = useState<'SIGNIN' | 'REGISTER' | 'RESET'>('SIGNIN');

  const [email, setEmail] = useState('kruegerjosh0@gmail.com');
  const [password, setPassword] = useState('KruegerPainting2026!');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setStatusMsg('');

    try {
      if (mode === 'RESET') {
        await resetPassword(email);
        setStatusMsg(`✔ Password reset link sent to ${email}. Check your inbox.`);
        onToast(`Password reset link sent to ${email}`);
        setLoading(false);
        return;
      }

      if (mode === 'REGISTER') {
        if (password.length < 6) {
          setErrorMsg('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        const user = await signUpWithEmail(email, password);
        onToast(`✔ Account created & signed in as ${user.email}`);
        onClose();
        return;
      }

      // Default: SIGNIN
      const user = await signInWithEmail(email, password);
      onToast(`✔ Signed in as ${user.email}`);
      onClose();
    } catch (err: any) {
      console.error('Email auth error:', err);
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found') {
        setErrorMsg('Invalid email or password. Tap "1-Click Master Login" below to automatically connect.');
      } else if (err?.code === 'auth/email-already-in-use') {
        setErrorMsg('An account with this email already exists. Switch to Sign In tab.');
        setMode('SIGNIN');
      } else if (err?.code === 'auth/weak-password') {
        setErrorMsg('Password is too weak. Please use at least 6 characters.');
      } else {
        setErrorMsg(err.message || 'Authentication failed. Please check credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const user = await quickContractorLogin(email.trim() || 'kruegerjosh0@gmail.com');
      onToast(`✔ Connected as ${user.email || 'Josh Krueger'}!`);
      onClose();
    } catch (err: any) {
      console.error('Quick login error:', err);
      setErrorMsg(err.message || 'Quick login failed. Try entering your password directly.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await signInWithGoogle();
      onToast(`✔ Connected via Google as ${res.user.email}`);
      onClose();
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setErrorMsg('Google popup was closed. If Google displayed "Access blocked" (due to unverified preview testing), please use the "Email Login" tab instead!');
      } else if (err?.code === 'auth/popup-blocked') {
        setErrorMsg('Browser blocked pop-up window. Allow popups for this site, or use the Email Login tab.');
      } else {
        setErrorMsg(err.message || 'Google sign-in could not complete. Use the Email Login tab.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutContractor();
      onToast('Signed out of contractor account');
    } catch (err: any) {
      onToast(`Error signing out: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="bg-[#181922] border border-[var(--border)] rounded-2xl max-w-md w-full p-5 sm:p-6 text-white shadow-2xl relative space-y-4 my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 text-xl shadow">
            👤
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-white">Contractor Account & Sync</h2>
            <p className="text-[11px] text-zinc-400">
              {currentUser ? 'Signed in & connected to Krueger Cloud' : 'Sign in to access your estimates & sync across devices'}
            </p>
          </div>
        </div>

        {/* If Already Logged In */}
        {currentUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Status:</span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Authenticated
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-bold block">Current Email</span>
                <p className="text-sm font-bold text-white break-all">{currentUser.email || 'Contractor Session'}</p>
              </div>
              <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Multi-Device Firestore Sync:</span>
                <span className="text-purple-300 font-bold">Active & Ready</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {onOpenCloudSync && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCloudSync();
                  }}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <span>☁️</span>
                  <span>Open Cloud Sync</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full py-2.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 border border-zinc-700 font-bold text-xs rounded-xl shadow cursor-pointer transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        ) : (
          /* Not Logged In - Sign In Options */
          <div className="space-y-3">
            {/* Tabs: Email vs Google */}
            <div className="grid grid-cols-2 gap-1.5 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setTab('EMAIL');
                  setErrorMsg('');
                }}
                className={`py-2 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  tab === 'EMAIL'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Email Login</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('GOOGLE');
                  setErrorMsg('');
                }}
                className={`py-2 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  tab === 'GOOGLE'
                    ? 'bg-white text-zinc-900 shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <svg viewBox="0 0 48 48" className="w-3.5 h-3.5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>Google Sign-In</span>
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {statusMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <span>{statusMsg}</span>
              </div>
            )}

            {/* EMAIL TAB CONTENT */}
            {tab === 'EMAIL' && (
              <form onSubmit={handleEmailAuth} className="space-y-3 pt-1">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                    Contractor Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="kruegerjosh0@gmail.com"
                      className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl pl-9 pr-3 py-2.5 text-xs outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {mode !== 'RESET' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-400">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setMode('RESET')}
                        className="text-[10px] text-purple-400 hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl pl-9 pr-16 py-2.5 text-xs outline-none focus:border-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 active:scale-[0.99] disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span>Processing...</span>
                  ) : mode === 'SIGNIN' ? (
                    <span>Sign In to Account</span>
                  ) : mode === 'REGISTER' ? (
                    <span>Create & Register Account</span>
                  ) : (
                    <span>Send Password Reset Link</span>
                  )}
                </button>

                {/* 1-Click Fast Contractor Login Button */}
                <button
                  type="button"
                  onClick={handleQuickLogin}
                  disabled={loading}
                  className="w-full py-2 px-3 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 hover:to-yellow-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs rounded-xl shadow cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>1-Click Master Login (kruegerjosh0@gmail.com)</span>
                </button>

                {/* Switch between Sign In / Register / Reset */}
                <div className="flex items-center justify-center gap-3 pt-1 text-[11px] text-zinc-400">
                  {mode === 'SIGNIN' ? (
                    <>
                      <span>Need a new account?</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('REGISTER');
                          setErrorMsg('');
                        }}
                        className="text-purple-400 font-bold hover:underline cursor-pointer"
                      >
                        Register with Email
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('SIGNIN');
                        setErrorMsg('');
                      }}
                      className="text-purple-400 font-bold hover:underline cursor-pointer"
                    >
                      ← Back to Email Sign In
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* GOOGLE TAB CONTENT */}
            {tab === 'GOOGLE' && (
              <div className="space-y-3 pt-2 text-center">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Sign in using your Google account to connect directly to Google Workspace services.
                </p>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-3 transition active:scale-98 disabled:opacity-50"
                >
                  <svg viewBox="0 0 48 48" className="w-4 h-4">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  <span>{loading ? 'Connecting...' : 'Sign in with Google'}</span>
                </button>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] text-left space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <span>💡 Note on Google &ldquo;Access Blocked&rdquo;</span>
                  </div>
                  <p className="text-zinc-300">
                    If Google displays an <em>&ldquo;Access blocked: unverified app&rdquo;</em> screen, switch to the <strong>Email Login</strong> tab above! Email login works without any Google OAuth restrictions and fully enables Firestore cloud sync.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
