import express from "express";
import { BigQuery } from "@google-cloud/bigquery";
import cors from "cors";

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
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors());


const bigquery = new BigQuery();

// とりあえずルートパス
app.get("/", (req, res) => {
  res.send("Backend API is running");
});



app.get("/api/announcements", async (req, res) => {
  console.log("GET /api/announcements hit");
  // クエリ文字列から limit を取得
  const limit = Number(req.query.limit) || 10;

  // SQL インジェクション対策：数値以外は弾く
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    return res.status(400).json({ error: "Invalid limit" });
  }
  
  // 外側の `` は javascript のテンプレート文字列。${limit} で limit を参照する。
  const prefix = "PROJECT_ID.DATASET_NAME."
  const query = `select * from ${prefix}backend_announcements`;

  try{
    const [rows] = await bigquery.query({ query });
    res.json(rows);
  } catch(err){
    console.error("ERROR in /api/announcements:", err);
    res.status(500).json({ error: "Internal Server Error" });
    //res.status(500).json({ error: "Internal Server Error", detail: err.message, stack: err.stack });
  }
});




app.get("/api/evaluations", async (req, res) => {
  console.log("GET /api/evaluations hit");
  // クエリ文字列から limit を取得
  const limit = Number(req.query.limit) || 10;

  // SQL インジェクション対策：数値以外は弾く
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    return res.status(400).json({ error: "Invalid limit" });
  }
  
  // 外側の `` は javascript のテンプレート文字列。${limit} で limit を参照する。
  const prefix = "PROJECT_ID.DATASET_NAME."
  const query = `select * from ${prefix}backend_evaluations`;

  try{
    const [rows] = await bigquery.query({ query });
    res.json(rows);
  } catch(err){
    console.error("ERROR in /api/evaluations:", err);
    res.status(500).json({ error: "Internal Server Error" });
    //res.status(500).json({ error: "Internal Server Error", detail: err.message, stack: err.stack });
  }
});



app.get("/api/companies", async (req, res) => {
  console.log("GET /api/companies hit");
  // クエリ文字列から limit を取得
  const limit = Number(req.query.limit) || 10;

  // SQL インジェクション対策：数値以外は弾く
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    return res.status(400).json({ error: "Invalid limit" });
  }
  
  // 外側の `` は javascript のテンプレート文字列。${limit} で limit を参照する。
  const prefix = "PROJECT_ID.DATASET_NAME."
  const query = `select * from ${prefix}backend_companies`;
  
  try{
    const [rows] = await bigquery.query({ query });
    res.json(rows);
  } catch(err){
    console.error("ERROR in /api/companies:", err);
    res.status(500).json({ error: "Internal Server Error" });
    //res.status(500).json({ error: "Internal Server Error", detail: err.message, stack: err.stack });
  }
});



app.get("/api/orderers", async (req, res) => {
  console.log("GET /api/orderers hit");
  // クエリ文字列から limit を取得
  const limit = Number(req.query.limit) || 10;

  // SQL インジェクション対策：数値以外は弾く
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    return res.status(400).json({ error: "Invalid limit" });
  }
  
  // 外側の `` は javascript のテンプレート文字列。${limit} で limit を参照する。
  const prefix = "PROJECT_ID.DATASET_NAME."
  const query = `select * from ${prefix}backend_orderers`;
  
  try{
    const [rows] = await bigquery.query({ query });
    res.json(rows);
  } catch(err){
    console.error("ERROR in /api/orderers:", err);
    res.status(500).json({ error: "Internal Server Error" });
    //res.status(500).json({ error: "Internal Server Error", detail: err.message, stack: err.stack });
  }
});



app.get("/api/partners", async (req, res) => {
  console.log("GET /api/partners hit");
  // クエリ文字列から limit を取得
  const limit = Number(req.query.limit) || 10;

  // SQL インジェクション対策：数値以外は弾く
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    return res.status(400).json({ error: "Invalid limit" });
  }
  
  // 外側の `` は javascript のテンプレート文字列。${limit} で limit を参照する。
  const prefix = "PROJECT_ID.DATASET_NAME."
  const query = `select * from ${prefix}backend_partners`;

  try{
    const [rows] = await bigquery.query({ query });
    res.json(rows);
  } catch(err){
    console.error("ERROR in /api/partners:", err);
    res.status(500).json({ error: "Internal Server Error" });
    //res.status(500).json({ error: "Internal Server Error", detail: err.message, stack: err.stack });
  }
});



// Cloud Run は PORT 環境変数を使う
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
