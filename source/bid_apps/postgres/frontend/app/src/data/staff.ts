import type { Staff } from '../types';
import { getApiUrl } from '../config/api';

export async function fetchStaffList(): Promise<Staff[]> {
  const response = await fetch(getApiUrl('/api/contacts'));
  if (!response.ok) {
    throw new Error(`Failed to load contacts: ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createStaffRecord(
  data: Pick<Staff, 'name' | 'department' | 'email' | 'phone'>
): Promise<Staff | null> {
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
    return created;
  } catch (error) {
    console.error('Failed to create contact:', error);
    return null;
  }
}
