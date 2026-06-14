"use client";

import {
  AlertCircle,
  Bot,
  Database,
  Files,
  FileText,
  LoaderCircle,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  User,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api").replace(/\/$/, "");

function formatDate(value) {
  if (!value) {
    return "Not indexed";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function sourceLabel(source) {
  if (!source.page) {
    return source.source;
  }

  return `${source.source}, page ${source.page}`;
}

function formatTokens(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatShortDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function documentSourceLabel(sourceType) {
  return sourceType === "upload" ? "Upload" : "Sample";
}

function documentAccessLabel(document) {
  if (document.accessLevel === "public") {
    return "Public";
  }

  if (document.accessLevel === "team") {
    return "Team";
  }

  return "Private";
}

function buildHistory(messages) {
  return messages
    .filter((message) => !message.isError)
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

export function DocumentChat() {
  const [auth, setAuth] = useState({
    ready: false,
    token: null,
    user: null
  });
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [status, setStatus] = useState({
    ready: false,
    documentName: null,
    chunkCount: 0,
    indexedAt: null
  });
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamName, setTeamName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [activeTeamId, setActiveTeamId] = useState("");
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  const busy = isIndexing || isUploading || isAsking;
  const totalTokens = status.tokenUsage?.total?.totalTokens || 0;
  const documents = status.documents || [];
  const statusText = useMemo(() => {
    if (!status.ready) {
      return "No document indexed";
    }

    return `${status.chunkCount} chunks`;
  }, [status]);

  function clearSession() {
    localStorage.removeItem("documentQaAuth");
    setAuth({
      ready: true,
      token: null,
      user: null
    });
    setMessages([]);
    setConversations([]);
    setTeams([]);
    setActiveConversationId(null);
  }

  function authHeaders(extraHeaders = {}) {
    return {
      ...extraHeaders,
      ...(auth.token
        ? {
            Authorization: `Bearer ${auth.token}`
          }
        : {})
    };
  }

  async function apiFetch(path, options = {}) {
    return fetch(`${apiBase}${path}`, {
      ...options,
      headers: authHeaders(options.headers || {})
    });
  }

  async function readJson(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        clearSession();
      }
      throw new Error(payload.error || "Request failed");
    }
    return payload;
  }

  function saveSession(payload) {
    localStorage.setItem("documentQaAuth", JSON.stringify(payload));
    setAuth({
      ready: true,
      token: payload.token,
      user: payload.user
    });
  }

  async function submitAuth(event) {
    event.preventDefault();
    setError("");

    try {
      const response = await fetch(`${apiBase}/auth/${authMode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(authForm)
      });
      saveSession(await readJson(response));
    } catch (authError) {
      setError(authError.message);
    }
  }

  async function refreshStatus() {
    try {
      const response = await apiFetch("/status");
      const payload = await readJson(response);
      setStatus(payload);
    } catch (statusError) {
      setError(statusError.message);
    }
  }

  async function refreshConversations() {
    try {
      const response = await apiFetch("/conversations");
      const payload = await readJson(response);
      setConversations(payload.conversations || []);
    } catch (conversationError) {
      setError(conversationError.message);
    }
  }

  async function refreshTeams() {
    try {
      const response = await apiFetch("/teams");
      const payload = await readJson(response);
      setTeams(payload.teams || []);
      setActiveTeamId((current) => current || payload.teams?.[0]?.id || "");
    } catch (teamError) {
      setError(teamError.message);
    }
  }

  async function refreshWorkspace() {
    await Promise.all([refreshStatus(), refreshConversations(), refreshTeams()]);
  }

  async function createTeam(event) {
    event.preventDefault();
    const nextName = teamName.trim();
    if (!nextName) {
      return;
    }

    setError("");

    try {
      const response = await apiFetch("/teams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: nextName
        })
      });
      const payload = await readJson(response);
      setTeamName("");
      setActiveTeamId(payload.team.id);
      await refreshTeams();
    } catch (teamError) {
      setError(teamError.message);
    }
  }

  async function addTeamMember(event) {
    event.preventDefault();
    if (!activeTeamId || !memberEmail.trim()) {
      return;
    }

    setError("");

    try {
      await readJson(
        await apiFetch(`/teams/${activeTeamId}/members`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: memberEmail,
            role: "member"
          })
        })
      );
      setMemberEmail("");
      await refreshTeams();
    } catch (teamError) {
      setError(teamError.message);
    }
  }

  async function indexSample() {
    setError("");
    setIsIndexing(true);

    try {
      const response = await apiFetch("/index-sample", {
        method: "POST"
      });
      const payload = await readJson(response);
      setStatus(payload);
      setMessages([]);
      setActiveConversationId(null);
      await refreshConversations();
    } catch (indexError) {
      setError(indexError.message);
    } finally {
      setIsIndexing(false);
    }
  }

  async function uploadDocument(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError("");
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await apiFetch("/upload", {
        method: "POST",
        body: formData
      });
      const payload = await readJson(response);
      setStatus(payload);
      setMessages([]);
      setActiveConversationId(null);
      await refreshConversations();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  function startNewChat() {
    setMessages([]);
    setActiveConversationId(null);
    setError("");
  }

  async function deleteDocument(documentId) {
    setError("");

    try {
      const response = await apiFetch(`/documents/${documentId}`, {
        method: "DELETE"
      });
      const payload = await readJson(response);
      setStatus(payload);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function shareDocument(documentId, value) {
    const isTeamShare = value.startsWith("team:");
    const accessLevel = isTeamShare ? "team" : value;
    const teamId = isTeamShare ? value.replace("team:", "") : null;

    setError("");

    try {
      const response = await apiFetch(`/documents/${documentId}/share`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          accessLevel,
          teamId
        })
      });
      const payload = await readJson(response);
      setStatus(payload);
    } catch (shareError) {
      setError(shareError.message);
    }
  }

  async function loadConversation(conversationId) {
    setError("");

    try {
      const response = await apiFetch(`/conversations/${conversationId}`);
      const payload = await readJson(response);
      setActiveConversationId(payload.conversation.id);
      setMessages(payload.conversation.messages || []);
    } catch (conversationError) {
      setError(conversationError.message);
    }
  }

  async function removeConversation(event, conversationId) {
    event.stopPropagation();
    setError("");

    try {
      const response = await apiFetch(`/conversations/${conversationId}`, {
        method: "DELETE"
      });
      const payload = await readJson(response);
      setConversations(payload.conversations || []);
      if (activeConversationId === conversationId) {
        startNewChat();
      }
    } catch (conversationError) {
      setError(conversationError.message);
    }
  }

  async function askQuestion(event) {
    event.preventDefault();

    const nextQuestion = question.trim();
    if (!nextQuestion || isAsking) {
      return;
    }

    setError("");
    setQuestion("");
    setIsAsking(true);
    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: nextQuestion
      }
    ]);

    try {
      const response = await apiFetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: nextQuestion,
          conversationId: activeConversationId,
          history: buildHistory(messages)
        })
      });
      const payload = await readJson(response);
      setActiveConversationId(payload.conversationId || activeConversationId);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.answer,
          usage: payload.usage,
          sources: payload.sources || []
        }
      ]);
      if (payload.tokenUsage) {
        setStatus((current) => ({
          ...current,
          tokenUsage: payload.tokenUsage
        }));
      }
      await refreshConversations();
    } catch (askError) {
      setError(askError.message);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: askError.message,
          isError: true
        }
      ]);
    } finally {
      setIsAsking(false);
    }
  }

  useEffect(() => {
    async function restoreSession() {
      const saved = localStorage.getItem("documentQaAuth");
      if (!saved) {
        setAuth((current) => ({
          ...current,
          ready: true
        }));
        return;
      }

      try {
        const parsed = JSON.parse(saved);
        const response = await fetch(`${apiBase}/auth/me`, {
          headers: {
            Authorization: `Bearer ${parsed.token}`
          }
        });
        const payload = await readJson(response);
        setAuth({
          ready: true,
          token: parsed.token,
          user: payload.user
        });
      } catch {
        clearSession();
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    if (auth.ready && auth.token) {
      refreshWorkspace();
    }
  }, [auth.ready, auth.token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAsking]);

  if (!auth.ready) {
    return (
      <main className="auth-shell">
        <LoaderCircle className="spin" size={28} aria-hidden="true" />
      </main>
    );
  }

  if (!auth.token) {
    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={submitAuth}>
          <div className="brand-lockup">
            <div className="brand-mark">
              <FileText size={24} aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">Private RAG</p>
              <h1>{authMode === "login" ? "Welcome back" : "Create account"}</h1>
            </div>
          </div>

          {authMode === "register" ? (
            <label className="field-label">
              <span>Name</span>
              <input
                value={authForm.name}
                onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
          ) : null}

          <label className="field-label">
            <span>Email</span>
            <input
              value={authForm.email}
              onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
            />
          </label>

          <label className="field-label">
            <span>Password</span>
            <input
              value={authForm.password}
              onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Minimum 8 characters"
              type="password"
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {error ? (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <button type="submit" className="primary-button">
            {authMode === "login" ? "Login" : "Register"}
          </button>

          <button
            type="button"
            className="text-button"
            onClick={() => {
              setError("");
              setAuthMode(authMode === "login" ? "register" : "login");
            }}
          >
            {authMode === "login" ? "Create a new account" : "Use an existing account"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="document-panel" aria-label="Document controls">
        <div className="brand-lockup">
          <div className="brand-mark">
            <FileText size={24} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">LangChain.js</p>
            <h1>Document Q&A</h1>
          </div>
        </div>

        <div className="user-panel">
          <div>
            <strong>{auth.user?.name}</strong>
            <span>{auth.user?.email}</span>
          </div>
          <button type="button" className="small-icon-button" onClick={clearSession} aria-label="Log out">
            <LogOut size={15} />
          </button>
        </div>

        <section className="status-panel" aria-label="Index status">
          <div className="status-row">
            <span className={status.ready ? "status-dot ready" : "status-dot"} />
            <span>{statusText}</span>
          </div>
          <h2>{status.documentName || "Waiting for a document"}</h2>
          <p>{formatDate(status.indexedAt)}</p>
          <div className="usage-summary">
            <span>Total tokens</span>
            <strong>{formatTokens(totalTokens)}</strong>
          </div>
        </section>

        <div className="control-grid">
          <button type="button" className="primary-button" onClick={indexSample} disabled={busy}>
            {isIndexing ? <LoaderCircle className="spin" size={18} /> : <Database size={18} />}
            <span>Load company PDFs</span>
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {isUploading ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
            <span>Upload</span>
          </button>

          <button type="button" className="icon-button" onClick={refreshStatus} disabled={busy} aria-label="Refresh status">
            <RefreshCw size={18} />
          </button>
        </div>

        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept=".pdf,.txt,.md"
          onChange={uploadDocument}
        />

        {error ? (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="library-section" aria-label="Teams">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Teams</p>
              <h2>{teams.length} team{teams.length === 1 ? "" : "s"}</h2>
            </div>
            <Users size={18} aria-hidden="true" />
          </div>

          <form className="compact-form" onSubmit={createTeam}>
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="New team name"
            />
            <button type="submit" className="secondary-button" disabled={busy || !teamName.trim()}>
              Create
            </button>
          </form>

          {teams.length ? (
            <>
              <select className="inline-select" value={activeTeamId} onChange={(event) => setActiveTeamId(event.target.value)}>
                {teams.map((team) => (
                  <option value={team.id} key={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>

              <form className="compact-form" onSubmit={addTeamMember}>
                <input
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  placeholder="Member email"
                  type="email"
                />
                <button type="submit" className="secondary-button" disabled={busy || !activeTeamId || !memberEmail.trim()}>
                  Add
                </button>
              </form>

              <div className="item-list">
                {teams.map((team) => (
                  <div className={`team-item ${activeTeamId === team.id ? "active" : ""}`} key={team.id}>
                    <strong>{team.name}</strong>
                    <span>{team.members.length} member{team.members.length === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted-copy">Create a team to share documents.</p>
          )}
        </section>

        <section className="library-section" aria-label="Indexed documents">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Library</p>
              <h2>{documents.length} document{documents.length === 1 ? "" : "s"}</h2>
            </div>
            <Files size={18} aria-hidden="true" />
          </div>

          <div className="item-list">
            {documents.length ? (
              documents.map((document) => {
                const canManage = document.ownerId === auth.user?.id || auth.user?.role === "admin";
                const shareValue = document.accessLevel === "team" ? `team:${document.teamId || ""}` : document.accessLevel || "private";

                return (
                  <div className="library-item" key={document.id}>
                    <div>
                      <strong>{document.displayName}</strong>
                      <span>
                        {documentSourceLabel(document.sourceType)} - {document.chunkCount} chunks - {documentAccessLabel(document)}
                      </span>
                      {canManage ? (
                        <select
                          className="inline-select compact-select"
                          value={shareValue}
                          onChange={(event) => shareDocument(document.id, event.target.value)}
                          disabled={busy}
                        >
                          <option value="private">Private</option>
                          <option value="public">Public</option>
                          {teams.map((team) => (
                            <option value={`team:${team.id}`} key={team.id}>
                              Team: {team.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        className="small-icon-button"
                        onClick={() => deleteDocument(document.id)}
                        disabled={busy}
                        aria-label={`Delete ${document.displayName}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="muted-copy">No saved documents yet.</p>
            )}
          </div>
        </section>

        <section className="library-section" aria-label="Saved conversations">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Chats</p>
              <h2>{conversations.length} saved</h2>
            </div>
            <button type="button" className="small-icon-button" onClick={startNewChat} disabled={busy} aria-label="Start new chat">
              <Plus size={15} />
            </button>
          </div>

          <div className="item-list">
            {conversations.length ? (
              conversations.map((conversation) => (
                <div
                  className={`conversation-item ${activeConversationId === conversation.id ? "active" : ""}`}
                  key={conversation.id}
                >
                  <button type="button" onClick={() => loadConversation(conversation.id)} disabled={busy}>
                    <MessageSquare size={16} aria-hidden="true" />
                    <span>
                      <strong>{conversation.title}</strong>
                      <small>{formatShortDate(conversation.updatedAt)}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="small-icon-button"
                    onClick={(event) => removeConversation(event, conversation.id)}
                    disabled={busy}
                    aria-label={`Delete ${conversation.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            ) : (
              <p className="muted-copy">No saved chats yet.</p>
            )}
          </div>
        </section>
      </aside>

      <section className="chat-panel" aria-label="Document chat">
        <div className="chat-header">
          <div>
            <p className="eyebrow">Chat</p>
            <h2>{status.ready ? status.documentName : "No active document"}</h2>
          </div>
          <span className={status.ready ? "pill ready" : "pill"}>{status.ready ? "Ready" : "Idle"}</span>
        </div>

        <div className="message-list">
          {messages.length === 0 ? (
            <div className="empty-state">
              <Bot size={28} aria-hidden="true" />
              <p>Ask about branches, employees, salaries, departments, projects, daily tasks, or company policies.</p>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <article className={`message ${message.role} ${message.isError ? "error" : ""}`} key={`${message.role}-${index}`}>
              <div className="message-icon">
                {message.role === "user" ? <User size={18} aria-hidden="true" /> : <Bot size={18} aria-hidden="true" />}
              </div>
              <div className="message-body">
                <p>{message.content}</p>
                {message.sources?.length ? (
                  <div className="sources" aria-label="Sources">
                    {message.sources.map((source) => (
                      <span key={`${source.id}-${source.page}-${source.preview}`}>{sourceLabel(source)}</span>
                    ))}
                  </div>
                ) : null}
                {message.usage ? (
                  <div className="token-meter" aria-label="Token usage">
                    <span>Prompt {formatTokens(message.usage.promptTokens)}</span>
                    <span>Answer {formatTokens(message.usage.completionTokens)}</span>
                    <span>Total {formatTokens(message.usage.totalTokens)}</span>
                  </div>
                ) : null}
              </div>
            </article>
          ))}

          {isAsking ? (
            <article className="message assistant">
              <div className="message-icon">
                <Bot size={18} aria-hidden="true" />
              </div>
              <div className="message-body thinking">
                <LoaderCircle className="spin" size={18} aria-hidden="true" />
                <span>Thinking</span>
              </div>
            </article>
          ) : null}

          <div ref={chatEndRef} />
        </div>

        <form className="composer" onSubmit={askQuestion}>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about the indexed document"
            disabled={isAsking}
          />
          <button type="submit" className="send-button" disabled={!question.trim() || isAsking} aria-label="Send question">
            {isAsking ? <LoaderCircle className="spin" size={20} /> : <Send size={20} />}
          </button>
        </form>
      </section>
    </main>
  );
}
