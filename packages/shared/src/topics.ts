import { z } from 'zod';

// The subjects a learner can ask a story to be about. A learner picks the ones
// they would read about anyway, and stories are drawn from real German coverage
// of that subject — the reason to open the app is the subject, not the drill.
//
// This list is the contract: `Story.topic` and `User.interests` hold these
// slugs, and the API maps each slug to its feeds (`sources.constants.ts`).
// Topics without feeds generate grounded, contextual fiction around the topic.

export const TOPIC_CATEGORIES = [
  { id: 'news-society', label: 'News & Society', emoji: '🏛️' },
  { id: 'science-tech', label: 'Science & Tech', emoji: '🔬' },
  { id: 'culture-arts', label: 'Culture & Arts', emoji: '🎭' },
  { id: 'lifestyle-leisure', label: 'Lifestyle & Leisure', emoji: '☕' },
  { id: 'sports-fitness', label: 'Sports & Fitness', emoji: '🏅' },
] as const;

export type TopicCategoryId = (typeof TOPIC_CATEGORIES)[number]['id'];

export interface TopicDefinition {
  slug: string;
  label: string;
  emoji: string;
  category: TopicCategoryId;
}

export const STORY_TOPICS: readonly TopicDefinition[] = [
  // News & Society
  { slug: 'news', label: 'News', emoji: '📰', category: 'news-society' },
  { slug: 'germany', label: 'Germany', emoji: '🇩🇪', category: 'news-society' },
  { slug: 'world', label: 'World', emoji: '🌍', category: 'news-society' },
  { slug: 'politics', label: 'Politics', emoji: '🏛️', category: 'news-society' },
  { slug: 'business', label: 'Business', emoji: '📈', category: 'news-society' },
  { slug: 'economy', label: 'Economy & Finance', emoji: '💶', category: 'news-society' },
  { slug: 'society', label: 'Society & Trends', emoji: '👥', category: 'news-society' },
  { slug: 'law', label: 'Law & Justice', emoji: '⚖️', category: 'news-society' },

  // Science & Tech
  { slug: 'technology', label: 'Technology', emoji: '💻', category: 'science-tech' },
  { slug: 'science', label: 'Science', emoji: '🔬', category: 'science-tech' },
  { slug: 'space', label: 'Space & Astronomy', emoji: '🚀', category: 'science-tech' },
  { slug: 'ai', label: 'AI & Computing', emoji: '🤖', category: 'science-tech' },
  { slug: 'nature', label: 'Nature & Wildlife', emoji: '🌿', category: 'science-tech' },
  { slug: 'climate', label: 'Climate & Ecology', emoji: '🌱', category: 'science-tech' },
  { slug: 'psychology', label: 'Psychology & Mind', emoji: '🧠', category: 'science-tech' },
  { slug: 'medicine', label: 'Health & Medicine', emoji: '🩺', category: 'science-tech' },

  // Culture & Arts
  { slug: 'culture', label: 'Arts & Culture', emoji: '🎭', category: 'culture-arts' },
  { slug: 'literature', label: 'Books & Literature', emoji: '📚', category: 'culture-arts' },
  { slug: 'cinema', label: 'Movies & Series', emoji: '🎬', category: 'culture-arts' },
  { slug: 'music', label: 'Music', emoji: '🎵', category: 'culture-arts' },
  { slug: 'history', label: 'History', emoji: '🏺', category: 'culture-arts' },
  { slug: 'philosophy', label: 'Philosophy & Ideas', emoji: '💭', category: 'culture-arts' },
  { slug: 'architecture', label: 'Architecture & Design', emoji: '🏛️', category: 'culture-arts' },

  // Lifestyle & Leisure
  { slug: 'everyday', label: 'Everyday Life', emoji: '☕', category: 'lifestyle-leisure' },
  { slug: 'food', label: 'Cooking & Food', emoji: '🍳', category: 'lifestyle-leisure' },
  { slug: 'travel', label: 'Travel & Places', emoji: '✈️', category: 'lifestyle-leisure' },
  { slug: 'gaming', label: 'Gaming & Esports', emoji: '🎮', category: 'lifestyle-leisure' },
  { slug: 'fashion', label: 'Fashion & Style', emoji: '👕', category: 'lifestyle-leisure' },
  { slug: 'gardening', label: 'Gardening & Plants', emoji: '🌻', category: 'lifestyle-leisure' },
  { slug: 'automotive', label: 'Cars & Mobility', emoji: '🚗', category: 'lifestyle-leisure' },

  // Sports & Fitness
  { slug: 'football', label: 'Football', emoji: '⚽', category: 'sports-fitness' },
  { slug: 'sport', label: 'General Sports', emoji: '🏅', category: 'sports-fitness' },
  { slug: 'fitness', label: 'Fitness & Workout', emoji: '💪', category: 'sports-fitness' },
  { slug: 'cycling', label: 'Cycling', emoji: '🚴', category: 'sports-fitness' },
  { slug: 'outdoors', label: 'Hiking & Outdoors', emoji: '🏔️', category: 'sports-fitness' },
  { slug: 'motorsport', label: 'Motorsport & Racing', emoji: '🏎️', category: 'sports-fitness' },
] as const;

export type StoryTopic = (typeof STORY_TOPICS)[number]['slug'];

export const STORY_TOPIC_SLUGS = STORY_TOPICS.map((t) => t.slug) as StoryTopic[];

export const storyTopicSchema = z.string().min(1).max(50);

export function findTopic(slug: string | null | undefined): TopicDefinition | null {
  if (!slug) return null;
  return STORY_TOPICS.find((t) => t.slug === slug) ?? null;
}

export function isPresetTopic(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return STORY_TOPIC_SLUGS.includes(slug as StoryTopic);
}

/** Display label for a slug or custom topic string, falling back cleanly for unknown values. */
export function topicLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const found = findTopic(slug);
  if (found) return found.label;

  const clean = slug.replace(/^custom:/i, '').trim();
  if (!clean) return slug;

  // If slug is hyphenated/underscored, turn into Title Case
  if (/^[a-z0-9_-]+$/.test(clean)) {
    return clean
      .split(/[-_]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return clean;
}

/** Emoji icon for a preset topic or custom interest tag. */
export function topicEmoji(slug: string | null | undefined): string {
  if (!slug) return '✨';
  const found = findTopic(slug);
  return found?.emoji ?? '🏷️';
}

/** Category id for a slug, or null for custom topics. */
export function topicCategory(slug: string | null | undefined): TopicCategoryId | null {
  if (!slug) return null;
  return findTopic(slug)?.category ?? null;
}
