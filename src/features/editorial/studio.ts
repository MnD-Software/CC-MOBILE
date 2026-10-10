import type { Campaign } from "./content";

export function campaignExpiry(
  choice: "today" | "tomorrow" | "week",
  start: string,
  now = Date.now(),
) {
  const base = Math.max(Date.parse(start) || now, now);
  const kenya = new Date(base + 3 * 3600000);
  const days = choice === "today" ? 0 : choice === "tomorrow" ? 1 : 7;
  return new Date(
    Date.UTC(
      kenya.getUTCFullYear(),
      kenya.getUTCMonth(),
      kenya.getUTCDate() + days,
      20,
      59,
      59,
      999,
    ),
  ).toISOString();
}

export function newCampaign(now = Date.now()): Campaign {
  const starts_at = new Date(now).toISOString();
  return {
    id: "",
    revision: 0,
    title: "",
    description: "",
    image_url: "",
    video_url: "",
    starts_at,
    ends_at: campaignExpiry("tomorrow", starts_at, now),
    product_slugs: [],
    category_id: null,
    branch_names: [],
    member_only: false,
    published: false,
    template: "offer",
  };
}

export function storyStatus(story: Campaign, now = Date.now()) {
  if (!story.published) return "Draft";
  if (Date.parse(story.ends_at) <= now) return "Ended";
  return Date.parse(story.starts_at) > now ? "Scheduled" : "Live";
}

export function studioDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("en-KE", {
        timeZone: "Africa/Nairobi",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Choose a date";
}

export function storyProblem(
  story: Campaign,
  publish = false,
  now = Date.now(),
) {
  if (story.title.trim().length < 3)
    return "Give your story a name of at least 3 letters.";
  if (story.title.trim().length > 100)
    return "Keep the story name under 100 characters.";
  if (!story.image_url) return "Add a photo for your story.";
  if (!story.product_slugs.length && !story.category_id)
    return "Choose the cakes customers can shop.";
  if (story.product_slugs.length > 8)
    return "Choose up to 8 cakes for one story.";
  if (
    !Number.isFinite(Date.parse(story.starts_at)) ||
    !Number.isFinite(Date.parse(story.ends_at)) ||
    Date.parse(story.ends_at) <= Date.parse(story.starts_at)
  )
    return "Choose an end time after your story starts.";
  if (publish && Date.parse(story.ends_at) <= now)
    return "Choose a future end time before publishing.";
  return null;
}
