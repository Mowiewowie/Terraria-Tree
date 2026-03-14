import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveCurrentState, getLocalCenter } from '../router/navigation';

/**
 * Hook that listens for browser popstate events and restores app state.
 * Supports hero fly animation with proper forward/backward detection:
 *
 * FORWARD (going to a page we've visited):
 *   Bridge = destination page's root item (exists as child card in current tree)
 *   Fly camera so bridge card aligns with where it'll be on destination page.
 *
 * BACKWARD (going back to a previous page):
 *   Bridge = current page's root item (exists as child card on destination page)
 *   Fly camera so current root aligns with where it was on destination page.
 */
export function useHistory(
  treeContainerRef?: React.RefObject<HTMLDivElement | null>,
  vizAreaRef?: React.RefObject<HTMLDivElement | null>,
  performCrossfade?: (skipFade?: boolean) => void,
  createGhost?: () => void,
) {
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (!e.state || e.state.idx === undefined) return;

      const s = useStore.getState();

      // Save outgoing state (captures camera + itemLocations at current position)
      if (s.historyIdx >= 0 && s.appHistory[s.historyIdx]) {
        saveCurrentState(true);
      }

      const targetIdx = e.state.idx as number;
      const isBackward = targetIdx < s.historyIdx;
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

      // Category view — simple crossfade
      if (state.viewType === 'category') {
        performCrossfade?.();
        s.setHistoryIdx(targetIdx);
        s.setCurrentCategoryName(state.category || null);
        s.setViewType('category');
        return;
      }

      // --- Tree view: attempt hero fly ---
      const treeContainer = treeContainerRef?.current;
      const vizArea = vizAreaRef?.current;

      /** Apply destination state after crossfade. bridgeItemId = which card to flash. */
      const applyState = (bridgeItemId?: string) => {
        const s2 = useStore.getState();
        s2.setHistoryIdx(targetIdx);
        // Flash the bridge item on the destination page (not always the root)
        s2.setHighlightItemId(bridgeItemId || state.id || null);
        if (state.mode) s2.setTreeMode(state.mode);
        if (state.expanded) s2.setExpandedNodes(new Set(state.expanded));
        if (state.discoverItems) s2.setDiscoverBoxItems(state.discoverItems);
        if (state.selectedRecipeIndices) s2.setSelectedRecipeIndices(state.selectedRecipeIndices);
        s2.setCurrentTreeItemId(state.id || null);
        s2.setViewType('tree');
        // Camera will be restored by AppShell's auto-center effect from saved history
      };

      // Both pages must be tree views for hero fly
      if (treeContainer && vizArea && s.currentViewType === 'tree' && state.viewType === 'tree') {
        // Validate bridge for discover mode transitions
        const pastState = s.appHistory[s.historyIdx];
        const leavingMode = pastState?.mode;
        const enteringMode = state.mode;
        let isValidBridge = true;

        if (leavingMode === 'discover' || enteringMode === 'discover') {
          if (leavingMode === 'discover') {
            // Leaving discover: target item must exist in outgoing page's snapshot
            if (!pastState?.itemLocations || !pastState.itemLocations[String(state.id)]) {
              isValidBridge = false;
            }
          }
          if (enteringMode === 'discover') {
            // Entering discover: current root must exist in destination's snapshot
            if (!state.itemLocations || !state.itemLocations[String(s.currentTreeItemId)]) {
              isValidBridge = false;
            }
          }
        }

        if (isValidBridge && isBackward) {
          // BACKWARD: bridge = current page's root (which was a child on destination page)
          const bridgeId = s.currentTreeItemId;
          const rootCard = bridgeId
            ? treeContainer.querySelector<HTMLElement>(
                `.is-root > .relative > .item-card[data-id="${bridgeId}"], .item-card[data-id="${bridgeId}"]`,
              )
            : treeContainer.querySelector<HTMLElement>(
                '.is-root > .relative > .item-card, .is-root > .discover-box-container',
              );

          // Check if bridge has a known position on the destination page
          const pastLoc = bridgeId && state.itemLocations?.[bridgeId];

          if (rootCard && pastLoc && state.cameraX !== undefined && state.cameraY !== undefined && state.cameraScale !== undefined) {
            rootCard.classList.add('hero-bridge');
            treeContainer.classList.add('fade-unfocused');

            const startLocal = getLocalCenter(rootCard, treeContainer, s.targetScale);
            const startBaseWidth = startLocal.w || 128;
            const pastBaseWidth = pastLoc.w || 96;
            const pastScale = state.cameraScale;

            // Fly so current root card aligns with its position on the destination page
            const flyScale = pastScale * (pastBaseWidth / startBaseWidth);
            const pastScreenX = state.cameraX + pastLoc.x * pastScale;
            const pastScreenY = state.cameraY + pastLoc.y * pastScale;
            const flyX = pastScreenX - startLocal.x * flyScale;
            const flyY = pastScreenY - startLocal.y * flyScale;

            s.setTarget(flyX, flyY, flyScale);

            setTimeout(() => {
              treeContainer.classList.remove('fade-unfocused');
              void treeContainer.offsetWidth;
              // Pre-snap target to saved camera position before cloning ghost.
              // createGhost will snap the render loop's currentX/Y to match.
              if (state.cameraX !== undefined && state.cameraY !== undefined && state.cameraScale !== undefined) {
                useStore.getState().setTarget(state.cameraX, state.cameraY, state.cameraScale);
              }
              // Clone ghost (no fade yet) — auto-center effect will call startFade()
              // after confirming the camera position is finalized.
              createGhost?.();
              // For backward: flash the bridge item (current root) on the destination page
              applyState(bridgeId || undefined);
            }, 400);
            return;
          }
        } else if (isValidBridge && !isBackward) {
          // FORWARD: bridge = destination page's root (exists as child in current tree)
          const bridgeId = state.id;
          if (bridgeId) {
            const childCard = treeContainer.querySelector<HTMLElement>(
              `.item-card[data-id="${bridgeId}"]`,
            );

            if (childCard) {
              childCard.classList.add('hero-bridge');
              treeContainer.classList.add('fade-unfocused');

              const startLocal = getLocalCenter(childCard, treeContainer, s.targetScale);
              const vizRect = vizArea.getBoundingClientRect();

              // If destination has saved state with item positions, use them
              let futureScale = 1.1;
              let futureBaseWidth = state.mode === 'discover' ? 80 : 128;
              let futureScreenX = vizRect.width / 2;
              let futureScreenY = vizRect.height / 2;

              if (state.itemLocations?.[bridgeId] && state.cameraX !== undefined && state.cameraY !== undefined && state.cameraScale !== undefined) {
                const futureLoc = state.itemLocations[bridgeId];
                futureScale = state.cameraScale;
                futureBaseWidth = futureLoc.w || futureBaseWidth;
                futureScreenX = state.cameraX + futureLoc.x * futureScale;
                futureScreenY = state.cameraY + futureLoc.y * futureScale;
              }

              const startBaseWidth = startLocal.w || 96;
              const flyScale = futureScale * (futureBaseWidth / startBaseWidth);
              const flyX = futureScreenX - startLocal.x * flyScale;
              const flyY = futureScreenY - startLocal.y * flyScale;

              s.setTarget(flyX, flyY, flyScale);

              setTimeout(() => {
                treeContainer.classList.remove('fade-unfocused');
                void treeContainer.offsetWidth;
                // Pre-snap target to saved camera position before cloning ghost.
                if (state.cameraX !== undefined && state.cameraY !== undefined && state.cameraScale !== undefined) {
                  useStore.getState().setTarget(state.cameraX, state.cameraY, state.cameraScale);
                }
                // Clone ghost (no fade yet) — auto-center effect will call startFade()
                createGhost?.();
                applyState();
              }, 400);
              return;
            }
          }
        }
      }

      // No bridge found or validation failed — just crossfade
      performCrossfade?.();
      applyState(); // uses default bridgeItemId = state.id (root)
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [treeContainerRef, vizAreaRef, performCrossfade, createGhost]);
}
