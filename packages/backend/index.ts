import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./src/utils/logger";
import { errorHandler } from "./src/middleware/errorHandler";
import { authenticate, authorize } from "./src/middleware/auth";
import { pool } from "./src/config/database";
import {
  EvaluationController,
  AnnouncementController,
  PartnerController,
  OrdererController,
  ContactController,
  CompanyController,
} from "./src/controllers";

const app = express();

// Security headers
app.use(helmet());

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

// Structured logging
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
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "not_ready", timestamp: new Date().toISOString() });
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

// Apply authentication to all /api routes
app.use("/api", authenticate);

// Evaluation routes
app.get("/api/evaluations/stats", evaluationController.getStats);
app.get("/api/evaluations/status-counts", evaluationController.getStatusCounts);
app.get("/api/evaluations", evaluationController.getList);
app.get("/api/evaluations/:id", evaluationController.getById);
app.patch("/api/evaluations/:evaluationNo", authorize("admin", "evaluator"), evaluationController.updateWorkStatus);
app.get("/api/evaluations/:evaluationNo/assignees", evaluationController.getAssignees);
app.put("/api/evaluations/:evaluationNo/assignees", authorize("admin", "evaluator"), evaluationController.updateAssignee);
app.get("/api/evaluations/:evaluationNo/orderer-workflow", evaluationController.getOrdererWorkflow);
app.put("/api/evaluations/:evaluationNo/orderer-workflow", authorize("admin", "evaluator", "orderer"), evaluationController.updateOrdererWorkflow);

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
app.post("/api/contacts", authorize("admin", "evaluator"), contactController.create);
app.patch("/api/contacts/:id", authorize("admin", "evaluator"), contactController.update);
app.delete("/api/contacts/:id", authorize("admin"), contactController.delete);

// Company routes
app.get("/api/companies", companyController.getList);

// Global error handler (must be after all routes)
app.use(errorHandler);

// Cloud Run は PORT 環境変数を使う
const port = process.env.PORT || 8080;

const server = app.listen(port, () => {
  logger.info({ port }, "API server running");
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info({ signal }, "Shutdown signal received");
  server.close(async () => {
    logger.info("HTTP server closed");
    await pool.end();
    logger.info("Database pool closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
