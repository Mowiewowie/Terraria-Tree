import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import type { TreeMode } from '../../types/items';

interface ToolbarProps {
  onResetView: () => void;
  onExpandTier: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onModeChange: (mode: TreeMode) => void;
  visible: boolean;
}

export default function Toolbar({
  onResetView,
  onExpandTier,
  onExpandAll,
  onCollapseAll,
  onModeChange,
  visible,
}: ToolbarProps) {
  const treeMode = useStore((s) => s.treeMode);
  const showTransmutations = useStore((s) => s.showTransmutations);
  const showTotalQuantity = useStore((s) => s.showTotalQuantity);
  const currentViewType = useStore((s) => s.currentViewType);
  const historyIdx = useStore((s) => s.historyIdx);
  const historyLength = useStore((s) => s.appHistory.length);
  const setShowTransmutations = useStore((s) => s.setShowTransmutations);
  const setShowTotalQuantity = useStore((s) => s.setShowTotalQuantity);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  // --- Toolbar drag-scroll ---
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const dragStartX = useRef(0);
  const scrollLeft = useRef(0);

  useEffect(() => {
    const el = toolsRef.current;
    if (!el) return;

    const onDown = (e: MouseEvent) => {
      isDragging.current = true;
      dragMoved.current = false;
      dragStartX.current = e.pageX;
      scrollLeft.current = el.scrollLeft;
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const walk = (e.pageX - dragStartX.current) * 1.5;
      if (Math.abs(walk) > 5) dragMoved.current = true;
      el.scrollLeft = scrollLeft.current - walk;
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      el.style.cursor = '';
      setTimeout(() => { dragMoved.current = false; }, 0);
    };
    const onClick = (e: MouseEvent) => {
      if (dragMoved.current) {
        e.stopPropagation();
        e.preventDefault();
        dragMoved.current = false;
      }
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('click', onClick, true);

    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('click', onClick, true);
    };
  }, []);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [mobileMenuOpen]);

  const handleTransmuteChange = useCallback((checked: boolean) => {
    setShowTransmutations(checked);
    // Tree reload will be triggered by the parent watching this state
  }, [setShowTransmutations]);

  const handleTotalQtyChange = useCallback((checked: boolean) => {
    setShowTotalQuantity(checked);
  }, [setShowTotalQuantity]);

  const isTreeView = currentViewType === 'tree';
  const isDiscoverMode = treeMode === 'discover';

  if (!visible) return null;

  return (
    <div className={`absolute top-6 left-6 right-6 z-40 flex items-start gap-2 pointer-events-none transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Nav buttons */}
      <div className="controls-panel flex gap-1 p-1 rounded-lg shadow-lg pointer-events-auto shrink-0">
        <button
          id="navBack"
          disabled={historyIdx <= 0}
          title="Go Back"
          onClick={() => history.back()}
          className="w-10 h-10 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all flex items-center justify-center text-xl"
        >
          <i className="fa-solid fa-arrow-left" />
        </button>
        <button
          id="navForward"
          disabled={historyIdx >= historyLength - 1}
          title="Go Forward"
          onClick={() => history.forward()}
          className="w-10 h-10 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all flex items-center justify-center text-xl"
        >
          <i className="fa-solid fa-arrow-right" />
        </button>
      </div>

      {/* Mobile menu toggle */}
      <div className="controls-panel md:hidden p-1 rounded-lg shadow-lg pointer-events-auto shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMobileMenuOpen((v) => !v);
          }}
          className="w-10 h-10 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-xl transition-all"
        >
          <i className="fa-solid fa-ellipsis-v" />
        </button>
      </div>

      {/* Tools panel */}
      <div
        ref={toolsRef}
        className={`pointer-events-auto ${mobileMenuOpen ? 'flex' : 'hidden'} md:flex flex-row flex-wrap md:flex-nowrap gap-2 absolute md:static top-[3.5rem] left-0 right-0 md:right-auto bg-white/95 dark:bg-slate-900/95 md:bg-transparent dark:md:bg-transparent p-3 md:p-0 rounded-lg md:rounded-none border border-slate-300 dark:border-slate-700 md:border-none shadow-2xl md:shadow-none backdrop-blur-md md:backdrop-blur-none max-w-[calc(100vw-3rem)] overflow-x-auto hide-scrollbar pb-1 select-none z-50`}
      >
        {/* Mode selector */}
        {isTreeView && (
          <div className="controls-panel rounded-lg px-2 sm:px-3 flex items-center gap-1.5 shadow-lg shrink-0 h-10 md:h-12 overflow-x-auto hide-scrollbar">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider border-r border-slate-300 dark:border-slate-700 pr-2">
              Mode
            </span>
            {([
              { value: 'recipe' as const, icon: 'fa-hammer', label: 'Recipe', color: 'blue' },
              { value: 'usage' as const, icon: 'fa-code-branch', label: 'Used In', color: 'purple' },
              { value: 'discover' as const, icon: 'fa-compass', label: 'Discover', color: 'emerald' },
            ]).map((mode) => (
              <label
                key={mode.value}
                className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
              >
                <input
                  type="radio"
                  name="treeMode"
                  value={mode.value}
                  checked={treeMode === mode.value}
                  onChange={() => { setMobileMenuOpen(false); onModeChange(mode.value); }}
                  className={`text-${mode.color}-600 focus:ring-${mode.color}-500 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 cursor-pointer`}
                />
                <i className={`fa-solid ${mode.icon} text-slate-400 text-xs`} />
                {mode.label}
              </label>
            ))}
          </div>
        )}

        {/* Filters (hidden in discover mode) */}
        {isTreeView && !isDiscoverMode && (
          <div className="controls-panel rounded-lg shadow-lg shrink-0 h-10 md:h-12 flex">
            <label className="w-auto h-full px-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap">
              <input
                type="checkbox"
                checked={showTransmutations}
                onChange={(e) => handleTransmuteChange(e.target.checked)}
                className="rounded w-4 h-4 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 cursor-pointer"
              />
              Transmutations
            </label>
            <label className="w-auto h-full px-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap border-l border-slate-300 dark:border-slate-600">
              <input
                type="checkbox"
                checked={showTotalQuantity}
                onChange={(e) => handleTotalQtyChange(e.target.checked)}
                className="rounded w-4 h-4 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 cursor-pointer"
              />
              Totals
            </label>
          </div>
        )}

        {/* Expand/Collapse/Reset */}
        {isTreeView && (
          <>
            <button onClick={() => { setMobileMenuOpen(false); onExpandTier(); }} className="controls-panel px-3 rounded-lg text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-blue-500 shadow-lg flex items-center justify-center gap-1.5 transition-all text-sm font-medium whitespace-nowrap shrink-0 h-10 md:h-12 cursor-pointer">
              <i className="fa-solid fa-angle-down" /> Expand Tier
            </button>
            <button onClick={() => { setMobileMenuOpen(false); onExpandAll(); }} className="controls-panel px-3 rounded-lg text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-blue-500 shadow-lg flex items-center justify-center gap-1.5 transition-all text-sm font-medium whitespace-nowrap shrink-0 h-10 md:h-12 cursor-pointer">
              <i className="fa-solid fa-angles-down" /> Expand All
            </button>
            <button onClick={() => { setMobileMenuOpen(false); onCollapseAll(); }} className="controls-panel px-3 rounded-lg text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-blue-500 shadow-lg flex items-center justify-center gap-1.5 transition-all text-sm font-medium whitespace-nowrap shrink-0 h-10 md:h-12 cursor-pointer">
              <i className="fa-solid fa-angles-up" /> Collapse All
            </button>
          </>
        )}

        <button onClick={() => { setMobileMenuOpen(false); onResetView(); }} className="controls-panel px-3 rounded-lg text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-blue-500 shadow-lg flex items-center justify-center gap-1.5 transition-all text-sm font-medium whitespace-nowrap shrink-0 h-10 md:h-12 cursor-pointer">
          <i className="fa-solid fa-compress-arrows-alt" /> Reset
        </button>
      </div>
    </div>
  );
}
