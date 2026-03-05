import { useRef, useCallback, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useHistory } from '../../hooks/useHistory';
import { useTransition } from '../../hooks/useTransition';
import { viewItem, viewCategory, viewHome, switchMode, transitionToNewItem, calculateResetView, saveCurrentState } from '../../router/navigation';
import SearchBar from './SearchBar';
import Toolbar from './Toolbar';
import CanvasContainer from '../Canvas/CanvasContainer';
import TreeView from '../Tree/TreeView';
import CategoryView from '../Category/CategoryView';
import DiscoverRoot from '../Discover/DiscoverRoot';
import type { ItemIndexEntry, TreeMode } from '../../types/items';

export default function AppShell() {
  const isDataLoaded = useStore((s) => s.isDataLoaded);
  const statusText = useStore((s) => s.statusText);
  const currentViewType = useStore((s) => s.currentViewType);
  const treeMode = useStore((s) => s.treeMode);

  const vizAreaRef = useRef<HTMLDivElement>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  // Wire up browser history (popstate)
  useHistory();

  // Crossfade transitions
  const { performCrossfade } = useTransition(treeContainerRef);

  // --- Navigation handlers ---

  const handleSearchSelect = useCallback((item: ItemIndexEntry) => {
    performCrossfade();
    viewItem(item.id, true);
  }, [performCrossfade]);

  const handleNavigate = useCallback((_cardEl: HTMLDivElement, id: string) => {
    performCrossfade();
    transitionToNewItem(id);
  }, [performCrossfade]);

  const handleCategoryView = useCallback((category: string) => {
    performCrossfade();
    viewCategory(category);
  }, [performCrossfade]);

  const handleModeSwitch = useCallback((mode: TreeMode) => {
    performCrossfade();
    switchMode(mode);
  }, [performCrossfade]);

  const handleHomeClick = useCallback(() => {
    viewHome();
  }, []);

  // --- Toolbar handlers ---

  const handleResetView = useCallback(() => {
    if (!vizAreaRef.current || !treeContainerRef.current) return;
    const { x, y, scale } = calculateResetView(vizAreaRef.current, treeContainerRef.current);
    useStore.getState().setTarget(x, y, scale);
    saveCurrentState();
  }, []);

  const handleExpandTier = useCallback(() => {
    // Expand one tier: add all currently-visible non-expanded nodes to expandedNodes
    const s = useStore.getState();
    const treeContainer = treeContainerRef.current;
    if (!treeContainer) return;

    const expandBtns = treeContainer.querySelectorAll<HTMLElement>('.expand-btn');
    let expanded = false;
    const next = new Set(s.expandedNodes);

    expandBtns.forEach((btn) => {
      const node = btn.closest('.tree-node');
      const card = node?.querySelector<HTMLElement>('.item-card');
      if (card?.dataset.id && !next.has(card.dataset.id)) {
        next.add(card.dataset.id);
        expanded = true;
      }
    });

    if (expanded) {
      s.setExpandedNodes(next);
      saveCurrentState();
    }
  }, []);

  const handleExpandAll = useCallback(() => {
    // This is handled by React re-renders when expandedNodes changes
    // We iteratively expand by adding all node IDs that have children
    const s = useStore.getState();
    const db = s.itemsDatabase;
    const next = new Set(s.expandedNodes);

    // Expand all nodes that have recipes (recipe mode) or usages
    for (const id of Object.keys(db)) {
      const item = db[id];
      if (item.Recipes && item.Recipes.length > 0) {
        next.add(id);
      }
    }

    s.setExpandedNodes(next);
    saveCurrentState();
  }, []);

  const handleCollapseAll = useCallback(() => {
    useStore.getState().clearExpandedNodes();
    saveCurrentState();
  }, []);

  const handleModeChange = useCallback((mode: TreeMode) => {
    handleModeSwitch(mode);
  }, [handleModeSwitch]);

  // Save state periodically and on unload
  useEffect(() => {
    const handleBeforeUnload = () => saveCurrentState();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const showToolbar = currentViewType === 'tree' || currentViewType === 'category';
  const isHome = currentViewType === 'home';

  // Render tree content based on view type and mode
  const renderContent = () => {
    if (currentViewType === 'category') {
      return (
        <CategoryView
          onNavigate={handleNavigate}
          onCategoryView={handleCategoryView}
        />
      );
    }

    if (currentViewType === 'tree') {
      if (treeMode === 'discover') {
        return (
          <DiscoverRoot
            onNavigate={handleNavigate}
            onCategoryView={handleCategoryView}
            onModeSwitch={handleModeSwitch}
          />
        );
      }
      return (
        <TreeView
          onNavigate={handleNavigate}
          onCategoryView={handleCategoryView}
          onModeSwitch={handleModeSwitch}
        />
      );
    }

    return null;
  };

  return (
    <div className={`h-[100dvh] overscroll-none flex flex-col ${isHome ? 'home-mode' : ''}`}>
      {/* Header */}
      <header
        className="w-full bg-white dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 z-50 flex-none relative"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingBottom: '0.75rem',
          paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
          paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 w-full">
          {/* Logo */}
          <div
            id="logoContainer"
            className="flex items-center gap-3 z-50 pointer-events-auto shrink-0 cursor-pointer"
            onClick={handleHomeClick}
          >
            <i className="fa-solid fa-tree text-green-500 dark:text-green-400 text-2xl transition-all" />
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white hidden lg:block transition-all">
              Terrari<span className="text-green-500 dark:text-green-400">Tree</span>
            </h1>
          </div>

          {/* Search */}
          <div id="searchWrapper" className="relative w-full max-w-xl flex gap-2 z-50 pointer-events-auto origin-center min-w-[150px] sm:min-w-[250px]">
            <SearchBar onSelect={handleSearchSelect} disabled={!isDataLoaded} />
          </div>

          {/* Status */}
          <div id="statusWrapper" className="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap z-50 pointer-events-auto shrink-0 flex items-center gap-3">
            <span className={isDataLoaded ? 'text-green-500' : 'text-slate-500'}>
              {statusText || 'Initializing...'}
            </span>
            <button
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors focus:outline-none"
              title="Data Sources & Mods"
            >
              <i className="fa-solid fa-gear text-xl" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow w-full relative overflow-hidden transition-colors duration-300">
        {!isHome && (
          <Toolbar
            visible={showToolbar}
            onResetView={handleResetView}
            onExpandTier={handleExpandTier}
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
            onModeChange={handleModeChange}
          />
        )}

        <CanvasContainer
          vizAreaRef={vizAreaRef}
          treeContainerRef={treeContainerRef}
          treeClassName={
            currentViewType === 'tree' && treeMode === 'usage' ? 'mode-usage' :
            currentViewType === 'tree' && treeMode === 'discover' ? 'mode-usage mode-discover' :
            ''
          }
        >
          {renderContent()}
        </CanvasContainer>
      </main>
    </div>
  );
}
