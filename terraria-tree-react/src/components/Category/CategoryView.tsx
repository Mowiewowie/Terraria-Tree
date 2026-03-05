import { useMemo, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useTooltip } from '../../hooks/useTooltip';
import { useCollected } from '../../hooks/useCollected';
import ItemCard from '../Cards/ItemCard';
import Tooltip from '../Tooltip/Tooltip';

interface CategoryViewProps {
  onNavigate?: (cardEl: HTMLDivElement, id: string) => void;
  onCategoryView?: (category: string) => void;
}

/**
 * Grid view for a single item category (e.g., "Swords", "Potions").
 * Sorted by Damage descending, then DisplayName ascending.
 */
export default function CategoryView({ onNavigate, onCategoryView }: CategoryViewProps) {
  const currentCategoryName = useStore((s) => s.currentCategoryName);
  const itemsDatabase = useStore((s) => s.itemsDatabase);

  const { tooltip, show, move, hide } = useTooltip();
  const { toggleAndCascade } = useCollected();

  const items = useMemo(() => {
    if (!currentCategoryName) return [];
    return Object.values(itemsDatabase)
      .filter((i) => i.Category === currentCategoryName)
      .sort((a, b) => {
        const dmgA = a.Stats?.Damage ?? -1;
        const dmgB = b.Stats?.Damage ?? -1;
        if (dmgA !== dmgB) return dmgB - dmgA;
        return (a.DisplayName || '').localeCompare(b.DisplayName || '');
      });
  }, [currentCategoryName, itemsDatabase]);

  if (!currentCategoryName) return null;

  return (
    <div className="category-box">
      <h2 className="category-header">
        {currentCategoryName} ({items.length})
      </h2>
      <div className="category-grid">
        {items.map((data) => (
          <ItemCard
            key={data.ID}
            data={data}
            onTooltipShow={show}
            onTooltipMove={move}
            onTooltipHide={hide}
            onNavigate={onNavigate}
            onCategoryView={onCategoryView}
            onCollectedToggle={toggleAndCascade}
          />
        ))}
      </div>

      <Tooltip
        data={tooltip}
        onWikiClick={(url) => window.open(url, '_blank')}
        onCategoryClick={onCategoryView}
      />
    </div>
  );
}
