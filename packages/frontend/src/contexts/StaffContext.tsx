import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Staff } from '../types';
import { fetchStaffList, createStaffRecord, updateStaffRecord, deleteStaffRecord } from '../data/staff';

interface StaffContextValue {
  staff: Staff[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createStaff: (data: Pick<Staff, 'name' | 'department' | 'email' | 'phone'>) => Promise<Staff | null>;
  updateStaff: (id: string, data: Partial<Pick<Staff, 'name' | 'department' | 'email' | 'phone'>>) => Promise<Staff | null>;
  deleteStaff: (id: string) => Promise<boolean>;
  findById: (id: string) => Staff | undefined;
}

const StaffContext = createContext<StaffContextValue | undefined>(undefined);
const mockContextValue: StaffContextValue = {
  staff: [],
  loading: false,
  error: null,
  refresh: async () => {},
  createStaff: async () => null,
  updateStaff: async () => null,
  deleteStaff: async () => false,
  findById: () => undefined,
};

export function StaffProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStaffList();
      setStaff(data);
    } catch (err) {
      console.error('Failed to load staff list:', err);
      setStaff([]);
      setError(err instanceof Error ? err.message : 'Failed to load staff list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const createStaff = useCallback(
    async (data: Pick<Staff, 'name' | 'department' | 'email' | 'phone'>) => {
      const created = await createStaffRecord(data);
      if (created) {
        setStaff((prev) => [...prev, created]);
        setError(null);
      }
      return created;
    },
    []
  );

  const updateStaff = useCallback(
    async (id: string, data: Partial<Pick<Staff, 'name' | 'department' | 'email' | 'phone'>>) => {
      const updated = await updateStaffRecord(id, data);
      if (updated) {
        setStaff((prev) => prev.map((s) => (s.id === id ? updated : s)));
        setError(null);
      }
      return updated;
    },
    []
  );

  const deleteStaff = useCallback(
    async (id: string) => {
      const deleted = await deleteStaffRecord(id);
      if (deleted) {
        setStaff((prev) => prev.filter((s) => s.id !== id));
        setError(null);
      }
      return deleted;
    },
    []
  );

  const findById = useCallback(
    (id: string) => staff.find((member) => member.id === id),
    [staff]
  );

  const value = useMemo<StaffContextValue>(
    () => ({
      staff,
      loading,
      error,
      refresh: loadStaff,
      createStaff,
      updateStaff,
      deleteStaff,
      findById,
    }),
    [staff, loading, error, loadStaff, createStaff, updateStaff, deleteStaff, findById]
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaffDirectory(): StaffContextValue {
  const context = useContext(StaffContext);
  if (!context) {
    throw new Error('useStaffDirectory must be used within a StaffProvider');
  }
  return context;
}

interface MockStaffProviderProps {
  children: ReactNode;
  value?: Partial<StaffContextValue>;
}

export function MockStaffProvider({ children, value }: MockStaffProviderProps) {
  const mergedValue: StaffContextValue = {
    ...mockContextValue,
    ...value,
    staff: value?.staff ?? mockContextValue.staff,
    loading: value?.loading ?? mockContextValue.loading,
    error: value?.error ?? mockContextValue.error,
    refresh: value?.refresh ?? mockContextValue.refresh,
    createStaff: value?.createStaff ?? mockContextValue.createStaff,
    updateStaff: value?.updateStaff ?? mockContextValue.updateStaff,
    deleteStaff: value?.deleteStaff ?? mockContextValue.deleteStaff,
    findById: value?.findById ?? mockContextValue.findById,
  };

  return <StaffContext.Provider value={mergedValue}>{children}</StaffContext.Provider>;
}
