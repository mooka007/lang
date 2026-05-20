# Document Q&A Chatbot with LangChain.js

Chat with PDF, text, or Markdown documents using a Node.js API, LangChain.js retrieval, GitHub Models or OpenAI, and a Next.js frontend.

## What Is Built

- Express API for document indexing, upload, status checks, and Q&A.
- LangChain.js RAG pipeline using PDF loading, text splitting, embeddings, and an in-memory vector store.
- Next.js frontend with document controls and a chat interface.
- Sample Company X employee knowledge base in Markdown and generated PDF form.

## Project Structure

```text
.
├── front/                      # Next.js frontend and UI/UX code
│   ├── app/
│   └── components/
├── scripts/
│   └── make-sample-pdf.js
└── server/                     # Express + LangChain.js API
    ├── data/                   # Future persistent vector data
    ├── pdfs/                   # Sample/source documents
    │   ├── company-x-employee-knowledge-base.md
    │   └── company-x-employee-knowledge-base.pdf
    ├── uploads/                # Uploaded documents
    └── src/
```

## Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Then set one model provider.

```text
LLM_PROVIDER=github
EMBEDDING_PROVIDER=github
GITHUB_TOKEN=your_github_token_with_models_read_access
```

The project also supports OpenAI directly by setting `LLM_PROVIDER=openai`, `EMBEDDING_PROVIDER=openai`, and `OPENAI_API_KEY`.

The default upload limit is 100 MB. Change it with:

```text
UPLOAD_MAX_MB=100
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

## Run The App

Start the API and frontend together:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:server
npm run dev:front
```

Default URLs:

- API: `http://localhost:5000`
- Frontend: `http://localhost:3000`

## First Test Flow

1. Open `http://localhost:3000`.
2. Click `Index sample`.
3. Ask: `Who works on PX-Atlas and what are their roles?`
4. Ask: `Which employees are in Engineering and what are their daily tasks?`

## API Endpoints

- `GET /health`
- `GET /api/status`
- `POST /api/index-sample`
- `POST /api/upload`
- `POST /api/chat`

Example chat request:

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"How does async and await help with API calls?\"}"
```

## Sample PDF

The source content lives at:

```text
server/pdfs/company-x-employee-knowledge-base.md
```

Regenerate the PDF with:

```bash
npm run sample:pdf
```

## Next Steps

- Add persistent vector storage with Chroma, Pinecone, or pgvector.
- Add multi-document collections.
- Stream answers from the backend to the frontend.
- Add authentication before allowing public uploads.
