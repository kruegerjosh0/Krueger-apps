import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, Sparkles, CheckCircle2, ArrowRight, X } from 'lucide-react';
import {
  Customer,
  JobProject,
  FieldNote,
  ExpenseEntry,
  MileageEntry,
  ShoppingItem,
  SystemConstants,
} from '../../types';

export interface AiAction {
  type: string;
  [key: string]: any;
}

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  notes: FieldNote[];
  expenses: ExpenseEntry[];
  mileage: MileageEntry[];
  shoppingList: ShoppingItem[];
  constants: SystemConstants;
  currentTab: string;
  weatherLocation?: string;
  onExecuteActions: (actions: AiAction[]) => void;
  onToast: (msg: string) => void;
}

interface MessageItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  actions?: AiAction[];
  timestamp: string;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  customers,
  notes,
  expenses,
  mileage,
  shoppingList,
  constants,
  currentTab,
  weatherLocation,
  onExecuteActions,
  onToast,
}) => {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'init-1',
      role: 'model',
      text: "Hey Josh! I'm Flip, your Krueger Painting AI brain. Tap the mic or type below—I can estimate rooms, log expenses, add shopping items, dictate notes, or answer any painting trade questions.",
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);

  const recognitionRef = useRef<any>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  // Speech Recognition initialization
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
      };

      rec.onerror = (e: any) => {
        console.warn('Speech recognition status:', e.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  // Cancel speech on close
  useEffect(() => {
    if (!isOpen) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      if (isListening && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    }
  }, [isOpen, isListening]);

  if (!isOpen) return null;

  const toggleMic = () => {
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
    } else {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setInputText('');
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch {
        onToast('Microphone not available or permission denied.');
      }
    }
  };

  const speakText = (text: string) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(
        (v) => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('David')) && v.lang.startsWith('en')
      ) || voices.find((v) => v.lang.startsWith('en'));

      if (englishVoice) utterance.voice = englishVoice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch {}
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText !== undefined ? customText : inputText).trim();
    if (!textToSend || isProcessing) return;

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
    }

    const userMsg: MessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsProcessing(true);

    try {
      // Build brief summary for appContext
      const customersSummary = customers.slice(0, 15).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        status: c.statusOverride || 'SCHEDULED',
        jobCount: c.jobs?.length || 0,
      }));

      const recentNotesSummary = notes.slice(0, 6).map((n) => ({
        id: n.id,
        title: n.title,
        category: n.category,
        body: n.body.slice(0, 60),
      }));

      const recentExpensesSummary = expenses.slice(0, 6).map((e) => ({
        id: e.id,
        vendor: e.vendor,
        amount: e.amount,
        category: e.category,
      }));

      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
          appContext: {
            currentTab,
            customerCount: customers.length,
            customersSummary,
            recentNotes: recentNotesSummary,
            recentExpenses: recentExpensesSummary,
            shoppingCount: shoppingList.length,
            constants,
            weatherLocation: weatherLocation || 'West Bend, WI',
          },
        }),
      });

      if (!res.ok) {
        throw new Error('AI assistant service is currently unavailable.');
      }

      const data = await res.json();
      const reply = data.reply || "Got it, Josh! I've processed your request.";
      const actions = Array.isArray(data.actions) ? data.actions : [];

      const modelMsg: MessageItem = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: reply,
        actions,
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMsg]);

      // Speak response aloud
      speakText(reply);

      // Execute returned app actions immediately
      if (actions.length > 0) {
        onExecuteActions(actions);
      }
    } catch (err: any) {
      console.error('AI error:', err);
      const errorMsg: MessageItem = {
        id: `err-${Date.now()}`,
        role: 'model',
        text: `Sorry Josh, I had trouble with that: ${err.message || 'Please check connection'}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const samplePrompts = [
    'Estimate: 14x16 living room, 2 coats Emerald satin',
    'Add note: Order Sherwin samples for tomorrow morning',
    'Shopping: 4 rolls blue tape and 2 gals Duration Satin',
    'Expense: $65 at Menards for roller covers',
    'Log 24 miles to Cedarburg job walkthrough',
    'What primer stops water stains on drywall?',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#15161e] border-2 border-[var(--accent)] rounded-2xl w-full max-w-2xl h-[90vh] max-h-[720px] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header Bar */}
        <div className="bg-[#1c1d27] px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 text-black flex items-center justify-center shadow-lg font-black text-lg">
                ✨
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#30d158] border-2 border-[#15161e] rounded-full animate-pulse"></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span>Flip Gemini AI</span>
                  <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[9px] font-black px-1.5 py-0.2 rounded uppercase">
                    Krueger Brain
                  </span>
                </h3>
              </div>
              <p className="text-[10px] text-zinc-400">
                Voice & chat assistant • Puts data where it goes in the app
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Audio Speech Mute / Unmute Button */}
            <button
              type="button"
              onClick={() => {
                if (isSpeaking) window.speechSynthesis.cancel();
                setSpeechEnabled(!speechEnabled);
              }}
              className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                speechEnabled
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
              }`}
              title={speechEnabled ? 'Mute speech audio' : 'Enable speech audio'}
            >
              {speechEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conversation Stream */}
        <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#121319]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-md ${
                  m.role === 'user'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-semibold rounded-br-none'
                    : 'bg-[#1c1d27] border border-zinc-700/60 text-zinc-100 rounded-bl-none'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.text}</div>

                {/* Render Action Badges if actions were executed */}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-zinc-700/60 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-amber-400 block tracking-wide">
                      ⚡ App Actions Executed:
                    </span>
                    {m.actions.map((act, aIdx) => (
                      <div
                        key={aIdx}
                        className="bg-[#242634] border border-emerald-500/40 text-emerald-300 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>
                          {act.type === 'create_customer_estimate' &&
                            `Created estimate for ${act.customerName} (${act.rooms?.length || 0} room/area)`}
                          {act.type === 'add_note' && `Saved note: "${act.title}"`}
                          {act.type === 'add_shopping_items' &&
                            `Added ${act.items?.length || 1} item(s) to Shopping List`}
                          {act.type === 'log_expense' &&
                            `Logged $${act.amount?.toFixed(2)} at ${act.vendor}`}
                          {act.type === 'log_mileage' &&
                            `Logged ${act.miles} miles for ${act.purpose}`}
                          {act.type === 'navigate' && `Switched view to ${act.target}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[9px] text-zinc-500 mt-1 px-1">{m.timestamp}</span>
            </div>
          ))}

          {isProcessing && (
            <div className="flex items-center gap-2 text-xs text-amber-300 bg-[#1c1d27] border border-amber-500/30 px-3.5 py-2.5 rounded-xl w-fit">
              <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
              <span>Flip is calculating & taking action...</span>
            </div>
          )}
        </div>

        {/* Sample Prompt Chips */}
        <div className="px-4 py-2 bg-[#171822] border-t border-zinc-800/80 overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] uppercase font-extrabold text-zinc-400 shrink-0 mr-1">
            Try:
          </span>
          {samplePrompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(p)}
              className="text-[10px] font-bold bg-[#212330] hover:bg-[#2c2f42] text-zinc-300 hover:text-white px-2.5 py-1 rounded-full whitespace-nowrap border border-zinc-700/60 cursor-pointer transition-colors"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input & Voice Controls */}
        <div className="p-3 sm:p-4 bg-[#1c1d27] border-t border-[var(--border)] shrink-0">
          {isListening && (
            <div className="mb-2 bg-red-950/40 border border-red-500/50 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs text-red-300 animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                <span>Listening to your voice... Speak your walkthrough or question</span>
              </div>
              <button
                type="button"
                onClick={toggleMic}
                className="text-[10px] font-black uppercase text-red-400 hover:underline cursor-pointer"
              >
                Stop
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Big Mic Button */}
            <button
              type="button"
              onClick={toggleMic}
              className={`p-3 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95 ${
                isListening
                  ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-500/40'
                  : 'bg-amber-500 hover:bg-amber-400 text-black font-black'
              }`}
              title={isListening ? 'Stop listening' : 'Start speaking with your microphone'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Text Input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder={isListening ? 'Listening...' : 'Ask Flip anything or speak an estimate...'}
              className="flex-1 bg-[#121319] border border-zinc-700 focus:border-amber-400 text-white rounded-xl px-3.5 py-2.5 text-xs outline-none transition-colors"
            />

            {/* Send Button */}
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || isProcessing}
              className={`p-2.5 rounded-xl font-bold cursor-pointer transition-transform active:scale-95 ${
                inputText.trim() && !isProcessing
                  ? 'bg-amber-500 hover:bg-amber-400 text-black'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
