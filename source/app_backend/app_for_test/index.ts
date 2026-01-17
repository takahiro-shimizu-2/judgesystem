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



app.get("/api/evaluations", async (req, res) => {
  // クエリ文字列から limit を取得
  const limit = Number(req.query.limit) || 10;

  // SQL インジェクション対策：数値以外は弾く
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    return res.status(400).json({ error: "Invalid limit" });
  }
  
  // 外側の `` は javascript のテンプレート文字列。${limit} で limit を参照する。
  const prefix = "PROJECT_ID.DATASET_NAME."
  const query = `
select 
1 as id,
1 as evaluationNo,
1 as announcement_id,
1 as announcement_ordererId,
'dummy' as announcement_title,
'土木工事' as announcement_category,
'dummy' as announcement_organization,
'dummy' as announcement_workLocation,
'dummy' as announcement_department,
'dummy' as announcement_publishDate,
'dummy' as announcement_explanationStartDate,
'dummy' as announcement_explanationEndDate,
'dummy' as announcement_applicationStartDate,
'dummy' as announcement_applicationEndDate,
'dummy' as announcement_bidStartDate,
'dummy' as announcement_bidEndDate,
'dummy' as announcement_deadline,
10000 as announcement_estimatedAmountMin,
20000 as announcement_estimatedAmountMax,
'https://example.com/' as announcement_pdfUrl,
1 as company_id,
'dummy' as company_name,
'dummy' as company_address,
'A' as company_grade,
1 as company_priority,
1 as branch_id,
'dummy' as branch_name,
'dummy' as branch_address,
1 as requirements_id,
'dummy' as requirements_category,
'dummy' as requirements_name,
'all_met' as requirements_isMet,
'dummy' as requirements_reason,
'dummy' as requirements_evidence,
'all_met' as status,
'not_started' as workStatus,
'judgement' as currentStep,
'dummy' as evaluatedAt
  `;
  
  
  const [rows] = await bigquery.query({ query });

  // frontend用に整形
  const transformed = rows.reduce((acc, row) => {
    id: row.id,
    evaluationNo: row.evaluationNo,
    announcement_id: row.announcement_id,
    announcement_ordererId: row.announcement_ordererId,
    announcement_title: row.announcement_title,
    announcement_category: row.announcement_category,
    announcement_organization: row.announcement_organization,
    announcement_workLocation: row.announcement_workLocation,
    announcement_department: row.announcement_department,
    announcement_publishDate: row.announcement_publishDate,
    announcement_explanationStartDate: row.announcement_explanationStartDate,
    announcement_explanationEndDate: row.announcement_explanationEndDate,
    announcement_applicationStartDate: row.announcement_applicationStartDate,
    announcement_applicationEndDate: row.announcement_applicationEndDate,
    announcement_bidStartDate: row.announcement_bidStartDate,
    announcement_bidEndDate: row.announcement_bidEndDate,
    announcement_deadline: row.announcement_deadline,
    announcement_estimatedAmountMin: row.announcement_estimatedAmountMin,
    announcement_estimatedAmountMax: row.announcement_estimatedAmountMax,
    announcement_pdfUrl: row.announcement_pdfUrl,
    company_id: row.company_id,
    company_name: row.company_name,
    company_address: row.company_address,
    company_grade: row.company_grade,
    company_priority: row.company_priority,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    branch_address: row.branch_address,
    requirements_id: row.requirements_id,
    requirements_category: row.requirements_category,
    requirements_name: row.requirements_name,
    requirements_isMet: row.requirements_isMet,
    requirements_reason: row.requirements_reason,
    requirements_evidence: row.requirements_evidence,
    status: row.status,
    workStatus: row.workStatus,
    currentStep: row.currentStep,
    evaluatedAt: row.evaluatedAt,
    
    
    if(!acc[announcement_no]){
      acc[announcement_no] = {
        id: String(announcement_no),
        evaluationNo: String(announcement_no).padStart(8,'0'),
        evaluatedAt: updatedDate ? updatedDate : "1900-01-01",
        status: final_status ? "all_met" : "unmet",
        company: {
          id: `com-${company_id}`,
          name: company_name,
          address: company_address,
          grade: company_grade,
          priority: company_priority
        },
        branch: {
          id: `brn-${office_no}`,
          name: branch_name,
          address: branch_address
        },
        announcement: {
          id: `ann-${announcement_id}`,
          title: announcement_title,
          category: announcement_category,
          organization: announcement_organization,
          workLocation: announcement_workLocation,
          department: announcement_department,
          publishDate: row.announcement_publishDate,
          explanationStartDate: row.announcement_explanationStartDate,
          explanationEndDate: row.announcement_explanationEndDate,
          applicationStartDate: row.announcement_applicationStartDate,
          applicationEndDate: row.announcement_applicationEndDate,
          bidStartDate: row.announcement_bidStartDate,
          bidEndDate: row.announcement_bidEndDate,
          deadline: row.announcement_deadline,
          estimatedAmountMin: row.announcement_estimatedAmountMin,
          estimatedAmountMax: row.announcement_estimatedAmountMax,
          pdfUrl: row.announcement_pdfUrl,
        },
        requirements: [],
        status: row.status,
        workStatus: row.workStatus,
        currentStep: row.currentStep,
        evaluatedAt: row.evaluatedAt
      };
    }
    
    acc[announcement_no].requirements.push({
      id: `req-${row.requirement_id}`,
      category: row.requirement_category,
      name: row.requirement_name,
      isMet: row.requirements_isMet,
      reason: row.requirements_reason,
      evidence: row.requirements_evidence
    });
    
    return acc;
  }, {});

  // リストにして返す
  res.json(Object.values(transformed));
});

// Cloud Run は PORT 環境変数を使う
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
