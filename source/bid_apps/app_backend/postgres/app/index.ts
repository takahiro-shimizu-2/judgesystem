import express, { Request, Response } from "express";
import cors from "cors";
import compression from "compression";
import { PoolClient } from "pg";
import QueryStream from "pg-query-stream";
import { pool, TABLES, TableName, schemaPrefix } from "./src/config/database";
import { EvaluationController, AnnouncementController } from "./src/controllers";

const app = express();

app.use(cors({
  origin: "https://bidapp-frontend-postgres-50843898931.asia-northeast1.run.app",
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["*"],
  credentials: false
}));

app.options("*", cors());

// gzip圧縮を有効化
app.use(compression());

// Middleware to parse JSON body (must be before routes)
app.use(express.json());

// Streaming table handler to avoid 32MB limit
const createTableHandler = (tableName: TableName) => {
  const qualifiedTableName = `${schemaPrefix}${tableName}`;
  return async (req: Request, res: Response): Promise<void> => {
    console.log(`GET ${req.path} hit`);

    let client: PoolClient | undefined;
    try {
      client = await pool.connect();

      // Set headers
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");

      // Start JSON array
      res.write("[");
      let firstRow = true;

      // Create query stream
      const query = new QueryStream(`SELECT * FROM ${qualifiedTableName}`);
      const stream = client.query(query);

      stream.on("data", (row: unknown) => {
        // Add comma before all rows except the first
        if (!firstRow) {
          res.write(",");
        }
        res.write(JSON.stringify(row));
        firstRow = false;
      });

      stream.on("error", (err: Error) => {
        console.error(`ERROR in ${req.path} stream:`, err);
        if (!res.headersSent) {
          res.status(500).json({
            error: "Internal Server Error",
            message: err.message,
            path: req.path,
            table: qualifiedTableName
          });
        } else {
          // Stream already started, just end it
          res.end();
        }
      });

      stream.on("end", () => {
        // Close JSON array
        res.write("]");
        res.end();
        client?.release();
      });
    } catch (error) {
      console.error(`ERROR in ${req.path}:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          path: req.path,
          table: qualifiedTableName
        });
      }
      client?.release();
    }
  };
};

// Root path
app.get("/", (req, res) => {
  res.send("Backend API is running");
});

// Initialize controllers
const evaluationController = new EvaluationController();
const announcementController = new AnnouncementController();

// Evaluation routes
app.get("/api/evaluations", evaluationController.getList);
app.get("/api/evaluations/:id", evaluationController.getById);
app.patch("/api/evaluations/:evaluationNo", evaluationController.updateWorkStatus);

// Announcement routes
app.get("/api/announcements", announcementController.getList);
app.get("/api/announcements/:announcementNo", announcementController.getByNo);

// Other table routes (using streaming handler)
app.get("/api/companies", createTableHandler(TABLES.companies));
app.get("/api/orderers", createTableHandler(TABLES.orderers));
app.get("/api/partners", createTableHandler(TABLES.partners));

// Cloud Run は PORT 環境変数を使う
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
