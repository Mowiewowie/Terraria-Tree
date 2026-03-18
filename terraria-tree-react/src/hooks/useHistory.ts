import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveCurrentState } from '../router/navigation';

/**
 * Hook that listens for browser popstate events and restores app state.
 * No animations — just instant state restoration with saved camera position.
 */
export function useHistory() {
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (!e.state || e.state.idx === undefined) return;

      const s = useStore.getState();

      // Save outgoing state (captures camera + itemLocations at current position)
      if (s.historyIdx >= 0 && s.appHistory[s.historyIdx]) {
        saveCurrentState(true);
      }

      const targetIdx = e.state.idx as number;
      const state = s.appHistory[targetIdx]; // destination page's saved state

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
        s.setHistoryIdx(targetIdx);
        s.setCurrentCategoryName(state.category || null);
        s.setViewType('category');
        return;
      }

      // Tree view — restore all saved state
      const s2 = useStore.getState();
      s2.setHistoryIdx(targetIdx);

      // Determine bridge item: the item connecting this page to where we came from
      // Back: bridge = root of the page we just left (exists on this page's tree)
      // Forward: bridge = root of the destination page
      const goingBack = targetIdx < s.historyIdx;
      const bridgeEntry = goingBack ? s.appHistory[s.historyIdx] : s.appHistory[targetIdx];
      const bridgeId = bridgeEntry?.id || null;

      // Capture bridge card's screen position on the CURRENT page before swap
      if (bridgeId) {
        const card = document.querySelector<HTMLElement>(
          `.item-card[data-id="${CSS.escape(bridgeId)}"]`
        );
        if (card) {
          const rect = card.getBoundingClientRect();
          s2.setHighlightOrigin({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        } else {
          s2.setHighlightOrigin(null);
        }
      }
      s2.setHighlightItemId(bridgeId);

      if (state.mode) s2.setTreeMode(state.mode);
      if (state.expanded) s2.setExpandedNodes(new Set(state.expanded));
      if (state.discoverItems) s2.setDiscoverBoxItems(state.discoverItems);
      if (state.selectedRecipeIndices) s2.setSelectedRecipeIndices(state.selectedRecipeIndices);
      s2.setCurrentTreeItemId(state.id || null);
      s2.setViewType('tree');
      // Camera will be restored by AppShell's auto-center effect from saved history
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
}
