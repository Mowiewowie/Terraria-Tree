import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveCurrentState } from '../router/navigation';

/**
 * Hook that listens for browser popstate events and restores app state.
 * Handles back/forward navigation by restoring tree mode, expanded nodes,
 * discover box items, recipe indices, and camera position.
 */
export function useHistory() {
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

      s.setHistoryIdx(targetIdx);

      // Home state
      if (e.state.isHome || (state && state.isHome)) {
        s.setViewType('home');
        s.setCurrentTreeItemId(null);
        s.setCurrentCategoryName(null);
        return;
      }

      // No saved state — try to recover from URL params
      if (!state) {
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
        s.setCurrentCategoryName(state.category || null);
        s.setViewType('category');
        return;
      }

      // Tree view — restore full state
      if (state.mode) s.setTreeMode(state.mode);
      if (state.expanded) s.setExpandedNodes(new Set(state.expanded));
      if (state.discoverItems) s.setDiscoverBoxItems(state.discoverItems);
      if (state.selectedRecipeIndices) s.setSelectedRecipeIndices(state.selectedRecipeIndices);

      s.setCurrentTreeItemId(state.id || null);
      s.setViewType('tree');

      // Restore camera position
      if (state.cameraX !== undefined && state.cameraY !== undefined && state.cameraScale !== undefined) {
        s.setTarget(state.cameraX, state.cameraY, state.cameraScale);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
}
