export const CELEBRATION_DURATION = 9000;
export function celebrationPieces(compact = false) {
  const count = compact ? 108 : 5000;
  return Array.from({ length: count }, (_, index) => ({
    index,
    side: index % 2,
    burst: 0,
    delay: (index % 7) * 0.004,
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
