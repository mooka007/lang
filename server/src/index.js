import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { documentsRouter } from "./routes/documents.routes.js";
import { teamsRouter } from "./routes/teams.routes.js";
import { loadPersistedRagIndex } from "./services/rag.service.js";
import { ensureStorageFolders } from "./utils/storage.js";

await ensureStorageFolders();
await loadPersistedRagIndex();

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "document-qa-server"
  });
});

app.use("/api/auth", authRouter);
app.use("/api/teams", teamsRouter);
app.use("/api", documentsRouter);

app.use((error, _request, response, _next) => {
  if (error.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({
      error: `File too large. Maximum upload size is ${env.uploadMaxFileSizeMb} MB.`
    });
    return;
  }

  const status = error.status || 500;
  response.status(status).json({
    error: error.message || "Unexpected server error"
  });
});

app.listen(env.port, () => {
  console.log(`Document Q&A API listening on http://localhost:${env.port}`);
});
