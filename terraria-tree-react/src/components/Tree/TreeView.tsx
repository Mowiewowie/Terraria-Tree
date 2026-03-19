import { useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useTooltip } from '../../hooks/useTooltip';
import { useCollected } from '../../hooks/useCollected';
import TreeNode from './TreeNode';
import Tooltip from '../Tooltip/Tooltip';
import type { TreeMode } from '../../types/items';

interface TreeViewProps {
  onNavigate?: (cardEl: HTMLDivElement, id: string) => void;
  onCategoryView?: (category: string) => void;
  onModeSwitch?: (mode: TreeMode) => void;
}

/**
 * Orchestrator for recipe/usage tree modes.
 * Renders the root TreeNode, tooltip overlay.
 * Mode CSS classes (mode-usage) are applied on #treeContainer by AppShell.
 */
export default function TreeView({ onNavigate, onCategoryView, onModeSwitch }: TreeViewProps) {
  const currentTreeItemId = useStore((s) => s.currentTreeItemId);

  const { tooltip, tooltipElRef, show, move, hide } = useTooltip();
  const { toggleAndCascade } = useCollected();

  const handleTreeReload = useCallback(() => {}, []);

  if (!currentTreeItemId) return null;

  return (
    <div className="tree-root flex flex-col items-center">
      <TreeNode
        id={currentTreeItemId}
        isRoot
        onTooltipShow={show}
        onTooltipMove={move}
        onTooltipHide={hide}
        onNavigate={onNavigate}
        onCategoryView={onCategoryView}
        onCollectedToggle={toggleAndCascade}
        onModeSwitch={onModeSwitch}
        onTreeReload={handleTreeReload}
      />

      <Tooltip
        data={tooltip}
        elRef={tooltipElRef}
        onWikiClick={(url) => window.open(url, '_blank')}
        onCategoryClick={onCategoryView}
        onDismiss={hide}
      />
    </div>
  );
}
