export const CELEBRATION_DURATION = 9000;
export function celebrationPieces(compact = false) {
  const perBurst = compact ? 36 : 140;
  return Array.from({ length: perBurst * 3 }, (_, index) => ({
    index,
    side: index % 2,
    burst: Math.floor(index / perBurst),
    delay: Math.floor(index / perBurst) * 0.17 + (index % 7) * 0.004,
    energy: 0.58 + ((index * 17) % 35) / 100,
    color: [
      "#EC008C",
      "#EAC46B",
      "#FFF1C2",
      "#51C4DC",
      "#F58FC5",
      "#BE87C5",
      "#A7E2B8",
    ][index % 7],
  }));
}
export function gracefulFall(t: number, rise: number, height: number) {
  if (t <= 0.28) return -rise * (1 - (1 - t / 0.28) ** 3);
  return -rise + (height + rise) * ((t - 0.28) / 0.72) ** 1.4;
}
