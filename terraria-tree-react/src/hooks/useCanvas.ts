import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';

/**
 * Imperative canvas physics engine for pan/zoom/pinch.
 * Uses refs for 60fps lerp animation — NOT React state.
 * Only `targetX/Y/Scale` bridge between React and the animation loop.
 */
export function useCanvas(
  vizAreaRef: React.RefObject<HTMLDivElement | null>,
  treeContainerRef: React.RefObject<HTMLDivElement | null>,
) {
  // Mutable animation state (never triggers re-renders)
  const currentX = useRef(0);
  const currentY = useRef(0);
  const currentScale = useRef(1);
  const isAnimating = useRef(false);

  // Pan state
  const isPanning = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isDraggingThresholdMet = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);

  // Pinch state
  const initialPinchDist = useRef<number | null>(null);
  const initialScaleRef = useRef(1);

  // Wheel debounce
  const wheelTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const saveCurrentState = useCallback(() => {
    // Will be wired to router.saveCurrentState in Phase 6
    // For now, just sync target values to store
    const store = useStore.getState();
    store.setTarget(
      useStore.getState().targetX,
      useStore.getState().targetY,
      useStore.getState().targetScale,
    );
  }, []);

  // --- Render Loop (15% lerp) ---
  const renderLoop = useCallback(() => {
    const container = treeContainerRef.current;
    if (!container) return;

    const store = useStore.getState();

    // Snap mode: jump directly to target (no lerp animation)
    if (store.snapNextCamera) {
      currentX.current = store.targetX;
      currentY.current = store.targetY;
      currentScale.current = store.targetScale;
      store.setSnapNextCamera(false);
    } else {
      const factor = 0.15;
      currentX.current += (store.targetX - currentX.current) * factor;
      currentY.current += (store.targetY - currentY.current) * factor;
      currentScale.current += (store.targetScale - currentScale.current) * factor;
    }

    // GPU-accelerated transform
    container.style.transform = `translate3d(${currentX.current}px, ${currentY.current}px, 0) scale(${currentScale.current})`;

    const diff =
      Math.abs(store.targetX - currentX.current) +
      Math.abs(store.targetY - currentY.current) +
      Math.abs(store.targetScale - currentScale.current);

    // Performance mode during fast movement
    if (isPanning.current || initialPinchDist.current || diff > 1.5) {
      container.style.pointerEvents = 'none';
      container.classList.add('fast-panning');
      // Track whether this is a manual drag vs camera fly for image hiding logic
      if (isPanning.current || initialPinchDist.current) {
        container.classList.add('user-dragging');
      } else {
        container.classList.remove('user-dragging');
      }
    } else {
      container.style.pointerEvents = '';
      container.classList.remove('fast-panning');
      container.classList.remove('user-dragging');
    }

    // Settle when visually negligible
    if (diff < 0.001 && !isPanning.current && !initialPinchDist.current) {
      currentX.current = store.targetX;
      currentY.current = store.targetY;
      currentScale.current = store.targetScale;
      container.style.transform = `translate3d(${currentX.current}px, ${currentY.current}px, 0) scale(${currentScale.current})`;
      isAnimating.current = false;
    } else {
      requestAnimationFrame(renderLoop);
    }
  }, [treeContainerRef]);

  const triggerAnimation = useCallback(() => {
    if (!isAnimating.current) {
      isAnimating.current = true;
      requestAnimationFrame(renderLoop);
    }
  }, [renderLoop]);

  // Expose for external use (transitions, resetView, etc.)
  const getAnimationState = useCallback(
    () => ({
      currentX: currentX.current,
      currentY: currentY.current,
      currentScale: currentScale.current,
      isAnimating: isAnimating.current,
      isPanning: isPanning.current,
      isDraggingThresholdMet: isDraggingThresholdMet.current,
    }),
    [],
  );

  const setCurrentPosition = useCallback(
    (x: number, y: number, scale: number) => {
      currentX.current = x;
      currentY.current = y;
      currentScale.current = scale;
    },
    [],
  );

  // --- Attach all event listeners ---
  useEffect(() => {
    const vizArea = vizAreaRef.current;
    const container = treeContainerRef.current;
    if (!vizArea || !container) return;

    const store = useStore.getState;

    // --- Wheel Zoom ---
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vizArea.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const s = store();
      const localX = (mouseX - s.targetX) / s.targetScale;
      const localY = (mouseY - s.targetY) / s.targetScale;
      const zoomDelta = -e.deltaY * 0.0015;

      const newScale = Math.max(0.02, Math.min(s.targetScale + zoomDelta, 4));
      const newX = mouseX - localX * newScale;
      const newY = mouseY - localY * newScale;
      s.setTarget(newX, newY, newScale);
      triggerAnimation();

      clearTimeout(wheelTimeout.current);
      wheelTimeout.current = setTimeout(saveCurrentState, 300);
    };

    // --- Drag Prevention ---
    const onDragStart = (e: Event) => e.preventDefault();

    // --- Mouse Pan ---
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.no-pan')) return;
      isPanning.current = true;
      isDraggingThresholdMet.current = false;
      dragStartX.current = e.clientX;
      dragStartY.current = e.clientY;
      const s = store();
      startX.current = e.clientX - s.targetX;
      startY.current = e.clientY - s.targetY;
      vizArea.classList.add('grabbing');
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      if (Math.hypot(e.clientX - dragStartX.current, e.clientY - dragStartY.current) > 5) {
        isDraggingThresholdMet.current = true;
      }
      e.preventDefault();
      store().setTarget(
        e.clientX - startX.current,
        e.clientY - startY.current,
        store().targetScale,
      );
      triggerAnimation();
    };

    const onMouseUp = () => {
      if (!isPanning.current) return;
      isPanning.current = false;
      vizArea.classList.remove('grabbing');
      container.style.pointerEvents = '';
      triggerAnimation();
      saveCurrentState();
    };

    // --- Touch Pan/Pinch ---
    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest('.no-pan')) return;
      if (e.touches.length === 1) {
        isPanning.current = true;
        isDraggingThresholdMet.current = false;
        dragStartX.current = e.touches[0].clientX;
        dragStartY.current = e.touches[0].clientY;
        const s = store();
        startX.current = e.touches[0].clientX - s.targetX;
        startY.current = e.touches[0].clientY - s.targetY;
        vizArea.classList.add('grabbing');
      } else if (e.touches.length === 2) {
        isPanning.current = false;
        initialPinchDist.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        initialScaleRef.current = store().targetScale;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest('.no-pan') && !isPanning.current && !initialPinchDist.current) return;
      e.preventDefault();

      if (isPanning.current && e.touches.length === 1) {
        if (Math.hypot(e.touches[0].clientX - dragStartX.current, e.touches[0].clientY - dragStartY.current) > 5) {
          isDraggingThresholdMet.current = true;
        }
        store().setTarget(
          e.touches[0].clientX - startX.current,
          e.touches[0].clientY - startY.current,
          store().targetScale,
        );
        triggerAnimation();
      } else if (e.touches.length === 2 && initialPinchDist.current) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const zoomDelta = currentDist / initialPinchDist.current;

        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = vizArea.getBoundingClientRect();
        const mouseX = midX - rect.left;
        const mouseY = midY - rect.top;
        const s = store();
        const localX = (mouseX - s.targetX) / s.targetScale;
        const localY = (mouseY - s.targetY) / s.targetScale;

        const newScale = Math.max(0.02, Math.min(initialScaleRef.current * zoomDelta, 4));
        if (Number.isFinite(newScale)) {
          s.setTarget(mouseX - localX * newScale, mouseY - localY * newScale, newScale);
          triggerAnimation();
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isPanning.current = false;
        initialPinchDist.current = null;
        vizArea.classList.remove('grabbing');
        container.style.pointerEvents = '';
        triggerAnimation();
        saveCurrentState();
      } else if (e.touches.length === 1) {
        initialPinchDist.current = null;
        isPanning.current = true;
        const s = store();
        startX.current = e.touches[0].clientX - s.targetX;
        startY.current = e.touches[0].clientY - s.targetY;
      }
    };

    // Attach
    vizArea.addEventListener('wheel', onWheel, { passive: false });
    vizArea.addEventListener('dragstart', onDragStart);
    vizArea.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    vizArea.addEventListener('touchstart', onTouchStart, { passive: false });
    vizArea.addEventListener('touchmove', onTouchMove, { passive: false });
    vizArea.addEventListener('touchend', onTouchEnd);

    return () => {
      vizArea.removeEventListener('wheel', onWheel);
      vizArea.removeEventListener('dragstart', onDragStart);
      vizArea.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      vizArea.removeEventListener('touchstart', onTouchStart);
      vizArea.removeEventListener('touchmove', onTouchMove);
      vizArea.removeEventListener('touchend', onTouchEnd);
      clearTimeout(wheelTimeout.current);
    };
  }, [vizAreaRef, treeContainerRef, triggerAnimation, saveCurrentState]);

  // Auto-trigger animation when store targets change
  useEffect(() => {
    let prevTX = useStore.getState().targetX;
    let prevTY = useStore.getState().targetY;
    let prevTS = useStore.getState().targetScale;

    return useStore.subscribe((state) => {
      if (state.targetX !== prevTX || state.targetY !== prevTY || state.targetScale !== prevTS) {
        prevTX = state.targetX;
        prevTY = state.targetY;
        prevTS = state.targetScale;
        triggerAnimation();
      }
    });
  }, [triggerAnimation]);

  return { triggerAnimation, getAnimationState, setCurrentPosition };
}
