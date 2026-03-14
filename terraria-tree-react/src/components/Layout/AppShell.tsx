import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useHistory } from '../../hooks/useHistory';
import { useTransition } from '../../hooks/useTransition';
import { viewItem, viewCategory, viewHome, switchMode, transitionToNewItem, calculateResetView, saveCurrentState, estimateTreeSize, getLocalCenter } from '../../router/navigation';
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
  const [expandWarning, setExpandWarning] = useState<{ show: boolean; count: number }>({ show: false, count: 0 });
  const vizAreaRef = useRef<HTMLDivElement>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  // Crossfade transitions (split into createGhost + startFade to avoid race conditions)
  const { performCrossfade, createGhost, startFade } = useTransition(treeContainerRef);

  // Wire up browser history (popstate) with hero fly animation support
  useHistory(treeContainerRef, vizAreaRef, performCrossfade, createGhost);

  // --- Navigation handlers ---

  const handleSearchSelect = useCallback((item: ItemIndexEntry) => {
    useStore.getState().setHighlightItemId(null); // no flash on search
    performCrossfade();
    viewItem(item.id, true);
  }, [performCrossfade]);

  const handleNavigate = useCallback((cardEl: HTMLDivElement, id: string) => {
    const treeContainer = treeContainerRef.current;
    const vizArea = vizAreaRef.current;

    // Fallback: no refs, just crossfade
    if (!treeContainer || !vizArea) {
      useStore.getState().setHighlightItemId(id);
      performCrossfade();
      transitionToNewItem(id);
      return;
    }

    const s = useStore.getState();

    // Save current state BEFORE fly (captures correct camera + itemLocations)
    saveCurrentState();

    // Get bridge card's local center on current page
    const startLocal = getLocalCenter(cardEl, treeContainer, s.targetScale);

    // Hero fly setup: dim other cards, keep bridge visible
    cardEl.classList.add('hero-bridge');
    treeContainer.classList.add('fade-unfocused');

    // Fly toward approximate destination (center at scale 1.1).
    // The exact position is calculated after the new tree renders.
    const vizRect = vizArea.getBoundingClientRect();
    const futureScale = 1.1;
    const flyX = vizRect.width / 2 - startLocal.x * futureScale;
    const flyY = vizRect.height / 2 - startLocal.y * futureScale;
    s.setTarget(flyX, flyY, futureScale);

    // Flash the clicked item (= new page's root) on the destination page
    s.setHighlightItemId(id);

    // Wait for camera fly, then clone ghost and swap content
    setTimeout(() => {
      treeContainer.classList.remove('fade-unfocused');
      void treeContainer.offsetWidth; // force reflow before ghost clone

      // Phase 1: Clone ghost of old tree at fly-end position.
      // Don't start fade yet — auto-center will call startFade()
      // after calculating the exact camera position for the new tree.
      createGhost();
      transitionToNewItem(id, true); // skipSave — already saved above
    }, 400);
  }, [performCrossfade, createGhost]);

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

  // Tier-by-tier expand: expands one layer at a time to distribute render work
  // across multiple frames, preventing UI freezes on massive trees.
  const doExpandAll = useCallback((snapAtEnd = false) => {
    let iteration = 0;
    const expandNextTier = () => {
      const treeContainer = treeContainerRef.current;
      if (!treeContainer || iteration >= 20) {
        if (snapAtEnd) useStore.getState().setSnapNextCamera(true);
        resetViewDelayed();
        return;
      }
      iteration++;

      const s = useStore.getState();
      const next = new Set(s.expandedNodes);
      let expanded = false;

      // Find expand buttons for currently visible (not yet expanded) nodes
      treeContainer.querySelectorAll<HTMLElement>('.expand-btn').forEach((btn) => {
        const node = btn.closest('.tree-node');
        const card = node?.querySelector<HTMLElement>('.item-card');
        if (card?.dataset.id && !next.has(card.dataset.id)) {
          next.add(card.dataset.id);
          expanded = true;
        }
      });

      // Also handle discover_root
      const discoverBox = treeContainer.querySelector('[data-id="discover_root"]');
      if (discoverBox && !next.has('discover_root')) {
        next.add('discover_root');
        expanded = true;
      }

      if (!expanded) {
        if (snapAtEnd) useStore.getState().setSnapNextCamera(true);
        resetViewDelayed();
        return;
      }

      // Snap each intermediate tier too so the camera doesn't fly across
      if (snapAtEnd) useStore.getState().setSnapNextCamera(true);
      s.setExpandedNodes(next);
      // Wait for React to render this tier, then expand the next
      requestAnimationFrame(() => requestAnimationFrame(expandNextTier));
    };

    expandNextTier();
  }, [resetViewDelayed]);

  const handleExpandAll = useCallback(() => {
    const s = useStore.getState();
    const estimated = estimateTreeSize(s.currentTreeItemId, s.treeMode);
    if (estimated > 200) {
      setExpandWarning({ show: true, count: estimated });
      return;
    }
    doExpandAll();
  }, [doExpandAll]);

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
        const s = useStore.getState();
        const entry = s.appHistory[s.historyIdx];

        if (s.highlightItemId) {
          // Coming from hero fly (card click or back/forward).
          // Calculate the final camera position for the new tree.

          let finalX: number, finalY: number, finalScale: number;

          if (entry?.cameraX !== undefined && entry?.cameraY !== undefined && entry?.cameraScale !== undefined) {
            // Back/forward: restore exact saved camera position
            finalX = entry.cameraX;
            finalY = entry.cameraY;
            finalScale = entry.cameraScale;
          } else {
            // New forward click: frame entire tree naturally
            const rv = calculateResetView(vizAreaRef.current!, treeContainerRef.current!);
            finalX = rv.x;
            finalY = rv.y;
            finalScale = rv.scale;

            // Ensure root card is visible
            const rootCard = treeContainerRef.current.querySelector<HTMLElement>(
              `.item-card[data-id="${s.highlightItemId}"], .is-root .item-card`,
            );
            if (rootCard) {
              const local = getLocalCenter(rootCard, treeContainerRef.current, finalScale);
              const vizRect = vizAreaRef.current.getBoundingClientRect();
              const rootScreenY = finalY + local.y * finalScale;
              if (rootScreenY < 0 || rootScreenY > vizRect.height) {
                finalY = 40 - local.y * finalScale + 60;
              }
            }
          }

          // Snap camera to final position BEFORE starting fade.
          // This ensures ghost and container are at the same position
          // when the opacity crossfade begins — no flash.
          s.setSnapNextCamera(true);
          s.setTarget(finalX, finalY, finalScale);

          // Also directly snap the container's inline transform so it's
          // at the correct position immediately (don't wait for renderLoop).
          treeContainerRef.current.style.transform =
            `translate3d(${finalX}px, ${finalY}px, 0) scale(${finalScale})`;

          // NOW start the crossfade — ghost syncs to container position first.
          startFade();

          // Highlight the bridge item after the crossfade settles
          const hlId = s.highlightItemId;
          if (hlId && currentViewType === 'tree') {
            s.setHighlightItemId(null);
            setTimeout(() => {
              if (!treeContainerRef.current) return;
              const card =
                treeContainerRef.current.querySelector<HTMLElement>(`.item-card[data-id="${hlId}"]`);
              if (card) highlightCard(card);
            }, 600);
          }
        } else if (entry?.cameraX !== undefined && entry?.cameraY !== undefined && entry?.cameraScale !== undefined) {
          s.setTarget(entry.cameraX, entry.cameraY, entry.cameraScale);
        } else {
          const { x, y, scale } = calculateResetView(vizAreaRef.current!, treeContainerRef.current!);
          s.setTarget(x, y, scale);
        }
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [currentViewType, currentTreeItemId, currentCategoryName, treeMode, startFade]);

  // Toggle large-tree class for performance optimizations (image hiding during camera fly)
  const expandedNodes = useStore((s) => s.expandedNodes);
  useEffect(() => {
    const container = treeContainerRef.current;
    if (!container) return;
    // Use rAF to measure after React renders new nodes
    const raf = requestAnimationFrame(() => {
      const count = container.querySelectorAll('.item-card').length;
      container.classList.toggle('large-tree', count >= 200);
    });
    return () => cancelAnimationFrame(raf);
  }, [currentViewType, currentTreeItemId, treeMode, expandedNodes]);

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
  const flipAnimatingRef = useRef(false);

  // Capture element positions after every render (runs after paint)
  // Skip capture during active FLIP animation to avoid corrupting stored positions
  useEffect(() => {
    if (flipAnimatingRef.current) return;
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

    flipAnimatingRef.current = true;

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
      flipAnimatingRef.current = false;
      // Capture final positions now that animation is complete
      const ids2 = ['logoContainer', 'searchWrapper', 'statusWrapper'];
      const rects = new Map<string, DOMRect>();
      ids2.forEach(id2 => {
        const el2 = document.getElementById(id2);
        if (el2) rects.set(id2, el2.getBoundingClientRect());
      });
      prevRectsRef.current = rects;
    }, 650);

    return () => { clearTimeout(cleanup); flipAnimatingRef.current = false; };
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

      {/* Expand All warning modal */}
      {expandWarning.show && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setExpandWarning({ show: false, count: 0 })}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-sm shadow-2xl border border-slate-300 dark:border-slate-600" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
              <i className="fa-solid fa-triangle-exclamation text-amber-500" /> Large Tree Warning
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              This tree has approximately <strong className="text-amber-600 dark:text-amber-400">~{expandWarning.count}</strong> nodes.
              Expanding all may cause lag. Consider using <strong>Expand Tier</strong> instead for better performance.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium transition-colors"
                onClick={() => setExpandWarning({ show: false, count: 0 })}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
                onClick={() => {
                  setExpandWarning({ show: false, count: 0 });
                  doExpandAll(true);
                }}
              >
                Expand Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
