/**
 * 担当者マスターデータ
 */
import type { Staff } from '../types';

export const mockStaff: Staff[] = [
  {
    id: '1',
    no: 1,
    name: '田中太郎',
    department: '営業部',
    email: 'tanaka@example.com',
    phone: '03-1234-5678',
  },
  {
    id: '2',
    no: 2,
    name: '山田花子',
    department: '営業部',
    email: 'yamada@example.com',
    phone: '03-2345-6789',
  },
  {
    id: '3',
    no: 3,
    name: '佐藤次郎',
    department: '営業部',
    email: 'sato@example.com',
    phone: '03-3456-7890',
  },
  {
    id: '4',
    no: 4,
    name: '鈴木三郎',
    department: '技術部',
    email: 'suzuki@example.com',
    phone: '03-4567-8901',
  },
  {
    id: '5',
    no: 5,
    name: '高橋四郎',
    department: '技術部',
    email: 'takahashi@example.com',
    phone: '03-5678-9012',
  },
  {
    id: '6',
    no: 6,
    name: '伊藤五郎',
    department: '管理部',
    email: 'ito@example.com',
    phone: '03-6789-0123',
  },
  {
    id: '7',
    no: 7,
    name: '渡辺美咲',
    department: '営業部',
    email: 'watanabe@example.com',
    phone: '03-7890-1234',
  },
  {
    id: '8',
    no: 8,
    name: '中村健一',
    department: '技術部',
    email: 'nakamura@example.com',
    phone: '03-8901-2345',
  },
];

// 担当者をIDで検索
export function findStaffById(id: string): Staff | undefined {
  return mockStaff.find((s) => s.id === id);
}

// 担当者を名前で検索
export function findStaffByName(name: string): Staff | undefined {
  return mockStaff.find((s) => s.name === name);
}

// 部署で絞り込み
export function getStaffByDepartment(department: string): Staff[] {
  return mockStaff.filter((s) => s.department === department);
}

// 全部署リストを取得
export function getAllDepartments(): string[] {
  return [...new Set(mockStaff.map((s) => s.department))];
}
