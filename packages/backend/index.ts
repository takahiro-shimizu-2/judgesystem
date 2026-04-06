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
  OrdererController,
  ContactController,
  CompanyController,
  BidRequirementController,
} from "./src/controllers";
import { PublicAnnouncementController } from "./src/controllers/publicAnnouncementController";

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
app.use(express.json({ limit: process.env.EXPRESS_JSON_LIMIT || "10mb" }));

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
const ordererController = new OrdererController();
const contactController = new ContactController();
const companyController = new CompanyController();
const bidRequirementController = new BidRequirementController();
const publicAnnouncementController = new PublicAnnouncementController();

// =========================================================================
// Public API routes — 認証不要、入札案件一覧のみ
// /public/api は authenticate を経由しない
// =========================================================================
app.get("/public/api/announcements", publicAnnouncementController.getList);

// =========================================================================
// Internal API routes — 認証必須
// =========================================================================
app.use("/api", authenticate);

// Evaluation routes
app.get("/api/evaluations/stats", evaluationController.getStats);
app.get("/api/evaluations/status-counts", evaluationController.getStatusCounts);
app.get("/api/evaluations/company-options", evaluationController.getCompanyOptions);
app.get("/api/evaluations", evaluationController.getList);
app.get("/api/evaluations/:id", evaluationController.getById);
app.patch("/api/evaluations/:evaluationNo", authorize("admin", "evaluator"), evaluationController.updateWorkStatus);
app.get("/api/evaluations/:evaluationNo/assignees", evaluationController.getAssignees);
app.put("/api/evaluations/:evaluationNo/assignees", authorize("admin", "evaluator"), evaluationController.updateAssignee);
app.get("/api/evaluations/:evaluationNo/orderer-workflow", evaluationController.getOrdererWorkflow);
app.put("/api/evaluations/:evaluationNo/orderer-workflow", authorize("admin", "evaluator", "orderer"), evaluationController.updateOrdererWorkflow);
app.get("/api/evaluations/:evaluationNo/partner-workflow", evaluationController.getPartnerWorkflow);
app.put("/api/evaluations/:evaluationNo/partner-workflow", authorize("admin", "evaluator"), evaluationController.updatePartnerWorkflow);
app.post("/api/evaluations/:evaluationNo/partner-files", authorize("admin", "evaluator"), evaluationController.uploadPartnerFile);
app.get("/api/evaluations/:evaluationNo/partner-files/:fileId", authorize("admin", "evaluator"), evaluationController.downloadPartnerFile);
app.delete("/api/evaluations/:evaluationNo/partner-files/:fileId", authorize("admin", "evaluator"), evaluationController.deletePartnerFile);
app.get("/api/evaluations/:evaluationNo/partners", evaluationController.getPartnerCandidates);
app.post("/api/evaluations/:evaluationNo/partners", authorize("admin", "evaluator"), evaluationController.addPartnerCandidate);
app.patch("/api/evaluations/:evaluationNo/partners/:partnerId", authorize("admin", "evaluator"), evaluationController.updatePartnerCandidate);
app.delete("/api/evaluations/:evaluationNo/partners/:partnerId", authorize("admin", "evaluator"), evaluationController.deletePartnerCandidate);

// Announcement routes
app.get("/api/announcements", announcementController.getList);
app.get("/api/announcements/:announcementNo", announcementController.getByNo);
app.get("/api/announcements/:announcementNo/progressing-companies", announcementController.getProgressingCompanies);
app.get("/api/announcements/:announcementNo/similar-cases", announcementController.getSimilarCases);
app.get("/api/announcements/:announcementNo/documents/:documentId/preview", announcementController.getDocumentPreview);

// Orderer routes
app.get("/api/orderers", ordererController.getList);
app.get("/api/orderers/:id", ordererController.getById);
app.post("/api/orderers", authorize("admin", "evaluator"), ordererController.create);
app.patch("/api/orderers/:id", authorize("admin", "evaluator"), ordererController.update);
app.delete("/api/orderers/:id", authorize("admin"), ordererController.delete);

// Contact routes
app.get("/api/contacts", contactController.getList);
app.get("/api/contacts/:id", contactController.getById);
app.post("/api/contacts", authorize("admin", "evaluator"), contactController.create);
app.patch("/api/contacts/:id", authorize("admin", "evaluator"), contactController.update);
app.delete("/api/contacts/:id", authorize("admin"), contactController.delete);

// Bid requirement routes
app.get("/api/bid-requirements/search", bidRequirementController.search);

// Company routes
app.get("/api/companies", companyController.getList);
app.get("/api/companies/:id", companyController.getById);
app.post("/api/companies", authorize("admin", "evaluator"), companyController.create);
app.patch("/api/companies/:id", authorize("admin", "evaluator"), companyController.update);
app.delete("/api/companies/:id", authorize("admin"), companyController.delete);

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
