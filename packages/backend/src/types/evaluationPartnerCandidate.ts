export interface EvaluationPartnerCandidate {
  id: string;
  evaluationNo: string;
  partnerId: string;
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
