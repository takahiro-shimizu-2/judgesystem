import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import { logger } from "./src/utils/logger";
import { errorHandler } from "./src/middleware/errorHandler";
import {
  EvaluationController,
  AnnouncementController,
  PartnerController,
  OrdererController,
  ContactController,
  CompanyController,
} from "./src/controllers";

const app = express();

const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (requestOrigin, callback) => {
    if (!requestOrigin || corsOrigins.includes(requestOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${requestOrigin} is not allowed by CORS`));
  },
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["*"],
  credentials: false
};

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

// Security headers
app.use(helmet());

// Structured request logging
app.use(pinoHttp({ logger }));

// gzip圧縮を有効化
app.use(compression());

// Middleware to parse JSON body (must be before routes)
app.use(express.json());

// Health check endpoints
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/readiness", async (_req, res) => {
  try {
    const { pool } = await import("./src/config/database");
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    res.status(200).json({ status: "ready", database: "connected" });
  } catch {
    res.status(503).json({ status: "not ready", database: "disconnected" });
  }
});

// Root path
app.get("/", (_req, res) => {
  res.send("Backend API is running");
});

// Initialize controllers
const evaluationController = new EvaluationController();
const announcementController = new AnnouncementController();
const partnerController = new PartnerController();
const ordererController = new OrdererController();
const contactController = new ContactController();
const companyController = new CompanyController();

// Evaluation routes
app.get("/api/evaluations/stats", evaluationController.getStats);
app.get("/api/evaluations/status-counts", evaluationController.getStatusCounts);
app.get("/api/evaluations", evaluationController.getList);
app.get("/api/evaluations/:id", evaluationController.getById);
app.patch("/api/evaluations/:evaluationNo", evaluationController.updateWorkStatus);
app.get("/api/evaluations/:evaluationNo/assignees", evaluationController.getAssignees);
app.put("/api/evaluations/:evaluationNo/assignees", evaluationController.updateAssignee);
app.get("/api/evaluations/:evaluationNo/orderer-workflow", evaluationController.getOrdererWorkflow);
app.put("/api/evaluations/:evaluationNo/orderer-workflow", evaluationController.updateOrdererWorkflow);

// Announcement routes
app.get("/api/announcements", announcementController.getList);
app.get("/api/announcements/:announcementNo", announcementController.getByNo);
app.get("/api/announcements/:announcementNo/progressing-companies", announcementController.getProgressingCompanies);
app.get("/api/announcements/:announcementNo/similar-cases", announcementController.getSimilarCases);
app.get("/api/announcements/:announcementNo/documents/:documentId/preview", announcementController.getDocumentPreview);

// Partner routes
app.get("/api/partners", partnerController.getList);
app.get("/api/partners/:id", partnerController.getById);

// Orderer routes
app.get("/api/orderers", ordererController.getList);
app.get("/api/orderers/:id", ordererController.getById);

// Contact routes
app.get("/api/contacts", contactController.getList);
app.get("/api/contacts/:id", contactController.getById);
app.post("/api/contacts", contactController.create);
app.patch("/api/contacts/:id", contactController.update);
app.delete("/api/contacts/:id", contactController.delete);

// Company routes
app.get("/api/companies", companyController.getList);

// Global error handler (must be after all routes)
app.use(errorHandler);

// Cloud Run は PORT 環境変数を使う
const port = process.env.PORT || 8080;

const server = app.listen(port, () => {
  logger.info({ port }, "API server running");
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Received shutdown signal");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
