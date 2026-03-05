import { useState, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { ItemIndexEntry } from '../types/items';

export interface SearchResult {
  item: ItemIndexEntry;
  score: number;
}

/**
 * Fuzzy search hook with token-based AND filtering and scoring.
 * Mirrors the original attachSearchLogic() behavior.
 */
export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultsRef = useRef<HTMLDivElement>(null);

  const search = useCallback((query: string) => {
    const val = query.toLowerCase().trim();
    setActiveIndex(-1);

    if (val.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const tokens = val.split(' ').filter((t) => t.length > 0);
    const itemIndex = useStore.getState().itemIndex;

    const matches = itemIndex
      .filter((i) =>
        tokens.every(
          (token) => i.name.toLowerCase().includes(token) || i.type.includes(token),
        ),
      )
      .map((i) => {
        let score = 0;
        const nameLower = i.name.toLowerCase();
        if (nameLower === val) score += 100;
        else if (nameLower.startsWith(val)) score += 50;
        else if (nameLower.includes(val)) score += 10;
        if (i.type === val) score += 20;
        return { item: i, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.name.localeCompare(b.item.name);
      })
      .slice(0, 15);

    setResults(matches);
    setIsOpen(matches.length > 0);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, onSelect: (item: ItemIndexEntry) => void) => {
      if (results.length === 0 || !isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(results.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        (e.target as HTMLElement).blur();
        const idx = activeIndex >= 0 ? activeIndex : 0;
        if (results[idx]) {
          onSelect(results[idx].item);
          close();
        }
      }
    },
    [results, isOpen, activeIndex],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const open = useCallback(() => {
    if (results.length > 0) setIsOpen(true);
  }, [results]);

  return { results, isOpen, activeIndex, search, onKeyDown, close, open, resultsRef };
}
