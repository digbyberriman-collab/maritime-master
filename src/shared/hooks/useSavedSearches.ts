import { useState, useEffect } from 'react';

export interface SavedSearch {
  id: string;
  name: string;
  filters: {
    search: string;
    categories: string[];
    statuses: string[];
    vessels: string[];
    ismSections: number[];
    languages: string[];
    authors: string[];
    dateRange: {
      issueFrom?: string;
      issueTo?: string;
      reviewFrom?: string;
      reviewTo?: string;
    };
    mandatoryOnly: boolean;
    tags: string[];
  };
  createdAt: string;
}

const STORAGE_KEY = 'ism-saved-searches';

export const useSavedSearches = () => {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSavedSearches(JSON.parse(stored));
      } catch {
        setSavedSearches([]);
      }
    }
  }, []);

  const saveSearch = (name: string, filters: SavedSearch['filters']) => {
    const newSearch: SavedSearch = {
      id: crypto.randomUUID(),
      name,
      filters,
      createdAt: new Date().toISOString(),
    };
    const updated = [newSearch, ...savedSearches];
    setSavedSearches(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newSearch;
  };

  const deleteSearch = (id: string) => {
    const updated = savedSearches.filter(s => s.id !== id);
    setSavedSearches(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return {
    savedSearches,
    saveSearch,
    deleteSearch,
  };
};
