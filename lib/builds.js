/**
 * Every build. Home page, metadata, and cross-links all read from here.
 *
 * `recorded` is the capture date of that build's walkthrough, shown under the
 * player. The clips are a record of what shipped at the buildathon, not living
 * documentation — dating them means the app can keep moving without the videos
 * quietly becoming lies. Re-cut a clip, change its date here.
 *
 * `wip` marks a build with no walkthrough yet; the home page shows the note in
 * place of the watch card.
 *
 * `agentVideo`, `agentPoster` and `agentRecorded` are a second clip of an AI
 * agent driving the build through WebMCP. When set, the home page's third
 * card plays it instead of linking to the tool catalog.
 *
 * `updated` marks a build that has moved on since the buildathon. It does two
 * jobs from one place: it advertises the work on the home page, and it turns
 * the walkthrough's date stamp into an explanation of why the video and the
 * live build no longer match. Drop the key when a clip is re-cut. `note` is a
 * lowercase fragment — it is read mid-sentence under the player.
 */
export const BUILDS = [
  {
    slug: "ambient",
    video: "/videos/web/ambientscribe.mp4",
    poster: "/videos/web/posters/ambientscribe.jpg",
    recorded: "August 28, 2026",
    tier: "top",
    name: "Ambient Scribe",
    icon: "mic",
    tint: "var(--blue-3)",
    problem: "Manual note organization creates friction, so ideas get lost.",
    solution: "Talk. An agent writes the note, names it, and files it in a folder it decides on.",
  },
  {
    slug: "captured",
    tier: "low",
    // No walkthrough yet. Shown on the home page in place of the watch card.
    wip: "Image generation is billing-gated, so it needs a paid Gemini key to run end to end.",
    name: "Captured Memory",
    icon: "image",
    tint: "#8B5CF6",
    problem: "Long stories without visuals are hard to stay inside of.",
    solution: "Paste a chapter or transcript. Scenes illustrate themselves as you move through them.",
  },
  {
    slug: "taskboard",
    video: "/videos/web/taskboard.mp4",
    poster: "/videos/web/posters/taskboard.jpg",
    recorded: "August 28, 2026",
    agentVideo: "/videos/web/taskboard-agent.mp4",
    agentPoster: "/videos/web/posters/taskboard-agent.jpg",
    agentRecorded: "September 3, 2026",
    tier: "top",
    name: "Taskboard",
    icon: "board",
    tint: "var(--green-3)",
    problem: "Deadline-free tasks quietly get neglected inside a bigger goal.",
    solution: "A kanban board whose cards are the segments of one progress bar.",
  },
  {
    slug: "this-or-that",
    video: "/videos/web/thisorthat.mp4",
    poster: "/videos/web/posters/thisorthat.jpg",
    recorded: "August 28, 2026",
    updated: {
      on: "September 1, 2026",
      note: "the swipes decide the table now, and setup asks one thing at a time",
    },
    tier: "top",
    name: "This or That",
    icon: "fork",
    tint: "var(--red-3)",
    problem: "Groups stall out deciding where to eat.",
    solution: "Swipe through spots. The overlap across everyone's picks is the answer.",
  },
  {
    slug: "policy-diff",
    video: "/videos/web/policy.mp4",
    poster: "/videos/web/posters/policy.jpg",
    recorded: "August 28, 2026",
    tier: "devfest",
    name: "Policy Diff",
    icon: "scales",
    tint: "#0EA5A5",
    problem: "Policy changes are real, constant, and buried in legal language.",
    solution: "Diff two versions, get the change in plain words, ranked by who it actually lands on.",
  },
  {
    slug: "skill-gap",
    video: "/videos/web/skillgap.mp4",
    poster: "/videos/web/posters/skillgap.jpg",
    recorded: "August 28, 2026",
    tier: "devfest",
    name: "Skill Gap",
    icon: "target",
    tint: "var(--yellow-3)",
    problem: "Rejections tell you no, never what you were missing.",
    solution: "Diff a resume against a posting, get the concrete gap and a two-week plan.",
  },
];

/**
 * Tiers, ranked. The home page no longer sections by tier (the tabbed player
 * covers every build with a walkthrough, and the rest are listed as still in
 * progress); the ids remain on each build and are reported by list_builds.
 */
export const TIERS = [
  {
    id: "top",
    name: "Team Rocket's Top Tier Build Concepts",
  },
  {
    id: "devfest",
    name: "DevFest DC 2026 Buildathon: Build Concepts",
  },
  {
    id: "low",
    name: "Still in the workshop",
  },
];

/** Builds grouped by tier, in tier order. Empty tiers are dropped. */
export const byTier = () =>
  TIERS.map((tier) => ({ ...tier, builds: BUILDS.filter((b) => b.tier === tier.id) })).filter(
    (t) => t.builds.length > 0
  );

export const bySlug = (slug) => BUILDS.find((b) => b.slug === slug);
