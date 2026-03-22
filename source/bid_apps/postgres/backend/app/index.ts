import express from "express";
import cors from "cors";
import compression from "compression";
import {
  EvaluationController,
  AnnouncementController,
  PartnerController,
  OrdererController,
  ContactController,
  CompanyController,
} from "./src/controllers";

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["*"],
  credentials: false
}));

app.options("*", cors());

// gzip圧縮を有効化
app.use(compression());

// Middleware to parse JSON body (must be before routes)
app.use(express.json());

// Root path
app.get("/", (req, res) => {
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

// Cloud Run は PORT 環境変数を使う
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
