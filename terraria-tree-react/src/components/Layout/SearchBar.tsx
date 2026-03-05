import { useRef, useCallback } from 'react';
import { useSearch } from '../../hooks/useSearch';
import { createDirectImageUrl, FALLBACK_ICON } from '../../utils/image';
import type { ItemIndexEntry } from '../../types/items';

interface SearchBarProps {
  onSelect: (item: ItemIndexEntry) => void;
  disabled?: boolean;
}

export default function SearchBar({ onSelect, disabled }: SearchBarProps) {
  const { results, isOpen, activeIndex, search, onKeyDown, close, open } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = useCallback(
    (item: ItemIndexEntry) => {
      close();
      if (inputRef.current) {
        inputRef.current.value = '';
        inputRef.current.blur();
      }
      onSelect(item);
    },
    [onSelect, close],
  );

  return (
    <div className="relative w-full max-w-md">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search items..."
        disabled={disabled}
        className="no-pan w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm disabled:opacity-50"
        onChange={(e) => search(e.target.value)}
        onKeyDown={(e) => onKeyDown(e, handleSelect)}
        onFocus={open}
      />
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 max-h-80 overflow-y-auto">
          {results.map((m, idx) => (
            <div
              key={m.item.id}
              className={`flex items-center justify-between p-2 cursor-pointer border-b border-slate-200 dark:border-slate-700 text-sm transition-colors ${
                idx === activeIndex
                  ? 'bg-blue-100 dark:bg-slate-600'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              onClick={() => handleSelect(m.item)}
              onMouseEnter={() => {}}
            >
              <div className="flex items-center gap-3">
                <img
                  src={m.item.icon_url || createDirectImageUrl(m.item.name)}
                  alt={`${m.item.name} Terraria Icon`}
                  className="w-6 h-6 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = FALLBACK_ICON;
                  }}
                />
                <span className="text-slate-800 dark:text-slate-200 font-medium truncate max-w-[150px]">
                  {m.item.name}
                </span>
              </div>
              {m.item.type && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold truncate">
                  {m.item.type}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
