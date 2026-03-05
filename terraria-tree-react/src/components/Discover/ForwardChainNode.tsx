import { memo, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import ItemCard from '../Cards/ItemCard';
import GenericCard from '../Cards/GenericCard';
import ExpandButton from '../Tree/ExpandButton';
import type { DiscoveryPathNode, ConvergenceEntry } from '../../algorithms/discovery';
import type { ItemRecord, Recipe } from '../../types/items';

interface ForwardChainNodeProps {
  pathNode: DiscoveryPathNode;
  convergences: ConvergenceEntry[];
  onRedraw?: () => void;
  onTooltipShow?: (e: React.MouseEvent, data: any, extraRecipe?: Recipe | null) => void;
  onTooltipMove?: (e: React.MouseEvent) => void;
  onTooltipHide?: () => void;
  onNavigate?: (cardEl: HTMLDivElement, id: string) => void;
  onCategoryView?: (category: string) => void;
  onCollectedToggle?: (id: string) => boolean;
}

/**
 * A node in the forward usage tree (discover mode DAG).
 * Convergence targets get a colored glow border.
 * Children are lazily rendered on expand.
 */
const ForwardChainNode = memo(function ForwardChainNode({
  pathNode,
  convergences,
  onRedraw,
  onTooltipShow,
  onTooltipMove,
  onTooltipHide,
  onNavigate,
  onCategoryView,
  onCollectedToggle,
}: ForwardChainNodeProps) {
  const itemsDatabase = useStore((s) => s.itemsDatabase);
  const expandedNodes = useStore((s) => s.expandedNodes);
  const addExpandedNode = useStore((s) => s.addExpandedNode);
  const removeExpandedNode = useStore((s) => s.removeExpandedNode);

  const data = itemsDatabase[pathNode.id] as ItemRecord | undefined;
  const hasChildren = pathNode.children.length > 0;
  const shouldAutoExpand = expandedNodes.has(pathNode.id);
  const [isOpen, setIsOpen] = useState(shouldAutoExpand);

  // Convergence target styling
  const convergenceStyle = useMemo(() => {
    if (pathNode.convergenceIdx !== null && convergences[pathNode.convergenceIdx]) {
      const color = convergences[pathNode.convergenceIdx].color;
      return { boxShadow: `0 0 0 3px ${color}, 0 0 12px ${color}` };
    }
    return undefined;
  }, [pathNode.convergenceIdx, convergences]);

  const isConvergenceTarget = pathNode.convergenceIdx !== null;

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    if (newOpen) {
      addExpandedNode(pathNode.id);
      // Trigger convergence line redraw after layout settles
      if (onRedraw) requestAnimationFrame(() => requestAnimationFrame(onRedraw));
    } else {
      removeExpandedNode(pathNode.id);
      if (onRedraw) requestAnimationFrame(onRedraw);
    }
  }, [isOpen, pathNode.id, addExpandedNode, removeExpandedNode, onRedraw]);

  if (!data) return <GenericCard name="Unknown Item" amount={0} />;

  return (
    <div className="tree-node">
      <div
        className={`${isConvergenceTarget ? 'convergence-target' : ''}`}
        style={convergenceStyle}
      >
        <ItemCard
          data={data}
          onTooltipShow={onTooltipShow}
          onTooltipMove={onTooltipMove}
          onTooltipHide={onTooltipHide}
          onNavigate={onNavigate}
          onCategoryView={onCategoryView}
          onCollectedToggle={onCollectedToggle}
        />
      </div>

      {hasChildren && (
        <>
          <ExpandButton isOpen={isOpen} mode="discover" onClick={handleToggle} />
          {isOpen && (
            <div className="tree-children">
              <button className="tree-line-btn" />
              {pathNode.children.map((child, i) => {
                const posClasses = `${i === 0 ? 'is-first' : ''} ${i === pathNode.children.length - 1 ? 'is-last' : ''} ${pathNode.children.length === 1 ? 'is-only' : ''}`;
                return (
                  <div key={`${child.id}-${i}`} className={`tree-node ${posClasses}`}>
                    <div className="line-h" />
                    <div className="line-v" />
                    <ForwardChainNode
                      pathNode={child}
                      convergences={convergences}
                      onRedraw={onRedraw}
                      onTooltipShow={onTooltipShow}
                      onTooltipMove={onTooltipMove}
                      onTooltipHide={onTooltipHide}
                      onNavigate={onNavigate}
                      onCategoryView={onCategoryView}
                      onCollectedToggle={onCollectedToggle}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default ForwardChainNode;
