/** Stable within a daypart; changes naturally with the Kenya calendar. */
export function clubWelcomeCopy(date = new Date()) {
  const local = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const hour = local.getUTCHours();
  const day = local.getUTCDay();
  const part = hour < 12 ? 0 : hour < 17 ? 1 : 2;
  const titles = [
    [
      "A fresh week. A sweeter start.",
      "Make a little room for joy.",
      "Your next happy moment starts here.",
      "A little sweetness goes a long way.",
      "Make today worth celebrating.",
      "The weekend deserves a treat.",
      "Slow mornings. Sweet plans.",
    ],
    [
      "A little treat for your afternoon.",
      "Turn a small moment into something sweet.",
      "Something good to look forward to.",
      "Good company. Great cake.",
      "Your weekend starts with a little joy.",
      "Big smiles start with little moments.",
      "Make this Sunday a little sweeter.",
    ],
    [
      "End the day on a sweet note.",
      "Good things are worth looking forward to.",
      "Plan a little joy for tomorrow.",
      "Make your next gathering memorable.",
      "Here is to a sweeter weekend.",
      "For the moments you will talk about tomorrow.",
      "A sweet finish to your week.",
    ],
  ];
  return {
    title: titles[part][day === 0 ? 6 : day - 1],
    message:
      part === 0
        ? "Your Club card, points and treats, ready for the day ahead."
        : part === 1
          ? "Every celebration brings you closer to your next Club reward."
          : "Your points stay with you. Your next celebration is waiting.",
    label: `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]} ${["morning", "afternoon", "evening"][part]}`,
  };
}
