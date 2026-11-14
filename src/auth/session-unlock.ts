const unlocked = new Map<string, number>();
export function markAccountUnlocked(owner: string) {
  unlocked.set(owner, Date.now());
}
export function recentlyUnlocked(owner: string) {
  return Date.now() - (unlocked.get(owner) || 0) < 15000;
}
export function forgetAccountUnlock(owner: string) {
  unlocked.delete(owner);
}
