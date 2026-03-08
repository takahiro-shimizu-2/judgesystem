/**
 * 企業マスターデータ
 * 全ての企業データの単一真実源（Single Source of Truth）
 * ※このデータはevaluations.tsとannouncements.tsで参照されます
 */
import type { CompanyPriority } from '../types';

// 企業詳細情報（内部型）
interface CompanyWithDetails {
  id: string;
  no: number;
  name: string;
  address: string;
  grade: string;
  priority: CompanyPriority;
  phone: string;
  email: string;
  representative: string;
  established: string;
  capital: number;
  employeeCount: number;
  branches: { name: string; address: string }[];
  certifications: string[];
}

const generateCompanies = async (): Promise<CompanyWithDetails[]> => {
  const res = await fetch("/api/companies");
  const data = await res.json();
  //console.log("API response:", data);
  return data;
}


// エクスポート
//export const mockCompanies: CompanyWithDetails[] = generateCompanies();
export const mockCompanies: CompanyWithDetails[] = await generateCompanies();


// ヘルパー関数
export const findCompanyById = (id: string): CompanyWithDetails | undefined =>
  mockCompanies.find(c => c.id === id);

export const findCompanyByName = (name: string): CompanyWithDetails | undefined =>
  mockCompanies.find(c => c.name === name);

//export const getCompanyPriority = (name: string): CompanyPriority => {
//  const company = companyList.find(c => c.name === name);
//  return company?.priority ?? 5;
//};
export const getCompanyPriority = (_name: string): CompanyPriority => {
  //const company = companyList.find(c => c.name === name);
  //return company?.priority ?? 5;
  return 5;
};

