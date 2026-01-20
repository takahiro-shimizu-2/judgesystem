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
  const query = `
with base as (
  select
  anno.announcement_no as id,
  1 as \`no\`,
  1 as ordererId,
  coalesce(anno.workName, 'dummytitle') as title,
  'dummy_cat' as category,
  coalesce(anno.topAgencyName, 'dummy') as organization,
  coalesce(anno.workPlace, 'dummy') as workLocation,

  coalesce(anno.zipcode, 'dummy') as department_postalcode,
  coalesce(anno.address, 'dummy') as department_address,
  coalesce(anno.department, 'dummy') as department_name,
  coalesce(anno.assigneeName, 'dummy') as department_contactPerson,
  coalesce(anno.telephone, 'dummy') as department_phone,
  coalesce(anno.fax, 'dummy') as department_fax,
  coalesce(anno.mail, 'dummy') as department_email,

  coalesce(anno.publishDate, 'dummy') as publishDate,
  coalesce(anno.docDistStart, 'dummy') as explanationStartDate,
  coalesce(anno.docDistEnd, 'dummy') as explanationEndDate,
  coalesce(anno.submissionStart, 'dummy') as applicationStartDate,
  coalesce(anno.submissionEnd, 'dummy') as applicationEndDate,
  coalesce(anno.bidStartDate, 'dummy') as bidStartDate,
  coalesce(anno.bidEndDate, 'dummy') as bidEndDate,
  'dummy_deadline' as deadline,

  1 as estimatedAmountMin,
  1000 as estimatedAmountMax,

  'closed' as status,

  10 as actualAmount,
  1 as winningCompanyId,
  'dummy_wincomp' as winningCompanyName
  from ${prefix}bid_announcements anno
) 
select
FORMAT('ann-%d', id) as id,
\`no\`,
ordererId,
title,
category,
organization,
workLocation,
struct(
  department_postalcode as postalCode,
  department_address as address,
  department_name as name,
  department_contactPerson as contactPerson,
  department_phone as phone,
  department_fax as fax,
  department_email as email
) as department,
publishDate,
explanationStartDate,
explanationEndDate,
applicationStartDate,
applicationEndDate,
bidStartDate,
bidEndDate,
deadline,
estimatedAmountMin,
estimatedAmountMax,
status,
actualAmount,
winningCompanyId,
winningCompanyName
from base
  `;


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
  const query = `
WITH base AS (
  SELECT
    eval.evaluation_no,
    eval.announcement_no,
    
    coalesce(anno.workName, 'dummytitle') AS workName,
    coalesce(anno.topAgencyName, 'dummy_org') AS topAgencyName,
    coalesce(anno.workPlace, 'workloc') AS workPlace,
    coalesce(anno.department, 'department') AS department,
    coalesce(anno.publishDate, 'publishDate') AS publishDate,
    coalesce(anno.docDistStart, 'expStartDate') AS docDistStart,
    coalesce(anno.docDistEnd, 'expEndDate') AS docDistEnd,
    coalesce(anno.submissionStart, 'appStartDate') AS submissionStart,
    coalesce(anno.submissionEnd, 'appEndDate') AS submissionEnd,
    coalesce(anno.bidStartDate, 'dummy') AS bidStartDate,
    coalesce(anno.bidEndDate, 'dummy') AS bidEndDate,
    coalesce(anno.pdfUrl, 'https://example.com/') AS pdfUrl,
    
    1 as documents_id,
    'bid_documents' as documents_type,
    '入札関連書' as documents_title,
    'pdf' as documents_fileFormat,
    25 as documents_pageCount,
    'dummy' as documents_extractedAt,
    'https://example.com/docs/ann-1/bid_documents.pdf' as documents_url,
    '入札関連書...' as documents_content,
    
    eval.company_no,
    coalesce(comp.company_name, 'dummy') AS company_name,
    coalesce(comp.company_address, 'dummy') AS company_address,
    eval.office_no,
    branch.office_name,
    branch.office_address,
    req1.requirement_no,
    req1.requirement_text,
    req2.requirement_type,
    req2.requirement_description,
    req2.isMet,
    eval.final_status,
    eval.updatedDate
  from ${prefix}company_bid_judgement eval

  inner join ${prefix}bid_announcements anno
  on eval.announcement_no = anno.announcement_no

  inner join ${prefix}company_master comp
  on eval.company_no = comp.company_no

  inner join ${prefix}office_master branch
  on eval.office_no = branch.office_no

  inner join ${prefix}bid_requirements req1
  on eval.announcement_no = req1.announcement_no

  inner join
  (
     select 
     announcement_no, office_no, requirement_no, requirement_type, requirement_description, true as isMet 
     from ${prefix}sufficient_requirements
     union all
     select 
     announcement_no, office_no, requirement_no, requirement_type, requirement_description, false as isMet 
     from ${prefix}insufficient_requirements
  ) req2
  on 
  req1.requirement_no = req2.requirement_no and eval.office_no = req2.office_no
)
SELECT
  cast(evaluation_no as string) AS id,
  LPAD(CAST(evaluation_no AS STRING), 8, '0') AS evaluationNo,
  struct(
    concat('ann-', announcement_no) AS id,
    concat('ord-', 1) AS ordererId,
    workName AS title,
    'dummycat' AS category,
    topAgencyName AS organization,
    workPlace AS workLocation,
    struct(
      '999-9999' as postalCode,
      '北極' as address,
      department as name,
      'あいうえお' as contactPerson,
      '99-9999-9999' as phone,
      '99-9999-9999' as fax,
      'kikaku@example.go.jp' as email
    ) as department,
    publishDate AS publishDate,
    docDistStart AS explanationStartDate,
    docDistEnd AS explanationEndDate,
    submissionStart AS applicationStartDate,
    submissionEnd AS applicationEndDate,
    bidStartDate AS bidStartDate,
    bidEndDate AS bidEndDate,
    bidEndDate AS deadline,
    10000 AS estimatedAmountMin,
    20000 AS estimatedAmountMax,
    pdfUrl AS pdfUrl,
    struct(
      concat('doc-',documents_id) as id,
      documents_type as type,
      documents_title as title,
      documents_fileFormat as fileFormat,
      documents_pageCount as pageCount,
      documents_extractedAt as extractedAt,
      documents_url as url,
      documents_content as content
    ) as documents
  ) AS announcement,
  struct(
    concat('com-', company_no) AS id,
    company_name as name,
    company_address as address,
    'A' AS grade,
    1 AS priority
  ) AS company,
  struct(
    concat('brn-', office_no) AS id,
    office_name AS name,
    office_address AS address
  ) AS branch,
  array_agg(
    struct(
      concat('req-', requirement_no) AS id,
      requirement_type AS category,
      requirement_text AS name,
      isMet AS isMet,
      requirement_description AS reason,
      'dummy_evidence' AS evidence
    )
  ) AS requirements,
  CASE WHEN coalesce(final_status, FALSE) THEN 'all_met' ELSE 'unmet' END AS status,
  'not_started' AS workStatus,
  'judgement' AS currentStep,
  coalesce(updatedDate, 'dummy') AS evaluatedAt
FROM base
GROUP BY
  evaluation_no,
  announcement_no,
  workName,
  topAgencyName,
  workPlace,
  department,
  publishDate,
  docDistStart,
  docDistEnd,
  submissionStart,
  submissionEnd,
  bidStartDate,
  bidEndDate,
  pdfUrl,
  
  documents_id,
  documents_type,
  documents_title,
  documents_fileFormat,
  documents_pageCount,
  documents_extractedAt,
  documents_url,
  documents_content,
  
  company_no,
  company_name,
  company_address,
  office_no, 
  office_name, 
  office_address, 
  final_status,
  updatedDate
  `;

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
  const query = `
WITH base AS (
  select 
  comp.company_no as id,
  1 as \`no\`,
  coalesce(comp.company_name, 'dummy') as name,
  coalesce(comp.company_address, 'dummy') as address,
  'A' as grade,
  1 as priority,
  coalesce(comp.telephone, 'dummy') as phone,
  'dummy' as email,
  coalesce(comp.name_of_representative, 'dummy') as representative,
  coalesce(comp.establishment_date, 'dummy') as established,
  1 as capital,
  100 as employeeCount,
  coalesce(branch.office_name, 'dummy') as branches_name,
  coalesce(branch.office_address, 'dummy') as branches_address,
  'dummy' as certifications

  from ${prefix}company_master comp
  left outer join ${prefix}office_master branch
  on comp.company_no = branch.company_no
)
select
concat('com-', id) as id,
\`no\`,
name,
address,
grade,
priority,
phone,
email,
representative,
established,
capital,
employeeCount,
array_agg(
  struct(
    branches_name as name,
    branches_address as address
  )
) AS branches,
array_agg(
  struct(
    certifications
  )
) as certifications
from base
group by
id,
\`no\`,
name,
address,
grade,
priority,
phone,
email,
representative,
established,
capital,
employeeCount
`;
  
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
  const query = `
with base as (
  select 
  1 as id,
  1 as \`no\`,
  'dummy' as name,
  'national' as category, 
  'dummy' as address,
  'dummy' as phone,
  'dummy' as fax,
  'dummy' as email,
  'dummy' as departments,
  10 as announcementCount,
  10 as awardCount,
  10 as averageAmount,
  'dummy' as lastAnnouncementDate
)
select
concat('ord-', id) as id,
\`no\`,
name,
category,
address,
phone,
fax,
email,
array_agg(
  struct(
    departments
  )
) as departments,
announcementCount,
awardCount,
averageAmount,
lastAnnouncementDate
from base
group by
id,
\`no\`,
name,
category,
address,
phone,
fax,
email,
announcementCount,
awardCount,
averageAmount,
lastAnnouncementDate
`;
  
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
  const query = `
WITH base AS (
  SELECT 
    1 AS id,
    1 AS \`no\`,
    'dummy' AS name,

    'dummy' AS postalCode,
    'dummy' AS address,
    'dummy' AS phone,
    'dummy' AS fax,
    'dummy' AS email,
    'https://example.com/' AS url,
    10 AS surveyCount,
    10 AS rating,
    10 AS resultCount,
    
    'dummy' AS categories, 

    1 AS pastProjects_evaluationId,
    1 AS pastProjects_announcementId,
    1 AS pastProjects_announcementNo,
    'dummy' AS pastProjects_announcementTitle,
    'dummy' AS pastProjects_branchName,
    'all_met' AS pastProjects_workStatus,
    'unavailable' AS pastProjects_evaluationStatus,
    1 AS pastProjects_priority,
    'open_competitive' AS pastProjects_bidType,
    '土木工事' AS pastProjects_category,
    '北極' AS pastProjects_prefecture,
    'dummy' AS pastProjects_publishDate,
    'dummy' AS pastProjects_deadline,
    'dummy' AS pastProjects_evaluatedAt,
    'dummy' AS pastProjects_organization,

    'dummy' AS representative, 
    'dummy' AS established, 
    1 AS capital, 
    1 AS employeeCount, 
    'dummy' AS branches_name,
    'dummy' AS branches_address,

    '役務の提供等' AS qualifications_unified_mainCategory, 
    '調査・研究' AS qualifications_unified_category, 
    '関東・甲信越' AS qualifications_unified_region, 
    '1200' AS qualifications_unified_value, 
    'C' AS qualifications_unified_grade, 

    '経済産業省' AS qualifications_orderers_ordererName, 
    '大工' AS qualifications_orderers_items_category, 
    '関東・甲信越' AS qualifications_orderers_items_region, 
    '600' AS qualifications_orderers_items_value, 
    'C' AS qualifications_orderers_items_grade
)

-- items を先に作る（集計のネストを避ける）
, orderer_items AS (
  SELECT
    qualifications_orderers_ordererName AS ordererName,
    ARRAY_AGG(
      STRUCT(
        qualifications_orderers_items_category AS category,
        qualifications_orderers_items_region AS region,
        qualifications_orderers_items_value AS value,
        qualifications_orderers_items_grade AS grade
      )
    ) AS items
  FROM base
  GROUP BY qualifications_orderers_ordererName
)

SELECT
  CONCAT('ptn-', id) AS id,
  \`no\`,
  name,
  postalCode,
  address,
  phone,
  fax,
  email,
  url,
  surveyCount,
  rating,
  resultCount,

  -- categories は文字列配列として返す
  ARRAY_AGG(categories) AS categories,

  ARRAY_AGG(
    STRUCT(
      pastProjects_evaluationId AS evaluationId,
      pastProjects_announcementId AS announcementId,
      pastProjects_announcementNo AS announcementNo,
      pastProjects_announcementTitle AS announcementTitle,
      pastProjects_branchName AS branchName,
      pastProjects_workStatus AS workStatus,
      pastProjects_evaluationStatus AS evaluationStatus,
      pastProjects_priority AS priority,
      pastProjects_bidType AS bidType,
      pastProjects_category AS category,
      pastProjects_prefecture AS prefecture,
      pastProjects_publishDate AS publishDate,
      pastProjects_deadline AS deadline,
      pastProjects_evaluatedAt AS evaluatedAt,
      pastProjects_organization AS organization
    )
  ) AS pastProjects,

  representative, 
  established, 
  capital, 
  employeeCount, 

  ARRAY_AGG(
    STRUCT(
      branches_name AS name,
      branches_address AS address
    )
  ) AS branches,

  STRUCT(
    -- unified は 1 要素の配列
    ARRAY_AGG(
      STRUCT(
        qualifications_unified_mainCategory AS mainCategory,
        qualifications_unified_category AS category,
        qualifications_unified_region AS region,
        qualifications_unified_value AS value,
        qualifications_unified_grade AS grade
      )
    ) AS unified,

    -- orderers は別 CTE で items を作ってからまとめる
    (SELECT ARRAY_AGG(STRUCT(ordererName, items)) FROM orderer_items) AS orderers
  ) AS qualifications

FROM base
GROUP BY
  id,
  \`no\`,
  name,
  postalCode,
  address,
  phone,
  fax,
  email,
  url,
  surveyCount,
  rating,
  resultCount,
  representative, 
  established, 
  capital, 
  employeeCount;
`;


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
