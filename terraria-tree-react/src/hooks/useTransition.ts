import { useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';

/**
 * Hook providing IK (Inverse Kinematics) transition logic.
 * Manages ghost container crossfade between old and new tree content.
 *
 * Split into two phases to avoid race conditions:
 *   1. createGhost() — clone old tree, hide container (no fade yet)
 *   2. startFade()   — sync ghost position, begin opacity crossfade
 *
 * The auto-center effect calls startFade() AFTER finalizing the camera
 * position, ensuring ghost and container are at the same position when
 * the opacity transition begins. This eliminates flash/jitter.
 */
export function useTransition(
  treeContainerRef: React.RefObject<HTMLDivElement | null>,
) {
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  /** Clean up any existing ghost + timeout */
  const cleanupGhost = useCallback(() => {
    if (ghostRef.current?.parentNode) {
      ghostRef.current.parentNode.removeChild(ghostRef.current);
      ghostRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = undefined;
    }
  }, []);

  /**
   * Phase 1: Clone current content as a ghost overlay.
   * Hides the container (opacity 0) but does NOT start the fade.
   * Call startFade() later after camera position is finalized.
   */
  const createGhost = useCallback(() => {
    const container = treeContainerRef.current;
    if (!container) return;

    cleanupGhost();

    const hasContent = container.innerHTML.trim() !== '';
    if (!hasContent) return;

    // Snap container to exact target position before cloning.
    // The render loop may still be mid-lerp; snap to 100% to prevent
    // position mismatch in the ghost.
    const s = useStore.getState();
    container.style.transform = `translate3d(${s.targetX}px, ${s.targetY}px, 0) scale(${s.targetScale})`;

    // Also snap the render loop's current position so it doesn't
    // overwrite the container transform in the next frame.
    s.setSnapNextCamera(true);

    // Create ghost clone
    const ghost = container.cloneNode(true) as HTMLDivElement;
    ghost.id = 'ghostContainer';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '5';
    ghost.style.transition = 'none';
    ghost.style.opacity = '1';
    container.parentNode?.insertBefore(ghost, container);
    ghostRef.current = ghost;

    // Hide container (new content will render here invisibly)
    container.style.transition = 'none';
    container.style.opacity = '0';
  }, [treeContainerRef, cleanupGhost]);

  /**
   * Phase 2: Start the opacity crossfade.
   * Must be called AFTER camera position is finalized (snapped).
   * Syncs ghost transform to match container before fading.
   */
  const startFade = useCallback(() => {
    const ghost = ghostRef.current;
    const container = treeContainerRef.current;
    if (!container) return;

    // Safety: if no ghost exists (already cleaned up or never created),
    // just ensure container is visible to prevent stuck invisible state.
    if (!ghost) {
      container.style.transition = '';
      container.style.opacity = '1';
      return;
    }

    // Don't sync ghost position to container — for item clicks, the ghost
    // was cloned at the fly-end position while the container was snapped to
    // the new tree's resetView. Syncing would cause a visible jump (flash).
    // Instead, let the crossfade dissolve between the two positions.
    // For back/forward, positions already match (both at saved state).

    // Start opacity crossfade
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.style.transition = 'opacity 0.6s ease';
        ghost.style.transition = 'opacity 0.6s ease';
        ghost.style.opacity = '0';
        container.style.opacity = '1';

        transitionTimeoutRef.current = setTimeout(() => {
          if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
          ghostRef.current = null;
          container.style.transition = '';
        }, 650);
      });
    });
  }, [treeContainerRef]);

  /**
   * Combined: create ghost + start fade immediately.
   * Use for non-hero transitions (search, mode switch) where
   * the camera position doesn't change.
   */
  const performCrossfade = useCallback((skipFade = false) => {
    if (skipFade) {
      cleanupGhost();
      return;
    }
    createGhost();
    startFade();
  }, [createGhost, startFade, cleanupGhost]);

  return { performCrossfade, createGhost, startFade, cleanup: cleanupGhost };
}
