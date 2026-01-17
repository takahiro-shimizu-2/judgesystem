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
    const id = row.id
    const evaluationNo = row.evaluationNo
    const announcement_id = row.announcement_id
    const announcement_ordererId = row.announcement_ordererId
    const announcement_title = row.announcement_title
    const announcement_category = row.announcement_category
    const announcement_organization = row.announcement_organization
    const announcement_workLocation = row.announcement_workLocation
    const announcement_department = row.announcement_department
    const announcement_publishDate = row.announcement_publishDate
    const announcement_explanationStartDate = row.announcement_explanationStartDate
    const announcement_explanationEndDate = row.announcement_explanationEndDate
    const announcement_applicationStartDate = row.announcement_applicationStartDate
    const announcement_applicationEndDate = row.announcement_applicationEndDate
    const announcement_bidStartDate = row.announcement_bidStartDate
    const announcement_bidEndDate = row.announcement_bidEndDate
    const announcement_deadline = row.announcement_deadline
    const announcement_estimatedAmountMin = row.announcement_estimatedAmountMin
    const announcement_estimatedAmountMax = row.announcement_estimatedAmountMax
    const announcement_pdfUrl = row.announcement_pdfUrl
    const company_id = row.company_id
    const company_name = row.company_name
    const company_address = row.company_address
    const company_grade = row.company_grade
    const company_priority = row.company_priority
    const branch_id = row.branch_id
    const branch_name = row.branch_name
    const branch_address = row.branch_address
    const requirements_id = row.requirements_id
    const requirements_category = row.requirements_category
    const requirements_name = row.requirements_name
    const requirements_isMet = row.requirements_isMet
    const requirements_reason = row.requirements_reason
    const requirements_evidence = row.requirements_evidence
    const status = row.status
    const workStatus = row.workStatus
    const currentStep = row.currentStep
    const evaluatedAt = row.evaluatedAt
    
    
    if(!acc[announcement_id]){
      acc[announcement_id] = {
        id: String(announcement_id),
        evaluationNo: String(evaluationNo).padStart(8,'0'),
        company: {
          id: `com-${company_id}`,
          name: company_name,
          address: company_address,
          grade: company_grade,
          priority: company_priority
        },
        branch: {
          id: `brn-${branch_id}`,
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
          publishDate: announcement_publishDate,
          explanationStartDate: announcement_explanationStartDate,
          explanationEndDate: announcement_explanationEndDate,
          applicationStartDate: announcement_applicationStartDate,
          applicationEndDate: announcement_applicationEndDate,
          bidStartDate: announcement_bidStartDate,
          bidEndDate: announcement_bidEndDate,
          deadline: announcement_deadline,
          estimatedAmountMin: announcement_estimatedAmountMin,
          estimatedAmountMax: announcement_estimatedAmountMax,
          pdfUrl: announcement_pdfUrl,
        },
        requirements: [],
        status: status,
        workStatus: workStatus,
        currentStep: currentStep,
        evaluatedAt: evaluatedAt
      };
    }
    
    acc[announcement_id].requirements.push({
      id: `req-${requirements_id}`,
      category: requirements_category,
      name: requirements_name,
      isMet: requirements_isMet,
      reason: requirements_reason,
      evidence: requirements_evidence
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
