# LangChain And RAG Flow In This Project

This project is a Document Q&A chatbot. The goal is simple: upload or load a PDF, ask questions about it, and get answers based on the document content.

The main idea behind the project is called **RAG**, which means **Retrieval-Augmented Generation**.

## What RAG Means

Normally, an AI model answers from what it already learned during training. That is not enough when we want answers from a private PDF, company file, employee document, or internal policy.

RAG solves this by adding a retrieval step before the AI answers.

The flow is:

```text
User question
→ search the document for relevant text
→ send that text to the AI model
→ AI answers using the retrieved document context
```

So the chatbot does not blindly guess. It first looks inside the indexed document.

## Project Structure

The project has two main parts:

```text
front/   → Next.js frontend, UI, chat screen, upload button
server/  → Express backend, document loading, embeddings, retrieval, AI calls
```

Important backend files:

```text
server/src/config/env.js              → reads configuration from .env
server/src/routes/documents.routes.js → API routes for upload, index, and chat
server/src/services/rag.service.js    → main RAG logic
server/src/services/model.service.js  → model calls and token usage tracking
server/src/utils/storage.js           → creates needed folders
```

## Step 1: Loading A Document

There are two ways to load a document:

1. Click **Index sample**
2. Upload a PDF, TXT, or Markdown file

The sample files are:

```text
server/pdfs/company-x-employee-knowledge-base.pdf
server/pdfs/company-x-branch-*.pdf
```

The Company X PDFs are intentionally detailed. They include fictional employee salaries, shifts, managers, roles, project managers, daily tasks, skills, languages, access levels, PTO balances, branch projects, budgets, deadlines, KPIs, and risks.

When the user clicks **Load company PDFs**, the frontend calls:

```text
POST /api/index-sample
```

When the user uploads a file, the frontend calls:

```text
POST /api/upload
```

## Step 2: Extracting Text

The backend reads the document.

For PDFs, it uses a PDF loader:

```text
PDF → text pages
```

The result is not one big text block. It is a list of document pages.

## Step 3: Splitting Text Into Chunks

AI models and vector search work better with smaller text sections.

So the backend splits the document into chunks.

Example:

```text
Full PDF
→ chunk 1
→ chunk 2
→ chunk 3
→ ...
```

In this project, chunks are created in:

```text
server/src/services/rag.service.js
```

The current chunk settings are:

```js
chunkSize: 1000
chunkOverlap: 180
```

`chunkSize` controls how large each section is.

`chunkOverlap` means each chunk shares a little text with the next one. This helps avoid losing context at chunk boundaries.

## Step 4: Creating Embeddings

An embedding is a numeric representation of text meaning.

Example:

```text
"Engineering employees working on PX-Atlas"
→ [0.12, -0.44, 0.87, ...]
```

The numbers allow the system to compare meaning, not just exact words.

This project can use:

```text
Local development embeddings
GitHub Models embeddings
OpenAI embeddings
```

The provider is controlled by `.env`:

```env
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=openai/text-embedding-3-small
```

For this project, `local` is the development default because the company dataset is large and should index fast while you test the chatbot. For a production-style demo, switch `EMBEDDING_PROVIDER` to `github` or `openai`.

## Step 5: Storing Chunks In A Vector Store

After chunks become embeddings, they are stored in a vector store.

This project currently uses:

```text
MemoryVectorStore
```

That means the vector data lives in memory while the server is running.

Important note:

```text
If the backend restarts, the document must be indexed again.
```

Later, this can be upgraded to persistent storage like:

```text
Chroma
Pinecone
Postgres pgvector
MongoDB vector search
```

## Step 6: Asking A Question

When the user asks a question, the frontend calls:

```text
POST /api/chat
```

The request includes:

```text
current question
recent chat history
```

The backend then:

1. Converts the question into an embedding
2. Searches the vector store for the closest document chunks
3. Adds exact matches for IDs like `CX-023` or project codes like `PX-Atlas`
4. Sends the retrieved chunks to the AI model
5. Returns the answer and sources

## Why Exact Matching Was Added

Vector search is good for meaning, but it can miss exact IDs.

For example:

```text
CX-023
PX-Atlas
salma.haddad23@companyx.example
```

These are exact terms, not general meanings.

So the project uses hybrid retrieval:

```text
exact matching + vector search
```

This makes employee and project questions more reliable.

## Step 7: Sending Context To The Model

The AI model does not receive the full PDF every time.

It receives only the most relevant chunks.

The prompt looks like this conceptually:

```text
System instruction:
Answer using the document context.
If the answer is not in the document, say you do not know.

Recent chat history:
...

User question:
...

Document context:
Relevant source chunks
```

This keeps the answer focused on the document.

## Step 8: Returning Sources

The backend returns:

```text
answer
sources
token usage
```

Sources help prove where the answer came from.

Example:

```text
Company X Employee Knowledge Base, page 5
```

This is useful when presenting the project because it shows the chatbot is grounded in the document.

## Chat Memory

The chatbot also receives recent chat messages from the frontend.

This helps with questions like:

```text
What were my last questions?
What about their daily tasks?
```

Important note:

```text
Memory is currently frontend session memory.
If the page refreshes, the chat history resets.
```

## Token Usage Tracking

The project tracks token usage for:

```text
embedding/indexing
chat prompt
chat answer
total session usage
```

This helps estimate cost and understand model usage.

The frontend shows:

```text
Total tokens
Prompt tokens
Answer tokens
```

The backend exposes this in:

```text
GET /api/status
POST /api/chat
```

## Complete Flow

Here is the full project flow:

```text
1. User loads sample PDFs or uploads a document
2. Backend extracts text from the document
3. Text is split into chunks
4. Each chunk is converted into an embedding
5. Chunks are stored in MemoryVectorStore
6. User asks a question
7. Question is embedded
8. Relevant chunks are retrieved
9. Exact IDs/project codes are matched
10. Retrieved context is sent to the AI model
11. AI returns an answer
12. Frontend displays answer, sources, and token usage
```

## How To Present This Project

You can explain it like this:

> This is a Document Q&A chatbot built with Next.js, Express, and LangChain-style RAG. The user loads a company PDF, the backend extracts and splits the text, creates embeddings, stores them in a vector store, and retrieves the most relevant chunks when a question is asked. The AI model then answers using only that retrieved context, and the UI shows the answer, sources, and token usage.

## Current Limitations

- The vector store is in memory, so indexing is lost after backend restart.
- Uploaded files are stored locally, not in cloud storage.
- Chat memory resets after page refresh.
- There is no authentication yet.
- The sample company data is fictional.

## Good Future Improvements

- Store vectors permanently with Chroma, Pinecone, pgvector, or MongoDB vector search.
- Add user accounts and protected document collections.
- Save chat history in a database.
- Add multi-document search.
- Add streaming answers.
- Add admin dashboard for uploaded files and token usage.
