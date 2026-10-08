export function celebrationReminderDate(
  month: number,
  day: number,
  now = new Date(),
) {
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(2000, month, 0).getDate()
  )
    throw new Error("Invalid celebration date");
  const occurrence = (year: number) =>
    new Date(
      year,
      month - 1,
      Math.min(day, new Date(year, month, 0).getDate()),
      9,
      0,
      0,
      0,
    );
  let next = occurrence(now.getFullYear());
  if (next.getTime() <= now.getTime()) next = occurrence(now.getFullYear() + 1);
  const reminder = new Date(next);
  reminder.setDate(reminder.getDate() - 7);
  return reminder.getTime() > now.getTime()
    ? reminder
    : new Date(now.getTime() + 60_000);
}
