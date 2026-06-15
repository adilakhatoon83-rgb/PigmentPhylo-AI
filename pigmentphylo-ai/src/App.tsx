import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Shield,
  Lock,
  Eye,
  EyeOff,
  User,
  LogOut,
  Terminal,
  BookOpen,
  Layers,
  Sun,
  Settings,
  Database,
  Cpu,
  Leaf,
  Zap,
  RefreshCw,
  Send,
  Plus,
  Trash,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Sparkles,
  ChevronRight,
  Dna
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const VITE_API_URL = (((import.meta as any).env?.VITE_API_URL) || 'https://web-production-51dc1.up.railway.app').replace(/\/$/, '');

const getApiUrl = (endpoint: string): string => {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${VITE_API_URL}${formattedEndpoint}`;
};

// Interfaces
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  pigment_data?: {
    molecule_name: string;
    formula: string;
    molecular_weight: number;
    absorption_peaks: number[];
    phylo_confidence: number;
    divergence_date: string;
    suggested_evo_branches: { name: string; mya: number }[];
  } | null;
}

interface WebNote {
  uuid: string;
  title: string;
  body: string;
  tag: string;
  timestamp: string;
}

export default function App() {
  // Authentication State
  const [token, setToken] = useState<string | null>(localStorage.getItem('bio_arc_token'));
  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('bio_arc_email'));
  const [isLoginView, setIsLoginView] = useState<boolean>(true);
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);

  // App Health check signature
  const [backendHealth, setBackendHealth] = useState<{ status: string; project: string } | null>(null);

  // Diagnostic Analyzer Control Coordinates
  const [starType, setStarType] = useState<'M' | 'K' | 'G' | 'F'>('M'); // M-Dwarf is exoplanetary default for BIO-ARC-772
  const [pigmentType, setPigmentType] = useState<string>('chlorophyll_x');
  const [atmosphereOpacity, setAtmosphereOpacity] = useState<number>(35);
  const [co2Density, setCo2Density] = useState<number>(60);
  const [infraredTransmission, setInfraredTransmission] = useState<number>(75);

  // Chat/Oracle State
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'System ready. BIO-ARC-772 Canopy diagnostic AI operational. Enter queries regarding phylogenetic pigment transition matrices or molecular solar overlaps.'
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Notes state
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteBody, setNoteBody] = useState<string>('');
  const [noteTag, setNoteTag] = useState<string>('#CanopySpectra');
  const [savedNotes, setSavedNotes] = useState<WebNote[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('All');
  const [isNoteSaving, setIsNoteSaving] = useState<boolean>(false);
  const [notesNotification, setNotesNotification] = useState<{ type: 'success' | 'err'; msg: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'terminal' | 'vault' | 'corpus'>('terminal');

  // Splash Screen and Offline States
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 8000);
    return () => clearInterval(interval);
  }, []);

  // Corpus dataset upload state
  const [corpusFile, setCorpusFile] = useState<File | null>(null);
  const [isCorpusUploading, setIsCorpusUploading] = useState<boolean>(false);
  const [corpusNotification, setCorpusNotification] = useState<{ type: 'success' | 'err'; msg: string } | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; chunks: number; s3Url?: string }[]>([]);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);

  const fetchCorpusFiles = async (authToken: string | null = token) => {
    if (!authToken) return;
    try {
      const res = await fetch(getApiUrl('/corpus'), {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.files) {
          const filesMapped = data.files.map((f: any) => ({
            name: f.filename,
            chunks: f.chunk_count,
            s3Url: f.s3_url
          }));
          setUploadedFiles(filesMapped);
        }
      }
    } catch (err) {
      console.error("Failed to load corpus files from server", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCorpusFiles(token);
    } else {
      setUploadedFiles([]);
    }
  }, [token]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setCorpusFile(file);
      handleCorpusUpload(file);
    }
  };

  const handleCorpusUpload = async (fileToUpload: File) => {
    if (!fileToUpload.name.toLowerCase().endsWith('.pdf')) {
      setCorpusNotification({ type: 'err', msg: "Only PDF files are supported by the exoplanetary processor." });
      return;
    }

    setIsCorpusUploading(true);
    setCorpusNotification(null);

    const formData = new FormData();
    formData.append('file', fileToUpload);

    try {
      const res = await fetch(getApiUrl('/corpus/upload'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (res.status === 401) {
        handleLogout();
        throw new Error("Credentials expired or invalid. Access denied.");
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Corpus upload declined by server.");
      }

      setCorpusNotification({
        type: 'success',
        msg: `Spectra Corpus ingested: ${data.message}`
      });
      setUploadedFiles(prev => [...prev, { name: fileToUpload.name, chunks: data.num_chunks, s3Url: data.s3_url }]);
      setCorpusFile(null);
    } catch (err: any) {
      setCorpusNotification({
        type: 'err',
        msg: `Ingestion Failed: ${err.message}`
      });
    } finally {
      setIsCorpusUploading(false);
    }
  };

  // Load Saved Notes from localStorage on boot to persist local entries along with backend confirmations
  useEffect(() => {
    const cached = localStorage.getItem('bio_arc_notes');
    if (cached) {
      try {
        setSavedNotes(JSON.parse(cached));
      } catch (err) {
        console.error(err);
      }
    }
    checkHealth();
  }, []);

  // Save notes locally when updated
  useEffect(() => {
    localStorage.setItem('bio_arc_notes', JSON.stringify(savedNotes));
  }, [savedNotes]);

  // Keep chat scrolled
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const checkHealth = async () => {
    try {
      const res = await fetch(getApiUrl('/health'));
      if (res.ok) {
        const data = await res.json();
        setBackendHealth(data);
        setIsOffline(false);
      } else {
        setIsOffline(true);
      }
    } catch (err) {
      console.error("Backend health connection error: ", err);
      setIsOffline(true);
    }
  };

  // Auth Operations
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthLoading(true);

    const payload = {
      email: authEmail,
      password: authPassword
    };

    try {
      const endpoint = isLoginView ? '/auth/login' : '/auth/register';
      const res = await fetch(getApiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'An unexpected authentication error occurred.');
      }

      if (isLoginView) {
        // Handle Login response
        const tokenVal = data.access_token;
        if (tokenVal) {
          localStorage.setItem('bio_arc_token', tokenVal);
          localStorage.setItem('bio_arc_email', authEmail);
          setToken(tokenVal);
          setUserEmail(authEmail);
          setAuthSuccess("Authentication verified. Loading neural matrix...");
        } else {
          throw new Error("No token returned by login service.");
        }
      } else {
        // Handle Register response
        setAuthSuccess("BIO-ARC-772 account registered. Please sign in now.");
        setIsLoginView(true);
        setAuthPassword('');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Connection refused or authorization failed.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('bio_arc_token');
    localStorage.removeItem('bio_arc_email');
    setToken(null);
    setUserEmail(null);
    setAuthSuccess(null);
    setAuthError(null);
    setAuthEmail('');
    setAuthPassword('');
  };

  // Submit Chat Prompt to FastAPI (POST /chat protected by token)
  const submitChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsChatLoading(true);

    // Format chat messages format for pydantic ChatRequest
    const historyPayload = chatMessages.slice(1).map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    try {
      const res = await fetch(getApiUrl('/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMsg,
          history: historyPayload
        })
      });

      if (res.status === 401) {
        handleLogout();
        throw new Error("Credentials expired or invalid. Please sign back in.");
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Error receiving diagnostic data.");
      }

      // Initialize the assistant's typing message
      setChatMessages(prev => [...prev, { role: 'assistant', content: '', pigment_data: null }]);

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Response body streaming is unavailable.");
      }

      const decoder = new TextDecoder("utf-8");
      let streamBuffer = "";
      let accumulatedContent = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split("\n\n");
        // Save the partial line for the next iteration
        streamBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.startsWith("data:")) {
            const rawData = trimmedLine.substring(5).trim();
            if (!rawData) continue;

            // Check if this rawData is a pigment json block
            if (rawData.startsWith("{") && rawData.endsWith("}")) {
              try {
                const pigmentJson = JSON.parse(rawData);
                setChatMessages(prev => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last && last.role === 'assistant') {
                    copy[copy.length - 1] = {
                      ...last,
                      pigment_data: pigmentJson
                    };
                  }
                  return copy;
                });
              } catch (err) {
                // If the json parsing failed, treat it as token content
                accumulatedContent += rawData;
                setChatMessages(prev => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last && last.role === 'assistant') {
                    copy[copy.length - 1] = {
                      ...last,
                      content: accumulatedContent
                    };
                  }
                  return copy;
                });
              }
            } else {
              // Standard stream text token
              accumulatedContent += rawData;
              setChatMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.role === 'assistant') {
                  copy[copy.length - 1] = {
                    ...last,
                    content: accumulatedContent
                  };
                }
                return copy;
              });
            }
          }
        }
      }

      // Flush remainder of the stream buffer
      if (streamBuffer.trim().startsWith("data:")) {
        const trimmedLine = streamBuffer.trim();
        const rawData = trimmedLine.substring(5).trim();
        if (rawData) {
          if (rawData.startsWith("{") && rawData.endsWith("}")) {
            try {
              const pigmentJson = JSON.parse(rawData);
              setChatMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.role === 'assistant') {
                  copy[copy.length - 1] = {
                    ...last,
                    pigment_data: pigmentJson
                  };
                }
                return copy;
              });
            } catch {
              accumulatedContent += rawData;
            }
          } else {
            accumulatedContent += rawData;
          }
          setChatMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = {
                ...last,
                content: accumulatedContent
              };
            }
            return copy;
          });
        }
      }

    } catch (err: any) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `ALERT: System error parsing transaction. Response: ${err.message}`
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Save Field Notes to FastAPI (POST /notes protected by token)
  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteBody.trim() || isNoteSaving) return;

    setIsNoteSaving(true);
    setNotesNotification(null);

    const payload = {
      title: noteTitle,
      body: noteBody,
      tag: noteTag
    };

    try {
      const res = await fetch(getApiUrl('/notes'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 401) {
        handleLogout();
        throw new Error("Credentials expired or invalid. Access denied.");
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Vault rejection on saving note.");
      }

      // successfully saved in Python backend memory and verified
      const newNote: WebNote = {
        uuid: data.uuid,
        title: noteTitle,
        body: noteBody,
        tag: noteTag,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString()
      };

      setSavedNotes(prev => [newNote, ...prev]);
      setNoteTitle('');
      setNoteBody('');
      setNotesNotification({
        type: 'success',
        msg: `Spectra Saved. UUID verified: ${data.uuid.substring(0, 8)}...`
      });
    } catch (err: any) {
      setNotesNotification({
        type: 'err',
        msg: `Save Failed: ${err.message}`
      });
    } finally {
      setIsNoteSaving(false);
    }
  };

  const deleteNote = (uuidToDelete: string) => {
    setSavedNotes(prev => prev.filter(n => n.uuid !== uuidToDelete));
  };

  // BioPhysics calculations based on Star Type and Pigment selections
  const getSimulatedBioMetrics = () => {
    // 1. Solar Intensity distribution function
    // M-dwarf: Red & Near IR peaks (700nm to 950nm)
    // K-dwarf: Deep orange (600nm to 750nm)
    // G-type: Medium visible yellow/green (500nm to 650nm)
    // F-type: Violet/Blue (400nm to 550nm)
    
    // 2. Pigment absorption matches
    // chlorophyll_a: peaks around 430nm (blue) and 660nm (red)
    // chlorophyll_x (BIO-ARC-772 specific): peaks around 720nm and 772nm (extreme far-red)
    // bacterio_infrared: peaks around 800nm and 850nm (infrared)
    // retinal_magenta: peaks around 520nm (green)
    // phycobilin_cyan: peaks around 570nm (yellow-orange)

    let peakWavelength = "772 nm";
    let stellarFluxColor = "text-red-500 bg-red-950/40 border-red-800/50";
    let foliageColorName = "Bronze Carbon Slate";
    let foliageColorHex = "#1e1e24"; // Charcoal dark
    let starName = "M-Dwarf Class Solar Source";
    let efficiencyPercent = 78;

    // Evaluate star
    if (starType === 'M') {
      starName = "M-Dwarf Class Star (Exo-Thermal)";
      peakWavelength = "820 nm (Near Infared)";
      stellarFluxColor = "text-orange-500 border-orange-500/30 bg-orange-950/20";
    } else if (starType === 'K') {
      starName = "K-Dwarf Class Star (Orange Amber)";
      peakWavelength = "680 nm (Far-Red)";
      stellarFluxColor = "text-amber-500 border-amber-500/30 bg-amber-950/20";
    } else if (starType === 'G') {
      starName = "G-Type Class Star (Sun Standard)";
      peakWavelength = "550 nm (Visible Green/Yellow)";
      stellarFluxColor = "text-yellow-400 border-yellow-500/30 bg-yellow-950/20";
    } else {
      starType === 'F'
      starName = "F-Type Hyper Star (Ultra-Radiant)";
      peakWavelength = "440 nm (High UV/Blue)";
      stellarFluxColor = "text-cyan-400 border-cyan-500/30 bg-cyan-950/20";
    }

    // Match efficiency and reflected color name
    switch (pigmentType) {
      case 'chlorophyll_x': // Custom BIO-ARC-772 special
        if (starType === 'M') {
          efficiencyPercent = Math.min(98, 88 + (infraredTransmission / 10));
          foliageColorName = "Deep Obsidian Bronze (Reflecting Infrared Excess)";
          foliageColorHex = "#1c120c";
        } else if (starType === 'K') {
          efficiencyPercent = 82;
          foliageColorName = "Charcoal Silver Canopy";
          foliageColorHex = "#282a30";
        } else if (starType === 'G') {
          efficiencyPercent = 64;
          foliageColorName = "Pale Metallic Olive";
          foliageColorHex = "#3b443b";
        } else {
          efficiencyPercent = 45;
          foliageColorName = "Brushed Teal Indigo";
          foliageColorHex = "#1a2c3a";
        }
        break;

      case 'chlorophyll_a':
        if (starType === 'G') {
          efficiencyPercent = 85 - (atmosphereOpacity / 10);
          foliageColorName = "Lush Chloroplastic Emerald (Earth Standard)";
          foliageColorHex = "#10b981";
        } else if (starType === 'F') {
          efficiencyPercent = 90 - (atmosphereOpacity / 10);
          foliageColorName = "Vibrant Forest Yellow-Cyan";
          foliageColorHex = "#06b6d4";
        } else if (starType === 'K') {
          efficiencyPercent = 55;
          foliageColorName = "Muted Amber-Moss";
          foliageColorHex = "#53624e";
        } else {
          efficiencyPercent = 30;
          foliageColorName = "Extremely Dark Charcoal Green";
          foliageColorHex = "#0d1d11";
        }
        break;

      case 'bacterio_infrared':
        if (starType === 'M') {
          efficiencyPercent = Math.min(97, 85 + (infraredTransmission / 12) + (co2Density / 20));
          foliageColorName = "Pitch Velvet Purple (Absorbing full infrared matrix)";
          foliageColorHex = "#110214";
        } else if (starType === 'K') {
          efficiencyPercent = 70;
          foliageColorName = "Deep Maroon Indigo";
          foliageColorHex = "#3a0928";
        } else {
          efficiencyPercent = 35;
          foliageColorName = "Ashen Charcoal Red";
          foliageColorHex = "#2c1c20";
        }
        break;

      case 'retinal_magenta':
        if (starType === 'G') {
          efficiencyPercent = 92;
          foliageColorName = "Exquisite Halo Neon Magenta (Reflecting Blue & Red)";
          foliageColorHex = "#ec4899";
        } else if (starType === 'F') {
          efficiencyPercent = Math.min(95, 87 + (atmosphereOpacity / 8));
          foliageColorName = "Psychedelic Cosmic Orchid";
          foliageColorHex = "#a855f7";
        } else {
          efficiencyPercent = 50;
          foliageColorName = "Muted Cranberry Maroon";
          foliageColorHex = "#881337";
        }
        break;

      case 'phycobilin_cyan':
        if (starType === 'K') {
          efficiencyPercent = 89;
          foliageColorName = "Brilliant Electric Coral Cyan";
          foliageColorHex = "#0ea5e9";
        } else if (starType === 'G') {
          efficiencyPercent = 75;
          foliageColorName = "Fluorescent Teal Blue";
          foliageColorHex = "#14b8a6";
        } else {
          efficiencyPercent = 55;
          foliageColorName = "Dull Royal Cobalt";
          foliageColorHex = "#1e3a8a";
        }
        break;
    }

    // atmospheric correction impacts
    const atmosphereInterference = Math.round((atmosphereOpacity * 0.15) + ((100 - co2Density) * 0.08));
    efficiencyPercent = Math.round(Math.max(12, Math.min(99, efficiencyPercent - atmosphereInterference)));

    return {
      starName,
      peakWavelength,
      stellarFluxColor,
      foliageColorName,
      foliageColorHex,
      efficiencyPercent
    };
  };

  const bioMetrics = getSimulatedBioMetrics();

  // Helper tags for the note vault filtering
  const allTags = ['All', '#CanopySpectra', '#PigmentPhylo', '#Chlorophyll-X', '#Atmospheric-772'];

  const filteredNotes = savedNotes.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          n.body.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTagFilter === 'All' || n.tag === selectedTagFilter;
    return matchesSearch && matchesTag;
  });

  const isAwaitingFirstToken = isChatLoading && (
    chatMessages.length === 0 || 
    chatMessages[chatMessages.length - 1].role === 'user' || 
    (chatMessages[chatMessages.length - 1].role === 'assistant' && !chatMessages[chatMessages.length - 1].content.trim())
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col relative selecion-cyan select-none" id="bio-reactor-main">
      {/* Splash Screen */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 text-white font-sans"
            id="splash-screen"
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-emerald-500/10 rounded-full blur-[90px] animate-pulse" />
            </div>
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="relative flex flex-col items-center gap-5 text-center px-4"
            >
              <div className="p-4.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Dna className="w-14 h-14 animate-[spin_6s_linear_infinite]" />
              </div>
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] tracking-[0.25em] text-emerald-400 font-bold uppercase">CANOPY INTERFACE HUD</p>
                <h1 className="text-3xl font-extrabold tracking-tight">PigmentPhylo <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">AI</span></h1>
                <p className="font-mono text-[11px] text-slate-400 mt-1">MODULE MATRIX: <span className="text-emerald-400 font-semibold font-mono">BIO-ARC-772</span></p>
              </div>
              <div className="w-32 h-1 bg-slate-900 rounded-full overflow-hidden mt-3 max-w-full">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.9, ease: "easeInOut" }}
                  className="h-full bg-emerald-400" 
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-rose-600 text-white font-mono text-xs py-2.5 px-4 flex items-center justify-center gap-2 z-50 shrink-0 select-none shadow-lg border-b border-rose-800"
            id="offline-network-banner"
          >
            <AlertCircle className="w-4.5 h-4.5 animate-bounce shrink-0 text-white" />
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-center sm:text-left">
              <div>
                <span className="font-bold tracking-wider">OFFLINE STATUS ACCESSED:</span>{' '}
                <span className="opacity-90">Core exoplanetary backend BIO-ARC-772 is unreachable.</span>
              </div>
              <button 
                onClick={checkHealth}
                className="self-center sm:self-auto px-2.5 py-0.5 bg-white/20 hover:bg-white/30 border border-white/35 rounded text-[10px] font-bold uppercase transition-all cursor-pointer"
              >
                Reconnect Handshake
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic glow matrix */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[40%] -left-[20%] w-[90%] h-[95%] bg-emerald-500/5 rounded-full blur-[160px] glow-overlay" />
        <div className="absolute -bottom-[30%] -right-[10%] w-[80%] h-[80%] bg-cyan-500/5 rounded-full blur-[140px] glow-overlay" />
      </div>

      {/* HEADER HUD */}
      <header className="border-b border-slate-800/80 bg-slate-900/45 backdrop-blur-md z-10 px-4 py-3.5 sm:px-6 relative flex flex-wrap items-center justify-between gap-4" id="hud-header">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Activity className="w-5.5 h-5.5 animate-pulse" />
            <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] tracking-widest text-emerald-400 font-bold">PROJECT MODULE</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">BIO-ARC-772</span>
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1">
              PigmentPhylo <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">AI</span>
            </h1>
          </div>
        </div>

        {/* Backend Connectivity Micro Telemetry */}
        <div className="flex items-center gap-6" id="header-telemetry">
          <div className="hidden md:flex flex-col text-right font-mono">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Canopy Core State</span>
            <div className="flex items-center gap-1.5 justify-end mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-[11px] text-emerald-400 font-medium">SIMULATION ACTIVE</span>
            </div>
          </div>

          <div className="hidden sm:flex flex-col text-right font-mono">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Active Backend</span>
            <span className="text-[11px] text-zinc-300 font-medium flex items-center gap-1.5 justify-end mt-0.5">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              {backendHealth ? `${backendHealth.project} Live` : 'Connecting...'}
            </span>
          </div>

          {token && (
            <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800/80 rounded-lg p-1.5 pl-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono text-xs font-bold uppercase">
                  {userEmail ? userEmail.charAt(0) : 'U'}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-300 max-w-[120px] truncate" title={userEmail || ''}>
                    {userEmail}
                  </span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                title="Log Out Secure Session"
                id="btn-logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* RENDER LOGIN / REGISTER VIEW IF NOT AUTHENTICATED */}
      {!token ? (
        <main className="flex-1 flex items-center justify-center p-4 z-10" id="auth-container">
          <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800/90 rounded-2xl shadow-2xl p-6 sm:p-8 relative" id="auth-panel">
            {/* Corner retro cyber-grid accents */}
            <div className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-emerald-500/60 rounded-tl-lg" />
            <div className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-emerald-500/60 rounded-br-lg" />

            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 text-emerald-400 mb-4 animate-bounce">
                <Shield className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {isLoginView ? 'Initialize Core Authorization' : 'Register Genetic Officer'}
              </h2>
              <p className="text-sm text-gray-400 mt-1.5 max-w-sm mx-auto">
                {isLoginView
                  ? 'Access pigment aligners and spectral models for exoplanet canopy BIO-ARC-772.'
                  : 'Establish credentials loaded directly into system-level safe memory banks.'}
              </p>
            </div>

            {authError && (
              <div className="mb-6 p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5 animate-shake">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>{authSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">
                  Quantum Mail Node
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="officer@bio-arc-772.gov"
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">
                  Access Keyword Signature
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-emerald-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full py-3 px-4 mt-6 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-semibold rounded-xl text-sm transition-all shadow-lg hover:shadow-emerald-500/20 cursor-pointer flex justify-center items-center gap-2 font-mono"
              >
                {isAuthLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>{isLoginView ? 'ACCESS CORE NEURON' : 'RECORD METRIC PROFILE'}</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLoginView(!isLoginView);
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
                className="text-xs font-medium text-emerald-400 hover:text-teal-300 transition-colors"
              >
                {isLoginView
                  ? "Don't have diagnostic access? Register Genetic Profile"
                  : 'Already registered? Return to Authorization HUD'}
              </button>
            </div>
          </div>
        </main>
      ) : (
        /* CORE LOGGED IN DESKTOP WORKSPACE */
        <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10" id="workspace-layout">
          
          {/* LEFT PANEL (8 columns wide): BIO-COORDINATE CONTROL & SPECTRUM PLOTS */}
          <div className="lg:col-span-7 flex flex-col gap-6" id="left-workspace">
            
            {/* 1. SPECTRAL SYSTEM & ATMOSPHERE SELECTION CODES */}
            <section className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5 sm:p-6" id="canopy-controls">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                <Sliders className="w-4.5 h-4.5 text-emerald-400 animate-pulse" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex-1">
                  Exoplanetary Canopy Diagnostics Setup
                </h2>
                <span className="text-[10px] font-mono font-semibold py-0.5 px-1.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400">
                  REAL-TIME SIMULA
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                {/* Stellar Star Classification Selection */}
                <div>
                  <label className="block text-[11px] font-mono text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-orange-400 animate-spin-slow" />
                    Solar Light Source Peak
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['M', 'K', 'G', 'F'] as const).map((type) => {
                      const active = starType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setStarType(type)}
                          className={`py-2 px-1 rounded-xl border font-mono text-xs font-bold transition-all relative ${
                            active
                              ? 'bg-gradient-to-br from-indigo-900/50 to-emerald-950/50 text-white border-emerald-500/80'
                              : 'bg-slate-950/70 text-slate-400 border-slate-800/80 hover:border-slate-700/80'
                          }`}
                        >
                          {active && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          )}
                          <span className="block text-sm">{type}</span>
                          <span className="text-[9px] uppercase font-medium tracking-tighter opacity-70">
                            {type === 'M' ? 'Red' : type === 'K' ? 'Amber' : type === 'G' ? 'Sun' : 'Hyper'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Synthetic Pigment Class Selection */}
                <div>
                  <label className="block text-[11px] font-mono text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                    Phylogenetic Pigment Alignment
                  </label>
                  <select
                    value={pigmentType}
                    onChange={(e) => setPigmentType(e.target.value)}
                    className="w-full bg-slate-950/95 border border-slate-800/80 text-gray-200 py-2.5 px-3 rounded-xl font-mono text-xs outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500 transition-all cursor-pointer"
                  >
                    <option value="chlorophyll_x">Chlorophyll X-772 [Extreme Red/IR]</option>
                    <option value="chlorophyll_a">Chlorophyll-A [G-Solar Standard]</option>
                    <option value="bacterio_infrared">Bacteriochlorophyll [Deep Far-IR]</option>
                    <option value="retinal_magenta">Retinal-Magenta Protocol [Visible Green]</option>
                    <option value="phycobilin_cyan">Phycobilin Cyan Matrix [Yellow Absorption]</option>
                  </select>
                </div>
              </div>

              {/* Advanced Sliders for canopy properties */}
              <div className="space-y-4 pt-3 border-t border-slate-800/60">
                {/* Atmospheric Opacity Slider */}
                <div>
                  <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1.5">
                    <span>Atmospheric Aerosol Opacity</span>
                    <span className="text-emerald-400 font-bold">{atmosphereOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={atmosphereOpacity}
                    onChange={(e) => setAtmosphereOpacity(Number(e.target.value))}
                    className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* CO2 density slider */}
                <div>
                  <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1.5">
                    <span>CO2 Gaseous Retention Density</span>
                    <span className="text-cyan-400 font-bold">{co2Density}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={co2Density}
                    onChange={(e) => setCo2Density(Number(e.target.value))}
                    className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>

                {/* Near Infrared Radiation Transmission level */}
                <div>
                  <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1.5">
                    <span>Infrared Solar Transmittance Index</span>
                    <span className="text-amber-500 font-bold">{infraredTransmission}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={infraredTransmission}
                    onChange={(e) => setInfraredTransmission(Number(e.target.value))}
                    className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>
            </section>

            {/* 2. SPECTRAL MOLECULAR DYNAMIC PLOT (SVG) */}
            <section className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5 sm:p-6 flex-1 flex flex-col justify-between" id="spectra-visualization">
              <div className="mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-white text-sm font-bold font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu className="w-4.5 h-4.5 text-cyan-400" />
                      Molecular Absorbance Overlap Spectrum
                    </h3>
                    <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                      Overlap analysis of local solar irradiance vs. simulated macromolecular pigment receptors.
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 block">Overlap Efficiency</span>
                    <span className="text-2xl font-bold font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                      {bioMetrics.efficiencyPercent}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Dynamic SVG Plot */}
              <div className="bg-slate-950/90 border border-slate-800 p-2 sm:p-4 rounded-xl relative overflow-hidden flex-1 min-h-[180px] sm:min-h-[220px] flex flex-col justify-between">
                <div className="absolute top-2 right-2 flex gap-3 text-[9px] font-mono z-10 bg-slate-950/80 py-1 px-2 rounded border border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-1.5 rounded bg-emerald-500 block" />
                    <span className="text-slate-300">Pigment Absorbance</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-1.5 rounded bg-amber-500 block" />
                    <span className="text-slate-300">Stellar Solar Output</span>
                  </div>
                </div>

                {/* SVG Render Graph */}
                <div className="w-full flex-1 relative flex items-center mt-4">
                  <svg viewBox="0 0 400 120" className="w-full h-full overflow-visible">
                    {/* Grid lines */}
                    <line x1="0" y1="100" x2="400" y2="100" stroke="#1e293b" strokeWidth="1" />
                    <line x1="0" y1="60" x2="400" y2="60" stroke="#0f172a" strokeDasharray="3,3" />
                    <line x1="0" y1="20" x2="400" y2="20" stroke="#0f172a" strokeDasharray="3,3" />

                    <line x1="80" y1="0" x2="80" y2="100" stroke="#0f172a" strokeDasharray="3,3" />
                    <line x1="160" y1="0" x2="160" y2="100" stroke="#0f172a" strokeDasharray="3,3" />
                    <line x1="240" y1="0" x2="240" y2="100" stroke="#0f172a" strokeDasharray="3,3" />
                    <line x1="320" y1="0" x2="320" y2="100" stroke="#0f172a" strokeDasharray="3,3" />

                    {/* Stellar Intensity curve */}
                    {/* Alter shape of solar curve depending on star selection */}
                    <path
                      d={
                        starType === 'M'
                          ? "M 0,95 Q 120,-10 280,30 Q 360,60 400,98"
                          : starType === 'K'
                          ? "M 0,90 Q 150,0 220,10 Q 320,80 400,98"
                          : starType === 'G'
                          ? "M 0,90 Q 180,-15 200,-5 Q 300,70 400,98"
                          : "M 0,10 Q 80,0 160,50 Q 280,90 400,98"
                      }
                      fill="none"
                      stroke="#d97706"
                      strokeWidth="2"
                      opacity="0.85"
                    />

                    {/* Pigment Absorbance peaks depending on choice */}
                    <path
                      d={
                        pigmentType === 'chlorophyll_x'
                          ? "M 0,98 Q 50,85 100,98 Q 180,95 240,65 Q 260,10 270,95 T 320,15 T 360,98 font"
                          : pigmentType === 'chlorophyll_a'
                          ? "M 0,98 Q 30,10 60,98 Q 140,95 240,98 Q 280,15 320,98"
                          : pigmentType === 'bacterio_infrared'
                          ? "M 0,98 Q 150,95 220,98 Q 280,85 320,10 Q 360,-20 380,95"
                          : pigmentType === 'retinal_magenta'
                          ? "M 0,98 Q 100,95 180,5 Q 220,98 Q 300,95 400,98"
                          : "M 0,98 Q 150,90 220,20 Q 250,95 320,95"
                      }
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                    />

                    {/* Active vertical marker matching sliders */}
                    <line
                      x1={(atmosphereOpacity * 4).toString()}
                      y1="0"
                      x2={(atmosphereOpacity * 4).toString()}
                      y2="100"
                      stroke="#06b6d4"
                      strokeWidth="1.5"
                      opacity="0.6"
                      strokeDasharray="2,2"
                    />
                  </svg>
                </div>

                {/* Graph Axis labels */}
                <div className="flex justify-between font-mono text-[9px] text-gray-500 border-t border-slate-900/40 pt-1.5 shrink-0 select-none">
                  <span>UV 380nm</span>
                  <span>Visible 450nm</span>
                  <span>Photosynthetic 680nm</span>
                  <span>Far-Red 772nm</span>
                  <span>Infrared 950nm</span>
                </div>
              </div>

              {/* Foliage Leaf Render and bio evaluation summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-4 border-t border-slate-800/60 font-mono text-xs text-gray-400">
                <div className="bg-slate-950/65 border border-slate-900 rounded-xl p-3">
                  <span className="text-[10px] text-gray-500 block uppercase mb-1">Star System Spectrum</span>
                  <div className="flex items-center gap-2 text-white">
                    <Sun className="w-4 h-4 text-orange-400" />
                    <span>{bioMetrics.starName}</span>
                  </div>
                  <span className="text-[10px] block mt-1">Solar Peak Wavelength: <b className="text-zinc-300">{bioMetrics.peakWavelength}</b></span>
                </div>

                <div className="bg-slate-950/65 border border-slate-900 rounded-xl p-3 flex items-center gap-3">
                  {/* Virtual Canopy Color Indicator Preview */}
                  <div
                    className="w-12 h-12 rounded-xl shrink-0 border border-slate-700/80 shadow-inner flex items-center justify-center relative group"
                    style={{ backgroundColor: bioMetrics.foliageColorHex }}
                  >
                    <Leaf className="w-5 h-5 text-emerald-400 opacity-60 group-hover:opacity-100 transition-opacity" />
                    {/* pulse overlay */}
                    <span className="absolute inset-0 rounded-xl border border-emerald-500/20 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block uppercase">Canopy Adaptation Leaf Tint</span>
                    <span className="text-white font-bold block leading-snug">{bioMetrics.foliageColorName}</span>
                    <span className="text-[10px] text-zinc-500">Render Hex: {bioMetrics.foliageColorHex}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT PANEL (5 columns wide): INTERACTIVE CONSOLES TAB BAR */}
          <div className="lg:col-span-5 flex flex-col gap-6" id="right-workspace">
            <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-md rounded-2xl flex-1 flex flex-col min-h-[500px]" id="consoletabs-wrapper">
              
              {/* Tab Selector Buttons */}
              <div className="flex border-b border-slate-800 p-2 gap-2 shrink-0 bg-slate-950/40 rounded-t-2xl">
                <button
                  onClick={() => setActiveTab('terminal')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'terminal'
                      ? 'bg-slate-800 text-white shadow-inner border border-slate-700/60'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
                  }`}
                  id="tab-btn-terminal"
                >
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>AI DIAGNOSTICIAN</span>
                </button>

                <button
                  onClick={() => setActiveTab('vault')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'vault'
                      ? 'bg-slate-800 text-white shadow-inner border border-slate-700/60'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
                  }`}
                  id="tab-btn-vault"
                >
                  <BookOpen className="w-4 h-4 text-cyan-400" />
                  <span>FIELD MOLECULES VAULT</span>
                  {savedNotes.length > 0 && (
                    <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                      {savedNotes.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('corpus')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'corpus'
                      ? 'bg-slate-800 text-white shadow-inner border border-slate-700/60'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
                  }`}
                  id="tab-btn-corpus"
                >
                  <Layers className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span>COGNITIVE CORPUS</span>
                </button>
              </div>

              {/* TAB CONTENT 1: AI DIAGNOSTIC ORACLE PANEL */}
              {activeTab === 'terminal' && (
                <div className="flex-1 flex flex-col justify-between p-4 sm:p-5 relative overflow-hidden" id="tab-terminal">
                  
                  {/* Chat logs */}
                  <div className="flex-1 space-y-4 overflow-y-auto mb-4 pr-1 scrollbar-thin max-h-[480px]">
                    {chatMessages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 select-none">
                          <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider">
                            {msg.role === 'user' ? 'SYSTEM OFFICER' : 'BIO-ARC-772 COGNITIVE ENGINE'}
                          </span>
                        </div>
                        <div
                          className={`p-3.5 rounded-2xl max-w-[90%] text-sm font-sans leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-100 rounded-tr-none'
                              : 'bg-slate-950/80 border border-slate-800/80 text-gray-300 rounded-tl-none font-mono text-xs border-l-2 border-l-cyan-500'
                          }`}
                        >
                          <div>{msg.content}</div>
                          
                          {msg.pigment_data && (
                            <div className="mt-4 p-4 bg-slate-900 border border-amber-500/20 text-slate-100 rounded-xl space-y-3 font-mono text-[11px] border-l-4 border-l-amber-500">
                              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                                <span className="text-amber-400 font-bold tracking-wider uppercase text-[10px] flex items-center gap-1.5 animate-pulse">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  PIGMENT DIAGNOSTIC DATA
                                </span>
                                <span className="text-slate-500 text-[10px] uppercase font-bold">BIO-ARC-772</span>
                              </div>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-[10px]">
                                <div>
                                  <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Molecule Name</span>
                                  <span className="text-white font-semibold">{msg.pigment_data.molecule_name}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Chemical Formula</span>
                                  <span className="text-emerald-300 font-semibold">{msg.pigment_data.formula}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Molecular Weight</span>
                                  <span className="text-cyan-300 font-semibold">{msg.pigment_data.molecular_weight} g/mol</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Phylo Confidence</span>
                                  <span className="text-emerald-400 font-extrabold">{(msg.pigment_data.phylo_confidence * 100).toFixed(0)}%</span>
                                </div>
                                <div className="col-span-1 sm:col-span-2">
                                  <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Estimated Divergence Date</span>
                                  <span className="text-amber-200 font-semibold">{msg.pigment_data.divergence_date}</span>
                                </div>
                              </div>

                              {msg.pigment_data.absorption_peaks && msg.pigment_data.absorption_peaks.length > 0 && (
                                <div className="pt-1">
                                  <span className="text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-1.5">Absorption Peaks</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {msg.pigment_data.absorption_peaks.map((peak: number, pIdx: number) => (
                                      <span key={pIdx} className="bg-slate-950 px-2.5 py-0.5 rounded text-[10px] text-cyan-400 font-bold border border-cyan-500/20">
                                        {peak} nm
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {msg.pigment_data.suggested_evo_branches && msg.pigment_data.suggested_evo_branches.length > 0 && (
                                <div className="border-t border-slate-850 pt-2.5">
                                  <span className="text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-2">Phylochemical Lineages / Evo Branches</span>
                                  <div className="space-y-1.5">
                                    {msg.pigment_data.suggested_evo_branches.map((branch: any, bIdx: number) => (
                                      <div key={bIdx} className="flex items-center justify-between text-[10px] bg-slate-950 px-2.5 py-1.5 rounded border border-slate-850">
                                        <span className="text-emerald-300 font-bold">{branch.name}</span>
                                        <span className="text-slate-400 font-semibold">{branch.mya} MYA (million years ago)</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isAwaitingFirstToken ? (
                      <div className="flex flex-col items-start font-mono w-full" id="awaiting-token-skeleton">
                        <span className="text-[9px] text-slate-500 mb-1.5 uppercase tracking-widest animate-pulse">Transmitting Telemetry...</span>
                        <div className="w-full max-w-[85%] bg-slate-950/80 border border-slate-800/80 p-4 rounded-xl rounded-tl-none space-y-2.5 animate-pulse">
                          <div className="h-3 w-3/4 bg-slate-800 rounded-md" />
                          <div className="h-3 w-1/2 bg-slate-800 rounded-md" />
                          <div className="h-2.5 w-5/6 bg-slate-850 rounded-md" />
                        </div>
                      </div>
                    ) : (
                      isChatLoading && (
                        <div className="flex flex-col items-start font-mono">
                          <span className="text-[9px] text-slate-500 mb-1">DECRYPTING FREQUENCY BOUNDS...</span>
                          <div className="p-3 bg-slate-950/50 border border-slate-900 text-xs text-gray-500 rounded-xl flex items-center gap-2 rounded-tl-none">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                            <span>Receiving quantum spectral bands...</span>
                          </div>
                        </div>
                      )
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Suggestion prompt presets */}
                  <div className="mb-3 pt-3 border-t border-slate-800/40 select-none">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-1.5">Canopy Preset Diagnostics</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "Calculate solar flux overlaps",
                        "Optimize far-red Chlorophyll X-772",
                        "Diagnose M-dwarf stellar emission"
                      ].map((preset, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => {
                            setChatInput(preset);
                          }}
                          className="text-[10px] font-mono py-1 px-2 border border-slate-850 bg-slate-950 hover:bg-slate-900 border-slate-800/80 text-slate-300 rounded hover:border-emerald-500/50 transition-all text-left"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chat input form */}
                  <form onSubmit={submitChat} className="relative mt-2 shrink-0">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask the AI diag oracle..."
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                    />
                    <button
                      type="submit"
                      disabled={isChatLoading || !chatInput.trim()}
                      className="absolute right-2.5 top-2.5 p-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 rounded-lg transition-all disabled:opacity-30 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {/* TAB CONTENT 2: NOTES FIELD MOLECULAR VAULT */}
              {activeTab === 'vault' && (
                <div className="flex-1 flex flex-col p-4 sm:p-5 overflow-hidden" id="tab-vault">
                  
                  {/* Create A Note Entry Form */}
                  <form onSubmit={submitNote} className="space-y-3.5 mb-5 bg-slate-950/50 border border-slate-850 p-4 rounded-xl relative shrink-0">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                      <span className="text-[10px] font-mono font-bold uppercase text-cyan-400 tracking-widest flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" /> Commit Spectra Diagnosis Case
                      </span>
                    </div>

                    {notesNotification && (
                      <div className={`p-2.5 rounded text-[11px] font-mono flex items-start gap-2 ${
                        notesNotification.type === 'success'
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                      }`}>
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{notesNotification.msg}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <input
                          type="text"
                          required
                          placeholder="Diagnostics Case Title..."
                          value={noteTitle}
                          onChange={(e) => setNoteTitle(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-white placeholder-gray-500 outline-none focus:border-cyan-500 transition-all font-mono"
                        />
                      </div>

                      <div>
                        <select
                          value={noteTag}
                          onChange={(e) => setNoteTag(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-zinc-300 outline-none focus:border-cyan-500 transition-all font-mono cursor-pointer"
                        >
                          <option value="#CanopySpectra">#CanopySpectra</option>
                          <option value="#PigmentPhylo">#PigmentPhylo</option>
                          <option value="#Chlorophyll-X">#Chlorophyll-X</option>
                          <option value="#Atmospheric-772">#Atmospheric-772</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <textarea
                        required
                        rows={2}
                        placeholder="Establish findings on wavelength shift transitions, chlorophyll configurations, or spectral peak deviations..."
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-white placeholder-gray-500 outline-none focus:border-cyan-500 transition-all font-sans leading-normal resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isNoteSaving}
                      className="w-full py-2 px-3 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-semibold rounded-lg text-xs font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                    >
                      {isNoteSaving ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                      ) : (
                        <>
                          <Database className="w-3.5 h-3.5" />
                          <span>COMMIT CASE TO VAULT</span>
                        </>
                      )}
                    </button>
                  </form>

                  {/* List, Search and Filter saved notes */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center gap-2 mb-3 bg-slate-950/30 p-2 border border-slate-900 rounded-xl shrink-0">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500">
                          <Search className="w-3.5 h-3.5" />
                        </span>
                        <input
                          type="text"
                          placeholder="Search vault cases..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 pl-8 pr-3 text-xs text-white placeholder-gray-500 outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>

                      {/* Filter pills */}
                      <select
                        value={selectedTagFilter}
                        onChange={(e) => setSelectedTagFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-850 text-slate-300 py-1.5 px-2 rounded-lg text-xs font-mono outline-none focus:border-cyan-550 cursor-pointer"
                      >
                        {allTags.map((t, tIdx) => (
                          <option key={tIdx} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Notes items display */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin max-h-[290px]">
                      {filteredNotes.length === 0 ? (
                        <div className="text-center py-8 bg-slate-950/30 border border-slate-900 rounded-xl border-dashed">
                          <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                          <p className="text-xs text-slate-400 font-mono">No committed molecular records matched parameters.</p>
                        </div>
                      ) : (
                        filteredNotes.map((note) => (
                          <div
                            key={note.uuid}
                            className="bg-slate-950/75 border border-slate-850 rounded-xl p-3.5 relative group hover:border-cyan-500/30 transition-all hover:bg-slate-950"
                          >
                            <div className="flex justify-between items-start gap-2 mb-1">
                              <h4 className="font-mono text-xs font-bold text-white leading-snug">
                                {note.title}
                              </h4>
                              <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-cyan-400 border border-cyan-500/10">
                                {note.tag}
                              </span>
                            </div>

                            <p className="text-xs text-slate-300 leading-normal mb-3 whitespace-pre-wrap font-sans">
                              {note.body}
                            </p>

                            <div className="flex items-center justify-between border-t border-slate-900/80 pt-2 font-mono text-[9px] text-gray-500 select-none">
                              <span className="truncate max-w-[150px]" title={`Full UUID: ${note.uuid}`}>
                                UUID: {note.uuid.substring(0, 18)}...
                              </span>
                              <div className="flex items-center gap-3.5">
                                <span>{note.timestamp}</span>
                                <button
                                  onClick={() => deleteNote(note.uuid)}
                                  className="text-gray-500 hover:text-rose-400 p-0.5 rounded transition-colors"
                                  title="Erase Note Vault Record"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT 3: COGNITIVE CORPUS KNOWLEDGE BASE */}
              {activeTab === 'corpus' && (
                <div className="flex-1 flex flex-col p-4 sm:p-5 overflow-hidden font-sans" id="tab-corpus">
                  <div className="mb-4 shrink-0">
                    <h3 className="text-white text-sm font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
                      <Layers className="w-4 h-4" />
                      COGNITIVE CORPUS KNOWLEDGE BASE
                    </h3>
                    <p className="text-[11px] text-gray-400 font-mono mt-1">
                      Upload planetary guides or botanical reference PDF files. Chunks are embedded and referenced dynamically during active diagnostic sessions.
                    </p>
                  </div>

                  {corpusNotification && (
                    <div className={`p-3 rounded-xl text-xs font-mono mb-4 flex items-start gap-2.5 shrink-0 ${
                      corpusNotification.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                    }`}>
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{corpusNotification.msg}</span>
                    </div>
                  )}

                  {/* Drag-and-drop uploader area */}
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center gap-4 cursor-pointer relative shrink-0 ${
                      isDragActive
                        ? 'border-emerald-400 bg-emerald-500/5'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700/80 hover:bg-slate-950/60'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setCorpusFile(file);
                          handleCorpusUpload(file);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={isCorpusUploading}
                    />

                    <div className="p-3.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400">
                      {isCorpusUploading ? (
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                      ) : (
                        <Database className="w-6 h-6 text-amber-400 animate-pulse" />
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-mono text-white font-bold">
                        {isCorpusUploading ? 'Ingesting planetary files...' : 'Drag and Drop Spectra PDF or click to browse'}
                      </p>
                      <p className="text-[10px] text-gray-450 font-mono mt-1">
                        PDF files are parsed, split into 500-char chunks, and vector mapped.
                      </p>
                    </div>

                    {corpusFile && (
                      <span className="text-[10px] font-mono font-semibold py-1 px-2.5 rounded bg-slate-905 border border-slate-800 text-teal-400 max-w-full truncate">
                        Queued: {corpusFile.name}
                      </span>
                    )}
                  </div>

                  {/* Uploaded items listing */}
                  <div className="mt-5 flex-1 flex flex-col min-h-0">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-2 border-b border-slate-900 pb-1 shrink-0">
                      Active Ingested Files Map ({uploadedFiles.length})
                    </span>
                    
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[160px] scrollbar-thin">
                      {uploadedFiles.length === 0 ? (
                        <div className="text-center py-6 text-[11px] font-mono text-gray-500 bg-slate-950/25 border border-slate-900 rounded-xl border-dashed">
                          No physical PDF manuals cataloged yet.
                        </div>
                      ) : (
                        uploadedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950 border border-slate-850 p-2.5 rounded-xl flex items-center justify-between font-mono text-xs text-slate-300 hover:border-amber-500/25 transition-all"
                          >
                            {file.s3Url ? (
                              <a 
                                href={file.s3Url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="truncate max-w-[200px] text-slate-200 hover:text-amber-400 underline decoration-dotted transition-all"
                                title={`Click to view raw document on AWS S3: ${file.name}`}
                              >
                                {file.name}
                              </a>
                            ) : (
                              <span className="truncate max-w-[200px] text-slate-100" title={file.name}>{file.name}</span>
                            )}
                            <span className="shrink-0 text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 py-0.5 px-2 rounded-full font-bold">
                              {file.chunks} chunks
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* FOOTER STATS PANEL */}
      <footer className="border-t border-slate-900 bg-slate-950/85 z-10 px-4 py-2 text-center text-[10px] font-mono text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-1 select-none" id="footer-system-hud">
        <span>BIO-ARC-772 MULTISPECTRAL SIMULATOR MODULE V1.0.0</span>
        <div className="flex items-center gap-4">
          <span>COGNITIVE MATRIX ONLINE</span>
          <span>SYSTEM CHRONOS: {new Date().toLocaleTimeString()} UTC</span>
        </div>
      </footer>
    </div>
  );
}
