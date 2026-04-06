/**
 * 協力会社マスターデータ（企業情報を統合）
 */
import type { CompanyListItem } from '../types';
import { getApiUrl } from '../config/api';

export interface CompanyListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  prefectures?: string[];
  categories?: string[];
  ratings?: number[];
  hasSurvey?: string;
  hasPrimeQualification?: string;
  sort?: string;
  order?: string;
}

export interface CompanyListRow {
  id: string;
  no: number;
  name: string;
  address: string;
  phone: string;
  surveyCount: number | null;
  rating: number | null;
  resultCount: number | null;
  hasPrimeQualification: boolean;
  categories: { group: string | null; name: string }[];
}

export interface PaginatedCompanyResponse {
  data: CompanyListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchCompanyMasterList(
  params?: CompanyListParams,
  signal?: AbortSignal,
): Promise<PaginatedCompanyResponse> {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set('page', String(params.page));
  if (params?.pageSize != null) sp.set('pageSize', String(params.pageSize));
  if (params?.q) sp.set('q', params.q);
  if (params?.prefectures?.length) sp.set('prefecture', params.prefectures.join(','));
  if (params?.categories?.length) sp.set('category', params.categories.join(','));
  if (params?.ratings?.length) sp.set('ratings', params.ratings.join(','));
  if (params?.hasSurvey) sp.set('hasSurvey', params.hasSurvey);
  if (params?.hasPrimeQualification) sp.set('hasPrimeQualification', params.hasPrimeQualification);
  if (params?.sort) sp.set('sort', params.sort);
  if (params?.order) sp.set('order', params.order);

  const qs = sp.toString();
  const url = getApiUrl(`/api/companies${qs ? `?${qs}` : ''}`);
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load companies: ${response.status}`);
  }
  return await response.json();
}

export async function createCompanyRecord(
  data: {
    name: string;
    postalCode: string;
    address: string;
    phone: string;
    fax: string;
    email: string;
    url: string;
    representative: string;
    established: string;
    capital: string;
    employeeCount: string;
    categories: { group: string | null; name: string }[];
    branches: { name: string; address: string }[];
  }
): Promise<CompanyListItem | null> {
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

/** updateCompanyRecord に渡せるフィールド（PATCH 用部分更新） */
export interface CompanyUpdateData {
  name?: string;
  postalCode?: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
  url?: string;
  representative?: string;
  established?: string;
  capital?: string;
  employeeCount?: string;
  categories?: string[] | { group: string | null; name: string }[];
  branches?: { name: string; address: string }[];
  surveyCount?: string;
  resultCount?: string;
  rating?: number;
}

export async function updateCompanyRecord(
  id: string,
  data: CompanyUpdateData
): Promise<CompanyListItem | null> {
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
