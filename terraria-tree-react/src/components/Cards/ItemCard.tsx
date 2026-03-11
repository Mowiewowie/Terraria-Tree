import { memo, useCallback, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { createDirectImageUrl, FALLBACK_ICON } from '../../utils/image';
import { isMobileUX } from '../../utils/helpers';
import type { ItemRecord, Recipe } from '../../types/items';
import type { GroupTooltipData } from '../../hooks/useTooltip';

interface ItemCardProps {
  data: ItemRecord;
  sizeClass?: 'sm' | 'lg';
  contextRecipe?: Recipe | null;
  customClickHandler?: (e: React.MouseEvent) => void;
  onTooltipShow?: (e: React.MouseEvent, data: ItemRecord | GroupTooltipData, extraRecipe?: Recipe | null) => void;
  onTooltipMove?: (e: React.MouseEvent) => void;
  onTooltipHide?: () => void;
  onNavigate?: (cardEl: HTMLDivElement, id: string) => void;
  onCategoryView?: (category: string) => void;
  onCollectedToggle?: (id: string) => boolean;
}

const ItemCard = memo(function ItemCard({
  data,
  sizeClass = 'sm',
  contextRecipe,
  customClickHandler,
  onTooltipShow,
  onTooltipMove,
  onTooltipHide,
  onNavigate,
  onCategoryView,
  onCollectedToggle,
}: ItemCardProps) {
  const collectedItems = useStore((s) => s.collectedItems);
  const cardRef = useRef<HTMLDivElement>(null);

  const itemId = String(data.ID);
  const isCollected = collectedItems.has(itemId);
  const isLarge = sizeClass === 'lg';

  // Mod-source tint
  const modSource = (data.ModSource || '').toLowerCase();
  let bgStyle: React.CSSProperties | undefined;
  if (modSource === 'calamitymod' || modSource === 'calamitymodmusic') {
    bgStyle = { background: 'linear-gradient(rgba(205, 97, 85, 0.3), rgba(205, 97, 85, 0.3)), var(--card-bg)' };
  } else if (modSource === 'fargowiltas' || modSource === 'fargowiltassouls') {
    bgStyle = { background: 'linear-gradient(rgba(165, 105, 189, 0.3), rgba(165, 105, 189, 0.3)), var(--card-bg)' };
  }

  const imgSrc = data.IconUrl || createDirectImageUrl(data.DisplayName);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Always dismiss tooltip on click
    onTooltipHide?.();

    if (customClickHandler) {
      customClickHandler(e);
      return;
    }

    // Ctrl+Click → Wiki
    if ((e.ctrlKey || e.metaKey) && data.WikiUrl) {
      window.open(data.WikiUrl, '_blank');
      return;
    }
    // Shift+Click → Category
    if (e.shiftKey && data.Category) {
      onCategoryView?.(data.Category);
      return;
    }

    // Navigate
    if (cardRef.current && onNavigate) {
      onNavigate(cardRef.current, itemId);
    }
  }, [customClickHandler, data.WikiUrl, data.Category, itemId, onNavigate, onCategoryView, onTooltipHide]);

  const handleCheckClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onCollectedToggle?.(itemId);
  }, [itemId, onCollectedToggle]);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (!isMobileUX()) onTooltipShow?.(e, data, contextRecipe);
  }, [data, contextRecipe, onTooltipShow]);

  const handleMouseLeave = useCallback(() => {
    if (!isMobileUX()) onTooltipHide?.();
  }, [onTooltipHide]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isMobileUX()) onTooltipMove?.(e);
  }, [onTooltipMove]);

  return (
    <div
      ref={cardRef}
      className={`item-card relative flex flex-col items-center justify-center rounded-lg ${isLarge ? 'w-32 h-32' : 'w-24 h-24'} ${isCollected ? 'item-card-collected' : ''}`}
      style={bgStyle}
      data-id={itemId}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Hardmode badge */}
      {data.IsHardmode && (
        <img
          src="/sprites/Hardmode_Icon.png"
          alt="Hardmode"
          title="Hardmode Item"
          draggable={false}
          className="absolute top-0.5 left-0.5 w-4 h-4 z-20 cursor-help drop-shadow"
        />
      )}

      {/* Collected checkmark */}
      <button
        className={`collected-check absolute bottom-0.5 left-0.5 w-5 h-5 flex items-center justify-center rounded-full z-20 cursor-pointer no-pan ${isCollected ? 'collected-active' : ''}`}
        title={isCollected ? 'Mark as not collected' : 'Mark as collected'}
        onClick={handleCheckClick}
      >
        <i className={isCollected ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'} />
      </button>

      {/* Item image */}
      <img
        src={imgSrc}
        alt={`${data.DisplayName} Terraria Icon`}
        draggable={false}
        loading="lazy"
        className={`${isLarge ? 'w-14 h-14 mb-2' : 'w-10 h-10 mb-1'} object-contain`}
        onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
      />

      {/* Name */}
      <span className={`text-center font-semibold leading-tight px-1 line-clamp-2 text-slate-800 dark:text-slate-200 ${isLarge ? 'text-sm' : 'text-[10px]'}`}>
        {data.DisplayName}
      </span>
    </div>
  );
});

export default ItemCard;
