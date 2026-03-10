import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useSearch } from '../../hooks/useSearch';
import { useTooltip } from '../../hooks/useTooltip';
import { useCollected } from '../../hooks/useCollected';
import { buildDiscoveryGraph, getDiscoverableItems } from '../../algorithms/discovery';
import ItemCard from '../Cards/ItemCard';
import TreeNode from '../Tree/TreeNode';
import ForwardChainNode from './ForwardChainNode';
import ConvergenceOverlay from './ConvergenceOverlay';
import ExpandButton from '../Tree/ExpandButton';
import Tooltip from '../Tooltip/Tooltip';
import type { ItemIndexEntry } from '../../types/items';

interface DiscoverRootProps {
  onNavigate?: (cardEl: HTMLDivElement, id: string) => void;
  onCategoryView?: (category: string) => void;
  onModeSwitch?: (mode: 'recipe' | 'usage' | 'discover') => void;
}

/**
 * Root component for Discover mode.
 * Shows a discover box with added items, a search bar to add more,
 * and either a DAG visualization (2+ items) or simple usage list (0-1 items).
 */
export default function DiscoverRoot({ onNavigate, onCategoryView, onModeSwitch }: DiscoverRootProps) {
  const discoverBoxItems = useStore((s) => s.discoverBoxItems);
  const itemsDatabase = useStore((s) => s.itemsDatabase);
  const usageIndex = useStore((s) => s.usageIndex);
  const showTransmutations = useStore((s) => s.showTransmutations);
  const removeDiscoverBoxItem = useStore((s) => s.removeDiscoverBoxItem);
  const addDiscoverBoxItem = useStore((s) => s.addDiscoverBoxItem);
  const saveToLocalStorage = useStore((s) => s.saveToLocalStorage);

  const { tooltip, tooltipElRef, show: tooltipShow, move: tooltipMove, hide: tooltipHide } = useTooltip();
  const { toggleAndCascade } = useCollected();
  const { results, isOpen, activeIndex, search, onKeyDown, close } = useSearch();

  const expandedNodes = useStore((s) => s.expandedNodes);
  const addExpandedNode = useStore((s) => s.addExpandedNode);
  const removeExpandedNode = useStore((s) => s.removeExpandedNode);

  const [searchValue, setSearchValue] = useState('');
  // DAG open/close tracked via expandedNodes with special key so toolbar collapse-all affects it
  const dagOpen = expandedNodes.has('discover_root');
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-open DAG on mount and when items are added to discover box
  const prevItemCountRef = useRef(-1);
  useEffect(() => {
    const prevCount = prevItemCountRef.current;
    prevItemCountRef.current = discoverBoxItems.length;
    // Open on mount (prevCount === -1) or when items are added
    if (prevCount === -1 || discoverBoxItems.length > prevCount) {
      if (discoverBoxItems.length > 0 && !expandedNodes.has('discover_root')) {
        addExpandedNode('discover_root');
      }
    }
  }, [discoverBoxItems.length, expandedNodes, addExpandedNode]);

  // Build discovery graph for 2+ items
  const graph = useMemo(() => {
    if (discoverBoxItems.length < 2) return null;
    return buildDiscoveryGraph(discoverBoxItems, itemsDatabase, usageIndex, showTransmutations);
  }, [discoverBoxItems, itemsDatabase, usageIndex, showTransmutations]);

  // Get simple discoverable items for 0-1 items
  const simpleItems = useMemo(() => {
    if (discoverBoxItems.length >= 2) return [];
    return getDiscoverableItems(discoverBoxItems, itemsDatabase, usageIndex, showTransmutations);
  }, [discoverBoxItems, itemsDatabase, usageIndex, showTransmutations]);

  // Flatten first-layer items from all forward trees
  const firstLayerItems = useMemo(() => {
    if (!graph) return [];
    return graph.trees.flatMap((tree) => tree.children);
  }, [graph]);

  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    search(val);
  }, [search]);

  const handleSearchSelect = useCallback((item: ItemIndexEntry) => {
    if (!discoverBoxItems.includes(item.id)) {
      addDiscoverBoxItem(item.id);
      saveToLocalStorage();
    }
    setSearchValue('');
    close();
  }, [discoverBoxItems, addDiscoverBoxItem, saveToLocalStorage, close]);

  const handleRemoveItem = useCallback((itemId: string) => {
    removeDiscoverBoxItem(itemId);
    saveToLocalStorage();
  }, [removeDiscoverBoxItem, saveToLocalStorage]);

  const handleItemClick = useCallback((_itemId: string) => {
    // Switch to recipe mode and navigate to this item
    onModeSwitch?.('recipe');
  }, [onModeSwitch]);

  const handleDagToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dagOpen) {
      removeExpandedNode('discover_root');
    } else {
      addExpandedNode('discover_root');
    }
  }, [dagOpen, addExpandedNode, removeExpandedNode]);

  const triggerRedraw = useCallback(() => {
    const container = containerRef.current;
    if (container && (container as any).__convergenceRedraw) {
      (container as any).__convergenceRedraw();
    }
  }, []);

  const handleCollectedToggle = useCallback((id: string) => {
    return toggleAndCascade(id);
  }, [toggleAndCascade]);

  return (
    <div className="tree-root flex flex-col items-center" ref={containerRef}>
      <div className="tree-node is-root">
        {/* Discover Box */}
        <div className="discover-box-container bg-white dark:bg-slate-800 border-4 border-emerald-500 ring-4 ring-emerald-500/20 rounded-xl p-4 flex flex-col items-center shadow-2xl relative z-10 w-96" data-id="discover_root">
          {/* Header */}
          <div className="w-full flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-2 select-none">
            <h3 className="text-emerald-600 dark:text-emerald-400 font-bold text-lg flex items-center gap-2 select-none">
              <i className="fa-solid fa-compass" /> Discover Box
            </h3>
          </div>

          {/* Items grid */}
          <div className="flex flex-wrap justify-center gap-3 w-full mb-4">
            {discoverBoxItems.map((itemId) => {
              const itemData = itemsDatabase[itemId];
              if (!itemData) return null;
              return (
                <div key={itemId} className="relative group">
                  <ItemCard
                    data={itemData}
                    customClickHandler={() => handleItemClick(itemId)}
                    onTooltipShow={tooltipShow}
                    onTooltipMove={tooltipMove}
                    onTooltipHide={tooltipHide}
                    onNavigate={onNavigate}
                    onCategoryView={onCategoryView}
                    onCollectedToggle={handleCollectedToggle}
                  />
                  <button
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-md hover:bg-red-600 transition-colors z-20 opacity-0 group-hover:opacity-100 no-pan cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); handleRemoveItem(itemId); }}
                  >
                    <i className="fa-solid fa-times" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Search to add items */}
          <div className="relative w-full">
            <i className="fa-solid fa-plus absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="no-pan block w-full pl-8 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 text-sm shadow-inner"
              placeholder="Search to add items..."
              value={searchValue}
              onChange={handleSearchInput}
              onKeyDown={(e) => onKeyDown(e, handleSearchSelect)}
              onFocus={() => { if (searchValue.length >= 2 && results.length > 0) search(searchValue); }}
            />
            {isOpen && results.length > 0 && (
              <div className="absolute mt-1 w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-2xl max-h-48 overflow-y-auto z-50">
                {results.map((r, i) => (
                  <button
                    key={r.item.id}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${i === activeIndex ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    onClick={() => handleSearchSelect(r.item)}
                  >
                    <img
                      src={r.item.icon_url || r.item.fallback_image}
                      alt=""
                      className="w-6 h-6 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span>{r.item.name}</span>
                    <span className="ml-auto text-xs text-slate-400">{r.item.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* DAG visualization (2+ items with convergences) */}
        {discoverBoxItems.length >= 2 && graph && graph.convergences.length > 0 && (
          <>
            <ExpandButton isOpen={dagOpen} mode="discover" onClick={handleDagToggle} />
            {dagOpen && (
              <div className="relative flex flex-col items-center">
                <div className="tree-children">
                  <button className="tree-line-btn" />
                  {firstLayerItems.map((pathNode, i) => {
                    const posClasses = `${i === 0 ? 'is-first' : ''} ${i === firstLayerItems.length - 1 ? 'is-last' : ''} ${firstLayerItems.length === 1 ? 'is-only' : ''}`;
                    return (
                      <div key={`${pathNode.id}-${i}`} className={`tree-node ${posClasses}`}>
                        <div className="line-h" />
                        <div className="line-v" />
                        <ForwardChainNode
                          pathNode={pathNode}
                          convergences={graph.convergences}
                          onRedraw={triggerRedraw}
                          onTooltipShow={tooltipShow}
                          onTooltipMove={tooltipMove}
                          onTooltipHide={tooltipHide}
                          onNavigate={onNavigate}
                          onCategoryView={onCategoryView}
                          onCollectedToggle={handleCollectedToggle}
                        />
                      </div>
                    );
                  })}
                </div>
                <ConvergenceOverlay
                  convergences={graph.convergences}
                  containerRef={containerRef}
                  onTooltipShow={tooltipShow}
                  onTooltipMove={tooltipMove}
                  onTooltipHide={tooltipHide}
                />
              </div>
            )}
          </>
        )}

        {/* 2+ items but no convergences */}
        {discoverBoxItems.length >= 2 && (!graph || graph.convergences.length === 0) && (
          <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2 z-10 mb-5">
            <i className="fa-solid fa-leaf text-slate-400" /> No craftable items found from these ingredients.
          </div>
        )}

        {/* 0-1 items: simple usage list */}
        {discoverBoxItems.length < 2 && simpleItems.length > 0 && (
          <>
            <ExpandButton isOpen={dagOpen} mode="discover" onClick={handleDagToggle} />
            {dagOpen && (
              <div className="tree-children">
                <button className="tree-line-btn" />
                {simpleItems.map((usage, i) => {
                  const posClasses = `${i === 0 ? 'is-first' : ''} ${i === simpleItems.length - 1 ? 'is-last' : ''} ${simpleItems.length === 1 ? 'is-only' : ''}`;
                  return (
                    <div key={`${usage.id}-${i}`} className={`tree-node ${posClasses}`}>
                      <div className="line-h" />
                      <div className="line-v" />
                      <TreeNode
                        id={usage.id}
                        parentContextRecipe={usage.recipe}
                        onTooltipShow={tooltipShow}
                        onTooltipMove={tooltipMove}
                        onTooltipHide={tooltipHide}
                        onNavigate={onNavigate}
                        onCategoryView={onCategoryView}
                        onCollectedToggle={handleCollectedToggle}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 0-1 items with no results */}
        {discoverBoxItems.length < 2 && simpleItems.length === 0 && (
          <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2 z-10 mb-5">
            {discoverBoxItems.length === 0 ? (
              <><i className="fa-solid fa-info-circle text-slate-400" /> Add items to the box to discover recipes.</>
            ) : (
              <><i className="fa-solid fa-leaf text-slate-400" /> No craftable items found from these ingredients.</>
            )}
          </div>
        )}
      </div>

      <Tooltip
        data={tooltip}
        elRef={tooltipElRef}
        onWikiClick={(url) => window.open(url, '_blank')}
        onCategoryClick={onCategoryView}
      />
    </div>
  );
}
