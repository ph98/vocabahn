import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  fetchEnrichmentQuota,
  fetchMe,
  logout,
  updateInterests,
} from '../api';
import {
  STORY_TOPICS,
  TOPIC_CATEGORIES,
  isPresetTopic,
  type TopicCategoryId,
  type MainCefrLevel,
} from '@vocabahn/shared';
import { useSettings } from '../hooks/useSettings';
import { useToast } from './Toast';
import { Tab, TabList, TabPanel } from './Tabs';
import {
  Download,
  LogOut,
  Sparkles,
  BookOpen,
  Sliders,
  Compass,
  HardDrive,
  Check,
  Search,
  Plus,
  X,
  Tag,
  ChevronRight,
  Volume2,
  Bell,
  Keyboard,
  HelpCircle,
  ShieldCheck,
  Award,
  Zap,
} from 'lucide-react';
import { CEFRCalibrationCard } from './CEFRCalibrationCard';
import { CEFRBadge } from './CEFRBadge';
import { DailyReminderSection } from './DailyReminderSection';
import { SignInOptions } from './SignInOptions';

export type ProfileTab = 'overview' | 'interests' | 'preferences';

const MAIN_LEVEL_LIST: MainCefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const CEFR_LEVEL_METADATA: Record<MainCefrLevel, { name: string; range: string; desc: string }> = {
  A1: { name: 'Beginner', range: '500 – 1,000 words', desc: 'Basic greetings, daily needs and introductions.' },
  A2: { name: 'Elementary', range: '1,000 – 2,000 words', desc: 'Routine conversations, shopping and familiar environments.' },
  B1: { name: 'Intermediate', range: '2,000 – 4,000 words', desc: 'Work, travel, expressing opinions and independent discussions.' },
  B2: { name: 'Upper Intermediate', range: '4,000 – 8,000 words', desc: 'Complex texts, technical concepts and fluent conversation.' },
  C1: { name: 'Advanced', range: '8,000 – 15,000 words', desc: 'Spontaneous expression and nuanced, structured communication.' },
  C2: { name: 'Mastery', range: '15,000+ words', desc: 'Near-native comprehension and effortless German expression.' },
};

/**
 * Which subjects the learner's stories are drawn from when they don't pick one
 * per story — and what the scheduled morning story uses. Supports 35+ categorized
 * presets, custom topic tag creation, search filtering, and instant saving with toast feedback.
 */
export function InterestsSection({ interests }: { interests: string[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>(interests);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<TopicCategoryId | 'all'>('all');
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(interests);
  }, [interests]);

  const save = useMutation({
    mutationFn: (topics: string[]) => updateInterests(topics),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      setSelected(user.interests);
      const count = user.interests.length;
      const message =
        count === 0
          ? 'Reading interests cleared'
          : `Reading interests saved (${count} ${count === 1 ? 'subject' : 'subjects'})`;
      toast.success(message, { id: 'setting:interests' });
    },
    onError: () => {
      setSelected(interests);
      toast.error("Couldn't save reading interests", {
        id: 'setting:interests',
        description: 'Please check your connection and try again.',
      });
    },
  });

  const customTopics = useMemo(
    () => selected.filter((item) => !isPresetTopic(item)),
    [selected],
  );

  const toggleTopic = (slug: string) => {
    const isSelected = selected.some(
      (s) => s.toLowerCase() === slug.toLowerCase(),
    );
    let next: string[];
    if (isSelected) {
      next = selected.filter((s) => s.toLowerCase() !== slug.toLowerCase());
    } else {
      if (selected.length >= 50) {
        toast.info('Maximum 50 reading interests reached', { id: 'setting:interests-cap' });
        return;
      }
      next = [...selected, slug];
    }
    setSelected(next);
    save.mutate(next);
  };

  const handleAddCustomTopic = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = customInput.trim().replace(/[\r\n\t]+/g, ' ');
    if (!clean) return;

    if (clean.length < 2) {
      setCustomError('Topic must be at least 2 characters.');
      return;
    }
    if (clean.length > 40) {
      setCustomError('Topic must be 40 characters or fewer.');
      return;
    }
    if (selected.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      setCustomError(`"${clean}" is already in your reading interests.`);
      return;
    }
    if (selected.length >= 50) {
      setCustomError('Maximum 50 reading interests reached.');
      return;
    }

    const matchedPreset = STORY_TOPICS.find(
      (t) =>
        t.label.toLowerCase() === clean.toLowerCase() ||
        t.slug.toLowerCase() === clean.toLowerCase(),
    );
    const nextItem = matchedPreset ? matchedPreset.slug : clean;
    const next = [...selected, nextItem];

    setCustomError(null);
    setCustomInput('');
    setSelected(next);
    save.mutate(next);
  };

  const handleRemoveCustom = (topic: string) => {
    const next = selected.filter((s) => s !== topic);
    setSelected(next);
    save.mutate(next);
  };

  const handleClearAll = () => {
    setSelected([]);
    save.mutate([]);
  };

  const filteredPresets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return STORY_TOPICS.filter((topic) => {
      const matchesCategory = activeCategory === 'all' || topic.category === activeCategory;
      if (!matchesCategory) return false;
      if (!query) return true;
      return (
        topic.label.toLowerCase().includes(query) ||
        topic.slug.toLowerCase().includes(query)
      );
    });
  }, [search, activeCategory]);

  return (
    <div className="space-y-6">
      {/* Header with counter and clear action */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-800/80 pb-4">
        <div>
          <h2 className="text-base font-bold text-surface-100 flex items-center gap-2">
            <BookOpen aria-hidden className="size-5 text-indigo-400" />
            Curate Reading Interests
          </h2>
          <p className="mt-1 text-xs text-surface-400">
            {selected.length === 0
              ? 'Select from 35+ subjects or create custom tags. Daily and on-demand stories will be crafted from your choices.'
              : `Your stories will be drawn from ${selected.length} chosen ${selected.length === 1 ? 'subject' : 'subjects'}.`}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {selected.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={save.isPending}
                className="text-xs font-medium text-surface-400 hover:text-surface-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                Clear all
              </button>
              <span className="rounded-full bg-indigo-500/15 border border-indigo-500/30 px-3 py-1 text-xs font-semibold text-indigo-300">
                {selected.length} / 50 selected
              </span>
            </>
          )}
        </div>
      </div>

      {/* Custom Topic Input */}
      <div className="space-y-3 rounded-2xl border border-surface-800/80 bg-surface-950/40 p-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
            Add Specific / Niche Topic
          </h3>
          <p className="text-xs text-surface-500 mt-0.5">
            Interested in something specific? Add custom interests like &ldquo;Formula 1&rdquo;, &ldquo;Quantum Computing&rdquo;, or &ldquo;Specialty Coffee&rdquo;.
          </p>
        </div>
        <form onSubmit={handleAddCustomTopic} className="space-y-1.5">
          <label htmlFor="custom-topic-input" className="sr-only">
            Add specific topic
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Tag aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-surface-500" />
              <input
                id="custom-topic-input"
                type="text"
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  if (customError) setCustomError(null);
                }}
                placeholder="Add specific topic (e.g. Formula 1, Specialty Coffee, Cyberpunk)…"
                maxLength={40}
                disabled={save.isPending || selected.length >= 50}
                className="w-full rounded-xl border border-surface-700 bg-surface-900/80 py-2.5 pl-10 pr-3 text-xs sm:text-sm text-surface-200 placeholder:text-surface-500 focus:border-indigo-400 focus:bg-surface-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-colors disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!customInput.trim() || save.isPending || selected.length >= 50}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40 active:scale-[0.98]"
            >
              <Plus aria-hidden className="size-4" />
              <span>Add</span>
            </button>
          </div>
          {customError && (
            <p role="alert" className="text-xs text-accent-red font-medium">
              {customError}
            </p>
          )}
        </form>

        {/* Custom Topics List (if any) */}
        {customTopics.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-surface-800/60">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-400">
              Your Custom Topics ({customTopics.length})
            </span>
            <div className="flex flex-wrap gap-2">
              {customTopics.map((topic) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/15 py-1 pl-3 pr-2 text-xs font-semibold text-indigo-200 shadow-sm"
                >
                  <span aria-hidden="true">🏷️</span>
                  <span>{topic}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustom(topic)}
                    disabled={save.isPending}
                    aria-label={`Remove topic ${topic}`}
                    className="rounded p-0.5 text-indigo-300 hover:bg-indigo-500/30 hover:text-white transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search & Category Filter */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-surface-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search topics (e.g. history, space, cooking, football)…"
              className="w-full rounded-xl border border-surface-700 bg-surface-950/60 py-2 pl-10 pr-9 text-xs sm:text-sm text-surface-200 placeholder:text-surface-500 focus:border-indigo-400 focus:bg-surface-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear topic search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-surface-400 hover:text-surface-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div
          role="tablist"
          aria-label="Filter topic categories"
          className="flex flex-wrap gap-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
              activeCategory === 'all'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                : 'text-surface-400 bg-surface-900/60 border border-surface-800 hover:bg-surface-800 hover:text-surface-200'
            }`}
          >
            All Topics ({STORY_TOPICS.length})
          </button>
          {TOPIC_CATEGORIES.map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActiveCategory(cat.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                  isSelected
                    ? 'bg-indigo-500/20 text-indigo-200 font-semibold ring-1 ring-indigo-500/40 border border-indigo-500/30'
                    : 'text-surface-400 bg-surface-900/60 border border-surface-800 hover:bg-surface-800 hover:text-surface-200'
                }`}
              >
                <span aria-hidden="true">{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preset Topics Grid */}
      <fieldset disabled={save.isPending} className="mt-2">
        <legend className="sr-only">Reading interests topics</legend>

        {activeCategory === 'all' && !search ? (
          /* Grouped view */
          <div className="space-y-6">
            {TOPIC_CATEGORIES.map((cat) => {
              const catTopics = STORY_TOPICS.filter((t) => t.category === cat.id);
              const catSelectedCount = catTopics.filter((t) =>
                selected.some((s) => s.toLowerCase() === t.slug.toLowerCase()),
              ).length;

              return (
                <div key={cat.id} className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
                      <span aria-hidden="true">{cat.emoji}</span> {cat.label}
                    </span>
                    {catSelectedCount > 0 && (
                      <span className="rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                        {catSelectedCount} active
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {catTopics.map((topic) => {
                      const active = selected.some(
                        (s) => s.toLowerCase() === topic.slug.toLowerCase(),
                      );
                      return (
                        <button
                          key={topic.slug}
                          type="button"
                          onClick={() => toggleTopic(topic.slug)}
                          aria-pressed={active}
                          className={`group inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 active:scale-[0.98] ${
                            active
                              ? 'border-indigo-400/80 bg-indigo-500/20 text-indigo-100 shadow-sm shadow-indigo-500/15 ring-1 ring-indigo-500/40'
                              : 'border-surface-800 bg-surface-900/70 text-surface-300 hover:border-surface-700 hover:bg-surface-800 hover:text-surface-100'
                          }`}
                        >
                          <span aria-hidden="true" className="text-sm">{topic.emoji}</span>
                          <span>{topic.label}</span>
                          {active && <Check aria-hidden className="size-3.5 text-indigo-300 ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Filtered view */
          <div className="space-y-3">
            {filteredPresets.length > 0 ? (
              <div className="flex flex-wrap gap-2.5">
                {filteredPresets.map((topic) => {
                  const active = selected.some(
                    (s) => s.toLowerCase() === topic.slug.toLowerCase(),
                  );
                  return (
                    <button
                      key={topic.slug}
                      type="button"
                      onClick={() => toggleTopic(topic.slug)}
                      aria-pressed={active}
                      className={`group inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 active:scale-[0.98] ${
                        active
                          ? 'border-indigo-400/80 bg-indigo-500/20 text-indigo-100 shadow-sm shadow-indigo-500/15 ring-1 ring-indigo-500/40'
                          : 'border-surface-800 bg-surface-900/70 text-surface-300 hover:border-surface-700 hover:bg-surface-800 hover:text-surface-100'
                      }`}
                    >
                      <span aria-hidden="true" className="text-sm">{topic.emoji}</span>
                      <span>{topic.label}</span>
                      {active && <Check aria-hidden className="size-3.5 text-indigo-300 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-surface-700 p-6 text-center">
                <p className="text-xs text-surface-400">
                  No preset topic matches &ldquo;{search}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCustomInput(search.trim());
                    handleAddCustomTopic();
                  }}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20"
                >
                  <Plus aria-hidden className="size-3.5" />
                  Add &ldquo;{search.trim()}&rdquo; as a custom topic
                </button>
              </div>
            )}
          </div>
        )}
      </fieldset>

      {save.isError && (
        <p role="status" className="mt-2 text-xs text-accent-red font-medium">
          Couldn&apos;t save your interests. Please try again.
        </p>
      )}
    </div>
  );
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: user, isPending } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const { data: quota } = useQuery({
    queryKey: ['enrichment-quota'],
    queryFn: fetchEnrichmentQuota,
    enabled: !!user,
    staleTime: 30_000,
  });

  const signOut = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      queryClient.setQueryData(['me'], null);
      toast.info('Signed out', { id: 'auth:signout' });
    },
    onError: () => {
      toast.error("Couldn't sign out", {
        id: 'auth:signout',
        description: 'Please check your connection and try again.',
      });
    },
  });

  const { settings, updateSettings } = useSettings();
  const [showCalibration, setShowCalibration] = useState(false);

  const paramTab = searchParams.get('tab');
  const activeTab: ProfileTab =
    paramTab === 'interests' || paramTab === 'preferences' ? paramTab : 'overview';

  const handleSelectTab = (tab: ProfileTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 'overview') {
          next.delete('tab');
        } else {
          next.set('tab', tab);
        }
        return next;
      },
      { replace: true },
    );
  };

  const userMainLevel = user?.cefrLevel ? (user.cefrLevel.slice(0, 2) as MainCefrLevel) : null;
  const currentMeta = userMainLevel ? CEFR_LEVEL_METADATA[userMainLevel] : null;

  return (
    <section aria-label="Profile" className="w-full space-y-6 pb-12">
      {/* Top Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-surface-800/80 bg-gradient-to-br from-surface-900/95 via-surface-900/80 to-surface-950/95 p-6 sm:p-8 backdrop-blur-xl shadow-xl">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-sky-500/10 blur-3xl" />

        {isPending && <p aria-live="polite" className="text-sm text-surface-400">Checking session…</p>}
        {!isPending && !user && <SignInOptions />}

        {user && (
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4 sm:gap-5">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-16 rounded-2xl ring-2 ring-indigo-500/30 object-cover shadow-lg"
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-sky-500/25 ring-2 ring-indigo-500/30 text-xl font-bold text-indigo-200 shadow-lg">
                  {(user.name ?? user.email ?? 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-surface-100 truncate">
                    {user.name ?? user.email}
                  </h1>
                  {user.cefrLevel ? (
                    <CEFRBadge level={user.cefrLevel} size="md" />
                  ) : (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-accent-amber">
                      Level Not Set
                    </span>
                  )}
                </div>
                <p className="truncate text-xs sm:text-sm text-surface-400">{user.email}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-surface-800/80 px-2.5 py-0.5 text-[11px] font-medium text-surface-300 border border-surface-700/50">
                    <BookOpen aria-hidden className="size-3 text-indigo-400" />
                    {user.interests.length} {user.interests.length === 1 ? 'Reading Interest' : 'Reading Interests'}
                  </span>
                  {quota && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-surface-800/80 px-2.5 py-0.5 text-[11px] font-medium text-surface-300 border border-surface-700/50">
                      <Sparkles aria-hidden className="size-3 text-sky-400" />
                      {quota.used}/{quota.cap} AI Today
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => signOut.mutate()}
                disabled={signOut.isPending}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-surface-700 bg-surface-800/60 px-4 text-xs font-semibold text-surface-300 transition-colors hover:border-surface-600 hover:bg-surface-800 hover:text-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
              >
                <LogOut aria-hidden className="size-4" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {user && (
        <>
          {/* Top-Level Profile Tabs */}
          <TabList
            label="Profile sections"
            className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-surface-900/90 border border-surface-800/80 backdrop-blur-md shadow-sm overflow-x-auto"
          >
            <Tab
              id="profile-tab-overview"
              controls="profile-panel-overview"
              selected={activeTab === 'overview'}
              onSelect={() => handleSelectTab('overview')}
              className={`flex-1 min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white shrink-0 ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-surface-400 hover:bg-surface-800/60 hover:text-surface-200'
              }`}
            >
              <Compass aria-hidden className="size-4" />
              <span>Proficiency & Quota</span>
            </Tab>
            <Tab
              id="profile-tab-interests"
              controls="profile-panel-interests"
              selected={activeTab === 'interests'}
              onSelect={() => handleSelectTab('interests')}
              className={`flex-1 min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white shrink-0 ${
                activeTab === 'interests'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-surface-400 hover:bg-surface-800/60 hover:text-surface-200'
              }`}
            >
              <BookOpen aria-hidden className="size-4" />
              <span>Reading Interests</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  activeTab === 'interests'
                    ? 'bg-white/20 text-white'
                    : 'bg-indigo-500/15 text-indigo-300'
                }`}
              >
                {user.interests.length}
              </span>
            </Tab>
            <Tab
              id="profile-tab-preferences"
              controls="profile-panel-preferences"
              selected={activeTab === 'preferences'}
              onSelect={() => handleSelectTab('preferences')}
              className={`flex-1 min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white shrink-0 ${
                activeTab === 'preferences'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-surface-400 hover:bg-surface-800/60 hover:text-surface-200'
              }`}
            >
              <Sliders aria-hidden className="size-4" />
              <span>Preferences & Sync</span>
            </Tab>
          </TabList>

          {/* Tab 1: Proficiency & Quota */}
          <TabPanel
            id="profile-panel-overview"
            labelledBy="profile-tab-overview"
            className={activeTab === 'overview' ? 'block' : 'hidden'}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* CEFR Level & Roadmap Column (2/3 width) */}
              <div className="lg:col-span-2 space-y-6">
                <div className="rounded-3xl border border-surface-800/80 bg-gradient-to-br from-surface-900/90 via-surface-900/80 to-surface-950/90 p-6 sm:p-7 backdrop-blur-xl shadow-xl space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        <Compass aria-hidden className="size-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-surface-100">
                          CEFR German Proficiency
                        </h2>
                        <p className="text-xs text-surface-400">
                          Goethe-Institut & Profile Deutsch 12-sublevel calibration
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCalibration(!showCalibration)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-bold text-indigo-300 transition-colors hover:bg-indigo-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                    >
                      <Sparkles aria-hidden className="size-3.5" />
                      <span>{showCalibration ? 'Close Calibration' : user.cefrLevel ? 'Re-calibrate Level' : 'Calibrate Level'}</span>
                    </button>
                  </div>

                  {/* Visual CEFR Stepper / Progression */}
                  <div className="rounded-2xl border border-surface-800/80 bg-surface-950/60 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-surface-400">
                      <span>Level Roadmap</span>
                      {user.cefrLevel && (
                        <span className="text-indigo-400 font-bold">
                          Active: {user.cefrLevel} ({currentMeta?.name})
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                      {MAIN_LEVEL_LIST.map((lvl) => {
                        const isCurrentMain = userMainLevel === lvl;
                        return (
                          <div
                            key={lvl}
                            className={`flex flex-col items-center justify-center rounded-xl p-2 sm:p-2.5 text-center transition-all ${
                              isCurrentMain
                                ? 'bg-indigo-500/20 border-2 border-indigo-400 text-indigo-200 font-bold shadow-md shadow-indigo-500/15'
                                : 'bg-surface-900/60 border border-surface-800/80 text-surface-400'
                            }`}
                          >
                            <span className="text-xs sm:text-sm font-extrabold">{lvl}</span>
                            <span className="text-[10px] hidden sm:block text-surface-500 truncate w-full">
                              {CEFR_LEVEL_METADATA[lvl].name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {currentMeta && (
                      <p className="text-xs text-surface-300 pt-1">
                        <strong className="text-surface-100">{user.cefrLevel}:</strong> {currentMeta.desc} (approx. {currentMeta.range}).
                      </p>
                    )}
                  </div>

                  {/* Calibration explanation cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="flex items-start gap-3 rounded-2xl border border-surface-800/80 bg-surface-950/40 p-4">
                      <Zap aria-hidden className="size-5 shrink-0 text-indigo-400 mt-0.5" />
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-surface-200">
                          Smart Card Prioritization
                        </h3>
                        <p className="text-xs text-surface-400 leading-relaxed">
                          New card introductions prioritize vocabulary matching your frontier level, avoiding words that are too easy or advanced.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-surface-800/80 bg-surface-950/40 p-4">
                      <Award aria-hidden className="size-5 shrink-0 text-emerald-400 mt-0.5" />
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-surface-200">
                          Auto-Graduated Knowledge
                        </h3>
                        <p className="text-xs text-surface-400 leading-relaxed">
                          Lower-level filler words below your calibrated tier are automatically seeded as known so you never waste time drilling them.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inline Calibration Drawer */}
                {(showCalibration || !user.cefrLevel) && (
                  <div className="rounded-3xl overflow-hidden shadow-2xl">
                    <CEFRCalibrationCard
                      user={user}
                      onDismiss={user.cefrLevel ? () => setShowCalibration(false) : undefined}
                    />
                  </div>
                )}
              </div>

              {/* AI Enrichment & Account Column (1/3 width) */}
              <div className="space-y-6">
                {/* Daily AI Enrichment Card */}
                {quota && (
                  <div className="rounded-3xl border border-surface-800/80 bg-gradient-to-br from-surface-900/90 to-surface-950/90 p-6 backdrop-blur-xl shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles aria-hidden className="size-4 text-indigo-400" />
                        <h2 className="text-xs font-bold uppercase tracking-wider text-surface-400">
                          Daily AI Enrichment
                        </h2>
                      </div>
                      <span className="text-xs font-mono font-bold tabular-nums text-surface-200">
                        {quota.used} / {quota.cap}
                      </span>
                    </div>

                    <div
                      role="meter"
                      aria-label={`Enrichment usage: ${quota.used} of ${quota.cap} used today`}
                      aria-valuenow={quota.used}
                      aria-valuemin={0}
                      aria-valuemax={quota.cap}
                      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-800 border border-surface-700/50"
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 transition-all duration-300"
                        style={{ width: `${Math.min((quota.used / quota.cap) * 100, 100)}%` }}
                      />
                    </div>

                    <div className="space-y-2 text-xs text-surface-400">
                      <p className="text-surface-300">
                        Every unenriched dictionary entry you view is automatically enriched on demand:
                      </p>
                      <div className="space-y-1.5 text-[11px] text-surface-400 pl-1">
                        <div className="flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-indigo-400 shrink-0" />
                          <span>Definitions, grammatical gender &amp; IPA</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-sky-400 shrink-0" />
                          <span>Native ElevenLabs / Google TTS pronunciation</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span>Curated HD Unsplash visual associations</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-surface-500 pt-1 border-t border-surface-800/80">
                        Quota resets every day at 00:00 UTC.
                      </p>
                    </div>
                  </div>
                )}

                {/* Account & Security Summary */}
                <div className="rounded-3xl border border-surface-800/80 bg-gradient-to-br from-surface-900/90 to-surface-950/90 p-6 backdrop-blur-xl shadow-xl space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck aria-hidden className="size-4 text-emerald-400" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-surface-400">
                      Session &amp; Security
                    </h2>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-surface-800/60">
                      <span className="text-surface-400">Status</span>
                      <span className="font-semibold text-emerald-400 flex items-center gap-1">
                        <span className="size-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                        Active Learner
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-surface-800/60">
                      <span className="text-surface-400">Email</span>
                      <span className="font-mono text-surface-200 truncate max-w-[160px]">{user.email}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-surface-400">Session Cookie</span>
                      <span className="text-surface-300">Secure HTTP-Only</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>

          {/* Tab 2: Reading Interests */}
          <TabPanel
            id="profile-panel-interests"
            labelledBy="profile-tab-interests"
            className={activeTab === 'interests' ? 'block' : 'hidden'}
          >
            <div className="rounded-3xl border border-surface-800/80 bg-gradient-to-br from-surface-900/90 via-surface-900/80 to-surface-950/90 p-6 sm:p-8 backdrop-blur-xl shadow-xl">
              <InterestsSection interests={user.interests} />
            </div>
          </TabPanel>

          {/* Tab 3: Preferences & Sync */}
          <TabPanel
            id="profile-panel-preferences"
            labelledBy="profile-tab-preferences"
            className={activeTab === 'preferences' ? 'block' : 'hidden'}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Study & Audio Preferences Card */}
              <div className="rounded-3xl border border-surface-800/80 bg-gradient-to-br from-surface-900/90 to-surface-950/90 p-6 backdrop-blur-xl shadow-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Volume2 aria-hidden className="size-4 text-indigo-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-surface-400">
                    Review Audio &amp; Study
                  </h2>
                </div>

                <label className="flex items-center justify-between gap-4 cursor-pointer group rounded-2xl border border-surface-800 bg-surface-950/50 p-4 transition-colors hover:border-surface-700">
                  <div className="space-y-1">
                    <span className="text-sm font-semibold text-surface-100">
                      Autoplay audio during reviews
                    </span>
                    <p className="text-xs text-surface-400 leading-relaxed">
                      Play native German pronunciation automatically when flashcards are revealed.
                    </p>
                  </div>
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={settings.autoplayAudio}
                      onChange={(e) => updateSettings({ autoplayAudio: e.target.checked })}
                      aria-label="Autoplay audio during reviews"
                    />
                    <div
                      className={`h-6 w-11 rounded-full transition-colors ${
                        settings.autoplayAudio ? 'bg-indigo-600' : 'bg-surface-700 group-hover:bg-surface-600'
                      }`}
                    />
                    <div
                      className={`absolute top-1 left-1 size-4 rounded-full bg-white transition-transform ${
                        settings.autoplayAudio ? 'translate-x-5' : ''
                      }`}
                    />
                  </div>
                </label>
              </div>

              {/* Daily Reminder Card */}
              <div className="rounded-3xl border border-surface-800/80 bg-gradient-to-br from-surface-900/90 to-surface-950/90 p-6 backdrop-blur-xl shadow-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Bell aria-hidden className="size-4 text-indigo-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-surface-400">
                    Daily Push Reminder
                  </h2>
                </div>
                <div className="rounded-2xl border border-surface-800 bg-surface-950/50 p-4">
                  <DailyReminderSection />
                </div>
              </div>

              {/* Offline Data Pack */}
              <div className="rounded-3xl border border-surface-800/80 bg-gradient-to-br from-surface-900/90 to-surface-950/90 p-6 backdrop-blur-xl shadow-xl space-y-4">
                <div className="flex items-center gap-2">
                  <HardDrive aria-hidden className="size-4 text-indigo-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-surface-400">
                    Offline Dictionary Pack
                  </h2>
                </div>
                <div className="rounded-2xl border border-surface-800 bg-surface-950/50 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-surface-100">
                        Top 1,000 Enriched Entries
                      </p>
                      <p className="text-xs text-surface-400">
                        Full offline definitions, grammar tables, and translations in JSON.
                      </p>
                    </div>
                    <a
                      href="/api/v1/dictionary/offline-pack"
                      download="vocabahn-offline.json"
                      onClick={() => {
                        toast.info('Downloading offline dictionary pack…', { id: 'setting:offline-pack' });
                      }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-surface-700 bg-surface-800 px-4 py-2 text-xs font-bold text-surface-200 transition-colors hover:bg-surface-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white shrink-0"
                    >
                      <Download aria-hidden className="size-4" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Review Shortcuts Guide */}
              <div className="rounded-3xl border border-surface-800/80 bg-gradient-to-br from-surface-900/90 to-surface-950/90 p-6 backdrop-blur-xl shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Keyboard aria-hidden className="size-4 text-indigo-400" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-surface-400">
                      Keyboard Shortcuts
                    </h2>
                  </div>
                  <Link
                    to="/help"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <HelpCircle aria-hidden className="size-3.5" />
                    <span>User Guide</span>
                    <ChevronRight aria-hidden className="size-3.5" />
                  </Link>
                </div>

                <div className="rounded-2xl border border-surface-800 bg-surface-950/50 p-4">
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-surface-400">Flip card</span>
                      <kbd className="rounded-md bg-surface-800 border border-surface-700 px-2 py-0.5 text-[11px] font-mono text-surface-200">Space</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-surface-400">Replay audio</span>
                      <kbd className="rounded-md bg-surface-800 border border-surface-700 px-2 py-0.5 text-[11px] font-mono text-surface-200">R</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-surface-400">Rate 1 to 4</span>
                      <kbd className="rounded-md bg-surface-800 border border-surface-700 px-2 py-0.5 text-[11px] font-mono text-surface-200">1 – 4</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-surface-400">Toggle theme</span>
                      <kbd className="rounded-md bg-surface-800 border border-surface-700 px-2 py-0.5 text-[11px] font-mono text-surface-200">Ctrl+Shift+L</kbd>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>
        </>
      )}
    </section>
  );
}
