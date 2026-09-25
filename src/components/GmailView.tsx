import React, { useState, useEffect } from 'react';
import { Customer } from '../types';
import {
  signInWithGoogle,
  signOutGoogle,
  fetchGmailMessages,
  fetchGmailMessageDetails,
  sendGmailMessage,
  GmailMessageSummary,
  GmailFullMessage,
  subscribeToAuth,
} from '../utils/googleWorkspace';
import { User } from 'firebase/auth';

interface GmailViewProps {
  customers: Customer[];
  onOpenCustomerFolder?: (customerId: number) => void;
  onToast: (msg: string) => void;
}

export const GmailView: React.FC<GmailViewProps> = ({
  customers,
  onOpenCustomerFolder,
  onToast,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // Email List State
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNREAD' | 'CUSTOMERS'>('ALL');

  // Active Selected Message
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<GmailFullMessage | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Compose State
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [replyThreadId, setReplyThreadId] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);

  // Confirmation Dialog State (MANDATORY per Workspace skill guidelines)
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  // Subscribe to auth state
  useEffect(() => {
    const unsub = subscribeToAuth((user, token) => {
      setCurrentUser(user);
      setAccessToken(token);
      if (token) {
        loadEmails(token, searchQuery);
      }
    });
    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    setIsAuthorizing(true);
    setErrorMsg('');
    try {
      const res = await signInWithGoogle();
      onToast(`✔ Connected as ${res.user.email}`);
      loadEmails(res.accessToken, searchQuery);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setErrorMsg('Sign-in popup was closed. Tap below to retry, or use "Open Gmail Web Compose" directly.');
        onToast('Sign-in cancelled');
      } else if (err?.code === 'auth/popup-blocked') {
        setErrorMsg('Pop-up was blocked by your browser. Please allow pop-ups for this site or use "Open Gmail Web Compose".');
        onToast('Pop-up blocked by browser');
      } else {
        console.error('Google Sign-In failed:', err);
        setErrorMsg(err.message || 'Failed to sign in with Google.');
      }
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutGoogle();
      setMessages([]);
      setSelectedMessage(null);
      setSelectedMessageId(null);
      onToast('Signed out of Google Workspace');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sign out.');
    }
  };

  const loadEmails = async (token?: string, query = '') => {
    if (!token && !accessToken) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const list = await fetchGmailMessages(query, 25);
      setMessages(list);
    } catch (err: any) {
      console.error('Gmail load error:', err);
      setErrorMsg(err.message || 'Could not load messages from Gmail.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMessage = async (msgId: string) => {
    setSelectedMessageId(msgId);
    setLoadingDetails(true);
    try {
      const details = await fetchGmailMessageDetails(msgId);
      setSelectedMessage(details);
    } catch (err: any) {
      onToast(`Failed to load email: ${err.message}`);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenCompose = (initialTo = '', initialSubject = '', initialBody = '', threadId?: string) => {
    setComposeTo(initialTo);
    setComposeSubject(initialSubject);
    setComposeBody(initialBody);
    setReplyThreadId(threadId);
    setComposeOpen(true);
  };

  const handleSelectTemplate = (templateType: 'ESTIMATE' | 'INVOICE' | 'SCHEDULE' | 'THANKYOU', customer?: Customer) => {
    const cName = customer ? customer.name : 'Valued Customer';
    if (customer?.email) setComposeTo(customer.email);

    if (templateType === 'ESTIMATE') {
      setComposeSubject(`Krueger Painting - Walkthrough Estimate for ${cName}`);
      setComposeBody(
        `Hi ${cName},\n\nThank you for inviting Krueger Painting out to walk your property! Attached/listed is the full estimate for your painting project.\n\nOur quote includes:\n- Full surface prep, pressure washing, scraping, and sanding bare wood\n- 1 coat exterior primer where bare surfaces are exposed\n- 2 full coats of premium latex coatings\n\nPlease let us know if you have any questions or would like to secure a start date on our schedule!\n\nBest regards,\nJosh Krueger\nKrueger Painting\n(262) 443-1199\nN630 Moraine Dr, Campbellsport, WI 53010`
      );
    } else if (templateType === 'INVOICE') {
      setComposeSubject(`Krueger Painting - Project Invoice for ${cName}`);
      setComposeBody(
        `Hi ${cName},\n\nThank you for trusting Krueger Painting with your home! Attached is the final bill for the completed project.\n\nWe appreciate your prompt payment. We accept check, cash, Venmo, and credit card payments.\n\nThank you again for your business and support of our local painting craftsmanship!\n\nWarm regards,\nJosh Krueger\nKrueger Painting\n(262) 443-1199`
      );
    } else if (templateType === 'SCHEDULE') {
      setComposeSubject(`Krueger Painting - Scheduled Start Date for ${cName}`);
      setComposeBody(
        `Hi ${cName},\n\nWe have your painting project locked in on our crew calendar! We are planning to arrive around 8:00 AM.\n\nPlease ensure any vehicles or items near the work area are moved so we can safely set up ladders and staging equipment.\n\nIf the weather forecast changes, we will reach out immediately.\n\nLooking forward to working with you,\nJosh Krueger\nKrueger Painting\n(262) 443-1199`
      );
    } else if (templateType === 'THANKYOU') {
      setComposeSubject(`Thank you from Krueger Painting!`);
      setComposeBody(
        `Hi ${cName},\n\nJust wanted to reach out and say thank you again for having Krueger Painting work on your project! It was a pleasure working with you.\n\nIf you love how your fresh paint turned out, leaving us a quick 5-star review helps our local business tremendously.\n\nHave a wonderful week!\n\nSincerely,\nJosh Krueger\nKrueger Painting`
      );
    }
  };

  const handleRequestSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo.trim()) {
      onToast('Please enter a recipient email address.');
      return;
    }
    // Open explicit confirmation dialog as required by Google Workspace integration security rules
    setConfirmSendOpen(true);
  };

  const handleExecuteSend = async () => {
    setConfirmSendOpen(false);
    setIsSending(true);
    try {
      await sendGmailMessage({
        to: composeTo,
        subject: composeSubject,
        body: composeBody,
        replyToThreadId: replyThreadId,
      });
      onToast(`✔ Email sent successfully to ${composeTo}!`);
      setComposeOpen(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      setReplyThreadId(undefined);
      // Reload message list
      if (accessToken) loadEmails(accessToken, searchQuery);
    } catch (err: any) {
      console.error('Failed to send email:', err);
      onToast(`Error sending email: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // Filter messages
  const customerEmails = new Set(
    customers
      .map((c) => c.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e && e.length > 3))
  );

  const filteredMessages = messages.filter((msg) => {
    if (filterMode === 'UNREAD') return msg.isUnread;
    if (filterMode === 'CUSTOMERS') {
      const fromLower = msg.from.toLowerCase();
      const toLower = msg.to.toLowerCase();
      return Array.from(customerEmails).some((ce) => fromLower.includes(ce) || toLower.includes(ce));
    }
    return true;
  });

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-20">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ea4335]/15 border border-[#ea4335]/40 flex items-center justify-center text-xl shadow">
            ✉️
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[var(--text)] flex items-center gap-2">
              <span>Gmail Workspace Hub</span>
              {accessToken && (
                <span className="bg-[#1c2e1f] text-[#30d158] border border-[#30d158]/50 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse"></span>
                  Connected
                </span>
              )}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {currentUser?.email
                ? `Signed in as ${currentUser.email} • Client emails & estimates`
                : 'Send estimates, invoices & updates directly from your Gmail account'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {accessToken ? (
            <>
              <button
                type="button"
                onClick={() => handleOpenCompose()}
                className="bg-[#ea4335] hover:bg-[#d93025] text-white px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow transition-transform active:scale-95"
              >
                <span>✏️</span>
                <span>Compose Email</span>
              </button>
              <button
                type="button"
                onClick={() => loadEmails(accessToken, searchQuery)}
                disabled={loading}
                className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] px-3 py-2 rounded-xl text-xs font-bold border border-[var(--border)] cursor-pointer flex items-center gap-1"
                title="Refresh Inbox"
              >
                <span className={loading ? 'animate-spin' : ''}>🔄</span>
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="bg-[var(--surface-subtle)] hover:bg-red-500/20 text-gray-400 hover:text-red-400 px-2.5 py-2 rounded-xl text-xs font-bold border border-[var(--border)] cursor-pointer"
                title="Sign Out of Google Workspace"
              >
                ✕ Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isAuthorizing}
              className="gsi-material-button bg-white hover:bg-gray-100 text-gray-800 font-bold px-4 py-2 rounded-xl border border-gray-300 shadow cursor-pointer flex items-center gap-2.5 transition-all active:scale-95 disabled:opacity-50"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span>{isAuthorizing ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-red-400 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* When Not Connected: Connect Banner with Clear Instructions */}
      {!accessToken && (
        <div className="bg-gradient-to-br from-[#1a1c24] to-[#121318] border border-[var(--border)] rounded-2xl p-6 text-center shadow-xl space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#ea4335]/15 border border-[#ea4335]/40 flex items-center justify-center text-3xl">
            📬
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-extrabold text-white">Connect Your Gmail Account</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Link your official Google account to review customer replies, send estimates and bills with 1-click professional templates, and synchronize messages directly with customer file cabinets.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isAuthorizing}
              className="bg-white hover:bg-gray-100 text-gray-800 font-extrabold px-6 py-3 rounded-xl shadow-lg cursor-pointer inline-flex items-center gap-3 transition-transform active:scale-95"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span>{isAuthorizing ? 'Connecting to Google...' : 'Authorize Gmail & Sign In'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.open('https://mail.google.com/mail/?view=cm&fs=1', '_blank')}
              className="bg-[#ea4335]/20 hover:bg-[#ea4335]/30 text-[#ea4335] font-extrabold px-5 py-3 rounded-xl border border-[#ea4335]/40 shadow cursor-pointer inline-flex items-center gap-2 transition-transform active:scale-95 text-xs"
            >
              <span>✉️</span>
              <span>Open Gmail Web Compose</span>
            </button>
          </div>

          <div className="text-[10px] text-[var(--text-muted)] pt-2">
            Secure client-side OAuth connection with Google Workspace. Your messages and credentials are encrypted in-memory.
          </div>
        </div>
      )}

      {/* When Connected: Search, Filter, and Email Threads */}
      {accessToken && (
        <div className="space-y-3">
          {/* Controls: Search Bar and Filters */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-sm space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadEmails(accessToken, searchQuery);
                }}
                placeholder="Search emails by sender, customer name, estimate, or keyword..."
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-xl px-3.5 py-2 text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => loadEmails(accessToken, searchQuery)}
                className="bg-[var(--accent-secondary)] text-white font-bold text-xs px-3.5 py-2 rounded-xl cursor-pointer"
              >
                Search
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setFilterMode('ALL')}
                  className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    filterMode === 'ALL'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border-[var(--border)]'
                  }`}
                >
                  All Messages ({messages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('UNREAD')}
                  className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    filterMode === 'UNREAD'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border-[var(--border)]'
                  }`}
                >
                  Unread ({messages.filter((m) => m.isUnread).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('CUSTOMERS')}
                  className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    filterMode === 'CUSTOMERS'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border-[var(--border)]'
                  }`}
                >
                  Clients ({filteredMessages.length})
                </button>
              </div>

              <div className="text-[10px] text-[var(--text-muted)] font-mono">
                {filteredMessages.length} emails shown
              </div>
            </div>
          </div>

          {/* Master / Detail Layout */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
            {/* Left Column: Email Thread List */}
            <div className="md:col-span-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto">
              {loading && (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  <div className="animate-spin text-2xl mb-2">🔄</div>
                  Loading your Gmail inbox...
                </div>
              )}

              {!loading && filteredMessages.length === 0 && (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  No emails match your filter. Tap &ldquo;Refresh&rdquo; or change search term.
                </div>
              )}

              {!loading &&
                filteredMessages.map((msg) => {
                  const isSelected = selectedMessageId === msg.id;
                  // Check if sender matches any customer in cabinet
                  const matchedCustomer = customers.find(
                    (c) =>
                      (c.email && msg.from.toLowerCase().includes(c.email.toLowerCase())) ||
                      (c.name && msg.from.toLowerCase().includes(c.name.toLowerCase()))
                  );

                  return (
                    <button
                      key={msg.id}
                      type="button"
                      onClick={() => handleSelectMessage(msg.id)}
                      className={`w-full text-left p-3 transition-colors cursor-pointer block ${
                        isSelected
                          ? 'bg-[var(--surface-subtle)] border-l-4 border-l-[var(--accent)]'
                          : msg.isUnread
                          ? 'bg-[#ea4335]/5 hover:bg-[var(--surface-subtle)] font-bold'
                          : 'hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-black text-[var(--text)] truncate max-w-[180px]">
                          {msg.from.split('<')[0].replace(/"/g, '').trim() || msg.from}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)] font-mono shrink-0">
                          {msg.date.split(',')[0]}
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-[var(--accent)] truncate mb-0.5">
                        {msg.subject}
                      </div>

                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                        {msg.snippet}
                      </p>

                      {matchedCustomer && (
                        <div className="mt-1 flex items-center gap-1 text-[9px] text-[#30d158] font-bold">
                          <span>📁 Linked to client: {matchedCustomer.name}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Right Column: Email Reader & Actions */}
            <div className="md:col-span-7 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-sm min-h-[400px]">
              {loadingDetails && (
                <div className="py-20 text-center text-xs text-[var(--text-muted)]">
                  <div className="animate-spin text-2xl mb-2">🔄</div>
                  Loading message details...
                </div>
              )}

              {!loadingDetails && selectedMessage && (
                <div className="space-y-3">
                  <div className="border-b border-[var(--border)] pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-extrabold text-[var(--text)] leading-tight">
                        {selectedMessage.subject}
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenCompose(
                            selectedMessage.from.match(/<([^>]+)>/)?.[1] || selectedMessage.from,
                            `Re: ${selectedMessage.subject}`,
                            `\n\n--- On ${selectedMessage.date}, ${selectedMessage.from} wrote:\n> ${selectedMessage.bodyText
                              .split('\n')
                              .join('\n> ')}`,
                            selectedMessage.threadId
                          )
                        }
                        className="bg-[var(--accent)] hover:opacity-95 text-white px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-sm"
                      >
                        <span>↩️</span>
                        <span>Reply</span>
                      </button>
                    </div>

                    <div className="mt-2 space-y-0.5 text-xs text-[var(--text-muted)]">
                      <div>
                        <strong className="text-[var(--text)]">From:</strong> {selectedMessage.from}
                      </div>
                      <div>
                        <strong className="text-[var(--text)]">To:</strong> {selectedMessage.to}
                      </div>
                      <div className="text-[10px] font-mono">{selectedMessage.date}</div>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {selectedMessage.bodyText}
                  </div>

                  {/* Context Actions with Customers */}
                  <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold">
                      Contractor Actions:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const senderEmail =
                            selectedMessage.from.match(/<([^>]+)>/)?.[1] || selectedMessage.from;
                          const senderName =
                            selectedMessage.from.split('<')[0].replace(/"/g, '').trim() || 'New Client';
                          // Open Customer quick-add if not exists
                          const exists = customers.find(
                            (c) => c.email.toLowerCase() === senderEmail.toLowerCase()
                          );
                          if (exists && onOpenCustomerFolder) {
                            onOpenCustomerFolder(exists.id);
                          } else {
                            onToast(`Contact lead: ${senderName} (${senderEmail})`);
                          }
                        }}
                        className="bg-[var(--accent-secondary)] text-white text-[10px] font-extrabold px-2.5 py-1 rounded-lg cursor-pointer"
                      >
                        📁 View / Match Client
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const senderEmail =
                            selectedMessage.from.match(/<([^>]+)>/)?.[1] || selectedMessage.from;
                          handleOpenCompose(
                            senderEmail,
                            `Estimate from Krueger Painting`,
                            `Hi,\n\nFollowing up on your message regarding painting services.\n\nBest regards,\nJosh Krueger\n(262) 443-1199`
                          );
                        }}
                        className="bg-[#30d158] text-white text-[10px] font-extrabold px-2.5 py-1 rounded-lg cursor-pointer"
                      >
                        ⚡ Send Quote Template
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!loadingDetails && !selectedMessage && (
                <div className="h-full py-28 text-center text-xs text-[var(--text-muted)] space-y-2">
                  <span className="text-3xl">👈</span>
                  <div>Select any email from the inbox list to read message details and send replies.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COMPOSE EMAIL MODAL */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in">
          <div className="bg-[#121318] border-2 border-[#ea4335] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#1c1d25] px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">✉️</span>
                <div>
                  <h3 className="text-sm font-black text-white">Compose Email via Gmail</h3>
                  <p className="text-[10px] text-gray-400">
                    Sending from {currentUser?.email || 'Gmail Account'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 font-bold cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>

            {/* Quick Template Picker Bar */}
            <div className="bg-[#171922] px-4 py-2 border-b border-[var(--border)] flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-gray-400 mr-1">
                Krueger Templates:
              </span>
              <button
                type="button"
                onClick={() => handleSelectTemplate('ESTIMATE')}
                className="bg-[#2c2317] hover:bg-[#3d301f] text-[#f1c40f] border border-[#f1c40f]/40 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                📄 Estimate Proposal
              </button>
              <button
                type="button"
                onClick={() => handleSelectTemplate('INVOICE')}
                className="bg-[#1c2e1f] hover:bg-[#28452c] text-[#30d158] border border-[#30d158]/40 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                💵 Project Invoice
              </button>
              <button
                type="button"
                onClick={() => handleSelectTemplate('SCHEDULE')}
                className="bg-[#1d2738] hover:bg-[#273852] text-[#0a84ff] border border-[#0a84ff]/40 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                📅 Start Date Confirmation
              </button>
              <button
                type="button"
                onClick={() => handleSelectTemplate('THANKYOU')}
                className="bg-[#281d33] hover:bg-[#3d2752] text-[#bf5af2] border border-[#bf5af2]/40 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                ⭐ Review &amp; Thank You
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleRequestSend} className="p-4 space-y-3 flex-1 overflow-y-auto">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
                  To (Client Email)
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    placeholder="e.g. customer@example.com"
                    className="flex-1 bg-[#1c1d25] border border-[var(--border)] focus:border-[#ea4335] text-white text-xs rounded-xl px-3 py-2 outline-none"
                  />
                  {customers.length > 0 && (
                    <select
                      onChange={(e) => {
                        const c = customers.find((x) => x.id === parseInt(e.target.value, 10));
                        if (c?.email) {
                          setComposeTo(c.email);
                          if (!composeSubject) setComposeSubject(`Krueger Painting - Project for ${c.name}`);
                        }
                      }}
                      className="bg-[#1c1d25] border border-[var(--border)] text-gray-300 text-xs rounded-xl px-2 py-2 outline-none max-w-[140px]"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Pick Customer...
                      </option>
                      {customers
                        .filter((c) => c.email)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject line..."
                  className="w-full bg-[#1c1d25] border border-[var(--border)] focus:border-[#ea4335] text-white text-xs rounded-xl px-3 py-2 outline-none font-semibold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
                  Message Body
                </label>
                <textarea
                  required
                  rows={10}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write message details..."
                  className="w-full bg-[#1c1d25] border border-[var(--border)] focus:border-[#ea4335] text-white text-xs rounded-xl p-3 outline-none resize-none leading-relaxed font-sans"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[10px] text-gray-400">
                  Sends directly from {currentUser?.email || 'your Gmail account'}
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setComposeOpen(false)}
                    className="px-4 py-2 bg-[#1c1d25] hover:bg-[#252733] text-gray-300 font-bold text-xs rounded-xl border border-[var(--border)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSending}
                    className="px-5 py-2 bg-[#ea4335] hover:bg-[#d93025] text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span>🚀</span>
                    <span>Send Message</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPLICIT USER CONFIRMATION DIALOG (MANDATORY per Workspace Integration skill) */}
      {confirmSendOpen && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#121318] border-2 border-[#ea4335] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-sm font-black text-white">Confirm Email Delivery</h3>
                <p className="text-[10px] text-gray-400">Google Workspace Security Check</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-gray-200">
              <p>
                Are you sure you want to send this email on your behalf from{' '}
                <strong className="text-white">{currentUser?.email}</strong>?
              </p>
              <div className="bg-[#1c1d25] p-3 rounded-xl border border-[var(--border)] space-y-1 text-[11px]">
                <div>
                  <span className="text-gray-400">To:</span> <strong className="text-white">{composeTo}</strong>
                </div>
                <div>
                  <span className="text-gray-400">Subject:</span>{' '}
                  <strong className="text-[#f1c40f]">{composeSubject}</strong>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSendOpen(false)}
                className="flex-1 py-2.5 bg-[#1c1d25] hover:bg-[#252733] text-gray-300 font-bold text-xs rounded-xl border border-[var(--border)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSend}
                className="flex-1 py-2.5 bg-[#ea4335] hover:bg-[#d93025] text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
              >
                Yes, Send Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
