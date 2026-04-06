import { useState, useCallback } from 'react';
import { getApiUrl } from '../config/api';

export interface BidRequirementSearchResult {
  requirementNo: number;
  announcementNo: number;
  documentId: string;
  requirementType: string;
  requirementText: string;
  announcementTitle: string;
}

interface SearchState {
  data: BidRequirementSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  query: string;
}

export function useBidRequirementSearch() {
  const [state, setState] = useState<SearchState>({
    data: [],
    total: 0,
    page: 0,
    pageSize: 25,
    loading: false,
    error: null,
    query: '',
  });

  const search = useCallback(async (query: string, page = 0, pageSize = 25) => {
    if (!query.trim()) {
      setState(prev => ({ ...prev, data: [], total: 0, page: 0, query: '', error: null }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null, query }));

    try {
      const params = new URLSearchParams({
        q: query,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(getApiUrl(`/api/bid-requirements/search?${params}`));
      if (!res.ok) {
        throw new Error(`Search failed: ${res.status}`);
      }
      const result = await res.json();
      setState(prev => ({
        ...prev,
        data: result.data,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        loading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Search failed',
      }));
    }
  }, []);

  return { ...state, search };
}
