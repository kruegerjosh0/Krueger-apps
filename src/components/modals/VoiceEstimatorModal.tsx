import React, { useState, useEffect, useRef } from 'react';
import { JobProject, RoomArea, RepairItem, SystemConstants } from '../../types';

interface VoiceEstimatorModalProps {
  currentJob: JobProject;
  constants: SystemConstants;
  onClose: () => void;
  onApplyAdditions: (rooms: RoomArea[], repairs: RepairItem[], prepScope?: string, scope?: string) => void;
  onToast: (msg: string) => void;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const VoiceEstimatorModal: React.FC<VoiceEstimatorModalProps> = ({
  currentJob,
  constants,
  onClose,
  onApplyAdditions,
  onToast,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: `Hey Josh! I'm Flip, your voice estimating assistant. You can speak naturally or dictate your entire job walkthrough (room dimensions, prep instructions, paint sheens, repairs), and I'll calculate all labor, paint gallons & specs and load them straight into your estimator tool.`,
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const continuousModeRef = useRef<boolean>(false);

  // Staged additions from voice interaction
  const [pendingRooms, setPendingRooms] = useState<RoomArea[]>([]);
  const [pendingRepairs, setPendingRepairs] = useState<RepairItem[]>([]);
  const [pendingPrepScope, setPendingPrepScope] = useState<string>('');
  const [pendingScope, setPendingScope] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  // Clean up any synthesis when modal closes
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript && transcript.trim()) {
        handleSendMessage(transcript.trim());
      }
      setIsListening(false);
    };

    recognition.onerror = (e: any) => {
      console.warn('Voice estimator recognition error:', e.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Text-To-Speech Output
  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick natural voice if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(
      (v) => v.lang.includes('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
    );
    if (englishVoice) utterance.voice = englishVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // If continuous mode is explicitly enabled, wait 1000ms for audio decay before listening
      if (continuousModeRef.current && recognitionRef.current) {
        setTimeout(() => {
          if (!window.speechSynthesis.speaking) {
            try {
              recognitionRef.current.start();
              setIsListening(true);
            } catch {
              // ignore if already active
            }
          }
        }, 1000);
      }
    };
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const toggleListening = () => {
    if (!speechSupported) {
      onToast('Speech recognition not supported in this browser. Please type below.');
      return;
    }

    // Stop speaking immediately if assistant is talking
    stopSpeaking();

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.warn('Speech start error:', err);
        setIsListening(false);
      }
    }
  };

  const handleSendMessage = async (userMsg: string) => {
    if (!userMsg.trim() || isLoading) return;

    const newHistory: Message[] = [...messages, { role: 'user', text: userMsg }];
    setMessages(newHistory);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/estimate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: newHistory,
          currentJob,
          constants,
        }),
      });

      if (!res.ok) throw new Error('Assistant unavailable');
      const data = await res.json();

      const reply = data.reply || `Got it! Let me know what else you'd like to calculate.`;
      setMessages([...newHistory, { role: 'model', text: reply }]);
      speakText(reply);

      // Collect any proposed additions
      if (Array.isArray(data.proposedRooms) && data.proposedRooms.length > 0) {
        setPendingRooms((prev) => [...prev, ...data.proposedRooms]);
      }
      if (Array.isArray(data.proposedRepairs) && data.proposedRepairs.length > 0) {
        setPendingRepairs((prev) => [...prev, ...data.proposedRepairs]);
      }
      if (data.parsedPrepScope && typeof data.parsedPrepScope === 'string') {
        setPendingPrepScope((prev) => (prev ? `${prev}\n${data.parsedPrepScope}` : data.parsedPrepScope));
      }
      if (data.parsedScope && typeof data.parsedScope === 'string') {
        setPendingScope((prev) => (prev ? `${prev}\n${data.parsedScope}` : data.parsedScope));
      }
    } catch {
      // Offline fallback rule response
      const fallbackReply = `I heard: "${userMsg}". Krueger Painting standard labor is approximately $1.00 per square foot for walls, and 2 full coats require 1 gallon of paint per 175 square feet. Surface repairs run $${constants.repairRate || 75} per hour.`;
      setMessages([...newHistory, { role: 'model', text: fallbackReply }]);
      speakText(fallbackReply);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPending = () => {
    if (pendingRooms.length === 0 && pendingRepairs.length === 0 && !pendingPrepScope && !pendingScope) return;
    onApplyAdditions(pendingRooms, pendingRepairs, pendingPrepScope || undefined, pendingScope || undefined);
    onToast(`✔ Applied walkthrough notes & additions straight into your estimate!`);
    setPendingRooms([]);
    setPendingRepairs([]);
    setPendingPrepScope('');
    setPendingScope('');
    onClose();
  };

  const quickPrompts = [
    'Living room 15x20 with 9ft ceilings',
    'Add master bedroom 14 by 16 at $380',
    '3 hours of drywall repair and scraping',
    'How many gallons for 900 sqft?',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-3 sm:p-5 animate-in fade-in">
      <div className="max-w-2xl w-full mx-auto bg-[#121318] border-2 border-[#f1c40f] rounded-2xl flex flex-col flex-1 shadow-2xl overflow-hidden my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#1c1d25] px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#2c2317] border-2 border-[#f1c40f] flex items-center justify-center text-lg shadow">
              🎙️
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>Flip Voice Estimator</span>
                <span className="bg-[#1c2e1f] text-[#30d158] border border-[#30d158]/50 text-[9px] font-black px-2 py-0.2 rounded uppercase">
                  AI Job Partner
                </span>
              </h3>
              <p className="text-[10px] text-gray-400">
                Hands-free conversational quoting for Krueger Painting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setContinuousMode(!continuousMode)}
              className={`px-2.5 py-1 rounded text-[10px] font-extrabold border transition-all cursor-pointer flex items-center gap-1 ${
                continuousMode
                  ? 'bg-[#1c2e1f] text-[#30d158] border-[#30d158]/50'
                  : 'bg-[#2a2c38] text-gray-400 border-[var(--border)]'
              }`}
              title="When enabled, Flip listens automatically after speaking so you don't need to tap the mic every time"
            >
              <span>{continuousMode ? '🎙️ Walkie-Talkie ON' : '🎙️ Single Shot'}</span>
            </button>

            {isSpeaking && (
              <button
                type="button"
                onClick={() => {
                  window.speechSynthesis?.cancel();
                  setIsSpeaking(false);
                }}
                className="bg-[#2c2317] text-[#f1c40f] border border-[#f1c40f]/40 px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                title="Mute Speech"
              >
                <span>🔇</span>
                <span>Mute</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                window.speechSynthesis?.cancel();
                onClose();
              }}
              className="bg-[#2a2c38] hover:bg-[#363948] text-white px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--border)] cursor-pointer"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Conversation Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0d0e12]">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'bg-[#f1c40f] text-[#231709] font-semibold rounded-br-none'
                    : 'bg-[#1c1d25] border border-[var(--border)] text-gray-200 rounded-bl-none'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 font-black text-[9px] uppercase tracking-wider opacity-75">
                  <span>{m.role === 'user' ? 'Josh (Contractor)' : 'Flip AI Estimator'}</span>
                </div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[#1c1d25] border border-[var(--border)] text-gray-300 rounded-2xl rounded-bl-none px-4 py-3 text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#f1c40f] animate-ping"></span>
                <span>Calculating Krueger Painting formulas &amp; specs...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Pending Items to Apply Banner */}
        {(pendingRooms.length > 0 || pendingRepairs.length > 0 || pendingPrepScope || pendingScope) && (
          <div className="bg-[#1e1913] border-t-2 border-[#f1c40f] p-3 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[#f1c40f] font-extrabold flex items-center gap-2">
                <span>✨ Calculated &amp; Ready to Add:</span>
                <span className="text-white">
                  {pendingRooms.length > 0 && `${pendingRooms.length} Room(s)`}
                  {pendingRooms.length > 0 && pendingRepairs.length > 0 && ' • '}
                  {pendingRepairs.length > 0 && `${pendingRepairs.length} Repair(s)`}
                  {(pendingPrepScope || pendingScope) && ' • Scope Notes'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingRooms([]);
                    setPendingRepairs([]);
                    setPendingPrepScope('');
                    setPendingScope('');
                  }}
                  className="text-gray-400 hover:text-white text-[11px] underline cursor-pointer"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={handleApplyPending}
                  className="bg-[#30d158] hover:bg-[#28b84c] text-white px-4 py-1.5 rounded-lg font-black text-xs shadow-md transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <span>✔</span>
                  <span>Insert Directly Into Estimator Tool</span>
                </button>
              </div>
            </div>

            {/* Prep and Scope notes if parsed */}
            {pendingPrepScope && (
              <div className="bg-[#2c2317] border border-[#f1c40f]/30 rounded-lg p-2 text-[11px] text-gray-200">
                <div className="flex items-center justify-between font-bold text-[#f1c40f] text-[10px] uppercase mb-0.5">
                  <span>📝 Extracted Prep Work Notes:</span>
                  <button
                    type="button"
                    onClick={() => setPendingPrepScope('')}
                    className="text-red-400 hover:text-red-300 font-bold"
                  >
                    ✕
                  </button>
                </div>
                <div className="whitespace-pre-wrap text-gray-300">{pendingPrepScope}</div>
              </div>
            )}

            {pendingScope && (
              <div className="bg-[#2c2317] border border-[#f1c40f]/30 rounded-lg p-2 text-[11px] text-gray-200">
                <div className="flex items-center justify-between font-bold text-[#f1c40f] text-[10px] uppercase mb-0.5">
                  <span>📋 Extracted General Scope:</span>
                  <button
                    type="button"
                    onClick={() => setPendingScope('')}
                    className="text-red-400 hover:text-red-300 font-bold"
                  >
                    ✕
                  </button>
                </div>
                <div className="whitespace-pre-wrap text-gray-300">{pendingScope}</div>
              </div>
            )}

            {/* Individual pending item badges */}
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
              {pendingRooms.map((rm, idx) => (
                <div
                  key={`rm-${idx}`}
                  className="bg-[#2c2317] border border-[#f1c40f]/40 rounded-lg px-2.5 py-1 text-[11px] text-gray-200 flex items-center gap-1.5"
                >
                  <span className="text-[#f1c40f] font-black">🚪 {rm.n}</span>
                  <span className="text-gray-400">(${rm.r} labor • {rm.og || 1} gal)</span>
                  <button
                    type="button"
                    onClick={() => setPendingRooms((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-300 font-bold ml-1 cursor-pointer"
                    title="Remove item"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {pendingRepairs.map((rp, idx) => (
                <div
                  key={`rp-${idx}`}
                  className="bg-[#2c2317] border border-[#f1c40f]/40 rounded-lg px-2.5 py-1 text-[11px] text-gray-200 flex items-center gap-1.5"
                >
                  <span className="text-[#f1c40f] font-black">🔧 {rp.d}</span>
                  <span className="text-gray-400">({rp.h} hrs)</span>
                  <button
                    type="button"
                    onClick={() => setPendingRepairs((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-300 font-bold ml-1 cursor-pointer"
                    title="Remove repair"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Suggestion Chips */}
        <div className="bg-[#161820] px-3 py-2 border-t border-[var(--border)] flex gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
          {quickPrompts.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(q)}
              className="bg-[#1f212b] hover:bg-[#2c2317] hover:text-[#f1c40f] text-gray-300 px-2.5 py-1 rounded-full whitespace-nowrap border border-[var(--border)] transition-colors cursor-pointer"
            >
              💡 {q}
            </button>
          ))}
        </div>

        {/* Voice Input Controller */}
        <div className="bg-[#1c1d25] p-3 border-t border-[var(--border)] space-y-2">
          {/* Big Hands-Free Microphone Button */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={toggleListening}
              className={`relative flex items-center justify-center w-16 h-16 rounded-full shadow-2xl transition-all cursor-pointer ${
                isListening
                  ? 'bg-red-600 text-white scale-110 shadow-red-500/50'
                  : 'bg-[#f1c40f] hover:bg-[#e0b40e] text-[#231709] hover:scale-105 shadow-[#f1c40f]/30'
              }`}
            >
              {isListening && (
                <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping"></span>
              )}
              <span className="text-2xl">{isListening ? '🛑' : '🎙️'}</span>
            </button>
          </div>

          <div className="text-center">
            <span className="text-xs font-extrabold text-white block">
              {isListening ? 'Listening to your voice... Speak room specs or questions' : 'Tap Microphone to Speak Hands-Free'}
            </span>
            <span className="text-[10px] text-gray-400">
              Flip will calculate paint, labor, and surface repairs out loud
            </span>
          </div>

          {/* Text Input Fallback */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="flex gap-2 pt-1"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Or type room dimensions (e.g. 14x16 living room)..."
              className="flex-1 bg-[#121318] border border-[var(--border)] focus:border-[#f1c40f] text-white rounded-xl px-3.5 py-2 text-xs outline-none"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="bg-[#f1c40f] disabled:opacity-50 text-[#231709] px-4 py-2 rounded-xl text-xs font-black cursor-pointer shadow"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
