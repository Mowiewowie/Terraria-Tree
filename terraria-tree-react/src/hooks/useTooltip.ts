import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import type { ItemRecord, Recipe } from '../types/items';

export interface TooltipData {
  itemData: ItemRecord | GroupTooltipData | null;
  extraRecipe: Recipe | null;
  visible: boolean;
}

export interface GroupTooltipData {
  isGroupData: true;
  name: string;
  groupItems: string[];
  url: string;
}

export function isGroupTooltip(data: any): data is GroupTooltipData {
  return data?.isGroupData === true;
}

/**
 * Positions the tooltip element relative to the mouse cursor.
 * Direct DOM manipulation for smooth, lag-free tracking.
 */
function positionTooltipEl(el: HTMLElement, clientX: number, clientY: number) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const offset = 15;
  let l = clientX + offset;
  let t = clientY + offset;

  if (l + w > window.innerWidth) l = clientX - w - offset;
  if (t + h > window.innerHeight) t = clientY - h - offset;
  l = Math.max(10, l);
  t = Math.max(10, t);

  el.style.left = `${l}px`;
  el.style.top = `${t}px`;
}

/**
 * Hook for managing tooltip visibility and positioning.
 * Uses React state for content/visibility, direct DOM for position.
 * useLayoutEffect positions the tooltip after React commits DOM (before paint).
 */
export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipData>({
    itemData: null,
    extraRecipe: null,
    visible: false,
  });

  const tooltipElRef = useRef<HTMLDivElement | null>(null);
  const lineTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Position tooltip after React commits the Tooltip component's DOM.
  // Fires AFTER ref is assigned but BEFORE browser paints.
  useLayoutEffect(() => {
    if (tooltip.visible && tooltipElRef.current) {
      positionTooltipEl(tooltipElRef.current, mouseRef.current.x, mouseRef.current.y);
      tooltipElRef.current.style.visibility = 'visible';
    }
  }, [tooltip.visible, tooltip.itemData]);

  const show = useCallback(
    (e: React.MouseEvent | MouseEvent | { clientX: number; clientY: number }, data: ItemRecord | GroupTooltipData, extraRecipe?: Recipe | null) => {
      const clientX = 'clientX' in e ? e.clientX : 0;
      const clientY = 'clientY' in e ? e.clientY : 0;
      mouseRef.current = { x: clientX, y: clientY };
      setTooltip({
        itemData: data,
        extraRecipe: extraRecipe || null,
        visible: true,
      });
    },
    [],
  );

  const move = useCallback((e: React.MouseEvent | MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    if (tooltipElRef.current) {
      positionTooltipEl(tooltipElRef.current, e.clientX, e.clientY);
    }
  }, []);

  const hide = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
    if (tooltipElRef.current) {
      tooltipElRef.current.style.visibility = 'hidden';
    }
    clearTimeout(lineTimeoutRef.current);
  }, []);

  const showDelayed = useCallback(
    (e: React.MouseEvent | MouseEvent, data: ItemRecord | GroupTooltipData, delay = 300, extraRecipe?: Recipe | null) => {
      clearTimeout(lineTimeoutRef.current);
      const clientX = e.clientX;
      const clientY = e.clientY;
      lineTimeoutRef.current = setTimeout(() => {
        show({ clientX, clientY }, data, extraRecipe);
      }, delay);
    },
    [show],
  );

  const cancelDelayed = useCallback(() => {
    clearTimeout(lineTimeoutRef.current);
  }, []);

  return { tooltip, tooltipElRef, show, move, hide, showDelayed, cancelDelayed };
}
