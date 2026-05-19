import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Send, Navigation, MapPin, Info, 
  Stethoscope, AlertCircle, Play, Square, Settings, 
  ExternalLink, BrainCircuit, MessageSquare, Languages as LangIcon,
  Sun, Moon, Volume2, Search, ArrowRight, Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSpeech } from './hooks/useSpeech';
import { HOSPITAL_DEPARTMENTS, HOSPITAL_FAQS, LANGUAGES } from './constants/hospitalData';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  translation?: string;
  intent?: any;
  timestamp: Date;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioStats, setAudioStats] = useState({ loudness: 0, rate: 0 });
  const [navPath, setNavPath] = useState<string[] | null>(null);
  
  const { 
    isListening, transcript, interimTranscript, 
    startListening, stopListening, speak, stopSpeaking 
  } = useSpeech(language.code);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Audio API for "Voice-emotion proxy"
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);

  const setupAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      audioContextRef.current = context;
      analyzerRef.current = analyzer;

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLoudness = () => {
        if (!isListening) return;
        analyzer.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;
        setAudioStats(prev => ({ ...prev, loudness: avg }));
        requestAnimationFrame(updateLoudness);
      };
      updateLoudness();
    } catch (err) {
      console.warn("Audio analysis context failed:", err);
    }
  };

  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
      if (transcript.trim()) handleSendMessage(transcript.trim());
    } else {
      setupAudioAnalysis();
      startListening();
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text) return;
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      // Find relevant FAQ
      const faqContext = HOSPITAL_FAQS
        .filter(f => text.toLowerCase().includes(f.question.toLowerCase().split(' ').slice(-1)[0]))
        .map(f => `Q: ${f.question} A: ${f.answer}`)
        .join('\n');

      const systemInstruction = `
        You are MedNav AI, a helpful hospital navigation and info assistant.
        HOSPITAL DEPARTMENTS: ${HOSPITAL_DEPARTMENTS.join(', ')}
        FAQ CONTEXT: ${faqContext || "No specific FAQ found for this query."}

        STRICT RULES:
        1. If user is asking for a location, intent is NAVIGATE.
        2. If user mentions symptoms, intent is TRIAGE. MAP symptoms to a department. NEVER give medical advice. Always add "Please consult a doctor."
        3. If user asks general hospital info, intent is INFO.
        4. Detect language (en, hi, te). Reply in that language.
        5. Return a strict JSON object: {
          intent: "NAVIGATE" | "INFO" | "TRIAGE" | "SMALLTALK",
          destination: "DEPT_NAME" | null,
          urgency: "ROUTINE" | "URGENT" | "EMERGENCY",
          reply: "Full conversational response",
          summary: "Max 2 sentence summary for TTS",
          reasoning: "One sentence reasoning for triage"
        }
        
        Voice Proxy Input: Loudness: ${audioStats.loudness.toFixed(2)}. (Higher means user might be distressed).
      `;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          systemInstruction,
          history: messages.slice(-4).map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
          }))
        })
      });

      const data = await response.json();
      
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: data.reply,
        intent: data,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);
      speak(data.summary || data.reply, language.code);

      // Trigger Nav Bridge if NAVIGATE
      if (data.intent === 'NAVIGATE' && data.destination) {
        handleNavBridge(data.destination);
      }

    } catch (error) {
      console.error(error);
      const errorMsg: Message = {
        id: 'err',
        role: 'assistant',
        text: "I'm sorry, I'm having trouble connecting to my brain. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNavBridge = async (destination: string) => {
    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Reception', to: destination })
      });
      const data = await response.json();
      setNavPath(data.path);
    } catch (err) {
      console.warn("Python backend offline - speech demo still works");
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 border-b px-6 py-4 backdrop-blur-md ${darkMode ? 'border-slate-800 bg-slate-950/80' : 'border-slate-200 bg-white/80'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
              <Navigation className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">MedNav AI</h1>
              <p className="text-[10px] font-medium uppercase tracking-wider text-blue-500">Hospital Companion</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1 md:flex dark:border-slate-800 dark:bg-slate-900">
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold uppercase transition-all ${language.code === l.code ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-12">
          
          {/* Left Panel: Classical AI (Informational) */}
          <div className="lg:col-span-4 lg:sticky lg:top-28 lg:h-fit">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`rounded-2xl border p-6 shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-white'}`}
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-blue-500" />
                  <h2 className="font-semibold">AI Search & Constraint Reasoning</h2>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  <Play className="h-3 w-3 fill-emerald-700 dark:fill-emerald-400" />
                  RUNNING
                </span>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  Classical algorithms for routing and scheduling.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {['BFS, DFS, UCS', 'Greedy, A*', 'CSP Backtracking', 'MRV + LCV', 'AC-3 Consistency', 'Min-Conflicts'].map(tech => (
                    <div key={tech} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold tracking-tight text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                      {tech}
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Pathfinding Bridge (Stub)</h3>
                  {navPath ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {navPath.map((step, i) => (
                          <React.Fragment key={i}>
                            <span className="text-[10px] text-blue-500 font-medium">{step}</span>
                            {i < navPath.length - 1 && <span className="text-[10px] text-slate-400">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                      <p className="text-[10px] text-emerald-500 font-medium italic">Python Backend Connected</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <div className="rounded-full bg-slate-100 p-3 dark:bg-slate-800">
                        <Search className="h-5 w-5 text-slate-400" />
                      </div>
                      <p className="text-center text-[10px] text-slate-500 italic">Python Backend Offline — Speech Demo Active</p>
                    </div>
                  )}
                </div>
                <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">
                  Run in PyCharm →
                </button>
              </div>
            </motion.div>
          </div>

          {/* Right Panel: Speech / LLM Interaction */}
          <div className="lg:col-span-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex h-[800px] flex-col rounded-2xl border shadow-xl ${darkMode ? 'border-slate-800 bg-slate-900 overflow-hidden' : 'border-slate-200 bg-white overflow-hidden'}`}
            >
              {/* Chat Title / Status */}
              <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                    <div className="absolute inset-0 animate-ping rounded-full bg-blue-500 opacity-75"></div>
                  </div>
                  <span className="text-sm font-semibold">Talk to the Hospital Assistant</span>
                </div>
                <div className="flex items-center gap-2">
                   {isProcessing && <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>}
                   <span className="text-xs text-slate-400">Explainable AI Active</span>
                </div>
              </div>

              {/* Chat Scroll Area */}
              <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center space-y-6 text-center">
                    <div className="rounded-full bg-blue-50 p-6 dark:bg-blue-900/20">
                      <Bot className="h-12 w-12 text-blue-500" />
                    </div>
                    <div className="max-w-xs">
                      <h3 className="text-lg font-bold">Hello! I'm MedNav AI.</h3>
                      <p className="mt-2 text-sm text-slate-500">I can help you find departments, triage symptoms, or answer hospital queries in multiple languages.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {messages.map((msg) => (
                      <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                          <div className={`inline-block rounded-2xl px-4 py-3 text-sm shadow-sm ${
                            msg.role === 'user' 
                              ? 'bg-blue-600 text-white rounded-br-none' 
                              : darkMode ? 'bg-slate-800 text-slate-200 rounded-bl-none' : 'bg-slate-100 text-slate-800 rounded-bl-none'
                          }`}>
                            {msg.text}
                          </div>
                          
                          {/* Intent Chips for Assistant Replies */}
                          {msg.role === 'assistant' && msg.intent && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                                msg.intent.urgency === 'EMERGENCY' ? 'bg-red-100 text-red-700 border-red-200 animate-pulse' :
                                msg.intent.urgency === 'URGENT' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                'bg-blue-100 text-blue-700 border-blue-200'
                              }`}>
                                <AlertCircle className="h-3 w-3" />
                                {msg.intent.urgency}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                                <MessageSquare className="h-3 w-3" />
                                {msg.intent.intent}
                              </span>
                              {msg.intent.destination && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950">
                                  <MapPin className="h-3 w-3" />
                                  TO: {msg.intent.destination}
                                </span>
                              )}
                            </div>
                          )}
                          <p className="text-[10px] font-medium text-slate-400">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Live Transcript Overlay */}
              <AnimatePresence>
                {(isListening || interimTranscript) && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mx-6 mb-4 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 dark:border-blue-900/30 dark:bg-blue-900/10"
                  >
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">Listening ({language.label})...</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {transcript} <span className="text-slate-400">{interimTranscript}</span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Area */}
              <div className={`border-t px-6 py-6 transition-colors ${isListening ? 'bg-blue-50/20 dark:bg-blue-900/10' : ''} dark:border-slate-800`}>
                <div className="mb-6 flex flex-wrap gap-2">
                  {[
                    { label: "I need the Pharmacy", text: "I need to find the Pharmacy" },
                    { label: "मुझे ICU जाना है", text: "मुझे ICU जाना है" },
                    { label: "Chest pain", text: "I have sudden chest pain and I'm feeling dizzy. Where should I go?" },
                    { label: "Visiting Hours", text: "What are the visiting hours?" }
                  ].map((chip, i) => (
                    <button 
                      key={i}
                      onClick={() => handleSendMessage(chip.text)}
                      className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-all ${darkMode ? 'border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:shadow-sm'}`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-4">
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleMicToggle}
                    className={`relative flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-all ${
                      isListening 
                        ? 'bg-red-500 text-white pulsing-mic' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isListening ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
                    
                    {/* Visualizer bars */}
                    {isListening && (
                      <div className="absolute -bottom-8 flex items-end gap-0.5 h-6">
                        {[1, 2, 3, 4, 3, 2, 1, 2, 3].map((h, i) => (
                          <motion.div 
                            key={i}
                            animate={{ height: [`${h*10}%`, `${h*30}%`, `${h*15}%`] }}
                            transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.05 }}
                            className="bg-red-400 w-1 rounded-full"
                          />
                        ))}
                      </div>
                    )}
                  </motion.button>
                  
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      placeholder="Type or use voice assistant..."
                      disabled={isProcessing}
                      className={`w-full rounded-2xl border px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSendMessage(e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-blue-600 p-2 text-white hover:bg-blue-700">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="flex items-center gap-1.5">
                       <Volume2 className="h-3 w-3" />
                       Loudness: <span className={audioStats.loudness > 50 ? 'text-red-500' : 'text-blue-500'}>{audioStats.loudness.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={stopSpeaking} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-slate-600 dark:border-slate-800">
                       <Square className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-7xl border-t px-6 py-8 text-center dark:border-slate-900">
         <p className="text-xs text-slate-400">
           © 2026 MedNav AI — Final Year Mini-Project (Computational Foundations for AI). Built for Faculty Mentor Research.
         </p>
      </footer>
    </div>
  );
}
