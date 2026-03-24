/**
 * 発注者マスターデータ
 */
import type { Orderer } from '../types/orderer';
import { getApiUrl } from '../config/api';

export async function fetchOrdererList(): Promise<Orderer[]> {
  const response = await fetch(getApiUrl('/api/orderers'));
  if (!response.ok) {
    throw new Error(`Failed to load orderers: ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createOrdererRecord(
  data: Pick<Orderer, 'name' | 'category' | 'address' | 'phone' | 'fax' | 'email'>
): Promise<Orderer | null> {
  try {
    const response = await fetch(getApiUrl('/api/orderers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to create orderer: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to create orderer:', error);
    return null;
  }
}

export async function updateOrdererRecord(
  id: string,
  data: Partial<Pick<Orderer, 'name' | 'category' | 'address' | 'phone' | 'fax' | 'email'>>
): Promise<Orderer | null> {
  try {
    const response = await fetch(getApiUrl(`/api/orderers/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update orderer: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to update orderer:', error);
    return null;
  }
}

export async function deleteOrdererRecord(id: string): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl(`/api/orderers/${id}`), {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete orderer: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete orderer:', error);
    return false;
  }
}

// 後方互換: 静的キャッシュ
let _ordererCache: Orderer[] | null = null;

async function ensureCache(): Promise<Orderer[]> {
  if (!_ordererCache) {
    _ordererCache = await fetchOrdererList();
  }
  return _ordererCache;
}

export function invalidateOrdererCache(): void {
  _ordererCache = null;
}

// 後方互換エクスポート（遅延初期化）
export const mockOrderers: Orderer[] = await fetchOrdererList();

export const findOrdererById = (id: string): Orderer | undefined =>
  mockOrderers.find(o => o.id === id);

export const findOrdererByName = (name: string): Orderer | undefined =>
  mockOrderers.find(o => o.name === name);
