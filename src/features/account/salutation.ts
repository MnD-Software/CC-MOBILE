/** Uses the customer's device time, including their current timezone. */
export function salutation(date = new Date()) {
  const hour = date.getHours();
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}
