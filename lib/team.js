/**
 * The team, credited on the home page.
 *
 * `photo` is a path under /public. LinkedIn exposes no public endpoint for
 * profile images — pulling them would need OAuth partner access and would
 * breach their terms — so headshots are supplied as files. Drop one in
 * public/team/ and set the path here; until then the card renders a monogram,
 * so the section looks finished either way.
 */
export const TEAM = [
  {
    name: "Phil Ramirez",
    github: "philmirez",
    linkedin: "https://www.linkedin.com/in/philmirez/",
    photo: null,
    tint: "var(--blue-3)",
  },
  {
    name: "Allen Pang",
    github: "aap7763",
    linkedin: "https://www.linkedin.com/in/allenanpang/",
    photo: null,
    tint: "var(--green-3)",
  },
  {
    name: "Mimi Pomephimkham",
    github: "mimersheree",
    linkedin: "https://www.linkedin.com/in/mimiphim/",
    photo: null,
    tint: "#8B5CF6",
  },
  {
    name: "Ray Gil",
    github: "roboray01",
    linkedin: "https://www.linkedin.com/in/raymundogil/",
    photo: null,
    tint: "var(--red-3)",
  },
];

/** "Phil Ramirez" -> "PR" */
export const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
