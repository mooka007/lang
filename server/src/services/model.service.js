import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { env, requireModelConfig } from "../config/env.js";

class GitHubEmbeddings {
  constructor() {
    this.model = env.github.embeddingModel;
  }

  async embedDocuments(texts) {
    return this.#requestEmbeddings(texts);
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

    const response = await fetch(`${env.github.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.github.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": env.github.apiVersion
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = payload.error?.message || payload.message || JSON.stringify(payload);
      const error = new Error(`GitHub Models embedding request failed (${response.status}): ${detail}`);
      error.status = response.status;
      throw error;
    }

    return [...payload.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
  }
}

export function createEmbeddings() {
  requireModelConfig();

  if (env.embeddingProvider === "github") {
    return new GitHubEmbeddings();
  }

  return new OpenAIEmbeddings({
    apiKey: env.openai.apiKey,
    model: env.openai.embeddingModel
  });
}

async function answerWithGitHub({ system, question, context, history }) {
  const response = await fetch(`${env.github.baseUrl}/chat/completions`, {
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

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload.error?.message || payload.message || JSON.stringify(payload);
    const error = new Error(`GitHub Models chat request failed (${response.status}): ${detail}`);
    error.status = response.status;
    throw error;
  }

  return payload.choices?.[0]?.message?.content || "I could not generate an answer from the model response.";
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

  return prompt.pipe(model).pipe(new StringOutputParser()).invoke({
    question,
    context: context || "No document context was retrieved for this question.",
    history
  });
}

export async function answerFromContext({ system, question, context, history }) {
  requireModelConfig();

  if (env.llmProvider === "github") {
    return answerWithGitHub({ system, question, context, history });
  }

  return answerWithOpenAI({ system, question, context, history });
}
