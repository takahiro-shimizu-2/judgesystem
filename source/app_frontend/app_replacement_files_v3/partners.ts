/**
 * 協力会社マスターデータ（企業情報を統合）
 * 全ての会社データの単一真実源（Single Source of Truth）
 */
import type { 
  PartnerListItem
  //PastProject, 
  //CompanyBranch, 
  //Qualifications, 
  //UnifiedQualificationItem, 
  //OrdererQualificationItem, 
  //OrdererQualification 
} from '../types';
import { mockBidEvaluations } from './evaluations';
import {
  unifiedMainCategories,
  unifiedSubCategories,
  ordererCategories,
  ordererRegions,
  ordererOrganizations,
  grades as qualificationGrades,
  type UnifiedMainCategory,
} from '../constants/qualifications';


const generatePartners = async (): Promise<PartnerListItem[]> => {
  const res = await fetch("/api/partners");
  const data = await res.json();
  //console.log("API response:", data);
  return data;
}

// エクスポート
// export const mockPartners: PartnerListItem[] = generatePartners();
export const mockPartners: PartnerListItem[] = await generatePartners();

// ヘルパー関数
export const findPartnerById = (id: string): PartnerListItem | undefined =>
  mockPartners.find(p => p.id === id);

export const findPartnerByName = (name: string): PartnerListItem | undefined =>
  mockPartners.find(p => p.name === name);
