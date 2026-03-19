import { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { isMobileUX } from '../utils/helpers';
import { clearMobileTooltip } from '../components/Cards/ItemCard';
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
    clearMobileTooltip();
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

  // Auto-dismiss tooltip on mobile when tapping outside item cards and tooltip
  useEffect(() => {
    if (!tooltip.visible || !isMobileUX()) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.tooltip') || target.closest('.item-card')) return;
      hide();
    };
    // setTimeout(0) avoids catching the current tap that opened the tooltip
    const timeout = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(timeout); document.removeEventListener('click', handler); };
  }, [tooltip.visible, hide]);

  return { tooltip, tooltipElRef, show, move, hide, showDelayed, cancelDelayed };
}
