/**
 * 発注者マスターデータ
 * 全ての発注者データの単一真実源（Single Source of Truth）
 */
import type { Orderer } from '../types/orderer';

const generateOrderers = async (): Promise<Orderer[]> => {
  const res = await fetch("/api/orderers");
  const data = await res.json();
  return data;
}

// エクスポート
//export const mockOrderers: Orderer[] = generateOrderers();
export const mockOrderers: Orderer[] = await generateOrderers();

// ヘルパー関数
export const findOrdererById = (id: string): Orderer | undefined =>
  mockOrderers.find(o => o.id === id);

export const findOrdererByName = (name: string): Orderer | undefined =>
  mockOrderers.find(o => o.name === name);
