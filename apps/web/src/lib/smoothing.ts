export function smoothTowards(prev: number, target: number, dt: number, attack: number, release: number): number {
  const tau = target > prev ? attack : release;
  const k = 1 - Math.exp(-dt / Math.max(tau, 0.001));
  return prev + (target - prev) * k;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
