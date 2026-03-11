import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveCurrentState, getLocalCenter } from '../router/navigation';

/**
 * Hook that listens for browser popstate events and restores app state.
 * Supports hero fly animation: if the target item exists as a card in the
 * current tree, the camera flies to it before crossfading to the new content.
 */
export function useHistory(
  treeContainerRef?: React.RefObject<HTMLDivElement | null>,
  vizAreaRef?: React.RefObject<HTMLDivElement | null>,
  performCrossfade?: (skipFade?: boolean) => void,
) {
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (!e.state || e.state.idx === undefined) return;

      const s = useStore.getState();

      // Save outgoing state
      if (s.historyIdx >= 0 && s.appHistory[s.historyIdx]) {
        saveCurrentState(true);
      }

      const targetIdx = e.state.idx as number;
      const state = s.appHistory[targetIdx];

      // Home state
      if (e.state.isHome || (state && state.isHome)) {
        s.setHistoryIdx(targetIdx);
        s.setViewType('home');
        s.setCurrentTreeItemId(null);
        s.setCurrentCategoryName(null);
        return;
      }

      // No saved state — try to recover from URL params
      if (!state) {
        s.setHistoryIdx(targetIdx);
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        const cat = params.get('category');

        if (id) {
          s.setCurrentTreeItemId(id);
          s.setViewType('tree');
          s.clearExpandedNodes();
        } else if (cat) {
          s.setCurrentCategoryName(cat);
          s.setViewType('category');
        }
        return;
      }

      // Category view
      if (state.viewType === 'category') {
        performCrossfade?.();
        s.setHistoryIdx(targetIdx);
        s.setCurrentCategoryName(state.category || null);
        s.setViewType('category');
        return;
      }

      // --- Tree view: check for hero fly bridge ---
      const treeContainer = treeContainerRef?.current;
      let bridgeCard: HTMLElement | null = null;

      if (treeContainer && s.currentViewType === 'tree' && state.viewType === 'tree') {
        const bridgeId = state.id;
        if (bridgeId) {
          bridgeCard = treeContainer.querySelector<HTMLElement>(
            `.item-card[data-id="${bridgeId}"]`,
          );
        }
      }

      const applyState = () => {
        const s2 = useStore.getState();
        s2.setHistoryIdx(targetIdx);
        if (state.mode) s2.setTreeMode(state.mode);
        if (state.expanded) s2.setExpandedNodes(new Set(state.expanded));
        if (state.discoverItems) s2.setDiscoverBoxItems(state.discoverItems);
        if (state.selectedRecipeIndices) s2.setSelectedRecipeIndices(state.selectedRecipeIndices);
        s2.setCurrentTreeItemId(state.id || null);
        s2.setViewType('tree');
        if (state.cameraX !== undefined && state.cameraY !== undefined && state.cameraScale !== undefined) {
          s2.setTarget(state.cameraX, state.cameraY, state.cameraScale);
        }
      };

      if (bridgeCard && treeContainer && vizAreaRef?.current) {
        // Fly camera to bridge card position, then crossfade to new content.
        // hero-bridge keeps the card visible (not dimmed) but without scale/glow.
        // The flash happens on the DESTINATION page via AppShell's highlightCard effect.
        bridgeCard.classList.add('hero-bridge');
        treeContainer.classList.add('fade-unfocused');

        const localCenter = getLocalCenter(bridgeCard, treeContainer, s.targetScale);
        const vizRect = vizAreaRef.current.getBoundingClientRect();
        s.setTarget(
          vizRect.width / 2 - localCenter.x * s.targetScale,
          vizRect.height / 2 - localCenter.y * s.targetScale,
          s.targetScale,
        );

        // Wait for camera fly to settle, then swap content
        setTimeout(() => {
          treeContainer.classList.remove('fade-unfocused');
          void treeContainer.offsetWidth; // Force reflow before cloning
          performCrossfade?.();
          applyState();
        }, 400);
      } else {
        // No bridge card found — just crossfade
        performCrossfade?.();
        applyState();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [treeContainerRef, vizAreaRef, performCrossfade]);
}
