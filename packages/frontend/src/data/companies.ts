/**
 * 企業マスターデータ
 */
import type { CompanyPriority } from '../types';
import { getApiUrl } from '../config/api';

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
  fax?: string | null;
  postalCode?: string | null;
  representative: string;
  established: string;
  capital: number;
  employeeCount: number;
  branches: { name: string; address: string }[];
  certifications: string[];
}

export async function fetchCompanyList(): Promise<CompanyWithDetails[]> {
  try {
    const response = await fetch(getApiUrl('/api/companies'));
    if (!response.ok) {
      throw new Error(`Failed to load companies: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Failed to fetch companies:', error);
    return [];
  }
}

export async function createCompanyRecord(
  data: {
    name: string;
    address: string;
    phone: string;
    email: string;
    fax: string;
    postalCode: string;
    representative: string;
    established: string;
    capital: string;
    employeeCount: string;
  }
): Promise<CompanyWithDetails | null> {
  try {
    const response = await fetch(getApiUrl('/api/companies'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to create company: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to create company:', error);
    return null;
  }
}

export async function updateCompanyRecord(
  id: string,
  data: Record<string, unknown>
): Promise<CompanyWithDetails | null> {
  try {
    const response = await fetch(getApiUrl(`/api/companies/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update company: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to update company:', error);
    return null;
  }
}

export async function deleteCompanyRecord(id: string): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl(`/api/companies/${id}`), {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete company: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete company:', error);
    return false;
  }
}

// 後方互換エクスポート
export const mockCompanies: CompanyWithDetails[] = await fetchCompanyList();

// ヘルパー関数
export const findCompanyById = (id: string): CompanyWithDetails | undefined =>
  mockCompanies.find(c => c.id === id);

export const findCompanyByName = (name: string): CompanyWithDetails | undefined =>
  mockCompanies.find(c => c.name === name);

export const getCompanyPriority = (_name: string): CompanyPriority => {
  return 5;
};
