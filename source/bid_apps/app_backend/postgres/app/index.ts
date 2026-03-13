import express, { Request, Response } from "express";
import cors from "cors";
import compression from "compression";
import { Pool, PoolClient, PoolConfig } from "pg";
import QueryStream from "pg-query-stream";

// LIMIT removed to match BigQuery backend behavior

const shouldEnableSsl = (): boolean => {
  const flag = (process.env.PGSSLMODE ?? process.env.PGSSL ?? "").toLowerCase();
  return flag === "require" || flag === "true";
};

const buildPoolConfig = (): PoolConfig => {
  const config: PoolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST ?? "127.0.0.1",
        port: Number(process.env.PGPORT ?? "5432"),
        database: process.env.PGDATABASE ?? "postgres",
        user: process.env.PGUSER ?? "postgres",
        password: process.env.PGPASSWORD,
      };

  if (shouldEnableSsl()) {
    config.ssl = {
      rejectUnauthorized:
        (process.env.PGSSL_REJECT_UNAUTHORIZED ?? "false").toLowerCase() === "true",
    };
  }

  return config;
};

const app = express();

//app.use(cors({
//  origin: "https://frontend-xxxxx.a.run.app"
//}));

// fetch はシンプルだがバックエンドが返すレスポンスが JSON の場合、ブラウザは以下の判断をする。
//「この API は JSON を返す」
//「Content-Type: application/json を扱う」
// → CORS の "simple request" の条件から外れる
// → プリフライト（OPTIONS）を送る
// つまり、フロント側が何も指定していなくても、
// バックエンドが JSON を返すだけでプリフライトが発生することがある。
//  origin: のみの指定だと Access-Control-Allow-Headers  が返らず cors エラー。

app.use(cors({
  origin: "https://frontend-xxxxx.a.run.app",
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["*"], // 全部許可に変更 // ["Content-Type", "Authorization"],
  credentials: false //ひとまずfalse. ログインとか考えると true にする必要があるかもしれない。
}));

// credentials: false
app.options("*", cors());

// gzip圧縮を有効化
app.use(compression());

// Middleware to parse JSON body (must be before routes)
app.use(express.json());

// credentials: true なら以下が必要？(未確認)
//app.options("*", (req, res) => {
//  res.set("Access-Control-Allow-Origin", "https://frontend-xxxxx.a.run.app");
//  res.set("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
//  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
//  res.set("Access-Control-Allow-Credentials", "true");
//  res.status(204).send("");
//});




const pool = new Pool(buildPoolConfig());

const TABLES = {
  announcements: "backend_announcements",
  evaluations: "backend_evaluations",
  companies: "backend_companies",
  orderers: "backend_orderers",
  partners: "backend_partners",
} as const;

type TableName = (typeof TABLES)[keyof typeof TABLES];
const schemaPrefix = process.env.PG_SCHEMA ? `${process.env.PG_SCHEMA}.` : "";

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
      res.setHeader("Cache-Control", "public, max-age=1800");

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

// とりあえずルートパス
app.get("/", (req, res) => {
  res.send("Backend API is running");
});



app.get("/api/announcements", createTableHandler(TABLES.announcements));
app.get("/api/evaluations", createTableHandler(TABLES.evaluations));
app.get("/api/companies", createTableHandler(TABLES.companies));
app.get("/api/orderers", createTableHandler(TABLES.orderers));
app.get("/api/partners", createTableHandler(TABLES.partners));

// PATCH endpoint for updating workStatus
app.patch("/api/evaluations/:evaluationNo", async (req: Request, res: Response): Promise<void> => {
  console.log(`PATCH /api/evaluations/${req.params.evaluationNo} hit`);

  const { evaluationNo } = req.params;
  const { workStatus } = req.body;

  // Validate workStatus
  const validStatuses = ["not_started", "in_progress", "completed"];
  if (!workStatus || !validStatuses.includes(workStatus)) {
    res.status(400).json({
      error: "Invalid workStatus",
      validValues: validStatuses
    });
    return;
  }

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const qualifiedTableName = `${schemaPrefix}${TABLES.evaluations}`;

    const result = await client.query(
      `UPDATE ${qualifiedTableName}
       SET "workStatus" = $1, "updatedAt" = NOW()
       WHERE "evaluationNo" = $2
       RETURNING *`,
      [workStatus, evaluationNo]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Evaluation not found" });
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(`ERROR in PATCH /api/evaluations/${evaluationNo}:`, error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  } finally {
    client?.release();
  }
});



// Cloud Run は PORT 環境変数を使う
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
