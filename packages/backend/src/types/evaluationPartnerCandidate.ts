export interface EvaluationPartnerCandidate {
  id: string;
  evaluationNo: string;
  partnerCompanyId: string | null;
  partnerOfficeId: string | null;
  partnerName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  fax: string | null;
  status: string;
  surveyApproved: boolean;
  createdAt: string;
  updatedAt: string;
}
