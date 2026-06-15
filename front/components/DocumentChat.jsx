"use client";

import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Database,
  Files,
  FileText,
  Info,
  LoaderCircle,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  User,
  UserMinus,
  Users,
  X
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
  const [teamActivity, setTeamActivity] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [openSidebarSections, setOpenSidebarSections] = useState({
    chats: true,
    library: false,
    teams: false
  });
  const [teamName, setTeamName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [activeTeamId, setActiveTeamId] = useState("");
  const [renameValues, setRenameValues] = useState({});
  const [documentAccessFilter, setDocumentAccessFilter] = useState("all");
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const [documentDetails, setDocumentDetails] = useState(null);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isLoadingTeamActivity, setIsLoadingTeamActivity] = useState(false);
  const [isLoadingDocumentDetails, setIsLoadingDocumentDetails] = useState(false);
  const [documentActionId, setDocumentActionId] = useState("");
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  const busy = isIndexing || isUploading || isAsking || isLoadingTeamActivity || isLoadingDocumentDetails || Boolean(documentActionId);
  const totalTokens = status.tokenUsage?.total?.totalTokens || 0;
  const documents = status.documents || [];
  const filteredDocuments = useMemo(
    () => (
      documentAccessFilter === "all"
        ? documents
        : documents.filter((document) => document.accessLevel === documentAccessFilter)
    ),
    [documents, documentAccessFilter]
  );
  const documentFilterCounts = useMemo(
    () => documents.reduce(
      (counts, document) => ({
        ...counts,
        [document.accessLevel || "private"]: (counts[document.accessLevel || "private"] || 0) + 1
      }),
      {
        all: documents.length,
        private: 0,
        team: 0,
        public: 0
      }
    ),
    [documents]
  );
  const activeTeam = teams.find((team) => team.id === activeTeamId) || null;
  const activeTeamMembership = activeTeam?.members?.find((member) => member.userId === auth.user?.id) || null;
  const activeTeamRole = auth.user?.role === "admin" ? "admin" : activeTeamMembership?.role || "";
  const teamNamesById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams]
  );
  const canManageActiveTeam = Boolean(
    activeTeam
      && (
        auth.user?.role === "admin"
        || activeTeam.members?.some(
          (member) => member.userId === auth.user?.id && ["owner", "admin"].includes(member.role)
        )
      )
  );
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
    setTeamActivity([]);
    setPendingInvites([]);
    setRenameValues({});
    setDocumentAccessFilter("all");
    setActiveDocumentId("");
    setDocumentDetails(null);
    setActiveConversationId(null);
  }

  function toggleSidebarSection(section) {
    setOpenSidebarSections((current) => ({
      ...current,
      [section]: !current[section]
    }));
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
      setActiveTeamId((current) => (
        payload.teams?.some((team) => team.id === current)
          ? current
          : payload.teams?.[0]?.id || ""
      ));
    } catch (teamError) {
      setError(teamError.message);
    }
  }

  async function refreshInvites() {
    try {
      const response = await apiFetch("/teams/invitations");
      const payload = await readJson(response);
      setPendingInvites(payload.invitations || []);
    } catch (inviteError) {
      setError(inviteError.message);
    }
  }

  async function loadTeamActivity(teamId) {
    if (!teamId) {
      setTeamActivity([]);
      return;
    }

    setIsLoadingTeamActivity(true);

    try {
      const response = await apiFetch(`/teams/${teamId}/activity`);
      const payload = await readJson(response);
      setTeamActivity(payload.activity || []);
    } catch (activityError) {
      setTeamActivity([]);
      setError(activityError.message);
    } finally {
      setIsLoadingTeamActivity(false);
    }
  }

  async function refreshWorkspace() {
    await Promise.all([refreshStatus(), refreshConversations(), refreshTeams(), refreshInvites()]);
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
      await loadTeamActivity(payload.team.id);
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
      await loadTeamActivity(activeTeamId);
    } catch (teamError) {
      setError(teamError.message);
    }
  }

  async function acceptInvitation(inviteId) {
    setError("");

    try {
      await readJson(
        await apiFetch(`/teams/invitations/${inviteId}/accept`, {
          method: "POST"
        })
      );
      await Promise.all([refreshTeams(), refreshInvites(), refreshStatus()]);
      await loadTeamActivity(activeTeamId);
    } catch (inviteError) {
      setError(inviteError.message);
    }
  }

  async function cancelTeamInvite(teamId, inviteId) {
    setError("");

    try {
      await readJson(
        await apiFetch(`/teams/${teamId}/invitations/${inviteId}`, {
          method: "DELETE"
        })
      );
      await Promise.all([refreshTeams(), refreshInvites()]);
      await loadTeamActivity(teamId);
    } catch (inviteError) {
      setError(inviteError.message);
    }
  }

  async function removeTeamMember(teamId, userId) {
    setError("");

    try {
      await readJson(
        await apiFetch(`/teams/${teamId}/members/${userId}`, {
          method: "DELETE"
        })
      );
      await Promise.all([refreshTeams(), refreshStatus()]);
      await loadTeamActivity(teamId);
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
      if (activeDocumentId === documentId) {
        setActiveDocumentId("");
        setDocumentDetails(null);
      }
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function loadDocumentDetails(documentId) {
    setError("");
    setActiveDocumentId(documentId);
    setIsLoadingDocumentDetails(true);

    try {
      const response = await apiFetch(`/documents/${documentId}`);
      const payload = await readJson(response);
      setDocumentDetails(payload);
    } catch (detailsError) {
      setDocumentDetails(null);
      setError(detailsError.message);
    } finally {
      setIsLoadingDocumentDetails(false);
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
      if (activeDocumentId === documentId) {
        await loadDocumentDetails(documentId);
      }
    } catch (shareError) {
      setError(shareError.message);
    }
  }

  async function renameDocument(document) {
    const displayName = (renameValues[document.id] || "").trim();
    if (!displayName || displayName === document.displayName) {
      return;
    }

    setError("");
    setDocumentActionId(document.id);

    try {
      const response = await apiFetch(`/documents/${document.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName
        })
      });
      const payload = await readJson(response);
      setStatus(payload);
      setRenameValues((current) => ({
        ...current,
        [document.id]: ""
      }));
      if (activeDocumentId === document.id) {
        await loadDocumentDetails(document.id);
      }
    } catch (renameError) {
      setError(renameError.message);
    } finally {
      setDocumentActionId("");
    }
  }

  async function reindexDocument(documentId) {
    setError("");
    setDocumentActionId(documentId);

    try {
      const response = await apiFetch(`/documents/${documentId}/reindex`, {
        method: "POST"
      });
      const payload = await readJson(response);
      setStatus(payload);
      if (activeDocumentId === documentId) {
        await loadDocumentDetails(documentId);
      }
    } catch (reindexError) {
      setError(reindexError.message);
    } finally {
      setDocumentActionId("");
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
    if (auth.ready && auth.token && activeTeamId) {
      loadTeamActivity(activeTeamId);
      return;
    }

    setTeamActivity([]);
  }, [auth.ready, auth.token, activeTeamId]);

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

        <div className="control-grid">
          <button type="button" className="primary-button" onClick={indexSample} disabled={busy}>
            {isIndexing ? <LoaderCircle className="spin" size={18} /> : <Database size={18} />}
            <span>Load company</span>
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

          <button type="button" className="icon-button" onClick={refreshWorkspace} disabled={busy} aria-label="Reload workspace">
            <RefreshCw size={18} />
            <span>Reload</span>
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

        <section className="library-section teams-section" aria-label="Teams">
          <div className="section-heading dropdown-heading">
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSidebarSection("teams")}
              aria-expanded={openSidebarSections.teams}
            >
              <span>
                <p className="eyebrow">Teams</p>
                <h2>{teams.length} team{teams.length === 1 ? "" : "s"}</h2>
              </span>
              <span className="section-toggle-icons">
                <Users size={18} aria-hidden="true" />
                <ChevronDown className={openSidebarSections.teams ? "chevron open" : "chevron"} size={17} aria-hidden="true" />
              </span>
            </button>
          </div>

          {openSidebarSections.teams ? (
            <div className="section-body">
          {pendingInvites.length ? (
            <div className="invite-list" aria-label="Pending invitations">
              {pendingInvites.map((invite) => (
                <div className="invite-item" key={invite.id}>
                  <span>
                    <strong>{invite.teamName}</strong>
                    <small>{invite.role}</small>
                  </span>
                  <button
                    type="button"
                    className="small-action-button"
                    onClick={() => acceptInvitation(invite.id)}
                    disabled={busy}
                  >
                    <Check size={14} aria-hidden="true" />
                    Accept
                  </button>
                </div>
              ))}
            </div>
          ) : null}

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

              {activeTeam ? (
                <div className="permission-card">
                  <span>
                    <strong>{activeTeam.name}</strong>
                    <small>{canManageActiveTeam ? "You can invite, remove, and manage sharing." : "You can view shared team documents."}</small>
                  </span>
                  <span className={`role-badge ${activeTeamRole || "member"}`}>{activeTeamRole || "member"}</span>
                </div>
              ) : null}

              <form className="compact-form" onSubmit={addTeamMember}>
                <input
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  placeholder="Member email"
                  type="email"
                  disabled={!canManageActiveTeam || busy}
                />
                <button type="submit" className="secondary-button" disabled={busy || !canManageActiveTeam || !activeTeamId || !memberEmail.trim()}>
                  Add
                </button>
              </form>

              {!canManageActiveTeam ? (
                <p className="muted-copy">Only team owners and admins can invite or remove members.</p>
              ) : null}

              <div className="item-list">
                {teams.map((team) => (
                  <div className={`team-item ${activeTeamId === team.id ? "active" : ""}`} key={team.id}>
                    <strong>{team.name}</strong>
                    <span>
                      {team.members.length} member{team.members.length === 1 ? "" : "s"}
                      {team.invites?.length ? ` - ${team.invites.length} pending` : ""}
                    </span>
                  </div>
                ))}
              </div>

              {activeTeam ? (
                <>
                  <div className="member-list" aria-label={`${activeTeam.name} members`}>
                    {activeTeam.members.map((member) => (
                      <div className="member-row" key={member.id}>
                        <span>
                          <strong>{member.name || member.email}</strong>
                          <small>{member.email} - {member.role}</small>
                        </span>
                        {canManageActiveTeam && member.role !== "owner" ? (
                          <button
                            type="button"
                            className="small-icon-button"
                            onClick={() => removeTeamMember(activeTeam.id, member.userId)}
                            disabled={busy}
                            aria-label={`Remove ${member.email}`}
                          >
                            <UserMinus size={15} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {activeTeam.invites?.map((invite) => (
                      <div className="member-row pending" key={invite.id}>
                        <span>
                          <strong>{invite.email}</strong>
                          <small>Pending invitation</small>
                        </span>
                        {canManageActiveTeam ? (
                          <button
                            type="button"
                            className="small-icon-button"
                            onClick={() => cancelTeamInvite(activeTeam.id, invite.id)}
                            disabled={busy}
                            aria-label={`Cancel invitation for ${invite.email}`}
                          >
                            <X size={15} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="team-activity-panel" aria-label={`${activeTeam.name} activity`}>
                    <div className="mini-heading">
                      <Clock size={15} aria-hidden="true" />
                      <strong>Team activity</strong>
                      {isLoadingTeamActivity ? <LoaderCircle className="spin" size={14} /> : null}
                    </div>
                    <div className="timeline-list">
                      {teamActivity.length ? (
                        teamActivity.map((activity) => (
                          <div className="timeline-item" key={activity.id}>
                            <span>
                              <strong>{activity.message}</strong>
                              <small>
                                {activity.actorName || activity.actorEmail || "System"} - {formatShortDate(activity.createdAt)}
                              </small>
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="muted-copy">No team activity yet.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="muted-copy">Create a team or accept an invitation to share documents.</p>
          )}
            </div>
          ) : null}
        </section>

        <section className="library-section documents-section" aria-label="Indexed documents">
          <div className="section-heading dropdown-heading">
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSidebarSection("library")}
              aria-expanded={openSidebarSections.library}
            >
              <span>
                <p className="eyebrow">Library</p>
                <h2>{filteredDocuments.length} document{filteredDocuments.length === 1 ? "" : "s"}</h2>
              </span>
              <span className="section-toggle-icons">
                <Files size={18} aria-hidden="true" />
                <ChevronDown className={openSidebarSections.library ? "chevron open" : "chevron"} size={17} aria-hidden="true" />
              </span>
            </button>
          </div>

          {openSidebarSections.library ? (
            <div className="section-body">
          <div className="filter-tabs" role="tablist" aria-label="Document access filter">
            {[
              ["all", "All"],
              ["private", "Private"],
              ["team", "Team"],
              ["public", "Public"]
            ].map(([value, label]) => (
              <button
                type="button"
                className={`filter-button ${documentAccessFilter === value ? "active" : ""}`}
                onClick={() => setDocumentAccessFilter(value)}
                key={value}
              >
                <span>{label}</span>
                <strong>{documentFilterCounts[value] || 0}</strong>
              </button>
            ))}
          </div>

          <div className="item-list">
            {filteredDocuments.length ? (
              filteredDocuments.map((document) => {
                const canManage = document.ownerId === auth.user?.id || auth.user?.role === "admin";
                const shareValue = document.accessLevel === "team" ? `team:${document.teamId || ""}` : document.accessLevel || "private";
                const sharedTeamName = document.teamId ? teamNamesById.get(document.teamId) : "";
                const isDocumentBusy = documentActionId === document.id;

                return (
                  <div className="library-item" key={document.id}>
                    <div>
                      <strong>{document.displayName}</strong>
                      <span>
                        {documentSourceLabel(document.sourceType)} - v{document.version || 1} - {document.chunkCount} chunks -{" "}
                        {documentAccessLabel(document)}
                        {sharedTeamName ? ` (${sharedTeamName})` : ""}
                      </span>
                      {canManage ? (
                        <div className="document-actions">
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

                          <div className="rename-row">
                            <input
                              value={renameValues[document.id] || ""}
                              onChange={(event) => setRenameValues((current) => ({
                                ...current,
                                [document.id]: event.target.value
                              }))}
                              placeholder="Rename document"
                              disabled={busy}
                            />
                            <button
                              type="button"
                              className="small-action-button"
                              onClick={() => renameDocument(document)}
                              disabled={busy || !(renameValues[document.id] || "").trim()}
                            >
                              {isDocumentBusy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}
                              Save
                            </button>
                          </div>

                          <button
                            type="button"
                            className="small-action-button"
                            onClick={() => reindexDocument(document.id)}
                            disabled={busy}
                          >
                            {isDocumentBusy ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
                            Re-index
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="library-item-actions">
                      <button
                        type="button"
                        className={`small-icon-button ${activeDocumentId === document.id ? "active" : ""}`}
                        onClick={() => loadDocumentDetails(document.id)}
                        disabled={busy}
                        aria-label={`Show details for ${document.displayName}`}
                      >
                        {isLoadingDocumentDetails && activeDocumentId === document.id ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <Info size={15} />
                        )}
                      </button>
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
                  </div>
                );
              })
            ) : (
              <p className="muted-copy">No documents match this filter.</p>
            )}
          </div>

          {documentDetails ? (
            <div className="document-detail-panel" aria-label="Document details">
              <div className="detail-heading">
                <div>
                  <p className="eyebrow">Details</p>
                  <h3>{documentDetails.document.displayName}</h3>
                </div>
                <button
                  type="button"
                  className="small-action-button"
                  onClick={() => {
                    setActiveDocumentId("");
                    setDocumentDetails(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="detail-grid">
                <div>
                  <span>Version</span>
                  <strong>v{documentDetails.document.version || 1}</strong>
                </div>
                <div>
                  <span>Access</span>
                  <strong>{documentAccessLabel(documentDetails.document)}</strong>
                </div>
                <div>
                  <span>Chunks</span>
                  <strong>{documentDetails.document.chunkCount}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{documentSourceLabel(documentDetails.document.sourceType)}</strong>
                </div>
              </div>

              <div className="timeline-block">
                <div className="mini-heading">
                  <Clock size={15} aria-hidden="true" />
                  <strong>Versions</strong>
                </div>
                <div className="timeline-list">
                  {documentDetails.versions?.length ? (
                    documentDetails.versions.map((version) => (
                      <div className="timeline-item" key={version.id}>
                        <span>
                          <strong>v{version.version} - {version.action}</strong>
                          <small>{version.chunkCount} chunks - {formatShortDate(version.indexedAt)}</small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted-copy">No version history yet.</p>
                  )}
                </div>
              </div>

              <div className="timeline-block">
                <div className="mini-heading">
                  <Clock size={15} aria-hidden="true" />
                  <strong>Activity</strong>
                </div>
                <div className="timeline-list">
                  {documentDetails.activity?.length ? (
                    documentDetails.activity.map((activity) => (
                      <div className="timeline-item" key={activity.id}>
                        <span>
                          <strong>{activity.message}</strong>
                          <small>
                            {activity.actorName || activity.actorEmail || "System"} - {formatShortDate(activity.createdAt)}
                          </small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted-copy">No activity yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
            </div>
          ) : null}
        </section>

        <section className="library-section chats-section" aria-label="Saved conversations">
          <div className="section-heading dropdown-heading">
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSidebarSection("chats")}
              aria-expanded={openSidebarSections.chats}
            >
              <span>
                <p className="eyebrow">Chats</p>
                <h2>{conversations.length} saved</h2>
              </span>
              <span className="section-toggle-icons">
                <MessageSquare size={18} aria-hidden="true" />
                <ChevronDown className={openSidebarSections.chats ? "chevron open" : "chevron"} size={17} aria-hidden="true" />
              </span>
            </button>
            <button type="button" className="small-icon-button" onClick={startNewChat} disabled={busy} aria-label="Start new chat">
              <Plus size={15} />
            </button>
          </div>

          {openSidebarSections.chats ? (
            <div className="section-body">
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
            </div>
          ) : null}
        </section>
      </aside>

      <section className="chat-panel" aria-label="Document chat">
        <div className="chat-header">
          <div>
            <p className="eyebrow">Chat</p>
            <h2>{status.ready ? status.documentName : "No active document"}</h2>
          </div>
          <div className="chat-header-actions">
            <button type="button" className="header-action" onClick={refreshWorkspace} disabled={busy}>
              <RefreshCw size={15} aria-hidden="true" />
              Sync
            </button>
            <button type="button" className="header-action" onClick={startNewChat} disabled={busy}>
              <Plus size={15} aria-hidden="true" />
              New Chat
            </button>
            <span className={status.ready ? "pill ready" : "pill"}>{status.ready ? "Ready" : "Idle"}</span>
          </div>
        </div>

        <div className="message-list">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="orbita-orb" aria-hidden="true" />
              <div className="empty-copy">
                <h2>Hi, there</h2>
                <p>Tell me what you need, and I will search the company knowledge base.</p>
              </div>
              <div className="starter-grid">
                <button
                  type="button"
                  className="starter-card featured"
                  onClick={() => setQuestion("List all Company X branches worldwide.")}
                >
                  <span className="starter-avatar">AI</span>
                  <span>
                    <strong>Branch overview</strong>
                    <small>Find every confirmed location.</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="starter-card"
                  onClick={() => setQuestion("What are the key employee policies in the knowledge base?")}
                >
                  <span>
                    <strong>Employee policies</strong>
                    <small>Summarize the useful rules.</small>
                  </span>
                  <span className="card-menu">...</span>
                </button>
                <button
                  type="button"
                  className="starter-card"
                  onClick={() => setQuestion("Which projects are assigned to the Morocco branch?")}
                >
                  <span>
                    <strong>Team projects</strong>
                    <small>Check branch assignments.</small>
                  </span>
                  <span className="card-menu">...</span>
                </button>
              </div>
              <div className="quick-actions" aria-label="Suggested prompts">
                {[
                  "Compare branches",
                  "Find departments",
                  "Check salaries",
                  "Review daily tasks"
                ].map((prompt) => (
                  <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <article className={`message ${message.role} ${message.isError ? "error" : ""}`} key={`${message.role}-${index}`}>
              <div className="message-icon">
                {message.role === "user" ? <User size={18} aria-hidden="true" /> : <Bot size={18} aria-hidden="true" />}
              </div>
              <div className="message-body">
                <p>{message.content}</p>
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
          <div className="composer-field">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask me anything..."
              disabled={isAsking}
            />
            <div className="composer-tools">
              <button type="button" className="tool-chip" onClick={() => toggleSidebarSection("library")}>
                Select Source
              </button>
              <span className="composer-spacer" />
              <button type="button" className="tool-chip" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                Attach
              </button>
              <button type="button" className="tool-chip" disabled>
                Voice
              </button>
              <button type="submit" className="send-button" disabled={!question.trim() || isAsking} aria-label="Send question">
                {isAsking ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
                Send
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
