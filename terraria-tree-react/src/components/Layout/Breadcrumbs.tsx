import { useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { createDirectImageUrl, FALLBACK_ICON } from '../../utils/image';

/**
 * Navigation breadcrumb trail showing the path of visited items.
 * Displays below the toolbar with item icons and names.
 * Clickable to jump to any point in history via history.go().
 */
export default function Breadcrumbs() {
  const appHistory = useStore((s) => s.appHistory);
  const historyIdx = useStore((s) => s.historyIdx);
  const itemsDatabase = useStore((s) => s.itemsDatabase);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to show current position when it changes
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [historyIdx]);

  if (appHistory.length === 0 || historyIdx < 0) return null;

  const handleClick = (targetIdx: number) => {
    if (targetIdx === historyIdx) return;
    const delta = targetIdx - historyIdx;
    history.go(delta);
  };

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide z-40 flex-none"
      style={{ scrollbarWidth: 'none' }}
    >
      {appHistory.map((entry, idx) => {
        const isCurrent = idx === historyIdx;
        const isFuture = idx > historyIdx;

        // Determine display info
        let label: string;
        let iconUrl: string | null = null;

        if (entry.isHome) {
          label = 'Home';
        } else if (entry.viewType === 'category') {
          label = entry.category || 'Category';
        } else if (entry.id) {
          const item = itemsDatabase[entry.id];
          label = item?.DisplayName || `Item ${entry.id}`;
          iconUrl = item?.IconUrl || createDirectImageUrl(item?.DisplayName);
        } else {
          label = 'Page';
        }

        return (
          <div key={idx} className="flex items-center gap-1 shrink-0">
            {idx > 0 && (
              <span className={`text-xs select-none ${isFuture ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>
                &rsaquo;
              </span>
            )}
            <button
              data-active={isCurrent ? 'true' : undefined}
              onClick={() => handleClick(idx)}
              className={`
                flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap
                transition-colors no-pan
                ${isCurrent
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700'
                  : isFuture
                    ? 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }
              `}
              title={label}
            >
              {entry.isHome ? (
                <i className="fa-solid fa-house text-[10px]" />
              ) : iconUrl ? (
                <img
                  src={iconUrl}
                  alt=""
                  className="w-4 h-4 object-contain"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
                />
              ) : (
                <i className="fa-solid fa-folder text-[10px]" />
              )}
              <span className="max-w-[120px] truncate">{label}</span>
              {entry.mode && entry.viewType === 'tree' && (
                <span className={`text-[9px] opacity-60 ${
                  entry.mode === 'recipe' ? 'text-blue-500' :
                  entry.mode === 'usage' ? 'text-purple-500' :
                  'text-emerald-500'
                }`}>
                  {entry.mode === 'recipe' ? 'R' : entry.mode === 'usage' ? 'U' : 'D'}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
