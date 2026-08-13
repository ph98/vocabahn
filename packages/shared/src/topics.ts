import { z } from 'zod';

// The subjects a learner can ask a story to be about. A learner picks the ones
// they would read about anyway, and stories are drawn from real German coverage
// of that subject — the reason to open the app is the subject, not the drill.
//
// This list is the contract: `Story.topic` and `User.interests` hold these
// slugs, and the API maps each slug to its feeds (`sources.constants.ts`).
// Not every topic has feeds; one without them still generates, just unsourced.

export const STORY_TOPICS = [
  { slug: 'news', label: 'News', emoji: '📰' },
  { slug: 'football', label: 'Football', emoji: '⚽' },
  { slug: 'sport', label: 'Sport', emoji: '🏅' },
  { slug: 'technology', label: 'Technology', emoji: '💻' },
  { slug: 'science', label: 'Science', emoji: '🔬' },
  { slug: 'business', label: 'Business', emoji: '📈' },
  { slug: 'world', label: 'World', emoji: '🌍' },
  { slug: 'germany', label: 'Germany', emoji: '🇩🇪' },
  { slug: 'everyday', label: 'Everyday life', emoji: '☕' },
] as const;

export type StoryTopic = (typeof STORY_TOPICS)[number]['slug'];

export const STORY_TOPIC_SLUGS = STORY_TOPICS.map((t) => t.slug) as StoryTopic[];

export const storyTopicSchema = z.enum(
  STORY_TOPICS.map((t) => t.slug) as [StoryTopic, ...StoryTopic[]],
);

export function findTopic(slug: string | null | undefined) {
  if (!slug) return null;
  return STORY_TOPICS.find((t) => t.slug === slug) ?? null;
}

/** Display label for a slug, falling back to the raw slug for unknown values. */
export function topicLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return findTopic(slug)?.label ?? slug;
}
