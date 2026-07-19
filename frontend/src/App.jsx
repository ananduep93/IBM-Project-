import React, { useState, useEffect, useRef } from 'react';
import { auth } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import './App.css';

const API_URL = '';

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024, dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getClientId = (uid) => {
  if (uid) return uid;
  let id = localStorage.getItem('aura_anon_id');
  if (!id) { id = 'anon_' + Math.random().toString(36).slice(2, 15); localStorage.setItem('aura_anon_id', id); }
  return id;
};

const renderMd = (md) => {
  if (!md) return '';
  const lines = md.split('\n');
  const out = []; let inUl = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('- ') || t.startsWith('* ')) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${t.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`);
    } else {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (t.startsWith('#### ')) out.push(`<h4>${t.slice(5)}</h4>`);
      else if (t.startsWith('### ')) out.push(`<h3>${t.slice(4)}</h3>`);
      else if (t.startsWith('## ')) out.push(`<h2>${t.slice(3)}</h2>`);
      else if (t.startsWith('# ')) out.push(`<h1>${t.slice(2)}</h1>`);
      else if (t === '---' || t === '***') out.push('<hr />');
      else if (t) out.push(`<p>${t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`);
    }
  }
  if (inUl) out.push('</ul>');
  return out.join('\n');
};

// ─────────────────────────────────────────────
// CIRCULAR PROGRESS SVG
// ─────────────────────────────────────────────
function Ring({ value = 0, size = 96, stroke = 8, color = '#7c3aed', label = '' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="ring-svg">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1.2s ease' }} />
      <text x="50%" y="46%" dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize={size * 0.22} fontWeight="700" fontFamily="Outfit">{value}</text>
      {label && <text x="50%" y="68%" dominantBaseline="middle" textAnchor="middle" fill="#94a3b8" fontSize={size * 0.13} fontFamily="Inter">{label}</text>}
    </svg>
  );
}

// ─────────────────────────────────────────────
// LOADING SCREEN
// ─────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="splash-screen">
      <img src="/logo.png" className="splash-logo" alt="AURA" />
      <span className="splash-brand">AURA</span>
      <span className="splash-sub">Loading workspace...</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// AUTH SCREEN
// ─────────────────────────────────────────────
function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const friendlyErr = (err) => {
    const code = err.code;
    const msg = err.message;
    const map = {
      'auth/email-already-in-use': 'This username is already taken.',
      'auth/invalid-email': 'Invalid username format.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/user-not-found': 'Username not found.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-credential': 'Incorrect username or password.',
      'auth/operation-not-allowed': 'Email/Password authentication is not enabled in your Firebase console. Please go to Authentication > Sign-in method and enable Email/Password.',
    };
    return map[code] || `${msg || 'Something went wrong.'} (${code})`;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const username = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!username) {
      setError('Username must contain letters or numbers.');
      setLoading(false);
      return;
    }
    // Generate derived local email address for Firebase Auth backend compatibility
    const derivedEmail = `${username}@aura.local`;

    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, derivedEmail, password);
        await updateProfile(cred.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, derivedEmail, password);
      }
    } catch (err) {
      setError(friendlyErr(err));
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-screen">
      <div className="auth-blobs">
        <div className="ab ab1" /><div className="ab ab2" /><div className="ab ab3" />
      </div>
      <div className="auth-card">
        <div className="auth-logo"><img src="/logo.png" className="logo-img animated-logo" alt="AURA" /><span>AURA</span></div>
        <p className="auth-tagline">Intelligent Document Workspace</p>
        <h2 className="auth-heading">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
        <p className="auth-sub">{mode === 'signup' ? 'Start analyzing documents with AI' : 'Sign in to your workspace'}</p>
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-field">
            <label>Username / Name</label>
            <input type="text" placeholder="e.g. anand" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <div className="auth-error">⚠️ {error}</div>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? <span className="dot-spin" /> : (mode === 'signup' ? '✨ Create Account' : '→ Sign In')}
          </button>
        </form>
        <p className="auth-toggle">
          {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}
          <button onClick={() => { setMode(m => m === 'signup' ? 'signin' : 'signup'); setError(''); }}>
            {mode === 'signup' ? ' Sign In' : ' Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HERO SCREEN
// ─────────────────────────────────────────────
function HeroScreen({ user, documents, onUpload, onSelectDoc, isUploading, uploadError, onSettingsOpen }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState('');

  const drop = (e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onUpload(f); };
  
  // Robust username extractor
  const getFirstName = () => {
    if (user?.displayName) return user.displayName.split(' ')[0];
    if (user?.email) {
      const emailName = user.email.split('@')[0];
      return emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    return 'User';
  };
  const firstName = getFirstName();
  const filtered = documents.filter(d => d.filename.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="hero" onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
      <div className="hero-bg">
        <div className="hblob hb1" /><div className="hblob hb2" /><div className="hblob hb3" />
        <div className="star-field" />
      </div>

      <header className="hero-nav">
        <div className="nav-brand"><img src="/logo.png" className="logo-img animated-logo" alt="AURA" /><span>AURA</span></div>
        <div className="nav-user">
          <div className="nav-avatar">{firstName.charAt(0).toUpperCase()}</div>
          <span className="nav-name">{user?.displayName || firstName}</span>
          <button className="settings-btn" onClick={onSettingsOpen} title="API Settings">⚙️</button>
          <button className="nav-signout" onClick={() => signOut(auth)} title="Sign Out">↩ Sign Out</button>
        </div>
      </header>

      <main className="hero-main">
        <p className="hero-greeting">Hello, {firstName} 👋</p>
        <h1 className="hero-headline">Drop your document.<br /><span className="grad-text">Unleash Intelligence.</span></h1>
        <p className="hero-desc">Upload any PDF or TXT — AURA reveals deep insights, summaries, entities, tone analysis, and answers any question you ask.</p>

        <div className={`hero-zone ${dragging ? 'zone-drag' : ''} ${isUploading ? 'zone-busy' : ''}`} onClick={() => !isUploading && fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".pdf,.txt" style={{ display: 'none' }} onChange={e => onUpload(e.target.files[0])} />
          {isUploading
            ? <div className="zone-inner"><div className="upload-spin" /><span>Uploading & processing document...</span></div>
            : dragging
              ? <div className="zone-inner"><span style={{ fontSize: '2.5rem' }}>🚀</span><span>Release to analyze</span></div>
              : <div className="zone-inner">
                  <div className="zone-icon">📄</div>
                  <span className="zone-title">Drop your document anywhere</span>
                  <span className="zone-sub">PDF or TXT · Drag & drop or click to browse · Max 20 MB</span>
                  <span className="zone-cta">Browse Files →</span>
                </div>
          }
        </div>
        {uploadError && <div className="upload-err">⚠️ {uploadError}</div>}
      </main>

      {documents.length > 0 && (
        <aside className="hero-recent">
          <div className="recent-top">
            <span className="recent-label">📂 Recent Documents</span>
            <input className="recent-search" type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="recent-items">
            {filtered.map((doc, i) => (
              <div key={doc.id} className="recent-item" onClick={() => onSelectDoc(doc.id)} style={{ animationDelay: `${i * 0.04}s` }}>
                <span className="ri-icon">{doc.mime_type === 'application/pdf' ? '📄' : '📝'}</span>
                <div className="ri-info"><span className="ri-name">{doc.filename}</span><span className="ri-size">{formatBytes(doc.size)}</span></div>
                <span className="ri-arrow">→</span>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PREVIEW SCREEN
// ─────────────────────────────────────────────
function PreviewScreen({ doc, pdfDoc, pageNum, numPages, zoomMultiplier, setPageNum, setZoomMultiplier, canvasRef, containerRef, thumbnails, onStart, onBack, isAnalysed }) {
  return (
    <div className="preview-screen">
      <header className="preview-nav">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <span className="prev-title">📄 {doc?.filename}</span>
        <span className="prev-size">{formatBytes(doc?.size)}</span>
      </header>

      <div className="preview-body">
        {/* PDF panel */}
        <div className="preview-pdf">
          <div className="pdf-toolbar">
            {pdfDoc ? <>
              <button className="ptb" onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1}>◀</button>
              <span className="pdf-pages">{pageNum} / {numPages}</span>
              <button className="ptb" onClick={() => setPageNum(p => Math.min(numPages, p + 1))} disabled={pageNum >= numPages}>▶</button>
              <div className="pdf-zoom">
                <button className="ptb" onClick={() => setZoomMultiplier(z => Math.max(0.4, parseFloat((z - 0.15).toFixed(2))))}>−</button>
                <span>{Math.round(zoomMultiplier * 100)}%</span>
                <button className="ptb" onClick={() => setZoomMultiplier(z => Math.min(3.0, parseFloat((z + 0.15).toFixed(2))))}>+</button>
              </div>
            </> : <span className="pdf-loading-txt">Loading preview...</span>}
          </div>

          <div className="pdf-canvas-wrap" ref={containerRef}>
            {pdfDoc
              ? <div className="canvas-frame"><canvas ref={canvasRef} /></div>
              : <div className="pdf-skel"><div className="skel" /><div className="skel s2" /><div className="skel" /><div className="skel s3" /></div>
            }
          </div>

          {thumbnails.length > 0 && (
            <div className="thumb-strip">
              {thumbnails.map((t, i) => (
                <img key={i} src={t} alt={`p${i + 1}`} className={`thumb ${pageNum === i + 1 ? 'thumb-active' : ''}`} onClick={() => setPageNum(i + 1)} />
              ))}
            </div>
          )}
        </div>

        {/* Info + CTA - Single Cohesive Liquid Glass Sidebar */}
        <div className="preview-info">
          <div className="liquid-preview-card">
            <div className="lpc-header">
              <div className="lpc-icon">📄</div>
              <h2 className="lpc-title">{doc?.filename}</h2>
              <div className="ready-badge">
                <span className="ready-dot" style={{ background: isAnalysed ? '#10b981' : '#15803d' }} />
                {isAnalysed ? 'Analysis Ready' : 'Ready for analysis'}
              </div>
            </div>

            {/* Typewriter details list */}
            <div className="lpc-details">
              <div className="lpc-row"><span className="lpc-lbl">FILE SIZE</span><span className="lpc-val">{formatBytes(doc?.size)}</span></div>
              <div className="lpc-row"><span className="lpc-lbl">FILE TYPE</span><span className="lpc-val monospace">{doc?.mime_type === 'application/pdf' ? 'PDF' : 'Text'}</span></div>
              {numPages > 0 && <div className="lpc-row"><span className="lpc-lbl">PAGES</span><span className="lpc-val monospace">{numPages}</span></div>}
            </div>

            <div className="lpc-divider" />

            <div className="lpc-features">
              <h3>What AURA will reveal</h3>
              <ul className="feat-list">
                {[
                  { icon: '✨', label: 'Executive Summary & Key Points' },
                  { icon: '🏷️', label: 'Keywords & Named Entities' },
                  { icon: '🎭', label: 'Tone & Complexity Analysis' },
                  { icon: '⏱️', label: 'Reading Time & Word Count' },
                  { icon: '✅', label: 'Action Items & Recommendations' },
                  { icon: '💬', label: 'Interactive Q&A Chat' },
                  { icon: '✏️', label: 'AI Text Rewriter (6 tones)' }
                ].map((f, i) => (
                  <li key={i} className="feat-item">
                    <span className="fi-icon">{f.icon}</span>
                    <span className="fi-label">{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button className="start-btn magnetic-btn" onClick={onStart}>
              <span className="start-glow" />
              <span>{isAnalysed ? '📊 View Insights' : '✨ Start AI Analysis'}</span>
            </button>
            <p className="cta-note">
              {isAnalysed ? 'Already analyzed. Opens instantly with zero token consumption.' : 'Powered by Google Gemini 2.5 Flash · Takes ~20-40 seconds'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ANALYZING SCREEN
// ─────────────────────────────────────────────
const STAGES = [
  { icon: '📖', msg: 'Reading document structure...', sub: 'Parsing layout, sections and formatting' },
  { icon: '🧠', msg: 'Understanding context & meaning...', sub: 'Building deep semantic comprehension' },
  { icon: '⚡', msg: 'Extracting insights & patterns...', sub: 'Identifying themes, entities and relationships' },
  { icon: '✨', msg: 'Generating intelligence report...', sub: 'Compiling your comprehensive analysis dashboard' },
];

function AnalyzingScreen({ progress, stageIdx, onCancel }) {
  const s = STAGES[Math.min(stageIdx, STAGES.length - 1)];
  return (
    <div className="analyzing">
      <div className="a-bg"><div className="a-b1" /><div className="a-b2" /></div>
      <div className="a-content">
        <div className="a-orb-wrap">
          <div className="a-orb" />
          <div className="a-ring ar1" /><div className="a-ring ar2" /><div className="a-ring ar3" />
          {[...Array(8)].map((_, i) => <div key={i} className="a-particle" style={{ '--pi': i }} />)}
        </div>
        <div className="a-text">
          <div className="a-icon">{s.icon}</div>
          <h2 className="a-msg">{s.msg}</h2>
          <p className="a-sub">{s.sub}</p>
        </div>
        <div className="stage-dots">
          {STAGES.map((_, i) => (
            <div key={i} className={`sdot ${i < stageIdx ? 'sdone' : i === stageIdx ? 'sact' : ''}`}>
              <div className="sdot-inner" />
              {i < STAGES.length - 1 && <div className={`sline ${i < stageIdx ? 'sdone' : ''}`} />}
            </div>
          ))}
        </div>
        <div className="a-prog-bar"><div className="a-prog-fill" style={{ width: `${progress}%` }} /></div>
        <span className="a-pct">{Math.round(progress)}%</span>
        
        <button className="cancel-analysis-btn" onClick={onCancel}>
          ⏹️ Stop Analysis
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
function Dashboard({ user, doc, analysis, chatMessages, setChatMessages, documents, onSelectDoc, onBack, onNewUpload, activeDocId, onSettingsOpen, apiRequests, onTrackRequest, onUpdateDoc }) {
  const [view, setView] = useState('insights'); // 'insights' | 'rewriter'
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [tone, setTone] = useState('Professional');
  const [rewriteResult, setRewriteResult] = useState('');
  const [rewriting, setRewriting] = useState(false);

  // Restore DB-persisted rewrite for the selected tone if available
  useEffect(() => {
    if (doc?.rewrite && doc.rewrite[tone]) {
      setRewriteResult(doc.rewrite[tone]);
    } else {
      setRewriteResult('');
    }
  }, [doc, tone]);
  const [docSearch, setDocSearch] = useState('');
  const [mobileSideOpen, setMobileSideOpen] = useState(false);
  const [speakingState, setSpeakingState] = useState('stopped'); // 'stopped' | 'playing' | 'paused'
  const chatEndRef = useRef(null);
  const clientId = getClientId(user?.uid);
  const msgs = chatMessages[activeDocId] || [];

  // Stop speech when switching documents
  useEffect(() => {
    window.speechSynthesis.cancel();
    setSpeakingState('stopped');
  }, [activeDocId]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const toggleSpeech = (text) => {
    if (speakingState === 'playing') {
      window.speechSynthesis.pause();
      setSpeakingState('paused');
    } else if (speakingState === 'paused') {
      window.speechSynthesis.resume();
      setSpeakingState('playing');
    } else {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[#*]/g, '');
      const u = new SpeechSynthesisUtterance(cleanText);
      u.onend = () => setSpeakingState('stopped');
      u.onerror = () => setSpeakingState('stopped');
      window.speechSynthesis.speak(u);
      setSpeakingState('playing');
    }
  };

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
    setSpeakingState('stopped');
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, streaming]);

  const sendChat = async () => {
    if (!chatInput.trim() || streaming) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setStreaming(true);
    const history = [...msgs, { role: 'user', content: userMsg }];
    setChatMessages(prev => ({ ...prev, [activeDocId]: history }));
    try {
      const res = await fetch(`${API_URL}/api/documents/${activeDocId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': clientId,
          'X-Gemini-Key': localStorage.getItem('aura_user_gemini_key') || ''
        },
        body: JSON.stringify({ chat_history: msgs, user_message: userMsg }),
      });
      let reply = '';
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        dec.decode(value).split('\n').filter(l => l.startsWith('data: ')).forEach(l => {
          try {
            const d = JSON.parse(l.slice(6));
            if (d.text) { reply += d.text; setChatMessages(prev => ({ ...prev, [activeDocId]: [...history, { role: 'assistant', content: reply }] })); }
          } catch {}
        });
      }
      onTrackRequest();
    } catch (e) { console.error('Chat err:', e); }
    finally { setStreaming(false); }
  };

  const doRewrite = async () => {
    setRewriting(true); setRewriteResult('');
    try {
      const r = await fetch(`${API_URL}/api/documents/${activeDocId}/rewrite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': clientId,
          'X-Gemini-Key': localStorage.getItem('aura_user_gemini_key') || ''
        },
        body: JSON.stringify({ tone }),
      });
      const d = await r.json();
      if (r.ok) {
        onTrackRequest();
        const updatedRewrite = { ...(doc?.rewrite || {}), [tone]: d.rewritten };
        onUpdateDoc({ rewrite: updatedRewrite });
        setRewriteResult(d.rewritten || '');
      } else {
        alert(d.detail || 'Rewrite failed.');
      }
    } catch (e) { console.error('Rewrite err:', e); }
    finally { setRewriting(false); }
  };

  const copy = (t) => navigator.clipboard.writeText(t);
  const dlMd = (t, n) => { const b = new Blob([t], { type: 'text/markdown' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = n; a.click(); URL.revokeObjectURL(u); };

  const tones = ['Professional', 'Casual', 'Academic', 'Persuasive', 'Simple', 'Creative'];
  const filtered = documents.filter(d => d.filename.toLowerCase().includes(docSearch.toLowerCase()));

  return (
    <div className="dashboard">
      {/* Sidebar overlay for mobile */}
      {mobileSideOpen && <div className="ds-overlay-mobile" onClick={() => setMobileSideOpen(false)} />}

      {/* Sidebar */}
      <aside className={`dash-side ${mobileSideOpen ? 'ds-open-mobile' : ''}`}>
        <div className="ds-brand">
          <img src="/logo.png" className="logo-img animated-logo" alt="AURA" />
          <span>AURA</span>
          <button className="ds-close-mobile" onClick={() => setMobileSideOpen(false)}>×</button>
        </div>
        <div className="ds-user">
          <div className="ds-avatar">{user?.displayName?.charAt(0)?.toUpperCase() || 'U'}</div>
          <div className="ds-uinfo">
            <span className="ds-uname">{user?.displayName || 'User'}</span>
            <span className="ds-uemail">{user?.email}</span>
          </div>
        </div>
        <button className="new-doc-btn" onClick={() => { onNewUpload(); setMobileSideOpen(false); }}>+ New Document</button>
        <input className="ds-search" type="text" placeholder="Search documents..." value={docSearch} onChange={e => setDocSearch(e.target.value)} />
        <div className="ds-list">
          <span className="ds-list-label">Workspace</span>
          {filtered.map(d => (
            <div key={d.id} className={`ds-item ${d.id === activeDocId ? 'ds-active' : ''}`} onClick={() => { onSelectDoc(d.id); setMobileSideOpen(false); }}>
              <span>{d.mime_type === 'application/pdf' ? '📄' : '📝'}</span>
              <span className="ds-iname">{d.filename}</span>
            </div>
          ))}
        </div>
        
        {/* API Quota Tracker Widget */}
        <div className="ds-quota-card">
          <div className="ds-qc-header">
            <span>📊 API Quota Tracker</span>
          </div>
          <div className="ds-qc-body">
            <div className="ds-qc-row">
              <span className="ds-qc-lbl">Requests Used</span>
              <span className="ds-qc-val">{apiRequests}</span>
            </div>
            <div className="ds-qc-row">
              <span className="ds-qc-lbl">Est. Tokens</span>
              <span className="ds-qc-val monospace">{apiRequests * 3800}</span>
            </div>
            <div className="ds-qc-row">
              <span className="ds-qc-lbl">Daily Quota</span>
              <span className="ds-qc-val">1,500</span>
            </div>
            
            <div className="ds-qc-progress-track">
              <div 
                className="ds-qc-progress-fill" 
                style={{ width: `${Math.min(100, (apiRequests / 1500) * 100)}%` }} 
              />
            </div>
            
            <div className="ds-qc-badge" style={{
              background: localStorage.getItem('aura_user_gemini_key') ? '#e2f0d9' : '#fff9e6',
              color: '#1a1a1a'
            }}>
              {localStorage.getItem('aura_user_gemini_key') ? '🔑 Custom API Key Active' : '⚠️ Shared Key Active'}
            </div>

            <div className="ds-qc-tip">
              <strong>💡 How to Ask AI:</strong> Click <strong>Ask AI</strong> in the top-right toolbar, type your question in the side panel, and hit enter!
            </div>
          </div>
        </div>

        <div className="ds-bottom-actions">
          <button className="ds-settings-btn" onClick={() => { onSettingsOpen(); setMobileSideOpen(false); }}>⚙️ API Settings</button>
          <button className="ds-signout" onClick={() => signOut(auth)}>↩ Sign Out</button>
        </div>
      </aside>

      {/* Main area */}
      <div className="dash-main">
        <header className="dash-bar">
          <div className="db-left">
            <button className="hamburger-btn" onClick={() => setMobileSideOpen(true)} title="Open Documents">☰</button>
            <button className="back-sm" onClick={onBack}>← Preview</button>
            <h1 className="db-title">📄 {doc?.filename}</h1>
          </div>
          <div className="db-actions">
            <button className={`dba ${view === 'insights' ? 'dba-act' : ''}`} onClick={() => setView('insights')}>✨ Insights</button>
            <button className={`dba ${view === 'rewriter' ? 'dba-act' : ''}`} onClick={() => setView('rewriter')}>✏️ Rewriter</button>
            <button className={`chat-toggle ${chatOpen ? 'ct-open' : ''}`} onClick={() => setChatOpen(o => !o)}>💬 {chatOpen ? 'Close Chat' : 'Ask AI'}</button>
          </div>
        </header>

        {/* INSIGHTS VIEW */}
        {view === 'insights' && analysis && (
          <div className="insights-area">
            <div className="insights-grid">

              {/* Executive Summary — full width */}
              <div className="icard card-full" style={{ '--cc': '#06b6d4' }}>
                <div className="ic-head">
                  <span className="ic-icon">✨</span><h3>Executive Summary</h3>
                  <div className="ic-acts">
                    <button className="summary-act-btn" onClick={() => copy(analysis.executive_summary)} title="Copy Content">
                      <span>📋 Copy</span>
                    </button>
                    
                    <button className={`summary-act-btn tts-btn ${speakingState !== 'stopped' ? 'tts-active' : ''}`}
                      onClick={() => toggleSpeech(analysis.executive_summary)} 
                      title={speakingState === 'playing' ? 'Pause Audio' : 'Listen / Resume'}>
                      <span>{speakingState === 'playing' ? '⏸️ Pause' : '🔊 Listen'}</span>
                    </button>

                    {speakingState !== 'stopped' && (
                      <button className="summary-act-btn tts-stop-btn" onClick={stopSpeech} title="Stop Audio">
                        <span>⏹️ Stop</span>
                      </button>
                    )}

                    <button className="summary-act-btn" onClick={() => dlMd(analysis.executive_summary, 'summary.md')} title="Download Report">
                      <span>⬇️ Download</span>
                    </button>

                    {speakingState === 'playing' && (
                      <div className="audio-wave" title="Audio Playing">
                        <span className="wave-bar wb1" />
                        <span className="wave-bar wb2" />
                        <span className="wave-bar wb3" />
                        <span className="wave-bar wb4" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="ic-body md-body" dangerouslySetInnerHTML={{ __html: renderMd(analysis.executive_summary) }} />
              </div>

              {/* Key Points */}
              {analysis.key_points?.length > 0 && (
                <div className="icard" style={{ '--cc': '#7c3aed' }}>
                  <div className="ic-head"><span className="ic-icon">📌</span><h3>Key Points</h3></div>
                  <ul className="kp-list">{analysis.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}

              {/* Action Items */}
              {analysis.action_items?.length > 0 && (
                <div className="icard" style={{ '--cc': '#f43f5e' }}>
                  <div className="ic-head"><span className="ic-icon">✅</span><h3>Action Items</h3></div>
                  <ul className="ai-list">{analysis.action_items.map((a, i) => <li key={i}><span className="ai-box">□</span>{a}</li>)}</ul>
                </div>
              )}

              {/* Keywords */}
              {analysis.keywords?.length > 0 && (
                <div className="icard" style={{ '--cc': '#10b981' }}>
                  <div className="ic-head"><span className="ic-icon">🏷️</span><h3>Keywords</h3></div>
                  <div className="kw-cloud">{analysis.keywords.map((k, i) => <span key={i} className="kw-tag" style={{ '--h': (i * 43) % 360 }}>{k}</span>)}</div>
                </div>
              )}

              {/* Tone */}
              {analysis.tone && (
                <div className="icard" style={{ '--cc': '#f59e0b' }}>
                  <div className="ic-head"><span className="ic-icon">🎭</span><h3>Tone Analysis</h3></div>
                  <div className="tone-pill">{analysis.tone}</div>
                  {analysis.tone_breakdown && (
                    <div className="tone-bars">
                      {Object.entries(analysis.tone_breakdown).map(([k, v]) => (
                        <div key={k} className="tbar">
                          <span className="tbar-lbl">{k}</span>
                          <div className="tbar-track"><div className="tbar-fill" style={{ width: `${v}%` }} /></div>
                          <span className="tbar-pct">{v}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Named Entities */}
              {analysis.named_entities && Object.values(analysis.named_entities).some(v => v?.length > 0) && (
                <div className="icard" style={{ '--cc': '#8b5cf6' }}>
                  <div className="ic-head"><span className="ic-icon">👤</span><h3>Named Entities</h3></div>
                  <div className="ent-groups">
                    {Object.entries(analysis.named_entities).filter(([, v]) => v?.length > 0).map(([cat, items]) => (
                      <div key={cat} className="ent-group">
                        <span className="ent-cat">{cat}</span>
                        <div className="ent-tags">{items.map((it, i) => <span key={i} className="ent-tag">{it}</span>)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {analysis.recommendations?.length > 0 && (
                <div className="icard" style={{ '--cc': '#06b6d4' }}>
                  <div className="ic-head"><span className="ic-icon">💡</span><h3>Recommendations</h3></div>
                  <ol className="rec-list">{analysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ol>
                </div>
              )}
            </div>
          </div>
        )}

        {/* REWRITER VIEW */}
        {view === 'rewriter' && (
          <div className="rewriter-area">
            <div className="rw-head">
              <h2>✏️ AI Text Rewriter</h2>
              <p>Transform this document's content into a different tone or style</p>
            </div>
            <div className="tone-grid">{tones.map(t => <button key={t} className={`tone-chip ${tone === t ? 'tc-act' : ''}`} onClick={() => setTone(t)}>{t}</button>)}</div>
            <button className="rw-btn" onClick={doRewrite} disabled={rewriting}>
              {rewriting ? <><span className="dot-spin" /> Rewriting document...</> : '✨ Rewrite in ' + tone + ' Tone'}
            </button>
            {rewriteResult && (
              <div className="rw-result">
                <div className="rw-result-head">
                  <span>Rewritten in <strong>{tone}</strong> tone</span>
                  <div><button onClick={() => copy(rewriteResult)}>📋 Copy</button><button onClick={() => dlMd(rewriteResult, `rewrite_${tone}.md`)}>⬇️ Download</button></div>
                </div>
                <div className="rw-body md-body" dangerouslySetInnerHTML={{ __html: renderMd(rewriteResult) }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat panel */}
      {chatOpen && (
        <div className="chat-panel cp-open">
          <div className="cp-head">
            <div><h3>💬 Ask AURA</h3><span className="cp-doc">{doc?.filename}</span></div>
            <button className="cp-close" onClick={() => setChatOpen(false)}>×</button>
          </div>
          <div className="cp-messages">
            {msgs.length === 0 && (
              <div className="cp-empty">
                <div className="cp-empty-orb" />
                <p>Ask anything about this document</p>
                <div className="cp-suggestions">
                  {['Summarize in 3 sentences', 'What are the main conclusions?', 'List all action items', 'What is the document about?'].map(s => (
                    <button key={s} className="sug-chip" onClick={() => setChatInput(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.role === 'assistant' && <span className="bubble-ico">✨</span>}
                <div className="bubble-txt" dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
              </div>
            ))}
            {streaming && <div className="bubble assistant"><span className="bubble-ico">✨</span><div className="typing"><span /><span /><span /></div></div>}
            <div ref={chatEndRef} />
          </div>
          <div className="cp-input">
            <input className="cp-inp" value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
              placeholder="Ask anything about this document..." />
            <button className="cp-send" onClick={sendChat} disabled={streaming || !chatInput.trim()}>↑</button>
          </div>
        </div>
      )}
      {chatOpen && <div className="cp-overlay" onClick={() => setChatOpen(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
function MainApp({ user }) {
  const [step, setStep] = useState('hero');
  const [documents, setDocuments] = useState([]);
  const [activeDocId, setActiveDocId] = useState(null);
  const [activeDoc, setActiveDoc] = useState(null);
  const [analysisCache, setAnalysisCache] = useState(() => { try { return JSON.parse(localStorage.getItem('aura_v3_analysis') || '{}'); } catch { return {}; } });
  const [chatMessages, setChatMessages] = useState(() => { try { return JSON.parse(localStorage.getItem('aura_v3_chats') || '{}'); } catch { return {}; } });
  const [isUploading, setIsUploading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('aura_user_gemini_key') || '');
  const [apiRequests, setApiRequests] = useState(() => {
    const val = parseInt(localStorage.getItem('aura_api_request_count'), 10);
    return isNaN(val) ? 0 : val;
  });

  const trackRequest = () => {
    setApiRequests(prev => {
      const current = isNaN(prev) ? 0 : prev;
      const next = current + 1;
      localStorage.setItem('aura_api_request_count', next.toString());
      return next;
    });
  };

  const saveApiKey = (key) => {
    localStorage.setItem('aura_user_gemini_key', key.trim());
    setUserApiKey(key.trim());
    setSettingsOpen(false);
  };

  const updateActiveDocFields = (fields) => {
    setActiveDoc(prev => prev ? { ...prev, ...fields } : prev);
    setDocuments(prev => prev.map(d => d.id === activeDocId ? { ...d, ...fields } : d));
  };

  const [uploadError, setUploadError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoomMultiplier, setZoomMultiplier] = useState(1.0);
  const [thumbnails, setThumbnails] = useState([]);
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const clientId = getClientId(user?.uid);
  const abortControllerRef = useRef(null);

  // Persist caches
  useEffect(() => { localStorage.setItem('aura_v3_analysis', JSON.stringify(analysisCache)); }, [analysisCache]);
  useEffect(() => { localStorage.setItem('aura_v3_chats', JSON.stringify(chatMessages)); }, [chatMessages]);

  // Load documents on mount or client ID change
  useEffect(() => {
    fetchDocs();
  }, [clientId]);

  // PDF canvas rendering
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let task = null, obs = null;
    const render = async () => {
      if (task) { task.cancel(); task = null; }
      try {
        const page = await pdfDoc.getPage(pageNum);
        const cw = containerRef.current ? containerRef.current.clientWidth - 32 : 600;
        const nat = page.getViewport({ scale: 1 });
        const scale = Math.max(0.3, (cw / nat.width) * zoomMultiplier);
        const vp = page.getViewport({ scale });
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        c.width = vp.width * dpr; c.height = vp.height * dpr;
        c.style.width = `${vp.width}px`; c.style.height = `${vp.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        task = page.render({ canvasContext: ctx, viewport: vp });
        await task.promise;
      } catch (e) { if (e?.name !== 'RenderingCancelledException') console.error(e); }
    };
    render();
    if (containerRef.current && window.ResizeObserver) {
      obs = new ResizeObserver(render);
      obs.observe(containerRef.current);
    }
    return () => { if (task) task.cancel(); if (obs) obs.disconnect(); };
  }, [pdfDoc, pageNum, zoomMultiplier, step]);

  const fetchDocs = async () => {
    try {
      const r = await fetch(`${API_URL}/api/documents`, { headers: { 'X-Client-Id': clientId } });
      if (r.ok) setDocuments(await r.json());
    } catch (e) { console.error('fetchDocs error:', e); }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setIsUploading(true); setUploadError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'X-Client-Id': clientId,
          'X-Gemini-Key': localStorage.getItem('aura_user_gemini_key') || ''
        },
        body: fd
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text || 'Upload failed — server returned empty response'); }
      if (!r.ok) throw new Error(data.detail || `Upload failed (${r.status})`);
      trackRequest();
      setDocuments(prev => [data, ...prev]);
      await loadDoc(data.id, data);
    } catch (e) {
      setUploadError(e.message);
      console.error('Upload error:', e);
    } finally { setIsUploading(false); }
  };

  const loadDoc = async (docId, docData = null) => {
    setActiveDocId(docId);
    setPdfDoc(null); setThumbnails([]); setPageNum(1); setZoomMultiplier(1.0);

    // Fetch doc details & restore DB-persisted data
    try {
      const r = await fetch(`${API_URL}/api/documents/${docId}`, { headers: { 'X-Client-Id': clientId } });
      if (r.ok) {
        const d = await r.json();
        setActiveDoc(d);
        // Restore full_analysis from DB
        if (d.full_analysis) {
          try {
            const parsed = typeof d.full_analysis === 'string' ? JSON.parse(d.full_analysis) : d.full_analysis;
            setAnalysisCache(prev => ({ ...prev, [docId]: parsed }));
          } catch {}
        }
        // Restore chat history from DB
        if (d.chat_history?.length > 0) {
          setChatMessages(prev => ({ ...prev, [docId]: d.chat_history }));
        }
      }
    } catch {}

    // Load PDF for preview
    try {
      const r = await fetch(`${API_URL}/api/documents/${docId}/file?client_id=${clientId}`);
      if (!r.ok) return;
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('application/pdf')) {
        const buf = await r.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        genThumbs(pdf);
      }
    } catch (e) { console.error('PDF load err:', e); }

    // If already has analysis cached, jump straight to dashboard
    if (analysisCache[docId]) {
      setStep('dashboard');
    } else {
      setStep('preview');
    }
  };

  const genThumbs = async (pdf) => {
    const count = Math.min(pdf.numPages, 12);
    const thumbs = [];
    for (let i = 1; i <= count; i++) {
      try {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.18 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        thumbs.push(c.toDataURL());
      } catch {}
    }
    setThumbnails(thumbs);
  };

  const cancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStep('preview');
  };

  const startAnalysis = async () => {
    // Use cached analysis if available
    if (analysisCache[activeDocId]) { setStep('dashboard'); return; }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStep('analyzing');
    setProgress(0); setStageIdx(0);

    const stageTimings = [
      { si: 0, from: 0, to: 25, ms: 4500 },
      { si: 1, from: 25, to: 55, ms: 5000 },
      { si: 2, from: 55, to: 80, ms: 4000 },
      { si: 3, from: 80, to: 95, ms: 3000 },
    ];

    const animStage = ({ si, from, to, ms }) => new Promise((res, rej) => {
      setStageIdx(si);
      const t0 = Date.now();
      const tick = () => {
        if (controller.signal.aborted) {
          rej(new Error('aborted'));
          return;
        }
        const p = Math.min(1, (Date.now() - t0) / ms);
        setProgress(from + (to - from) * p);
        if (p < 1) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });

    // Fire API call + animations in parallel
    const apiPromise = fetch(`${API_URL}/api/documents/${activeDocId}/analyze`, {
      method: 'POST',
      headers: {
        'X-Client-Id': clientId,
        'X-Gemini-Key': localStorage.getItem('aura_user_gemini_key') || ''
      },
      signal: controller.signal
    }).then(r => r.json());

    try {
      for (const st of stageTimings) {
        await animStage(st);
      }
      const analysis = await apiPromise;
      trackRequest();
      setAnalysisCache(prev => ({ ...prev, [activeDocId]: analysis }));
      setProgress(100);
      await new Promise(r => setTimeout(r, 600));
      setStep('dashboard');
    } catch (e) {
      if (e.name === 'AbortError' || e.message === 'aborted') {
        console.log('Analysis cancelled by user.');
      } else {
        console.error('Analysis error:', e);
        setStep('preview');
      }
    }
  };

  const docForActive = activeDoc || documents.find(d => d.id === activeDocId);

  return (
    <>
      {step === 'hero' && <HeroScreen user={user} documents={documents} onUpload={handleUpload} onSelectDoc={loadDoc} isUploading={isUploading} uploadError={uploadError} onSettingsOpen={() => setSettingsOpen(true)} />}
      {step === 'preview' && <PreviewScreen doc={docForActive} pdfDoc={pdfDoc} pageNum={pageNum} numPages={numPages} zoomMultiplier={zoomMultiplier} setPageNum={setPageNum} setZoomMultiplier={setZoomMultiplier} canvasRef={canvasRef} containerRef={containerRef} thumbnails={thumbnails} onStart={startAnalysis} onBack={() => setStep('hero')} isAnalysed={!!analysisCache[activeDocId]} />}
      {step === 'analyzing' && <AnalyzingScreen progress={progress} stageIdx={stageIdx} onCancel={cancelAnalysis} />}
      {step === 'dashboard' && <Dashboard user={user} doc={docForActive} analysis={analysisCache[activeDocId]} chatMessages={chatMessages} setChatMessages={setChatMessages} documents={documents} onSelectDoc={loadDoc} onBack={() => setStep('preview')} onNewUpload={() => setStep('hero')} activeDocId={activeDocId} onSettingsOpen={() => setSettingsOpen(true)} apiRequests={apiRequests} onTrackRequest={trackRequest} onUpdateDoc={updateActiveDocFields} />}

      {settingsOpen && (
        <div className="settings-modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="sm-head">
              <h3>⚙️ API Settings</h3>
              <button className="sm-close" onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <div className="sm-body">
              <label className="sm-label">Google Gemini API Key</label>
              <input 
                className="sm-input" 
                type="password" 
                placeholder="Paste your AIzaSy... key here" 
                value={userApiKey} 
                onChange={e => setUserApiKey(e.target.value)} 
              />
              <p className="sm-help">
                Use your own Gemini API key to bypass global rate limits. Your key remains private, is stored only locally in your browser, and is sent securely in request headers.
                <br /><br />
                <strong>⚠️ Key Scoping Note:</strong> Gemini Files API scopes uploaded documents to the API key that uploaded them. If you switch or change keys, please re-upload your document under your active key to analyze or chat with it.
              </p>
              <div className="sm-actions">
                <button className="sm-btn sm-clear" onClick={() => saveApiKey('')}>Clear Key</button>
                <button className="sm-btn sm-save" onClick={() => saveApiKey(userApiKey)}>Save Key</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <LoadingScreen />;
  if (!user) return <AuthScreen />;
  return <MainApp user={user} />;
}
