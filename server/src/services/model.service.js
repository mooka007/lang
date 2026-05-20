import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { env, requireModelConfig } from "../config/env.js";

function emptyUsage() {
  return {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
}

let tokenUsage = {
  embeddings: emptyUsage(),
  chat: emptyUsage(),
  lastEmbedding: null,
  lastChat: null
};

function normalizeUsage(usage) {
  if (!usage) {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };
  }

  const promptTokens = Number(
    usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens ?? 0
  );
  const completionTokens = Number(
    usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens ?? 0
  );
  const totalTokens = Number(
    usage.total_tokens ?? usage.totalTokens ?? promptTokens + completionTokens
  );

  return {
    promptTokens,
    completionTokens,
    totalTokens
  };
}

function recordUsage(kind, usage) {
  const normalized = normalizeUsage(usage);
  const bucket = tokenUsage[kind];

  bucket.requests += 1;
  bucket.promptTokens += normalized.promptTokens;
  bucket.completionTokens += normalized.completionTokens;
  bucket.totalTokens += normalized.totalTokens;

  if (kind === "embeddings") {
    tokenUsage.lastEmbedding = normalized;
  }

  if (kind === "chat") {
    tokenUsage.lastChat = normalized;
  }

  return normalized;
}

function usageFromOpenAIMessage(message) {
  return normalizeUsage(
    message.usage_metadata || message.response_metadata?.tokenUsage || message.response_metadata?.usage
  );
}

function messageContentToText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        return part?.text || "";
      })
      .join("");
  }

  return String(content || "");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryStatus(status) {
  return [429, 500, 502, 503, 504].includes(status);
}

async function fetchJsonWithRetry(url, options) {
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (response.ok || !shouldRetryStatus(response.status) || attempt === maxAttempts - 1) {
      return {
        response,
        payload
      };
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt;
    await sleep(delayMs);
  }

  throw new Error("Request retry loop ended unexpectedly.");
}

export function resetTokenUsage() {
  tokenUsage = {
    embeddings: emptyUsage(),
    chat: emptyUsage(),
    lastEmbedding: null,
    lastChat: null
  };
}

export function getTokenUsage() {
  return {
    embeddings: { ...tokenUsage.embeddings },
    chat: { ...tokenUsage.chat },
    total: {
      requests: tokenUsage.embeddings.requests + tokenUsage.chat.requests,
      promptTokens: tokenUsage.embeddings.promptTokens + tokenUsage.chat.promptTokens,
      completionTokens: tokenUsage.embeddings.completionTokens + tokenUsage.chat.completionTokens,
      totalTokens: tokenUsage.embeddings.totalTokens + tokenUsage.chat.totalTokens
    },
    lastEmbedding: tokenUsage.lastEmbedding,
    lastChat: tokenUsage.lastChat
  };
}

class GitHubEmbeddings {
  constructor() {
    this.model = env.github.embeddingModel;
  }

  async embedDocuments(texts) {
    const embeddings = [];

    for (let index = 0; index < texts.length; index += env.embeddingBatchSize) {
      const batch = texts.slice(index, index + env.embeddingBatchSize);
      embeddings.push(...(await this.#requestEmbeddings(batch)));
    }

    return embeddings;
  }

  async embedQuery(text) {
    const [embedding] = await this.#requestEmbeddings([text]);
    return embedding;
  }

  async #requestEmbeddings(input) {
    const body = {
      model: env.github.embeddingModel,
      input,
      encoding_format: "float"
    };

    if (env.github.embeddingDimensions) {
      body.dimensions = env.github.embeddingDimensions;
    }

    const { response, payload } = await fetchJsonWithRetry(`${env.github.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.github.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": env.github.apiVersion
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const detail = payload.error?.message || payload.message || JSON.stringify(payload);
      const error = new Error(`GitHub Models embedding request failed (${response.status}): ${detail}`);
      error.status = response.status;
      throw error;
    }

    recordUsage("embeddings", payload.usage);

    return [...payload.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
  }
}

class LocalHashEmbeddings {
  constructor() {
    this.dimensions = 384;
  }

  embedDocuments(texts) {
    return Promise.resolve(texts.map((text) => this.#embed(text)));
  }

  embedQuery(text) {
    return Promise.resolve(this.#embed(text));
  }

  #embed(text) {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    const tokens = String(text)
      .toLowerCase()
      .match(/[a-z0-9-]{2,}/g) || [];

    for (const token of tokens) {
      const hash = this.#hash(token);
      const index = Math.abs(hash) % this.dimensions;
      const sign = hash % 2 === 0 ? 1 : -1;
      vector[index] += sign;
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / norm);
  }

  #hash(value) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0;
    }

    return hash;
  }
}

export function createEmbeddings() {
  requireModelConfig();

  if (env.embeddingProvider === "local") {
    return new LocalHashEmbeddings();
  }

  if (env.embeddingProvider === "github") {
    return new GitHubEmbeddings();
  }

  return new OpenAIEmbeddings({
    apiKey: env.openai.apiKey,
    model: env.openai.embeddingModel
  });
}

async function answerWithGitHub({ system, question, context, history }) {
  const { response, payload } = await fetchJsonWithRetry(`${env.github.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.github.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": env.github.apiVersion
    },
    body: JSON.stringify({
      model: env.github.chatModel,
      messages: [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: `Recent conversation history:\n${history}\n\nQuestion: ${question}\n\nDocument context:\n${context || "No document context was retrieved for this question."}`
        }
      ],
      temperature: env.llmTemperature,
      max_tokens: env.llmMaxTokens
    })
  });

  if (!response.ok) {
    const detail = payload.error?.message || payload.message || JSON.stringify(payload);
    const error = new Error(`GitHub Models chat request failed (${response.status}): ${detail}`);
    error.status = response.status;
    throw error;
  }

  const usage = recordUsage("chat", payload.usage);

  return {
    answer: payload.choices?.[0]?.message?.content || "I could not generate an answer from the model response.",
    usage
  };
}

async function answerWithOpenAI({ system, question, context, history }) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system],
    ["human", "Recent conversation history:\n{history}\n\nQuestion: {question}\n\nDocument context:\n{context}"]
  ]);
  const model = new ChatOpenAI({
    apiKey: env.openai.apiKey,
    model: env.openai.chatModel,
    temperature: env.llmTemperature,
    maxTokens: env.llmMaxTokens
  });

  const promptValue = await prompt.invoke({
    question,
    context: context || "No document context was retrieved for this question.",
    history
  });
  const message = await model.invoke(promptValue);
  const usage = recordUsage("chat", usageFromOpenAIMessage(message));

  return {
    answer: messageContentToText(message.content),
    usage
  };
}

export async function answerFromContext({ system, question, context, history }) {
  requireModelConfig();

  if (env.llmProvider === "github") {
    return answerWithGitHub({ system, question, context, history });
  }

  return answerWithOpenAI({ system, question, context, history });
}
