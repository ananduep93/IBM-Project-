import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Dynamic API URL for development and production
const API_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';

// Helper to format bytes
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Line-by-line Markdown Parser (supports headers, lists, bold, and tables)
const parseMarkdown = (md) => {
  if (!md) return '';
  const lines = md.split('\n');
  const html = [];
  let inList = false;
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check bullet lists
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      const content = line.substring(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html.push(`<li>${content}</li>`);
      continue;
    } else {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
    }
    
    // Check tables
    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.includes('---')) {
        continue; // Skip the markdown separator row
      }
      const cells = line
        .split('|')
        .map(c => c.trim())
        .filter((c, index, arr) => index > 0 && index < arr.length - 1);
        
      if (!inTable) {
        html.push('<div class="entity-table-wrapper"><table class="entity-table">');
        inTable = true;
        html.push('<thead><tr>');
        cells.forEach(cell => {
          const content = cell.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          html.push(`<th>${content}</th>`);
        });
        html.push('</tr></thead><tbody>');
      } else {
        html.push('<tr>');
        cells.forEach(cell => {
          const content = cell.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          html.push(`<td>${content}</td>`);
        });
        html.push('</tr>');
      }
      continue;
    } else {
      if (inTable) {
        html.push('</tbody></table></div>');
        inTable = false;
      }
    }
    
    // Headers
    if (line.startsWith('### ')) {
      const content = line.substring(4).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html.push(`<h3>${content}</h3>`);
    } else if (line.startsWith('## ')) {
      const content = line.substring(3).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html.push(`<h2>${content}</h2>`);
    } else if (line.startsWith('# ')) {
      const content = line.substring(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html.push(`<h1>${content}</h1>`);
    } else if (line === '') {
      html.push('<br/>');
    } else {
      const content = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html.push(`<p>${content}</p>`);
    }
  }
  
  if (inList) html.push('</ul>');
  if (inTable) html.push('</tbody></table></div>');
  
  return html.join('\n');
};

const getClientId = () => {
  let id = localStorage.getItem('aura_client_id');
  if (!id) {
    id = 'usr_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('aura_client_id', id);
  }
  return id;
};

function App() {
  const [documents, setDocuments] = useState([]);
  const [activeDocId, setActiveDocId] = useState(null);
  const [activeDoc, setActiveDoc] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  
  // Loading and action states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  
  // Analysis content cache per document
  const [cache, setCache] = useState({}); // { [docId]: { summary, entities, rewrite: { [tone]: text } } }
  
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [loadingRewrite, setLoadingRewrite] = useState(false);
  const [selectedTone, setSelectedTone] = useState('Professional');
  
  // Chat dialogue state
  const [chatMessages, setChatMessages] = useState({}); // { [docId]: [{role, content}] }
  const [userMessage, setUserMessage] = useState('');
  const [isStreamingChat, setIsStreamingChat] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  // Load document list from backend on mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  // Fetch detailed document content on selection change
  useEffect(() => {
    if (activeDocId) {
      fetchDocDetails(activeDocId);
    } else {
      setActiveDoc(null);
    }
  }, [activeDocId]);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, activeDocId, isStreamingChat]);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/api/documents`, {
        headers: {
          'X-Client-Id': getClientId()
        }
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
        if (data.length > 0 && !activeDocId) {
          setActiveDocId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const fetchDocDetails = async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/documents/${id}`, {
        headers: {
          'X-Client-Id': getClientId()
        }
      });
      if (response.ok) {
        const data = await response.json();
        setActiveDoc(data);
      }
    } catch (err) {
      console.error('Failed to fetch document details:', err);
    }
  };

  // Upload file handlers
  const handleFileUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'X-Client-Id': getClientId()
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }
      
      const newDoc = await response.json();
      setDocuments(prev => [newDoc, ...prev]);
      setActiveDocId(newDoc.id);
    } catch (err) {
      setUploadError(err.message);
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const deleteDocument = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    
    try {
      const response = await fetch(`${API_URL}/api/documents/${id}`, {
        method: 'DELETE',
        headers: {
          'X-Client-Id': getClientId()
        }
      });
      if (response.ok) {
        setDocuments(prev => prev.filter(doc => doc.id !== id));
        // Clean cache and chat
        setCache(prev => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
        setChatMessages(prev => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
        
        if (activeDocId === id) {
          setActiveDocId(documents.length > 1 ? documents.find(d => d.id !== id)?.id : null);
        }
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // LLM Query Triggers
  const triggerSummary = async (docId) => {
    setLoadingSummary(true);
    try {
      const response = await fetch(`${API_URL}/api/documents/${docId}/summary`, {
        method: 'POST',
        headers: {
          'X-Client-Id': getClientId()
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to generate summary');
      }
      const data = await response.json();
      setCache(prev => ({
        ...prev,
        [docId]: {
          ...prev[docId],
          summary: data.summary,
        },
      }));
    } catch (err) {
      alert(`Summary Error: ${err.message}`);
    } finally {
      setLoadingSummary(false);
    }
  };

  const triggerEntities = async (docId) => {
    setLoadingEntities(true);
    try {
      const response = await fetch(`${API_URL}/api/documents/${docId}/extract`, {
        method: 'POST',
        headers: {
          'X-Client-Id': getClientId()
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to extract entities');
      }
      const data = await response.json();
      setCache(prev => ({
        ...prev,
        [docId]: {
          ...prev[docId],
          entities: data.entities,
        },
      }));
    } catch (err) {
      alert(`Entities Error: ${err.message}`);
    } finally {
      setLoadingEntities(false);
    }
  };

  const triggerRewrite = async (docId, tone) => {
    setLoadingRewrite(true);
    try {
      const response = await fetch(`${API_URL}/api/documents/${docId}/rewrite`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Client-Id': getClientId()
        },
        body: JSON.stringify({ tone }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to rewrite text');
      }
      const data = await response.json();
      setCache(prev => {
        const docCache = prev[docId] || {};
        const rewriteCache = docCache.rewrite || {};
        return {
          ...prev,
          [docId]: {
            ...docCache,
            rewrite: {
              ...rewriteCache,
              [tone]: data.rewritten,
            },
          },
        };
      });
    } catch (err) {
      alert(`Rewrite Error: ${err.message}`);
    } finally {
      setLoadingRewrite(false);
    }
  };

  // SSE Chat streaming handler
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!userMessage.trim() || isStreamingChat || !activeDocId) return;

    const currentMessage = userMessage;
    setUserMessage('');
    setIsStreamingChat(true);

    const docHistory = chatMessages[activeDocId] || [];
    const updatedHistory = [...docHistory, { role: 'user', content: currentMessage }];

    // Optimistically update list with user's message
    setChatMessages(prev => ({
      ...prev,
      [activeDocId]: updatedHistory,
    }));

    try {
      const response = await fetch(`${API_URL}/api/documents/${activeDocId}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Client-Id': getClientId()
        },
        body: JSON.stringify({
          chat_history: docHistory, // Send previous turns
          user_message: currentMessage,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to connect to chat API');
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let assistantResponseText = '';

      // Initialize empty bubble for the assistant's streaming response
      setChatMessages(prev => ({
        ...prev,
        [activeDocId]: [...updatedHistory, { role: 'assistant', content: '' }],
      }));

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const event = buffer.substring(0, boundary).trim();
          buffer = buffer.substring(boundary + 2);

          if (event.startsWith('data: ')) {
            try {
              const jsonStr = event.slice(6);
              const data = JSON.parse(jsonStr);
              
              if (data.text) {
                assistantResponseText += data.text;
                // Update the assistant message in chat list
                setChatMessages(prev => {
                  const currentList = [...prev[activeDocId]];
                  currentList[currentList.length - 1] = {
                    role: 'assistant',
                    content: assistantResponseText,
                  };
                  return { ...prev, [activeDocId]: currentList };
                });
              } else if (data.error) {
                assistantResponseText += `\n[Error: ${data.error}]`;
                setChatMessages(prev => {
                  const currentList = [...prev[activeDocId]];
                  currentList[currentList.length - 1] = {
                    role: 'assistant',
                    content: assistantResponseText,
                  };
                  return { ...prev, [activeDocId]: currentList };
                });
              }
            } catch (err) {
              console.error('Error parsing SSE json:', err);
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      setChatMessages(prev => ({
        ...prev,
        [activeDocId]: [
          ...updatedHistory,
          { role: 'assistant', content: `**Connection Error**: ${err.message}` },
        ],
      }));
    } finally {
      setIsStreamingChat(false);
    }
  };

  // Tab Switch handler (trigger queries lazily)
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (!activeDocId) return;

    if (tab === 'entities' && !cache[activeDocId]?.entities) {
      triggerEntities(activeDocId);
    } else if (tab === 'rewrite') {
      const docCache = cache[activeDocId] || {};
      const rewriteCache = docCache.rewrite || {};
      if (!rewriteCache[selectedTone]) {
        triggerRewrite(activeDocId, selectedTone);
      }
    }
  };

  const handleToneChange = (tone) => {
    setSelectedTone(tone);
    const docCache = cache[activeDocId] || {};
    const rewriteCache = docCache.rewrite || {};
    if (!rewriteCache[tone]) {
      triggerRewrite(activeDocId, tone);
    }
  };

  // Check if API key status is active
  const hasDocuments = documents.length > 0;

  return (
    <div className="app-container">
      {/* Mobile Drawer Overlay Scrim */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar} />
      )}

      {/* LEFT PANEL: Sidebar & Uploader (Slides out on mobile) */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="brand-section">
          <div className="brand-logo">A</div>
          <h1 className="brand-title">AURA Doc Analyzer</h1>
        </div>

        {/* Drag & Drop Upload Zone */}
        <div 
          className={`upload-container ${dragActive ? 'drag-active' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            accept=".pdf,.txt"
            onChange={(e) => handleFileUpload(e.target.files[0])}
          />
          <div className="upload-icon">
            {isUploading ? '⏳' : '📥'}
          </div>
          <div className="upload-text">
            {isUploading ? (
              <span>Uploading & Processing...</span>
            ) : (
              <>
                <span>Click to upload</span> or drag and drop <br />
                <small>PDF or TXT documents</small>
              </>
            )}
          </div>
        </div>

        {uploadError && (
          <div style={{ color: 'var(--accent-danger)', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(239,68,68,0.08)', padding: '10px', borderRadius: 'var(--border-radius-md)' }}>
            ⚠️ {uploadError}
          </div>
        )}

        {/* Document History list */}
        <div className="history-section">
          <div className="section-label">Documents</div>
          <div className="doc-list">
            {hasDocuments ? (
              documents.map((doc) => (
                <div 
                  key={doc.id}
                  className={`doc-item ${activeDocId === doc.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveDocId(doc.id);
                    setIsSidebarOpen(false); // Close sidebar on selection (mobile)
                  }}
                >
                  <div className="doc-info">
                    <span className="doc-icon">
                      {doc.mime_type === 'application/pdf' ? '📄' : '📝'}
                    </span>
                    <div className="doc-meta">
                      <span className="doc-name">{doc.filename}</span>
                      <span className="doc-size">{formatBytes(doc.size)}</span>
                    </div>
                  </div>
                  <button 
                    className="delete-btn"
                    onClick={(e) => deleteDocument(doc.id, e)}
                    title="Delete document"
                  >
                    🗑️
                  </button>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                No documents uploaded yet.
              </div>
            )}
          </div>
        </div>

        {/* Key status indicator */}
        <div className="apikey-indicator">
          <span>API Status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="status-dot active"></span>
            <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>Active</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER: Workspace (Header + Analysis Hub) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', width: '100%' }}>
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="mobile-header">
          <button className="menu-toggle-btn" onClick={toggleSidebar} aria-label="Toggle Navigation Menu">
            ☰
          </button>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.1rem', background: 'linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-blue) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AURA Analyzer
          </span>
          <div style={{ width: '32px' }}></div> {/* Balanced Spacer */}
        </header>

        {activeDocId ? (
          <main className="main-workspace">
            {/* AI Analysis Hub (Full Width Workspace) */}
            <section className="analysis-hub" style={{ flex: 1 }}>
              <div className="panel-header">
                <span className="panel-title" style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📄 {activeDoc?.filename || 'Loading Document...'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: '20px', border: '1px solid var(--panel-border)' }}>
                  {activeDoc ? formatBytes(activeDoc.size) : ''}
                </span>
              </div>
              <nav className="tab-nav">
                <button 
                  className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
                  onClick={() => handleTabChange('summary')}
                >
                  Summary
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                  onClick={() => handleTabChange('chat')}
                >
                  Q&A Chat
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'entities' ? 'active' : ''}`}
                  onClick={() => handleTabChange('entities')}
                >
                  Entities
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'rewrite' ? 'active' : ''}`}
                  onClick={() => handleTabChange('rewrite')}
                >
                  Rewriter
                </button>
              </nav>

              <div className={`tab-pane ${activeTab}-active`}>
                {/* TAB 1: Summary Panel */}
                {activeTab === 'summary' && (
                  loadingSummary ? (
                    <div className="loader-container">
                      <div className="spinner"></div>
                      <span className="loading-text">Analyzing structure and generating summary...</span>
                    </div>
                  ) : cache[activeDocId]?.summary ? (
                    <div className="summary-container">
                      <div className="summary-card">
                        <h3>✨ Executive Summary</h3>
                        <div 
                          className="markdown-body"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(cache[activeDocId].summary) }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="analysis-trigger-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '60px 20px', textAlign: 'center', margin: 'auto' }}>
                      <div style={{ fontSize: '3rem', animation: 'float 3s ease-in-out infinite' }}>✨</div>
                      <h3 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Document Ready for Analysis</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '320px', margin: 0 }}>
                        Click below to run layout parsing, key date detection, and generate an executive summary.
                      </p>
                      <button 
                        className="primary-action-btn"
                        onClick={() => triggerSummary(activeDocId)}
                        style={{
                          background: 'linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-blue) 100%)',
                          color: 'var(--text-primary)',
                          border: 'none',
                          padding: '12px 28px',
                          fontFamily: 'Outfit, sans-serif',
                          fontWeight: 600,
                          borderRadius: 'var(--border-radius-lg)',
                          cursor: 'pointer',
                          boxShadow: '0 4px 20px rgba(0, 242, 254, 0.25)',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 242, 254, 0.35)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 242, 254, 0.25)'; }}
                      >
                        Summarize Document
                      </button>
                    </div>
                  )
                )}

                {/* TAB 2: Chat Panel */}
                {activeTab === 'chat' && (
                  <div className="chat-container">
                    <div className="chat-messages">
                      {(chatMessages[activeDocId] || []).length > 0 ? (
                        (chatMessages[activeDocId] || []).map((msg, index) => (
                          <div 
                            key={index}
                            className={`chat-bubble ${msg.role}`}
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }}
                          />
                        ))
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', margin: 'auto' }}>
                          💬 Ask questions about the layout, text, or details of this document. The AI will answer.
                        </div>
                      )}
                      {isStreamingChat && (
                        <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: '0.8rem', paddingLeft: '8px' }}>
                          AI is typing...
                        </div>
                      )}
                      <div ref={chatBottomRef} />
                    </div>

                    <form className="chat-input-form" onSubmit={handleSendChatMessage}>
                      <input 
                        type="text" 
                        className="chat-input"
                        placeholder="Ask anything about the document..."
                        value={userMessage}
                        disabled={isStreamingChat}
                        onChange={(e) => setUserMessage(e.target.value)}
                      />
                      <button 
                        type="submit" 
                        className="chat-send-btn"
                        disabled={isStreamingChat || !userMessage.trim()}
                      >
                        ✈️
                      </button>
                    </form>
                  </div>
                )}

                {/* TAB 3: Entities Panel */}
                {activeTab === 'entities' && (
                  loadingEntities ? (
                    <div className="loader-container">
                      <div className="spinner"></div>
                      <span className="loading-text">Scanning document for names, dates, financials, and actions...</span>
                    </div>
                  ) : cache[activeDocId]?.entities ? (
                    <div 
                      className="markdown-body"
                      dangerouslySetInnerHTML={{ __html: parseMarkdown(cache[activeDocId].entities) }}
                    />
                  ) : (
                    <div className="loader-container">
                      <span className="loading-text">Preparing extraction...</span>
                    </div>
                  )
                )}

                {/* TAB 4: Rewriter Panel */}
                {activeTab === 'rewrite' && (
                  <div className="summary-container">
                    <div className="rewrite-controls">
                      <div className="section-label">Select Target Tone</div>
                      <div className="tone-selector">
                        {['Professional', 'Casual', 'ELI5 (Simplified)', 'Persuasive'].map((tone) => (
                          <button
                            key={tone}
                            className={`tone-btn ${selectedTone === tone ? 'active' : ''}`}
                            onClick={() => handleToneChange(tone)}
                          >
                            {tone}
                          </button>
                        ))}
                      </div>
                    </div>

                    {loadingRewrite ? (
                      <div className="loader-container">
                        <div className="spinner"></div>
                        <span className="loading-text">Translating content into {selectedTone} tone...</span>
                      </div>
                    ) : cache[activeDocId]?.rewrite?.[selectedTone] ? (
                      <div className="summary-card">
                        <h3>✍️ Rewritten in {selectedTone} Tone</h3>
                        <div 
                          className="markdown-body"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(cache[activeDocId].rewrite[selectedTone]) }}
                        />
                      </div>
                    ) : (
                      <div className="loader-container">
                        <span className="loading-text">Select a tone to generate a rewrite.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </main>
        ) : (
          /* Empty Workspace State */
          <div className="empty-workspace">
            <div className="empty-icon">📁</div>
            <h2 className="empty-title">AURA Document Analyzer</h2>
            <p className="empty-subtitle">
              Upload a PDF or TXT document on the left sidebar to start extracting insights, summarizing content, and chatting with your files.
            </p>
            {/* Mobile Menu tip */}
            <div style={{ display: 'none', background: 'rgba(0, 242, 254, 0.05)', border: '1px solid var(--panel-border)', padding: '12px 18px', borderRadius: 'var(--border-radius-md)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '20px' }} className="mobile-tip">
              💡 Tap the menu icon ☰ in the top-left to upload files or switch active documents.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
