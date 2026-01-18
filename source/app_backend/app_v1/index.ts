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
// → CORS の “simple request” の条件から外れる
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

app.get("/api/result", async (req, res) => {
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
t1.announcement_no,
t1.company_no,
t1.office_no,
t1.final_status,
t1.updatedDate,

t2.workName,
t2.topAgencyName,
t2.workPlace,
t2.pdfUrl,
t2.zipcode,
t2.address,
t2.department,
t2.assigneeName,
t2.telephone,
t2.fax,
t2.mail,
t2.publishDate,
t2.docDistStart,
t2.docDistEnd,
t2.submissionStart,
t2.submissionEnd,
t2.bidStartDate,
t2.bidEndDate,

t3.requirement_no,
t3.requirement_type,
t3.requirement_description,
t3.isMet,

t4.company_name,
t4.company_address,

t5.office_name,
t5.office_address

from ${prefix}company_bid_judgement t1
inner join
${prefix}bid_announcements t2
on 
t1.announcement_no = t2.announcement_no
inner join
(
   select announcement_no, office_no, requirement_no, requirement_type, requirement_description, true as isMet from ${prefix}sufficient_requirements
   union all
   select announcement_no, office_no, requirement_no, requirement_type, requirement_description, false as isMet from ${prefix}insufficient_requirements
) t3
on 
t1.announcement_no = t3.announcement_no
and t1.office_no = t3.office_no
inner join
${prefix}company_master t4
on
t1.company_no = t4.company_no
inner join
${prefix}office_master t5
on
t1.office_no = t5.office_no
limit ${limit}
  `;
  
  
  const [rows] = await bigquery.query({ query });

  // frontend用に整形
  const transformed = rows.reduce((acc, row) => {
  
    const announcement_no = row.announcement_no
    const company_no = row.company_no
    const office_no = row.office_no
    const final_status = row.final_status
    const updatedDate = row.updatedDate
    
    const workName = row.workName
    //const userAnnNo = row.userAnnNo
    //const topAgencyNo = row.topAgencyNo
    const topAgencyName = row.topAgencyName
    //const subAgencyNo = row.subAgencyNo
    //const subAgencyName = row.subAgencyName
    const workPlace = row.workPlace
    const pdfUrl = row.pdfUrl
    const zipcode = row.zipcode
    const address = row.address
    const department = row.department
    const assigneeName = row.assigneeName
    const telephone = row.telephone
    const fax = row.fax
    const mail = row.mail
    const publishDate = row.publishDate
    const docDistStart = row.docDistStart
    const docDistEnd = row.docDistEnd
    const submissionStart = row.submissionStart
    const submissionEnd = row.submissionEnd
    const bidStartDate = row.bidStartDate
    const bidEndDate = row.bidEndDate
    //const doneOCR = row.doneOCR
    //const remarks = row.remarks
    //const createdDate = row.createdDate
    //const updatedDate = row.updaedDate
    
    const requirement_no = row.requirement_no
    const requirement_type = row.requirement_type
    const requirement_description = row.requirement_description
    const isMet = row.isMet
    
    const company_name = row.company_name
    const company_address = row.company_address
    
    const office_name = row.office_name
    const office_address = row.office_address
    
    if(!acc[announcement_no]){
      acc[announcement_no] = {
        id: String(announcement_no),
        evaluationNo: String(announcement_no).padStart(8,'0'),
        evaluatedAt: updatedDate ? updatedDate : "1900-01-01",
        status: final_status ? "all_met" : "unmet",
        company: {
          id: `comp-${company_no}`,
          name: company_name,
          address: company_address,
          grade: 'A',
          priority: 5
        },
        branch: {
          id: `branch-${office_no}`,
          name: office_name,
          address: office_address
        },
        announcement: {
          id: `ann-${announcement_no}`,
          title: workName,
          category: "工事",
          organization: topAgencyName,
          workLocation: workPlace,
          department: {
              postalCode: zipcode,
              address: address,
              name: department,
              contactPerson: assigneeName,
              phone: telephone,
              fax: fax,
              email: mail
          },
          publishDate: publishDate ? publishDate : "1900-01-01",
          explanationStartDate: docDistStart ? docDistStart : "1900-01-01",
          explanationEndDate: docDistEnd ? docDistEnd : "1900-01-01",
          applicationStartDate: submissionStart ? submissionStart : "1900-01-01",
          applicationEndDate: submissionEnd ? submissionEnd : "1900-01-01",
          bidStartDate: bidStartDate ? bidStartDate : "1900-01-01",
          bidEndDate: bidEndDate ? bidEndDate : "1900-01-01",
          deadline: bidEndDate ? bidEndDate : "1900-01-01",
          estimatedAmountMin: 180000000,
          estimatedAmountMax: 580000000,
          pdfUrl: `PDFURL/${announcement_no}.pdf`
        },
        requirements: []
      };
    }
    
    acc[announcement_no].requirements.push({
      id: `req-${requirement_no}`,
      category: requirement_type,
      name: requirement_description,
      isMet: isMet,
      reason: "dummy",
      evidence: "dummy"
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
