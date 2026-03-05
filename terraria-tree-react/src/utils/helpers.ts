// --- Universal utility functions ---

/** Detects touch-primary devices (phones/tablets) */
export function isMobileUX(): boolean {
  return window.matchMedia('(any-pointer: coarse) and (hover: none)').matches;
}

/** Converts raw knockback value to human-readable text */
export function getFriendlyKnockback(value: number): string {
  if (value === 0) return 'No knockback';
  if (value <= 1.4) return 'Extremely weak knockback';
  if (value <= 2.9) return 'Very weak knockback';
  if (value <= 3.9) return 'Weak knockback';
  if (value <= 5.9) return 'Average knockback';
  if (value <= 6.9) return 'Strong knockback';
  if (value <= 7.9) return 'Very strong knockback';
  if (value <= 8.9) return 'Extremely strong knockback';
  if (value <= 10.9) return 'Godly knockback';
  return 'Insane knockback';
}

/** Converts raw use time value to human-readable speed text */
export function getFriendlyUseTime(value: number): string {
  if (value <= 8) return 'Insanely fast speed';
  if (value <= 15) return 'Very fast speed';
  if (value <= 20) return 'Fast speed';
  if (value <= 25) return 'Average speed';
  if (value <= 30) return 'Slow speed';
  if (value <= 35) return 'Very slow speed';
  if (value <= 45) return 'Extremely slow speed';
  return 'Snail speed';
}

/** Responsive minimum zoom scale based on viewport width */
export function getMinScale(): number {
  const w = window.innerWidth;
  if (w < 600) return 0.4;
  if (w < 1024) return 0.35;
  return 0.3;
}
