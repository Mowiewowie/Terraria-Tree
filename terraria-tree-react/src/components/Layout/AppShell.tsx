import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useHistory } from '../../hooks/useHistory';
import { useTransition } from '../../hooks/useTransition';
import { viewItem, viewCategory, viewHome, switchMode, transitionToNewItem, calculateResetView, saveCurrentState } from '../../router/navigation';
import { highlightCard } from '../../utils/highlight';
import SearchBar from './SearchBar';
import Toolbar from './Toolbar';
import SettingsModal from './SettingsModal';
import CanvasContainer from '../Canvas/CanvasContainer';
import TreeView from '../Tree/TreeView';
import CategoryView from '../Category/CategoryView';
import DiscoverRoot from '../Discover/DiscoverRoot';
import type { ItemIndexEntry, TreeMode } from '../../types/items';

/** Abbreviate status text for narrow screens: "v1.4.5 (Vanilla, Calamity)" → "v1.4.5 V+C" */
function abbreviateStatus(text: string | undefined): string {
  if (!text) return '';
  // Extract version (e.g. "v1.4.5")
  const versionMatch = text.match(/^v[\d.]+/);
  const version = versionMatch ? versionMatch[0] : text.split(' ')[0];

  // Abbreviate mod names
  const abbrevMap: Record<string, string> = {
    'vanilla': 'V',
    'calamity': 'C',
    "fargo's": 'F',
    'fargowiltas': 'F',
  };

  const modMatch = text.match(/\(([^)]+)\)/);
  if (modMatch) {
    const mods = modMatch[1].split(',').map(m => m.trim().toLowerCase());
    const abbrevs = mods.map(m => abbrevMap[m] || m.charAt(0).toUpperCase());
    return `${version} ${abbrevs.join('+')}`;
  }

  return version;
}

export default function AppShell() {
  const isDataLoaded = useStore((s) => s.isDataLoaded);
  const statusText = useStore((s) => s.statusText);
  const currentViewType = useStore((s) => s.currentViewType);
  const treeMode = useStore((s) => s.treeMode);

  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // Reset view after a delay (lets React render new nodes first)
  const resetViewDelayed = useCallback(() => {
    setTimeout(() => {
      if (!vizAreaRef.current || !treeContainerRef.current) return;
      const { x, y, scale } = calculateResetView(vizAreaRef.current, treeContainerRef.current);
      useStore.getState().setTarget(x, y, scale);
      saveCurrentState();
    }, 100);
  }, []);

  const handleExpandTier = useCallback(() => {
    const treeContainer = treeContainerRef.current;
    if (!treeContainer) return;

    const s = useStore.getState();
    const next = new Set(s.expandedNodes);
    let expanded = false;

    treeContainer.querySelectorAll<HTMLElement>('.expand-btn').forEach((btn) => {
      const node = btn.closest('.tree-node');
      const card = node?.querySelector<HTMLElement>('.item-card');
      if (card?.dataset.id && !next.has(card.dataset.id)) {
        next.add(card.dataset.id);
        expanded = true;
      }
    });

    if (expanded) {
      s.setExpandedNodes(next);
      resetViewDelayed();
    }
  }, [resetViewDelayed]);

  const handleExpandAll = useCallback(() => {
    const s = useStore.getState();
    const db = s.itemsDatabase;
    const next = new Set(s.expandedNodes);

    if (s.treeMode === 'recipe') {
      for (const id of Object.keys(db)) {
        if (db[id].Recipes && db[id].Recipes.length > 0) next.add(id);
      }
    } else {
      const usageIdx = s.usageIndex;
      for (const id of Object.keys(db)) {
        const name = (db[id].DisplayName || '').toLowerCase();
        if (usageIdx[name] && usageIdx[name].length > 0) next.add(id);
      }
    }

    s.setExpandedNodes(next);
    resetViewDelayed();
  }, [resetViewDelayed]);

  const handleCollapseAll = useCallback(() => {
    useStore.getState().clearExpandedNodes();
    resetViewDelayed();
  }, [resetViewDelayed]);

  const handleModeChange = useCallback((mode: TreeMode) => {
    handleModeSwitch(mode);
  }, [handleModeSwitch]);

  // Auto-center the tree after view content changes
  const currentTreeItemId = useStore((s) => s.currentTreeItemId);
  const currentCategoryName = useStore((s) => s.currentCategoryName);

  useEffect(() => {
    if (currentViewType === 'home') return;
    // Wait for React to render the new tree content, then center
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        if (!vizAreaRef.current || !treeContainerRef.current) return;
        // Only auto-center if no saved camera state exists for this history entry
        const s = useStore.getState();
        const entry = s.appHistory[s.historyIdx];
        if (entry?.cameraX !== undefined && entry?.cameraY !== undefined && entry?.cameraScale !== undefined) {
          // Restore saved camera position
          s.setTarget(entry.cameraX, entry.cameraY, entry.cameraScale);
        } else {
          const { x, y, scale } = calculateResetView(vizAreaRef.current!, treeContainerRef.current!);
          s.setTarget(x, y, scale);
        }

        // Highlight root card after navigation
        if (currentViewType === 'tree' && currentTreeItemId) {
          const rootCard = treeContainerRef.current?.querySelector<HTMLElement>(`.is-root > .relative > .item-card[data-id="${currentTreeItemId}"]`);
          if (rootCard) highlightCard(rootCard);
        }
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [currentViewType, currentTreeItemId, currentCategoryName, treeMode]);

  // Save state periodically and on unload
  useEffect(() => {
    const handleBeforeUnload = () => saveCurrentState();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const showToolbar = currentViewType === 'tree' || currentViewType === 'category';
  const isHome = currentViewType === 'home';

  // FLIP animation: store previous rects after each render, animate on transition
  const prevViewRef = useRef(currentViewType);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  // Capture element positions after every render (runs after paint)
  useEffect(() => {
    const ids = ['logoContainer', 'searchWrapper', 'statusWrapper'];
    const rects = new Map<string, DOMRect>();
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) rects.set(id, el.getBoundingClientRect());
    });
    prevRectsRef.current = rects;
  });

  // FLIP animation on home↔non-home transition (runs before paint)
  useLayoutEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = currentViewType;
    const isTransition = (prev === 'home') !== (currentViewType === 'home');
    if (!isTransition) return;

    const ids = ['logoContainer', 'searchWrapper', 'statusWrapper'];
    const els = ids.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[];

    // LAST positions = current DOM after React applied new layout
    const lastRects = els.map(el => el.getBoundingClientRect());

    // FIRST positions = stored from previous render's useEffect
    els.forEach((el, i) => {
      const firstRect = prevRectsRef.current.get(el.id);
      if (!firstRect) return;

      const invertX = firstRect.left - lastRects[i].left;
      const invertY = firstRect.top - lastRects[i].top;
      const invertScaleX = firstRect.width / (lastRects[i].width || 1);

      el.style.transformOrigin = 'top left';
      el.style.transition = 'none';
      if (el.id === 'logoContainer') {
        el.style.transform = `translate3d(${invertX}px, ${invertY}px, 0) scale(${invertScaleX})`;
      } else {
        el.style.transform = `translate3d(${invertX}px, ${invertY}px, 0)`;
      }
    });

    // Force reflow then animate to final position
    void document.body.offsetWidth;

    els.forEach(el => {
      el.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
      el.style.transform = '';
    });

    const cleanup = setTimeout(() => {
      els.forEach(el => {
        el.style.transition = '';
        el.style.transformOrigin = '';
      });
    }, 600);

    return () => clearTimeout(cleanup);
  }, [currentViewType]);

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
              {isDataLoaded ? (
                <>
                  {/* Full text on lg+ screens */}
                  <span className="hidden lg:inline">{statusText}</span>
                  {/* Abbreviated on smaller screens: version + short mods, no item count */}
                  <span className="lg:hidden">{abbreviateStatus(statusText)}</span>
                </>
              ) : (
                statusText || 'Initializing...'
              )}
            </span>
            <button
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors focus:outline-none"
              title="Data Sources & Mods"
              onClick={() => setSettingsOpen(true)}
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

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
