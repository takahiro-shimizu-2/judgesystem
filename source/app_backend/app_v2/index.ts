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
    pdfUrl AS pdfUrl
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
`;
  
  try{
    const [rows] = await bigquery.query({ query });

    const transformed = rows.reduce((acc, row) => {
      const id = row.id
      const no = row.no
      const name = row.name
      const category = row.category
      const address = row.address
      const phone = row.phone
      const fax = row.fax
      const email = row.email
      const departments = row.departments
      const announcementCount = row.announcementCount
      const awardCount = row.awardCount
      const averageAmount = row.averageAmount
      const lastAnnouncementDate = row.lastAnnouncementDate
      
      if(!acc[id]){
        acc[id] = {
          id: `ord-${id}`,
          no: no,
          name: name,
          category: category,
          address: address,
          phone: phone,
          fax: fax,
          email: email,
          
          departments: [],
          
          announcementCount: announcementCount,
          awardCount: awardCount,
          averageAmount: averageAmount,
          lastAnnouncementDate: lastAnnouncementDate
        };
      }
      
      acc[id].departments.push(departments);
      
      return acc;
    }, {});

    res.json(Object.values(transformed));
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
select 
1 as id,
1 as \`no\`,
'dummy' as name,

'dummy' as postalCode,
'dummy' as address,
'dummy' as phone,
'dummy' as fax,
'dummy' as email,
'https://example.com/' as url,
10 as surveyCount,
10 as rating,
10 as resultCount,
'dummy' as categories, 

1 as pastProjects_announcementId,
'dummy' as pastProjects_announcementTitle,
'dummy' as pastProjects_ordererName,
'unavailable' as pastProjects_status,
'dummy' as pastProjects_date,

'dummy' as representative, 
'dummy' as established, 
1 as capital, 
1 as employeeCount, 
'dummy' as branches_name,
'dummy' as branches_address,

'土木一式' as qualifications_qualificationitem_category, 
'A' as qualifications_qualificationitem_grade, 
'dummy' as qualifications_qualificationitem_validUntil,
'dummy' as qualifications_OrdererQualification_ordererName,
'dummy' as qualifications_OrdererQualification_items_category,
'A' as qualifications_OrdererQualification_items_grade,
'dummy' as qualifications_OrdererQualification_items_validUntil
`;



  try{
    const [rows] = await bigquery.query({ query });

    const transformed = rows.reduce((acc, row) => {

      const id = row.id
      const no = row.no
      const name = row.name

      const postalCode = row.postalCode
      const address = row.address
      const phone = row.phone
      const fax = row.fax
      const email = row.email
      const url = row.url

      const surveyCount = row.surveyCount
      const rating = row.rating
      const resultCount = row.resultCount
      const categories = row.categories

      const pastProjects_announcementId = row.pastProjects_announcementId
      const pastProjects_announcementTitle = row.pastProjects_announcementTitle
      const pastProjects_ordererName = row.pastProjects_ordererName
      const pastProjects_status = row.pastProjects_status
      const pastProjects_date = row.pastProjects_date

      const representative = row.representative
      const established = row.established
      const capital = row.capital
      const employeeCount = row.employeeCount
      
      const branches_name = row.branches_name
      const branches_address = row.branches_address

      const qualifications_qualificationitem_category = row.qualifications_qualificationitem_category
      const qualifications_qualificationitem_grade = row.qualifications_qualificationitem_grade
      const qualifications_qualificationitem_validUntil = row.qualifications_qualificationitem_validUntil

      const qualifications_OrdererQualification_ordererName = row.qualifications_OrdererQualification_ordererName
      const qualifications_OrdererQualification_items_category = row.qualifications_OrdererQualification_items_category
      const qualifications_OrdererQualification_items_grade = row.qualifications_OrdererQualification_items_grade
      const qualifications_OrdererQualification_items_validUntil = row.qualifications_OrdererQualification_items_validUntil


      if(!acc[id]){
        acc[id] = {
          id: `ptn-${id}`,
          no: no,
          name: name,

          postalCode: postalCode,
          address: address,
          phone: phone,
          email: email,
          fax: fax,
          url: url,
          
          surveyCount: surveyCount,
          rating: rating,
          resultCount: resultCount,
          
          representative: representative,
          established: established,
          capital: capital,
          employeeCount: employeeCount,
          
          categories: [],
          pastProjects: [],
          branches: [],
          qualifications: {
            "unified": [],
            "orderers": []
          }
        };
      }
      
      acc[id].categories.push(categories);
      acc[id].pastProjects.push({
        announcementId: pastProjects_announcementId,
        announcementTitle: pastProjects_announcementTitle,
        ordererName: pastProjects_ordererName,
        status: pastProjects_status,
        date: pastProjects_date
      });
      acc[id].branches.push({
        name: branches_name,
        address: branches_address
      });
      acc[id].qualifications.unified.push({
        category: qualifications_qualificationitem_category,
        grade: qualifications_qualificationitem_grade,
        validUntil: qualifications_qualificationitem_validUntil
      })
      
      
      const exists = acc[id].qualifications.orderers.some( (o) => o.ordererName === qualifications_OrdererQualification_ordererName);
      if(!exists){
        acc[id].qualifications.orderers.push({
          ordererName: qualifications_OrdererQualification_ordererName,
          items: []
        })
      }
      
      const orderer = acc[id].qualifications.orderers.find(o => o.ordererName === qualifications_OrdererQualification_ordererName);
      
      orderer.items.push({
        category: qualifications_qualificationitem_category,
        grade: qualifications_qualificationitem_grade,
        validUntil: qualifications_qualificationitem_validUntil
      })

      return acc;
    }, {});

    res.json(Object.values(transformed));
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
