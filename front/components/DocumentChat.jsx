"use client";

import {
  AlertCircle,
  Bot,
  Database,
  FileText,
  LoaderCircle,
  RefreshCw,
  Send,
  Upload,
  User
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
  const [status, setStatus] = useState({
    ready: false,
    documentName: null,
    chunkCount: 0,
    indexedAt: null
  });
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  const busy = isIndexing || isUploading || isAsking;
  const statusText = useMemo(() => {
    if (!status.ready) {
      return "No document indexed";
    }

    return `${status.chunkCount} chunks`;
  }, [status]);

  async function readJson(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Request failed");
    }
    return payload;
  }

  async function refreshStatus() {
    try {
      const response = await fetch(`${apiBase}/status`);
      const payload = await readJson(response);
      setStatus(payload);
    } catch (statusError) {
      setError(statusError.message);
    }
  }

  async function indexSample() {
    setError("");
    setIsIndexing(true);

    try {
      const response = await fetch(`${apiBase}/index-sample`, {
        method: "POST"
      });
      const payload = await readJson(response);
      setStatus(payload);
      setMessages([]);
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
      const response = await fetch(`${apiBase}/upload`, {
        method: "POST",
        body: formData
      });
      const payload = await readJson(response);
      setStatus(payload);
      setMessages([]);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsUploading(false);
      event.target.value = "";
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
      const response = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: nextQuestion,
          history: buildHistory(messages)
        })
      });
      const payload = await readJson(response);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.answer,
          sources: payload.sources || []
        }
      ]);
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
    refreshStatus();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAsking]);

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

        <section className="status-panel" aria-label="Index status">
          <div className="status-row">
            <span className={status.ready ? "status-dot ready" : "status-dot"} />
            <span>{statusText}</span>
          </div>
          <h2>{status.documentName || "Waiting for a document"}</h2>
          <p>{formatDate(status.indexedAt)}</p>
        </section>

        <div className="control-grid">
          <button type="button" className="primary-button" onClick={indexSample} disabled={busy}>
            {isIndexing ? <LoaderCircle className="spin" size={18} /> : <Database size={18} />}
            <span>Index sample</span>
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
              <p>Ask about employees, salaries, departments, projects, daily tasks, or company policies.</p>
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
