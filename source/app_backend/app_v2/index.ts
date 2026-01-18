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
  `;


  
  try{
    const [rows] = await bigquery.query({ query });

    const transformed = rows.reduce((acc, row) => {
      const id = row.id
      const no = row.no
      const ordererId = row.ordererId
      const title = row.title
      const category = row.category
      const organization = row.organization
      const workLocation = row.workLocation

      const department_postalcode = row.department_postalcode
      const department_address = row.department_address
      const department_name = row.department_name
      const department_contactPerson = row.department_contactPerson
      const department_phone = row.department_phone
      const department_fax = row.department_fax
      const department_email = row.department_email

      const publishDate = row.publishDate
      const explanationStartDate = row.explanationStartDate
      const explanationEndDate = row.explanationEndDate
      const applicationStartDate = row.applicationStartDate
      const applicationEndDate = row.applicationEndDate
      const bidStartDate = row.bidStartDate
      const bidEndDate = row.bidEndDate
      const deadline = row.deadline

      const estimatedAmountMin = row.estimatedAmountMin
      const estimatedAmountMax = row.estimatedAmountMax

      const status = row.status

      const actualAmount = row.actualAmount
      const winningCompanyId = row.winningCompanyId
      const winningCompanyName = row.winningCompanyName
      
      if(!acc[id]){
        acc[id] = {
          id: `ann-${id}`,
          no: no,
          ordererId: ordererId,
          title,
          category: category,
          organization: organization,
          workLocation: workLocation,
          department: {
            postalCode: department_postalcode,
            address: department_address,
            name: department_name,
            contactPerson: department_contactPerson,
            phone: department_phone,
            fax: department_fax, 
            email: department_email
          },
          publishDate: publishDate,
          explanationStartDate: explanationStartDate,
          explanationEndDate: explanationEndDate,
          applicationStartDate: applicationStartDate,
          applicationEndDate: applicationEndDate,
          bidStartDate: bidStartDate,
          bidEndDate: bidEndDate,
          deadline: deadline,
          estimatedAmountMin: estimatedAmountMin,
          estimatedAmountMax: estimatedAmountMax,
          status: status,
          actualAmount: actualAmount,
          winningCompanyId: winningCompanyId,
          winningCompanyName: winningCompanyName
        };
      }
      
      
      return acc;
    }, {});

    res.json(Object.values(transformed));
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
select 
eval.evaluation_no as id,
eval.evaluation_no as evaluationNo,
eval.announcement_no as announcement_id,
1 as announcement_ordererId,
coalesce(anno.workName, 'dummytitle') as announcement_title,
'dummycat' as announcement_category,
coalesce(anno.topAgencyName, 'dummy_org') as announcement_organization,
coalesce(anno.workPlace, 'workloc') as announcement_workLocation,
coalesce(anno.department, 'department') as announcement_department,
coalesce(anno.publishDate, 'publishDate') as announcement_publishDate,
coalesce(anno.docDistStart, 'expStartDate') as announcement_explanationStartDate,
coalesce(anno.docDistEnd, 'expEndDate') as announcement_explanationEndDate,
coalesce(anno.submissionStart, 'appStartDate') as announcement_applicationStartDate,
coalesce(anno.submissionEnd, 'appEndDate') as announcement_applicationEndDate,
coalesce(anno.bidStartDate, 'dummy') as announcement_bidStartDate,
coalesce(anno.bidEndDate, 'dummy') as announcement_bidEndDate,
coalesce(anno.bidEndDate, 'dummy') as announcement_deadline,
10000 as announcement_estimatedAmountMin,
20000 as announcement_estimatedAmountMax,
coalesce(anno.pdfUrl, 'https://example.com/') as announcement_pdfUrl,

eval.company_no as company_id,
coalesce(comp.company_name, 'dummy') as company_name,
coalesce(comp.company_address, 'dummy') as company_address,
'A' as company_grade,
1 as company_priority,
eval.office_no as branch_id,
coalesce(branch.office_name, 'dummy') as branch_name,
coalesce(branch.office_address, 'dummy') as branch_address,

req2.requirement_no as requirements_id,
coalesce(req2.requirement_type, 'dummy') as requirements_category,
coalesce(req1.requirement_text, 'dummy') as requirements_name,
coalesce(req2.isMet, FALSE) as requirements_isMet,
coalesce(req2.requirement_description, 'dummy') as requirements_reason,
'dummy_evidence' as requirements_evidence,
coalesce(eval.final_status, FALSE) as status,
'not_started' as workStatus,
'judgement' as currentStep,
coalesce(eval.updatedDate, 'dummy') as evaluatedAt

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
   select announcement_no, office_no, requirement_no, requirement_type, requirement_description, true as isMet from ${prefix}sufficient_requirements
   union all
   select announcement_no, office_no, requirement_no, requirement_type, requirement_description, false as isMet from ${prefix}insufficient_requirements
) req2
on 
eval.announcement_no = req2.announcement_no and eval.office_no = req2.office_no
  `;
  
  try{
    const [rows] = await bigquery.query({ query });

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

    res.json(Object.values(transformed));
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
`;
  
  try{
    const [rows] = await bigquery.query({ query });

    const transformed = rows.reduce((acc, row) => {
      const id = row.id
      const no = row.no
      const name = row.name
      const address = row.address
      const grade = row.grade
      const priority = row.priority
      const phone = row.phone
      const email = row.email
      const representative = row.representative
      const established = row.established
      const capital = row.capital
      const employeeCount = row.employeeCount
      const branches_name = row.branches_name
      const branches_address = row.branches_address
      const certifications = row.certifications
      
      if(!acc[id]){
        acc[id] = {
          id: `com-${id}`,
          no: no,
          name: name,
          address: address,
          grade: grade,
          priority: priority,
          phone: phone,
          email: email,
          representative: representative,
          established: established,
          capital: capital,
          branches: [],
          certifications: []
        };
      }
      
      acc[id].branches.push({
        name: branches_name,
        address: branches_address
      });
      acc[id].certifications.push(certifications);
      
      return acc;
    }, {});

    res.json(Object.values(transformed));
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
