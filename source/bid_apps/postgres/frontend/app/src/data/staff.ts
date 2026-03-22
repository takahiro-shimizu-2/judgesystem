/**
 * 担当者マスターデータ
 * サーバーの /api/contacts を単一ソースとして利用
 */
import type { Staff } from '../types';
import { getApiUrl } from '../config/api';

const fetchStaffFromApi = async (): Promise<Staff[]> => {
  try {
    const response = await fetch(getApiUrl('/api/contacts'));
    if (!response.ok) {
      throw new Error(`Failed to load contacts: ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Failed to fetch contacts:', error);
    return [];
  }
};

const staffStore: Staff[] = await fetchStaffFromApi();

export const mockStaff: Staff[] = staffStore;

export async function refreshStaff(): Promise<Staff[]> {
  const latest = await fetchStaffFromApi();
  staffStore.splice(0, staffStore.length, ...latest);
  return staffStore;
}

export async function createStaff(data: Pick<Staff, 'name' | 'department' | 'email' | 'phone'>): Promise<Staff | null> {
  try {
    const response = await fetch(getApiUrl('/api/contacts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to create contact: ${response.status}`);
    }
    const created: Staff = await response.json();
    staffStore.push(created);
    return created;
  } catch (error) {
    console.error('Failed to create contact:', error);
    return null;
  }
}

// 担当者をIDで検索
export function findStaffById(id: string): Staff | undefined {
  return staffStore.find((s) => s.id === id);
}

// 担当者を名前で検索
export function findStaffByName(name: string): Staff | undefined {
  return staffStore.find((s) => s.name === name);
}

// 部署で絞り込み
export function getStaffByDepartment(department: string): Staff[] {
  return staffStore.filter((s) => s.department === department);
}

// 全部署リストを取得
export function getAllDepartments(): string[] {
  return [...new Set(staffStore.map((s) => s.department))];
}
