/** Every build. Home page, metadata, and cross-links all read from here. */
export const BUILDS = [
  {
    slug: "ambient",
    video: "/videos/web/ambientscribe.mp4",
    poster: "/videos/web/posters/ambientscribe.jpg",
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
    tier: "devfest",
    name: "Skill Gap",
    icon: "target",
    tint: "var(--yellow-3)",
    problem: "Rejections tell you no, never what you were missing.",
    solution: "Diff a resume against a posting, get the concrete gap and a two-week plan.",
  },
];

/**
 * Display tiers for the home page, ranked. Order here is the order on screen.
 * `note` is only set where there is something real to warn about.
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
    name: "Team Rocket's Low Tier Build Concepts",
    note: "Image generation is billing-gated, so this one needs a paid Gemini key to run end to end.",
  },
];

/** Builds grouped by tier, in tier order. Empty tiers are dropped. */
export const byTier = () =>
  TIERS.map((tier) => ({ ...tier, builds: BUILDS.filter((b) => b.tier === tier.id) })).filter(
    (t) => t.builds.length > 0
  );

export const bySlug = (slug) => BUILDS.find((b) => b.slug === slug);
