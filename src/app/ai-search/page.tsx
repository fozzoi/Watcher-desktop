"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Sparkles, Send, Plus, Trash2, MessageSquare, Bot, User, 
  Film, Star, Award, ChevronRight, RefreshCw, Layers, Check 
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
}

const STARTER_PROMPTS = [
  'Compare Oppenheimer vs Interstellar',
  'Top 5 mind-bending thrillers with twist endings',
  'Best sci-fi movies from the 2010s',
  'Recommend dark psychological mysteries',
  'Surprise me with an obscure masterpiece',
];

export default function AiChatPage() {
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiName, setAiName] = useState('Cine');
  const [userMemory, setUserMemoryState] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load chat history & AI name
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
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelectConversation = (convo: Conversation) => {
    setActiveConvoId(convo.id);
    setMessages(convo.messages as ChatMessage[]);
    setTimeout(() => inputRef.current?.focus(), 50);
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

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputPrompt;
    if (!textToSend.trim() || loading) return;

    setInputPrompt('');
    // Retain input focus immediately
    inputRef.current?.focus();

    const userMsgId = 'msg_' + Date.now();
    const newMsgList: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: 'user', kind: 'text', text: textToSend }
    ];
    setMessages(newMsgList);
    setLoading(true);

    try {
      // Gather user tastes
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
      let botMessage: ChatMessage;

      if (reply.kind === 'movies' && reply.movies) {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'movies',
          text: reply.text,
          movies: reply.movies,
        };
      } else if (reply.kind === 'actors' && reply.actors) {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'actors',
          text: reply.text,
          actors: reply.actors,
        };
      } else if (reply.kind === 'table' && reply.headers && reply.rows) {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'table',
          text: reply.text,
          tableHeaders: reply.headers,
          tableRows: reply.rows,
        };
      } else if (reply.kind === 'list' && reply.items) {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'list',
          text: reply.text,
          listTitle: reply.title,
          listItems: reply.items,
        };
      } else {
        botMessage = {
          id: botMsgId,
          role: 'bot',
          kind: 'text',
          text: reply.text || (typeof reply === 'string' ? reply : "Here's what I found for you."),
        };
      }

      const finalizedMessages = [...newMsgList, botMessage];
      setMessages(finalizedMessages);

      // Save to conversation history
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
        }
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  return (
    <div className="ai-chat-layout animate-fade-in-up">
      {/* Sidebar: Conversation History */}
      <div className="chat-history-sidebar glass-premium">
        <div className="sidebar-top-action">
          <button className="new-chat-btn btn-primary" onClick={startNewConversation}>
            <Plus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="conversations-scroll">
          <span className="history-label">Recent Conversations</span>
          {conversations.length > 0 ? (
            conversations.map((convo) => {
              const active = convo.id === activeConvoId;
              return (
                <div
                  key={convo.id}
                  className={`convo-item ${active ? 'active' : ''}`}
                  onClick={() => handleSelectConversation(convo)}
                >
                  <MessageSquare size={14} className="convo-icon" />
                  <span className="convo-title">{convo.title}</span>
                  <button 
                    className="delete-convo-btn" 
                    onClick={(e) => handleDeleteConversation(convo.id, e)}
                    title="Delete Chat"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="no-convos">No previous conversations yet.</p>
          )}
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="chat-main-area">
        {/* Header */}
        <div className="chat-header glass">
          <div className="ai-persona-info">
            <div className="ai-avatar">
              <Sparkles size={18} />
            </div>
            <div>
              <h2>{aiName} Cinema Companion</h2>
              <p>Powered by Gemini AI • Context-aware film expert</p>
            </div>
          </div>
        </div>

        {/* Message Feed */}
        <div className="chat-feed">
          {messages.length === 0 ? (
            <div className="empty-chat-welcome">
              <div className="welcome-icon-box">
                <Sparkles size={36} />
              </div>
              <h2>Hi! I'm {aiName}, your personal cinema companion.</h2>
              <p>Ask for tailor-made film recommendations, character analysis, director retrospectives, or compare movies side-by-side.</p>

              <div className="starter-prompts-grid">
                {STARTER_PROMPTS.map((prompt, idx) => (
                  <button 
                    key={idx} 
                    className="starter-prompt-card glass"
                    onClick={() => handleSendMessage(prompt)}
                  >
                    <span>"{prompt}"</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-message-row ${msg.role}`}>
                  <div className="avatar-col">
                    {msg.role === 'user' ? (
                      <div className="user-msg-avatar">
                        <User size={16} />
                      </div>
                    ) : (
                      <div className="bot-msg-avatar">
                        <Sparkles size={16} />
                      </div>
                    )}
                  </div>

                  <div className="message-bubble-wrapper">
                    <span className="message-sender-name">
                      {msg.role === 'user' ? 'You' : aiName}
                    </span>

                    {/* Text Payload */}
                    {msg.text && (
                      <div className="text-bubble">
                        {msg.text.split('\n').map((paragraph, i) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                      </div>
                    )}

                    {/* Movie Cards Payload */}
                    {msg.kind === 'movies' && msg.movies && (
                      <div className="chat-media-grid">
                        {msg.movies.map((m) => (
                          <Link 
                            key={m.id} 
                            href={`/detail?id=${m.id}&type=${m.media_type || 'movie'}`}
                            className="chat-movie-card glass"
                          >
                            <img 
                              src={getImageUrl(m.poster_path, 'w300')} 
                              alt={m.title || m.name || ''} 
                              className="chat-movie-poster" 
                              loading="lazy" 
                            />
                            <div className="chat-movie-meta">
                              <h4>{m.title || m.name}</h4>
                              <div className="meta-row">
                                <span className="year">
                                  {(m.release_date || m.first_air_date || '').substring(0, 4)}
                                </span>
                                {m.vote_average ? (
                                  <span className="rating">
                                    <Star size={11} fill="gold" stroke="gold" /> {m.vote_average.toFixed(1)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Actor Cards Payload */}
                    {msg.kind === 'actors' && msg.actors && (
                      <div className="chat-actors-grid">
                        {msg.actors.map((a) => (
                          <Link 
                            key={a.id} 
                            href={`/cast?id=${a.id}`}
                            className="chat-actor-card glass"
                          >
                            <img 
                              src={getImageUrl(a.profile_path, 'w185')} 
                              alt={a.name} 
                              className="chat-actor-photo" 
                              loading="lazy" 
                            />
                            <div className="chat-actor-meta">
                              <h4>{a.name}</h4>
                              <span>{a.known_for_department}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Table Payload */}
                    {msg.kind === 'table' && msg.tableHeaders && msg.tableRows && (
                      <div className="chat-table-wrapper glass">
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
                      <div className="chat-list-wrapper glass">
                        {msg.listTitle && <h4>{msg.listTitle}</h4>}
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
                  </div>
                </div>
              ))}

              {loading && (
                <div className="chat-message-row bot">
                  <div className="avatar-col">
                    <div className="bot-msg-avatar">
                      <Sparkles size={16} />
                    </div>
                  </div>
                  <div className="message-bubble-wrapper">
                    <div className="text-bubble loading-dots">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="chat-input-container">
          <div className="chat-input-inner">
            <input 
              ref={inputRef}
              type="text"
              className="main-chat-input"
              placeholder={loading ? `${aiName} is thinking...` : `Ask ${aiName} about any movie, comparison, or recommendations...`}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              autoFocus
            />
            <button 
              className="send-message-btn btn-primary"
              onClick={() => handleSendMessage()}
              disabled={loading || !inputPrompt.trim()}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ai-chat-layout {
          display: flex;
          height: 100vh;
          min-height: 100vh;
          margin-top: -30px;
          margin-left: -40px;
          margin-right: -40px;
          margin-bottom: -100px;
          width: calc(100% + 80px);
          max-width: none;
          border-radius: 0;
          overflow: hidden;
          border: none;
          background: var(--bg-color);
        }

        @media (max-width: 900px) {
          .ai-chat-layout {
            margin-top: -20px;
            margin-left: -20px;
            margin-right: -20px;
            margin-bottom: -100px;
            width: calc(100% + 40px);
          }
        }

        .chat-history-sidebar {
          width: 280px;
          height: 100%;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--card-border);
          background: rgba(14, 14, 18, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        @media (max-width: 850px) {
          .chat-history-sidebar {
            display: none;
          }
        }
        .sidebar-top-action {
          padding: 16px;
          border-bottom: 1px solid var(--card-border);
        }
        .new-chat-btn {
          width: 100%;
          justify-content: center;
          padding: 10px;
        }
        .conversations-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .history-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--foreground-muted);
          margin-bottom: 8px;
          padding-left: 6px;
        }
        .convo-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          color: var(--foreground-muted);
          transition: var(--transition-fast);
        }
        .convo-item:hover {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--foreground);
        }
        .convo-item.active {
          background: rgba(229, 9, 20, 0.12);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--primary);
          font-weight: 600;
        }
        .convo-icon {
          flex-shrink: 0;
        }
        .convo-title {
          flex: 1;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .delete-convo-btn {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          opacity: 0;
          transition: var(--transition-fast);
        }
        .convo-item:hover .delete-convo-btn {
          opacity: 0.7;
        }
        .delete-convo-btn:hover {
          opacity: 1 !important;
          color: var(--primary);
        }
        .no-convos {
          font-size: 12px;
          color: var(--foreground-muted);
          padding: 10px;
        }
        .chat-main-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--bg-color);
          position: relative;
          height: 100%;
          overflow: hidden;
        }
        .chat-header {
          padding: 16px 32px;
          border-bottom: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--sidebar-bg);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 5;
        }
        .ai-persona-info {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .ai-avatar {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: var(--primary-gradient);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ai-persona-info h2 {
          font-size: 16px;
          font-weight: 700;
        }
        .ai-persona-info p {
          font-size: 11px;
          color: var(--foreground-muted);
        }
        .chat-feed {
          flex: 1;
          overflow-y: auto;
          padding: 24px 32px 110px 32px;
          display: flex;
          flex-direction: column;
        }
        .empty-chat-welcome {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          margin: auto;
          max-width: 680px;
          width: 100%;
          gap: 16px;
        }
        .welcome-icon-box {
          width: 68px;
          height: 68px;
          border-radius: 20px;
          background: rgba(229, 9, 20, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 6px;
        }
        .empty-chat-welcome h2 {
          font-size: 24px;
          font-weight: 700;
        }
        .empty-chat-welcome p {
          font-size: 14px;
          color: var(--foreground-muted);
          line-height: 1.6;
        }
        .starter-prompts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 10px;
          width: 100%;
          margin-top: 14px;
        }
        .starter-prompt-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 18px;
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          font-size: 13px;
          color: var(--foreground-muted);
          border: 1px solid var(--card-border);
          transition: var(--transition-fast);
        }
        .starter-prompt-card:hover {
          color: var(--foreground);
          border-color: var(--primary);
          transform: translateX(4px);
        }
        .messages-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 900px;
          width: 100%;
          margin: 0 auto;
        }
        .chat-message-row {
          display: flex;
          gap: 16px;
        }
        .chat-message-row.user {
          flex-direction: row-reverse;
        }
        .avatar-col {
          flex-shrink: 0;
        }
        .user-msg-avatar, .bot-msg-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .user-msg-avatar {
          background: var(--card-bg);
          color: var(--foreground);
          border: 1px solid var(--card-border);
        }
        .bot-msg-avatar {
          background: var(--primary-gradient);
          color: #fff;
        }
        .message-bubble-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-width: 80%;
        }
        .chat-message-row.user .message-bubble-wrapper {
          align-items: flex-end;
        }
        .message-sender-name {
          font-size: 11px;
          font-weight: 600;
          color: var(--foreground-muted);
        }
        .text-bubble {
          padding: 14px 18px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.6;
        }
        .chat-message-row.user .text-bubble {
          background: var(--primary);
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .chat-message-row.bot .text-bubble {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-bottom-left-radius: 4px;
        }
        .chat-media-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 12px;
          margin-top: 6px;
        }
        .chat-movie-card {
          border-radius: 10px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: var(--transition-fast);
        }
        .chat-movie-card:hover {
          transform: translateY(-3px);
          border-color: var(--primary);
        }
        .chat-movie-poster {
          width: 100%;
          height: 180px;
          object-fit: cover;
        }
        .chat-movie-meta {
          padding: 8px 10px;
        }
        .chat-movie-meta h4 {
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--foreground-muted);
          margin-top: 4px;
        }
        .chat-actors-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
          gap: 10px;
          margin-top: 6px;
        }
        .chat-actor-card {
          padding: 10px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 6px;
        }
        .chat-actor-photo {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          object-fit: cover;
        }
        .chat-actor-meta h4 {
          font-size: 12px;
          font-weight: 600;
        }
        .chat-actor-meta span {
          font-size: 10px;
          color: var(--foreground-muted);
        }
        .chat-table-wrapper {
          padding: 14px;
          border-radius: 12px;
          overflow-x: auto;
        }
        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .comparison-table th, .comparison-table td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid var(--card-border);
        }
        .comparison-table th {
          color: var(--primary);
          font-weight: 600;
        }
        .chat-list-wrapper {
          padding: 16px;
          border-radius: 12px;
        }
        .chat-list-wrapper h4 {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .list-items-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .structured-list-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 8px;
        }
        .item-rank {
          font-weight: 700;
          color: var(--primary);
          font-size: 13px;
          width: 24px;
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
          color: var(--foreground-muted);
        }
        .item-tag {
          font-size: 10px;
          background: rgba(229, 9, 20, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--primary);
          padding: 2px 8px;
          border-radius: 10px;
        }
        .chat-input-container {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 16px 32px 24px 32px;
          border-top: 1px solid var(--card-border);
          background: linear-gradient(180deg, transparent 0%, var(--bg-color) 40%, var(--bg-color) 100%);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 10;
        }

        .chat-input-inner {
          max-width: 900px;
          width: 100%;
          margin: 0 auto;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .main-chat-input {
          flex: 1;
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 16px;
          padding: 14px 20px;
          font-size: 14.5px;
          color: var(--foreground);
          outline: none;
          transition: var(--transition-smooth);
        }

        .main-chat-input:focus {
          border-color: var(--primary);
          background: var(--input-focus-bg);
          box-shadow: 0 0 20px rgba(229, 9, 20, 0.25);
        }
        .loading-dots {
          display: flex;
          gap: 4px;
          padding: 12px 18px;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--foreground-muted);
          animation: bounce 1.2s infinite ease-in-out;
        }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
