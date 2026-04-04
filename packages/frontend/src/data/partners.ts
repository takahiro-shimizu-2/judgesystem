/**
 * 協力会社マスターデータ（企業情報を統合）
 */
import type { PartnerListItem } from '../types';
import { getApiUrl } from '../config/api';

export interface PartnerListParams {
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

export interface PartnerListRow {
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

export interface PaginatedPartnerResponse {
  data: PartnerListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchPartnerList(
  params?: PartnerListParams,
  signal?: AbortSignal,
): Promise<PaginatedPartnerResponse> {
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
  const url = getApiUrl(`/api/partners${qs ? `?${qs}` : ''}`);
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load partners: ${response.status}`);
  }
  return await response.json();
}

export async function createPartnerRecord(
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
): Promise<PartnerListItem | null> {
  try {
    const response = await fetch(getApiUrl('/api/partners'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to create partner: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to create partner:', error);
    return null;
  }
}

/** updatePartnerRecord に渡せるフィールド（PATCH 用部分更新） */
export interface PartnerUpdateData {
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

export async function updatePartnerRecord(
  id: string,
  data: PartnerUpdateData
): Promise<PartnerListItem | null> {
  try {
    const response = await fetch(getApiUrl(`/api/partners/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update partner: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to update partner:', error);
    return null;
  }
}

export async function deletePartnerRecord(id: string): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl(`/api/partners/${id}`), {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete partner: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete partner:', error);
    return false;
  }
}


