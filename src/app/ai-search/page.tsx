"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Sparkles, Send, Plus, Trash2, MessageSquare, Bot, User, 
  Film, Star, Award, ChevronRight, ChevronLeft, RefreshCw, 
  Layers, Check, CheckCheck, Search, Menu, X, ArrowLeft,
  Clock, Flame, HelpCircle
} from 'lucide-react';
import { 
  fetchChatGemini, 
  searchTMDB, 
  searchPeople, 
  getImageUrl, 
  TMDBResult, 
  TMDBPerson 
} from '@/utils/tmdb';
import { 
  Conversation, 
  listConversations, 
  saveConversation, 
  deleteConversation, 
  titleFromFirstMessage, 
  getUserMemory, 
  getAiName 
} from '@/utils/chatStorage';
import { getUserPreferences } from '@/utils/userPreferences';
import { AsyncStorage } from '@/utils/storage';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  kind: 'text' | 'movies' | 'actors' | 'table' | 'list' | 'error';
  text?: string;
  movies?: TMDBResult[];
  actors?: TMDBPerson[];
  tableHeaders?: string[];
  tableRows?: (string | number)[][];
  listItems?: { title: string; subtitle?: string; value?: string; tag?: string }[];
  listTitle?: string;
  timestamp?: number;
}

const STARTER_PROMPTS = [
  'Compare Oppenheimer vs Interstellar',
  'Top 5 mind-bending thrillers with twist endings',
  'Best sci-fi movies from the 2010s',
  'Recommend dark psychological mysteries',
  'Surprise me with an obscure masterpiece',
  'Best Denis Villeneuve films ranked',
];

export default function AiChatPage() {
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [searchConvoQuery, setSearchConvoQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiName, setAiName] = useState('Cine');
  const [userMemory, setUserMemoryState] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showPromptsStrip, setShowPromptsStrip] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatFeedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom smoothly
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    } else if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, loading, scrollToBottom]);

  // Viewport resize & virtual keyboard listener to ensure chat stays anchored
  useEffect(() => {
    const handleViewportResize = () => {
      window.scrollTo(0, 0);
      scrollToBottom('auto');
    };

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
      return () => {
        window.visualViewport?.removeEventListener('resize', handleViewportResize);
        window.visualViewport?.removeEventListener('scroll', handleViewportResize);
      };
    }
  }, [scrollToBottom]);

  // Load chat history & AI persona
  useEffect(() => {
    const init = async () => {
      const name = await getAiName();
      setAiName(name || 'Cine');

      const mem = await getUserMemory();
      setUserMemoryState(mem || '');

      const convos = await listConversations();
      setConversations(convos);

      if (convos.length > 0) {
        setActiveConvoId(convos[0].id);
        setMessages(convos[0].messages as ChatMessage[]);
      } else {
        startNewConversation();
      }
    };
    init();
  }, []);

  const startNewConversation = () => {
    const newId = 'convo_' + Date.now();
    setActiveConvoId(newId);
    setMessages([]);
    setMobileSidebarOpen(false);
    setTimeout(() => {
      inputRef.current?.focus();
      scrollToBottom('auto');
    }, 60);
  };

  const handleSelectConversation = (convo: Conversation) => {
    setActiveConvoId(convo.id);
    setMessages(convo.messages as ChatMessage[]);
    setMobileSidebarOpen(false);
    setTimeout(() => {
      inputRef.current?.focus();
      scrollToBottom('auto');
    }, 60);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(id);
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    if (activeConvoId === id) {
      if (updated.length > 0) {
        handleSelectConversation(updated[0]);
      } else {
        startNewConversation();
      }
    }
  };

  const formatMessageTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatConvoTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (isYesterday) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputPrompt;
    if (!textToSend.trim() || loading) return;

    setInputPrompt('');
    setShowPromptsStrip(false);
    inputRef.current?.focus();

    const now = Date.now();
    const userMsgId = 'msg_' + now;
    const newMsgList: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: 'user', kind: 'text', text: textToSend, timestamp: now }
    ];
    setMessages(newMsgList);
    setLoading(true);

    try {
      const [wStr, hStr, prefs] = await Promise.all([
        AsyncStorage.getItem('watchlist'),
        AsyncStorage.getItem('history'),
        getUserPreferences(),
      ]);

      const watchlistTitles = (wStr ? JSON.parse(wStr) : []).map((i: any) => i.title || i.name);
      const watchedTitles = (hStr ? JSON.parse(hStr) : []).map((i: any) => i.title || i.name);

      const historyFormatted = newMsgList.slice(-6).map(m => ({
        role: m.role,
        kind: m.kind,
        text: m.text,
      }));

      const reply = await fetchChatGemini(
        textToSend,
        historyFormatted,
        userMemory,
        watchedTitles,
        watchlistTitles,
        [],
        prefs
      );

      const botMsgId = 'msg_' + (Date.now() + 1);
      const botTimestamp = Date.now();
      let botMessage: ChatMessage;

      if (reply.kind === 'movies' && reply.movies) {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'movies',
          text: reply.text,
          movies: reply.movies,
          timestamp: botTimestamp,
        };
      } else if (reply.kind === 'actors' && reply.actors) {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'actors',
          text: reply.text,
          actors: reply.actors,
          timestamp: botTimestamp,
        };
      } else if (reply.kind === 'table' && reply.headers && reply.rows) {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'table',
          text: reply.text,
          tableHeaders: reply.headers,
          tableRows: reply.rows,
          timestamp: botTimestamp,
        };
      } else if (reply.kind === 'list' && reply.items) {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'list',
          text: reply.text,
          listTitle: reply.title,
          listItems: reply.items,
          timestamp: botTimestamp,
        };
      } else {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'text',
          text: reply.text || (typeof reply === 'string' ? reply : "Here's what I found for you."),
          timestamp: botTimestamp,
        };
      }

      const finalizedMessages = [...newMsgList, botMessage];
      setMessages(finalizedMessages);

      // Persist conversation
      const convoId = activeConvoId || 'convo_' + Date.now();
      const existingConvo = conversations.find(c => c.id === convoId);
      const title = existingConvo?.title || titleFromFirstMessage(textToSend);

      const updatedConvo: Conversation = {
        id: convoId,
        title,
        messages: finalizedMessages,
        updatedAt: Date.now(),
      };

      await saveConversation(updatedConvo);
      const freshList = await listConversations();
      setConversations(freshList);
      setActiveConvoId(convoId);

    } catch (err: any) {
      console.error('Chat error:', err);
      setMessages(prev => [
        ...prev,
        {
          id: 'msg_err_' + Date.now(),
          role: 'bot',
          kind: 'error',
          text: "I encountered an issue generating that response. Please try again.",
          timestamp: Date.now(),
        }
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom('smooth');
      }, 50);
    }
  };

  const filteredConversations = conversations.filter(c => 
    c.title.toLowerCase().includes(searchConvoQuery.toLowerCase()) ||
    (c.messages as any[])?.some(m => m.text?.toLowerCase().includes(searchConvoQuery.toLowerCase()))
  );

  return (
    <div className="ai-chat-layout">
      {/* Mobile Drawer Backdrop */}
      {mobileSidebarOpen && (
        <div 
          className="mobile-sidebar-backdrop" 
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* WhatsApp Web Left Sidebar: Conversation List */}
      <aside className={`chat-history-sidebar ${mobileSidebarOpen ? 'drawer-open' : ''}`}>
        {/* Sidebar Header */}
        <div className="sidebar-header">
          <div className="sidebar-header-title">
            <div className="sidebar-avatar-box">
              <Sparkles size={18} className="sidebar-avatar-icon" />
            </div>
            <div>
              <h3>Chats</h3>
              <p>{conversations.length} conversation{conversations.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <div className="sidebar-header-actions">
            <button 
              className="header-icon-btn" 
              onClick={startNewConversation}
              title="New Chat"
            >
              <Plus size={19} />
            </button>
            <button 
              className="header-icon-btn mobile-close-btn" 
              onClick={() => setMobileSidebarOpen(false)}
              title="Close Drawer"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        {/* Search Conversations Input */}
        <div className="sidebar-search-box">
          <div className="search-input-wrapper">
            <Search size={15} className="search-icon" />
            <input 
              type="text"
              placeholder="Search or start new chat"
              value={searchConvoQuery}
              onChange={(e) => setSearchConvoQuery(e.target.value)}
              className="sidebar-search-input"
            />
            {searchConvoQuery && (
              <button 
                className="clear-search-btn" 
                onClick={() => setSearchConvoQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Conversations Scrollable List */}
        <div className="conversations-scroll-list">
          {filteredConversations.length > 0 ? (
            filteredConversations.map((convo) => {
              const active = convo.id === activeConvoId;
              const lastMsg = convo.messages[convo.messages.length - 1];
              const lastText = lastMsg?.text || (lastMsg?.kind === 'movies' ? '🎬 Movie Recommendations' : 'New conversation');
              const timeDisplay = formatConvoTime(convo.updatedAt);

              return (
                <div
                  key={convo.id}
                  className={`convo-row-item ${active ? 'active' : ''}`}
                  onClick={() => handleSelectConversation(convo)}
                >
                  <div className="convo-avatar">
                    <MessageSquare size={17} className="convo-avatar-icon" />
                  </div>
                  <div className="convo-main-info">
                    <div className="convo-title-row">
                      <span className="convo-title">{convo.title}</span>
                      <span className="convo-time">{timeDisplay}</span>
                    </div>
                    <div className="convo-snippet-row">
                      <span className="convo-snippet">{lastText}</span>
                      <button 
                        className="delete-convo-btn" 
                        onClick={(e) => handleDeleteConversation(convo.id, e)}
                        title="Delete chat"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-convos-state">
              <MessageSquare size={28} className="empty-icon" />
              <p>No conversations found</p>
              <button className="start-btn" onClick={startNewConversation}>
                Start New Chat
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* WhatsApp Web Main Chat Area */}
      <main className="chat-main-area">
        {/* WhatsApp Fixed Top Chat Header */}
        <header className="chat-header">
          <div className="chat-header-left">
            {/* Mobile Drawer Trigger */}
            <button 
              className="mobile-menu-trigger" 
              onClick={() => setMobileSidebarOpen(true)}
              title="Open Conversations"
            >
              <Menu size={20} />
              {conversations.length > 0 && (
                <span className="mobile-badge">{conversations.length}</span>
              )}
            </button>

            {/* AI Companion Avatar with Online Pulse */}
            <div className="ai-companion-avatar-wrapper">
              <div className="ai-companion-avatar">
                <Sparkles size={18} />
              </div>
              <span className="online-indicator-dot" />
            </div>

            {/* Companion Meta */}
            <div className="companion-meta">
              <div className="companion-name-row">
                <h2>{aiName} Cinema Companion</h2>
              </div>
              <div className="companion-status">
                {loading ? (
                  <span className="typing-status">
                    typing<span className="typing-dot">.</span><span className="typing-dot">.</span><span className="typing-dot">.</span>
                  </span>
                ) : (
                  <span className="online-status">Online • Cinema AI Expert</span>
                )}
              </div>
            </div>
          </div>

          {/* Chat Header Actions */}
          <div className="chat-header-right">
            <button 
              className="chat-action-btn"
              onClick={() => setShowPromptsStrip(!showPromptsStrip)}
              title="Quick Suggestions"
            >
              <Sparkles size={17} />
              <span className="action-btn-text">Prompts</span>
            </button>

            <button 
              className="chat-action-btn"
              onClick={startNewConversation}
              title="New Conversation"
            >
              <Plus size={17} />
              <span className="action-btn-text">New Chat</span>
            </button>
          </div>
        </header>

        {/* WhatsApp Chat Message Feed */}
        <div className="chat-feed" ref={chatFeedRef}>
          {/* Date Divider */}
          <div className="chat-date-divider">
            <span className="date-pill">TODAY</span>
          </div>

          {messages.length === 0 ? (
            /* Welcome screen when empty */
            <div className="empty-chat-welcome">
              <div className="welcome-icon-box">
                <Sparkles size={38} />
              </div>
              <h2>Welcome to {aiName} Cinema Companion</h2>
              <p>
                Ask for personalized movie & TV recommendations, cast filmographies, 
                comparative deep-dives, or curated hidden gems.
              </p>

              <div className="starter-prompts-container">
                <span className="prompts-label">Try asking:</span>
                <div className="starter-prompts-grid">
                  {STARTER_PROMPTS.map((prompt, idx) => (
                    <button 
                      key={idx} 
                      className="starter-prompt-card"
                      onClick={() => handleSendMessage(prompt)}
                    >
                      <span className="prompt-text">"{prompt}"</span>
                      <ChevronRight size={14} className="prompt-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Messages List */
            <div className="messages-list">
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-message-row ${msg.role}`}>
                  <div className="message-bubble-container">
                    {/* Bot Sender Name */}
                    {msg.role === 'bot' && (
                      <div className="bot-sender-badge">
                        <Sparkles size={12} className="sender-icon" />
                        <span>{aiName}</span>
                      </div>
                    )}

                    {/* Text Payload */}
                    {msg.text && (
                      <div className="bubble-text">
                        {msg.text.split('\n').map((paragraph, i) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                      </div>
                    )}

                    {/* Movie Cards Payload */}
                    {msg.kind === 'movies' && msg.movies && (
                      <div className="media-results-wrapper">
                        <div className="media-results-grid">
                          {msg.movies.map((m) => (
                            <Link 
                              key={m.id} 
                              href={`/detail?id=${m.id}&type=${m.media_type || 'movie'}`}
                              className="chat-movie-card"
                            >
                              <div className="card-poster-wrapper">
                                <img 
                                  src={getImageUrl(m.poster_path, 'w300')} 
                                  alt={m.title || m.name || ''} 
                                  className="card-poster" 
                                  loading="lazy" 
                                />
                                {m.vote_average ? (
                                  <span className="card-rating-badge">
                                    <Star size={10} fill="#f59e0b" stroke="#f59e0b" />
                                    {m.vote_average.toFixed(1)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="card-details">
                                <h4 className="card-title">{m.title || m.name}</h4>
                                <span className="card-year">
                                  {(m.release_date || m.first_air_date || '').substring(0, 4)}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actor Cards Payload */}
                    {msg.kind === 'actors' && msg.actors && (
                      <div className="actors-results-grid">
                        {msg.actors.map((a) => (
                          <Link 
                            key={a.id} 
                            href={`/cast?id=${a.id}`}
                            className="chat-actor-card"
                          >
                            <img 
                              src={getImageUrl(a.profile_path, 'w185')} 
                              alt={a.name} 
                              className="actor-photo" 
                              loading="lazy" 
                            />
                            <div className="actor-info">
                              <h4 className="actor-name">{a.name}</h4>
                              <span className="actor-dept">{a.known_for_department}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Table Payload */}
                    {msg.kind === 'table' && msg.tableHeaders && msg.tableRows && (
                      <div className="comparison-table-wrapper">
                        <table className="comparison-table">
                          <thead>
                            <tr>
                              {msg.tableHeaders.map((header, idx) => (
                                <th key={idx}>{header}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.tableRows.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Structured List Payload */}
                    {msg.kind === 'list' && msg.listItems && (
                      <div className="chat-list-wrapper">
                        {msg.listTitle && <h4 className="list-title">{msg.listTitle}</h4>}
                        <div className="list-items-box">
                          {msg.listItems.map((item, idx) => (
                            <div key={idx} className="structured-list-item">
                              <span className="item-rank">#{idx + 1}</span>
                              <div className="item-body">
                                <span className="item-title">{item.title}</span>
                                {item.subtitle && <span className="item-subtitle">{item.subtitle}</span>}
                              </div>
                              {item.tag && <span className="item-tag">{item.tag}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bubble Footer Metadata */}
                    <div className="bubble-footer">
                      <span className="message-time">
                        {formatMessageTime(msg.timestamp || Date.now())}
                      </span>
                      {msg.role === 'user' ? (
                        <CheckCheck size={14} className="check-marks read" />
                      ) : (
                        <Sparkles size={11} className="bot-verified-icon" />
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Bot Typing Bubble */}
              {loading && (
                <div className="chat-message-row bot">
                  <div className="message-bubble-container typing-bubble">
                    <div className="bot-sender-badge">
                      <Sparkles size={12} className="sender-icon" />
                      <span>{aiName} is thinking</span>
                    </div>
                    <div className="whatsapp-typing-indicator">
                      <span className="indicator-dot" />
                      <span className="indicator-dot" />
                      <span className="indicator-dot" />
                    </div>
                  </div>
                </div>
              )}

              {/* Scroll Anchor */}
              <div ref={messagesEndRef} style={{ height: 1 }} />
            </div>
          )}
        </div>

        {/* Quick Suggestion Prompts Floating Strip */}
        {showPromptsStrip && (
          <div className="quick-prompts-strip animate-fade-in-up">
            <div className="strip-header">
              <span>Quick Prompt Suggestions</span>
              <button 
                className="close-strip-btn" 
                onClick={() => setShowPromptsStrip(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="strip-pills-scroll">
              {STARTER_PROMPTS.map((prompt, idx) => (
                <button 
                  key={idx}
                  className="prompt-chip"
                  onClick={() => handleSendMessage(prompt)}
                >
                  <Sparkles size={12} />
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* WhatsApp Fixed Bottom Input Bar */}
        <footer className="chat-input-bar">
          <div className="chat-input-wrapper">
            {/* Prompts Toggle Button */}
            <button 
              className={`prompt-toggle-btn ${showPromptsStrip ? 'active' : ''}`}
              onClick={() => setShowPromptsStrip(!showPromptsStrip)}
              title="Suggest Prompts"
              type="button"
            >
              <Sparkles size={18} />
            </button>

            {/* Main Message Input */}
            <input 
              ref={inputRef}
              type="text"
              className="chat-text-input"
              placeholder={loading ? `${aiName} is thinking...` : `Type a message or ask for movie recommendations...`}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onFocus={() => {
                window.scrollTo(0, 0);
                setTimeout(() => scrollToBottom('smooth'), 120);
                setTimeout(() => scrollToBottom('smooth'), 300);
              }}
              onClick={() => {
                setTimeout(() => scrollToBottom('smooth'), 150);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              autoComplete="off"
              autoFocus
            />

            {/* Send Button */}
            <button 
              className={`send-action-btn ${inputPrompt.trim() && !loading ? 'can-send' : ''}`}
              onClick={() => handleSendMessage()}
              disabled={loading || !inputPrompt.trim()}
              title="Send Message (Enter)"
              type="button"
            >
              <Send size={18} className="send-icon" />
            </button>
          </div>
        </footer>
      </main>

      <style jsx>{`
        /* ===== Full Screen Chat Layout ===== */
        .ai-chat-layout {
          display: flex;
          width: 100%;
          height: 100%;
          max-height: 100%;
          overflow: hidden;
          position: relative;
          background: #0c0d12;
          color: #f5f5f7;
          font-family: var(--font-sans);
          user-select: none;
        }

        [data-theme="light"] .ai-chat-layout,
        :global([data-theme="light"]) .ai-chat-layout {
          background: #efeae2;
          color: #111827;
        }

        /* ===== Left Sidebar (Conversations) ===== */
        .chat-history-sidebar {
          width: 320px;
          min-width: 300px;
          height: 100%;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          background: #11141a;
          z-index: 40;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        [data-theme="light"] .chat-history-sidebar,
        :global([data-theme="light"]) .chat-history-sidebar {
          background: #ffffff;
          border-right: 1px solid rgba(0, 0, 0, 0.08);
        }

        .sidebar-header {
          height: 60px;
          padding: 0 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #191e26;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
        }

        [data-theme="light"] .sidebar-header,
        :global([data-theme="light"]) .sidebar-header {
          background: #f0f2f5;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        .sidebar-header-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .sidebar-avatar-box {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #e50914 0%, #b81d24 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(229, 9, 20, 0.35);
        }

        .sidebar-header-title h3 {
          font-size: 15px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: -0.2px;
        }

        .sidebar-header-title p {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.55);
        }

        [data-theme="light"] .sidebar-header-title p,
        :global([data-theme="light"]) .sidebar-header-title p {
          color: #6b7280;
        }

        .sidebar-header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .header-icon-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: rgba(245, 245, 247, 0.7);
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .header-icon-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        [data-theme="light"] .header-icon-btn,
        :global([data-theme="light"]) .header-icon-btn {
          color: #54656f;
        }

        [data-theme="light"] .header-icon-btn:hover,
        :global([data-theme="light"]) .header-icon-btn:hover {
          background: rgba(0, 0, 0, 0.05);
          color: #111827;
        }

        .mobile-close-btn {
          display: none;
        }

        /* Sidebar Search Box */
        .sidebar-search-box {
          padding: 8px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          background: #11141a;
          flex-shrink: 0;
        }

        [data-theme="light"] .sidebar-search-box,
        :global([data-theme="light"]) .sidebar-search-box {
          background: #ffffff;
          border-bottom-color: rgba(0, 0, 0, 0.05);
        }

        .search-input-wrapper {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #1f242d;
          border-radius: 8px;
          padding: 7px 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        [data-theme="light"] .search-input-wrapper,
        :global([data-theme="light"]) .search-input-wrapper {
          background: #f0f2f5;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .search-icon {
          color: rgba(245, 245, 247, 0.5);
          flex-shrink: 0;
        }

        [data-theme="light"] .search-icon,
        :global([data-theme="light"]) .search-icon {
          color: #667781;
        }

        .sidebar-search-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-size: 13px;
          color: inherit;
        }

        .sidebar-search-input::placeholder {
          color: rgba(245, 245, 247, 0.45);
        }

        [data-theme="light"] .sidebar-search-input::placeholder,
        :global([data-theme="light"]) .sidebar-search-input::placeholder {
          color: #667781;
        }

        .clear-search-btn {
          background: transparent;
          border: none;
          color: rgba(245, 245, 247, 0.5);
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        /* Conversations Scroll List */
        .conversations-scroll-list {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 6px 0;
          display: flex;
          flex-direction: column;
        }

        .convo-row-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          cursor: pointer;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          transition: background 0.15s ease;
          position: relative;
        }

        .convo-row-item:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .convo-row-item.active {
          background: #1f2733;
          border-left: 3px solid #e50914;
        }

        [data-theme="light"] .convo-row-item:hover,
        :global([data-theme="light"]) .convo-row-item:hover {
          background: #f5f6f6;
        }

        [data-theme="light"] .convo-row-item.active,
        :global([data-theme="light"]) .convo-row-item.active {
          background: #f0f2f5;
          border-left: 3px solid #e50914;
        }

        .convo-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(245, 245, 247, 0.7);
          flex-shrink: 0;
        }

        .convo-row-item.active .convo-avatar {
          background: rgba(229, 9, 20, 0.2);
          color: #e50914;
        }

        [data-theme="light"] .convo-avatar,
        :global([data-theme="light"]) .convo-avatar {
          background: #e9edef;
          color: #54656f;
        }

        .convo-main-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
          overflow: hidden;
        }

        .convo-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .convo-title {
          font-size: 13.5px;
          font-weight: 600;
          color: inherit;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .convo-time {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.45);
          flex-shrink: 0;
        }

        [data-theme="light"] .convo-time,
        :global([data-theme="light"]) .convo-time {
          color: #667781;
        }

        .convo-snippet-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .convo-snippet {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.55);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }

        [data-theme="light"] .convo-snippet,
        :global([data-theme="light"]) .convo-snippet {
          color: #667781;
        }

        .delete-convo-btn {
          background: transparent;
          border: none;
          color: rgba(245, 245, 247, 0.4);
          cursor: pointer;
          opacity: 0;
          transition: var(--transition-fast);
          padding: 2px;
        }

        .convo-row-item:hover .delete-convo-btn {
          opacity: 0.8;
        }

        .delete-convo-btn:hover {
          opacity: 1 !important;
          color: #e50914;
        }

        .empty-convos-state {
          padding: 30px 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: rgba(245, 245, 247, 0.5);
          font-size: 13px;
        }

        .start-btn {
          background: rgba(229, 9, 20, 0.15);
          color: #e50914;
          border: 1px solid rgba(229, 9, 20, 0.3);
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .start-btn:hover {
          background: #e50914;
          color: #ffffff;
        }

        /* ===== Main Chat Area ===== */
        .chat-main-area {
          flex: 1;
          height: 100%;
          max-height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          background: #0b0e14;
        }

        [data-theme="light"] .chat-main-area,
        :global([data-theme="light"]) .chat-main-area {
          background: #efeae2;
        }

        /* WhatsApp Fixed Top Chat Header */
        .chat-header {
          height: 60px;
          flex-shrink: 0;
          padding: 0 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #191e26;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          z-index: 30;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
        }

        [data-theme="light"] .chat-header,
        :global([data-theme="light"]) .chat-header {
          background: #f0f2f5;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        }

        .chat-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .mobile-menu-trigger {
          display: none;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
          position: relative;
          padding: 6px;
          border-radius: 8px;
        }

        .mobile-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          background: #e50914;
          color: #ffffff;
          font-size: 9px;
          font-weight: 800;
          border-radius: 8px;
          padding: 1px 4px;
        }

        .ai-companion-avatar-wrapper {
          position: relative;
          width: 40px;
          height: 40px;
          flex-shrink: 0;
        }

        .ai-companion-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #e50914 0%, #b81d24 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          box-shadow: 0 2px 10px rgba(229, 9, 20, 0.35);
        }

        .online-indicator-dot {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #22c55e;
          border: 2px solid #191e26;
          box-shadow: 0 0 6px rgba(34, 197, 94, 0.7);
        }

        [data-theme="light"] .online-indicator-dot,
        :global([data-theme="light"]) .online-indicator-dot {
          border-color: #f0f2f5;
        }

        .companion-meta {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }

        .companion-name-row h2 {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.2px;
        }

        .companion-status {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.6);
        }

        [data-theme="light"] .companion-status,
        :global([data-theme="light"]) .companion-status {
          color: #667781;
        }

        .online-status {
          color: #22c55e;
          font-weight: 500;
        }

        .typing-status {
          color: #e50914;
          font-weight: 600;
        }

        .typing-dot {
          animation: blinkDots 1.4s infinite;
        }

        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes blinkDots {
          0%, 20% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }

        .chat-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .chat-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: inherit;
          padding: 6px 12px;
          border-radius: 18px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .chat-action-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.16);
        }

        [data-theme="light"] .chat-action-btn,
        :global([data-theme="light"]) .chat-action-btn {
          background: #ffffff;
          border-color: rgba(0, 0, 0, 0.1);
          color: #111827;
        }

        [data-theme="light"] .chat-action-btn:hover,
        :global([data-theme="light"]) .chat-action-btn:hover {
          background: #f5f6f6;
        }

        /* ===== WhatsApp Chat Message Feed ===== */
        .chat-feed {
          flex: 1;
          min-height: 0;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 16px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scroll-behavior: smooth;
          overscroll-behavior: contain;
          user-select: text;
        }

        .chat-date-divider {
          display: flex;
          justify-content: center;
          margin: 6px 0 12px 0;
          user-select: none;
        }

        .date-pill {
          background: rgba(25, 30, 38, 0.85);
          color: rgba(245, 245, 247, 0.6);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          padding: 4px 12px;
          border-radius: 6px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        [data-theme="light"] .date-pill,
        :global([data-theme="light"]) .date-pill {
          background: #ffffff;
          color: #54656f;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .empty-chat-welcome {
          margin: auto;
          max-width: 620px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 24px 16px;
        }

        .welcome-icon-box {
          width: 68px;
          height: 68px;
          border-radius: 22px;
          background: rgba(229, 9, 20, 0.15);
          color: #e50914;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(229, 9, 20, 0.28);
          box-shadow: 0 8px 24px rgba(229, 9, 20, 0.2);
        }

        .empty-chat-welcome h2 {
          font-size: 20px;
          font-weight: 700;
        }

        .empty-chat-welcome p {
          font-size: 13.5px;
          color: rgba(245, 245, 247, 0.65);
          line-height: 1.6;
        }

        [data-theme="light"] .empty-chat-welcome p,
        :global([data-theme="light"]) .empty-chat-welcome p {
          color: #4b5563;
        }

        .starter-prompts-container {
          width: 100%;
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .prompts-label {
          font-size: 12px;
          font-weight: 600;
          color: rgba(245, 245, 247, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .starter-prompts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 8px;
          width: 100%;
        }

        .starter-prompt-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 11px 16px;
          border-radius: 12px;
          background: rgba(25, 30, 38, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.85);
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .starter-prompt-card:hover {
          background: rgba(229, 9, 20, 0.12);
          border-color: rgba(229, 9, 20, 0.35);
          color: #ffffff;
          transform: translateY(-1px);
        }

        [data-theme="light"] .starter-prompt-card,
        :global([data-theme="light"]) .starter-prompt-card {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          color: #111827;
        }

        [data-theme="light"] .starter-prompt-card:hover,
        :global([data-theme="light"]) .starter-prompt-card:hover {
          background: rgba(229, 9, 20, 0.06);
          border-color: #e50914;
        }

        .prompt-arrow {
          color: #e50914;
          flex-shrink: 0;
        }

        /* Message Rows */
        .messages-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 900px;
          width: 100%;
          margin: 0 auto;
        }

        .chat-message-row {
          display: flex;
          width: 100%;
        }

        .chat-message-row.user {
          justify-content: flex-end;
        }

        .chat-message-row.bot {
          justify-content: flex-start;
        }

        .message-bubble-container {
          max-width: 82%;
          position: relative;
          padding: 8px 12px 6px 12px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        /* User Message Bubble (WhatsApp styled green/crimson) */
        .chat-message-row.user .message-bubble-container {
          background: #005c4b;
          color: #ffffff;
          border-top-right-radius: 2px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        [data-theme="light"] .chat-message-row.user .message-bubble-container,
        :global([data-theme="light"]) .chat-message-row.user .message-bubble-container {
          background: #d9fdd3;
          color: #111827;
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        /* Bot Message Bubble (WhatsApp dark bubble) */
        .chat-message-row.bot .message-bubble-container {
          background: #202c33;
          color: #e9edef;
          border-top-left-radius: 2px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        [data-theme="light"] .chat-message-row.bot .message-bubble-container,
        :global([data-theme="light"]) .chat-message-row.bot .message-bubble-container {
          background: #ffffff;
          color: #111827;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .bot-sender-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 700;
          color: #e50914;
        }

        .bubble-text {
          font-size: 14.5px;
          line-height: 1.55;
          word-break: break-word;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .bubble-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          align-self: flex-end;
          margin-top: 2px;
          margin-left: 12px;
          user-select: none;
        }

        .message-time {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
        }

        [data-theme="light"] .chat-message-row.user .message-time,
        :global([data-theme="light"]) .chat-message-row.user .message-time {
          color: #667781;
        }

        [data-theme="light"] .chat-message-row.bot .message-time,
        :global([data-theme="light"]) .chat-message-row.bot .message-time {
          color: #667781;
        }

        .check-marks {
          color: rgba(255, 255, 255, 0.6);
        }

        .check-marks.read {
          color: #53bdeb;
        }

        .bot-verified-icon {
          color: #e50914;
        }

        /* Rich TMDB Payloads */
        .media-results-wrapper {
          margin-top: 4px;
          width: 100%;
        }

        .media-results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 10px;
        }

        .chat-movie-card {
          border-radius: 10px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.08);
          text-decoration: none;
          color: inherit;
          transition: transform 0.15s ease, border-color 0.15s ease;
        }

        .chat-movie-card:hover {
          transform: translateY(-2px);
          border-color: #e50914;
        }

        [data-theme="light"] .chat-movie-card,
        :global([data-theme="light"]) .chat-movie-card {
          background: #f0f2f5;
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .card-poster-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 2/3;
          background: #11141a;
        }

        .card-poster {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .card-rating-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          border-radius: 6px;
          padding: 2px 6px;
          font-size: 10.5px;
          font-weight: 700;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 3px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .card-details {
          padding: 8px;
        }

        .card-title {
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-year {
          font-size: 10.5px;
          color: rgba(245, 245, 247, 0.5);
        }

        [data-theme="light"] .card-year,
        :global([data-theme="light"]) .card-year {
          color: #667781;
        }

        /* Actors Grid */
        .actors-results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
          gap: 8px;
          margin-top: 4px;
        }

        .chat-actor-card {
          padding: 8px;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.08);
          text-decoration: none;
          color: inherit;
        }

        .actor-photo {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          object-fit: cover;
        }

        .actor-name {
          font-size: 12px;
          font-weight: 600;
        }

        .actor-dept {
          font-size: 10px;
          color: rgba(245, 245, 247, 0.5);
        }

        /* Comparison Table */
        .comparison-table-wrapper {
          overflow-x: auto;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.2);
          margin-top: 4px;
        }

        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
        }

        .comparison-table th, .comparison-table td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .comparison-table th {
          color: #e50914;
          font-weight: 700;
          background: rgba(0, 0, 0, 0.3);
        }

        /* Structured List */
        .chat-list-wrapper {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 4px;
        }

        .list-title {
          font-size: 13.5px;
          font-weight: 700;
        }

        .list-items-box {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .structured-list-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
        }

        .item-rank {
          font-weight: 800;
          color: #e50914;
          font-size: 13px;
        }

        .item-body {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .item-title {
          font-weight: 600;
          font-size: 13px;
        }

        .item-subtitle {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.55);
        }

        .item-tag {
          font-size: 10.5px;
          background: rgba(229, 9, 20, 0.15);
          color: #e50914;
          padding: 2px 8px;
          border-radius: 8px;
        }

        /* Bot Typing Indicator */
        .typing-bubble {
          padding: 10px 14px;
        }

        .whatsapp-typing-indicator {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 0;
        }

        .indicator-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(245, 245, 247, 0.6);
          animation: bounceDots 1.2s infinite ease-in-out;
        }

        .indicator-dot:nth-child(2) { animation-delay: 0.2s; }
        .indicator-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bounceDots {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-5px); opacity: 1; }
        }

        /* ===== Quick Prompts Strip ===== */
        .quick-prompts-strip {
          position: absolute;
          bottom: 74px;
          left: 18px;
          right: 18px;
          background: #191e26;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          padding: 10px 14px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
          z-index: 50;
        }

        [data-theme="light"] .quick-prompts-strip,
        :global([data-theme="light"]) .quick-prompts-strip {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.1);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
        }

        .strip-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          font-weight: 700;
          color: rgba(245, 245, 247, 0.6);
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        .close-strip-btn {
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
        }

        .strip-pills-scroll {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
        }

        .prompt-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #252d38;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.9);
          padding: 7px 12px;
          border-radius: 20px;
          font-size: 12px;
          white-space: nowrap;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .prompt-chip:hover {
          background: #e50914;
          color: #ffffff;
          border-color: #e50914;
        }

        [data-theme="light"] .prompt-chip,
        :global([data-theme="light"]) .prompt-chip {
          background: #f0f2f5;
          border: 1px solid rgba(0, 0, 0, 0.08);
          color: #111827;
        }

        /* ===== WhatsApp Fixed Bottom Input Bar ===== */
        .chat-input-bar {
          flex-shrink: 0;
          height: 64px;
          min-height: 64px;
          padding: 8px 18px;
          background: #191e26;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          z-index: 30;
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.2);
        }

        [data-theme="light"] .chat-input-bar,
        :global([data-theme="light"]) .chat-input-bar {
          background: #f0f2f5;
          border-top: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.05);
        }

        .chat-input-wrapper {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
        }

        .prompt-toggle-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: transparent;
          border: none;
          color: rgba(245, 245, 247, 0.65);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-fast);
          flex-shrink: 0;
        }

        .prompt-toggle-btn:hover,
        .prompt-toggle-btn.active {
          background: rgba(229, 9, 20, 0.15);
          color: #e50914;
        }

        [data-theme="light"] .prompt-toggle-btn,
        :global([data-theme="light"]) .prompt-toggle-btn {
          color: #54656f;
        }

        .chat-text-input {
          flex: 1;
          height: 42px;
          background: #2a3942;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 22px;
          padding: 0 18px;
          font-size: 15.5px;
          color: #ffffff;
          outline: none;
          transition: border-color 0.2s ease, background-color 0.2s ease;
        }

        .chat-text-input::placeholder {
          color: rgba(245, 245, 247, 0.45);
          font-size: 14px;
        }

        .chat-text-input:focus {
          border-color: #e50914;
          background: #32424c;
        }

        [data-theme="light"] .chat-text-input,
        :global([data-theme="light"]) .chat-text-input {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.1);
          color: #111827;
        }

        [data-theme="light"] .chat-text-input::placeholder,
        :global([data-theme="light"]) .chat-text-input::placeholder {
          color: #667781;
        }

        [data-theme="light"] .chat-text-input:focus,
        :global([data-theme="light"]) .chat-text-input:focus {
          border-color: #e50914;
        }

        .send-action-btn {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #252d38;
          border: none;
          color: rgba(245, 245, 247, 0.4);
          cursor: not-allowed;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: var(--transition-fast);
        }

        .send-action-btn.can-send {
          background: #e50914;
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(229, 9, 20, 0.4);
        }

        .send-action-btn.can-send:hover {
          transform: scale(1.05);
          filter: brightness(1.1);
        }

        .send-action-btn.can-send:active {
          transform: scale(0.95);
        }

        /* ===== Mobile Responsive Drawer & Touch Layout ===== */
        .mobile-sidebar-backdrop {
          display: none;
        }

        @media (max-width: 850px) {
          .chat-history-sidebar {
            position: absolute;
            top: 0;
            left: 0;
            bottom: 0;
            width: 85%;
            max-width: 320px;
            transform: translateX(-100%);
            box-shadow: none;
            border-right: 1px solid rgba(255, 255, 255, 0.1);
          }

          .chat-history-sidebar.drawer-open {
            transform: translateX(0);
            box-shadow: 8px 0 30px rgba(0, 0, 0, 0.6);
          }

          .mobile-sidebar-backdrop {
            display: block;
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.65);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 35;
          }

          .mobile-close-btn {
            display: flex;
          }

          .mobile-menu-trigger {
            display: flex;
          }

          .chat-feed {
            padding: 12px 12px;
          }

          .message-bubble-container {
            max-width: 92%;
          }

          .chat-input-bar {
            padding: 6px 10px;
            height: 56px;
            min-height: 56px;
          }

          .chat-text-input {
            height: 38px;
            font-size: 16px; /* Prevents auto-zoom on iOS */
          }

          .action-btn-text {
            display: none;
          }

          .chat-action-btn {
            padding: 6px 8px;
            border-radius: 50%;
          }

          .quick-prompts-strip {
            bottom: 64px;
            left: 10px;
            right: 10px;
          }
        }
      `}</style>
    </div>
  );
}
