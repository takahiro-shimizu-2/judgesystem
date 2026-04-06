export interface EvaluationCompanyCandidate {
  id: string;
  evaluationNo: string;
  companyId: string;
  companyName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  fax: string | null;
  status: string;
  surveyApproved: boolean;
  createdAt: string;
  updatedAt: string;
}
