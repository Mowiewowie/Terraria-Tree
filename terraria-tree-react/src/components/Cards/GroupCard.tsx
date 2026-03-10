import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createDirectImageUrl, FALLBACK_ICON } from '../../utils/image';
import { isMobileUX } from '../../utils/helpers';
import { RECIPE_GROUPS } from '../../data/recipe-groups';
import type { GroupTooltipData } from '../../hooks/useTooltip';


interface GroupCardProps {
  groupName: string;
  amount: number;
  onTooltipShow?: (e: React.MouseEvent, data: GroupTooltipData) => void;
  onTooltipMove?: (e: React.MouseEvent) => void;
  onTooltipHide?: () => void;
  onCategoryView?: (category: string) => void;
}

/**
 * "Any X" group card that cycles through valid alternatives every 1500ms.
 * Only animates when visible (IntersectionObserver with 200px margin).
 */
const GroupCard = memo(function GroupCard({
  groupName,
  amount,
  onTooltipShow,
  onTooltipMove,
  onTooltipHide,
  onCategoryView,
}: GroupCardProps) {
  const groupKey = Object.keys(RECIPE_GROUPS).find(
    (k) => k.toLowerCase() === groupName.toLowerCase(),
  );
  const groupItems = groupKey ? RECIPE_GROUPS[groupKey] : [groupName.replace('Any ', '')];

  const [currentIdx, setCurrentIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const isVisibleRef = useRef(false);

  const currentItem = groupItems[currentIdx];
  const imgSrc = createDirectImageUrl(currentItem);

  // Visibility-driven cycling
  useEffect(() => {
    if (groupItems.length <= 1) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        isVisibleRef.current = visible;

        if (visible && !intervalRef.current) {
          intervalRef.current = setInterval(() => {
            setFading(true);
            setTimeout(() => {
              setCurrentIdx((prev) => (prev + 1) % groupItems.length);
              setFading(false);
            }, 150);
          }, 1500);
        } else if (!visible && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = undefined;
        }
      },
      { rootMargin: '200px' },
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => {
      observer.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [groupItems.length]);

  const mockData: GroupTooltipData = {
    isGroupData: true,
    name: groupName,
    groupItems,
    url: `https://terraria.wiki.gg/wiki/Alternative_crafting_ingredients#${groupName.replace(/ /g, '_')}`,
  };

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey)) {
      window.open(mockData.url, '_blank');
    } else if (e.shiftKey) {
      onCategoryView?.(groupItems[0]);
    }
    // Normal click intentionally does nothing
  }, [mockData.url, onCategoryView, groupItems]);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (!isMobileUX()) onTooltipShow?.(e, mockData);
  }, [mockData, onTooltipShow]);

  return (
    <div className="tree-node">
      <div
        ref={cardRef}
        className="item-card relative flex flex-col items-center justify-center rounded-lg w-24 h-24 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 shadow-sm transition-transform hover:scale-105"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => { if (!isMobileUX()) onTooltipHide?.(); }}
        onMouseMove={(e) => { if (!isMobileUX()) onTooltipMove?.(e); }}
      >
        <img
          src={imgSrc}
          alt={`Any ${groupItems[0]} Terraria Crafting Alternative`}
          draggable={false}
          loading="lazy"
          className={`w-10 h-10 object-contain mb-1 transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}
          onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
        />
        <span className={`text-center font-semibold text-[10px] leading-tight px-1 line-clamp-2 text-slate-800 dark:text-slate-200 transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}>
          {currentItem}
        </span>

        {/* Amount badge */}
        <span className="absolute -top-2 -right-2 bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-500 text-blue-800 dark:text-blue-200 text-[10px] px-1.5 py-0.5 rounded-full z-20 font-mono shadow">
          x{amount}
        </span>

        {/* Group label */}
        <div className="absolute -bottom-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[9px] px-2 py-0.5 rounded shadow-md uppercase tracking-wider font-bold whitespace-nowrap z-30 border border-orange-700/50">
          <i className="fa-solid fa-layer-group mr-1" />{groupName}
        </div>
      </div>
    </div>
  );
});

export default GroupCard;
