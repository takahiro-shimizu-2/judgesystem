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

export async function updateStaffRecord(
  id: string,
  data: Partial<Pick<Staff, 'name' | 'department' | 'email' | 'phone'>>
): Promise<Staff | null> {
  try {
    const response = await fetch(getApiUrl(`/api/contacts/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update contact: ${response.status}`);
    }
    const updated: Staff = await response.json();
    return updated;
  } catch (error) {
    console.error('Failed to update contact:', error);
    return null;
  }
}

export async function deleteStaffRecord(id: string): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl(`/api/contacts/${id}`), {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete contact: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete contact:', error);
    return false;
  }
}
