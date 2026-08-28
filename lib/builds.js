/** The five builds. Home page, metadata, and cross-links all read from here. */
export const BUILDS = [
  {
    slug: "ambient",
    name: "Ambient Scribe",
    icon: "mic",
    tint: "var(--blue-3)",
    problem: "Manual note organization creates friction, so ideas get lost.",
    solution: "Talk. An agent writes the note, names it, and files it in a folder it decides on.",
  },
  {
    slug: "captured",
    name: "Captured Memory",
    icon: "image",
    tint: "#8B5CF6",
    problem: "Long stories without visuals are hard to stay inside of.",
    solution: "Paste a chapter or transcript. Scenes illustrate themselves as you move through them.",
  },
  {
    slug: "taskboard",
    name: "Taskboard",
    icon: "board",
    tint: "var(--green-3)",
    problem: "Deadline-free tasks quietly get neglected inside a bigger goal.",
    solution: "A kanban board whose cards are the segments of one progress bar.",
  },
  {
    slug: "this-or-that",
    name: "This or That",
    icon: "fork",
    tint: "var(--red-3)",
    problem: "Groups stall out deciding where to eat.",
    solution: "Swipe through spots. The overlap across everyone's picks is the answer.",
  },
  {
    slug: "skill-gap",
    name: "Skill Gap",
    icon: "target",
    tint: "var(--yellow-3)",
    problem: "Rejections tell you no, never what you were missing.",
    solution: "Diff a resume against a posting, get the concrete gap and a two-week plan.",
  },
];

export const bySlug = (slug) => BUILDS.find((b) => b.slug === slug);
