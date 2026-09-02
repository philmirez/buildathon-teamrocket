import { BUILDS } from "./builds";
import { TASKBOARD_TOOLS } from "@/app/taskboard/tools";
import { THISORTHAT_FORMS, THISORTHAT_TOOLS } from "@/app/this-or-that/tools";
import { POLICYDIFF_TOOLS } from "@/app/policy-diff/tools";
import { SKILLGAP_TOOLS } from "@/app/skill-gap/tools";
import { AMBIENT_TOOLS } from "@/app/ambient/tools";

/**
 * Every WebMCP tool this site registers, as plain data.
 *
 * The Shell registers SITE_TOOLS on every page; each build registers its own
 * group while its page is mounted. The /webmcp page and the README's tool
 * catalog are both rendered from this file, so the documented surface and
 * the registered surface cannot drift apart.
 */

const SLUGS = BUILDS.map((b) => b.slug);

export const SITE_TOOLS = [
  {
    name: "list_builds",
    description:
      "List every build on this site: slug, name, the problem it solves, its approach, tier and URL. Call this first to learn what the site can do, then open_build to reach one.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "open_build",
    description:
      "Navigate to a build's page. Each build registers its own tools only while its page is open, so call this before trying to use them.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", enum: SLUGS, description: "The build's slug, from list_builds." },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_setup_status",
    description:
      "Check which API keys the user has stored in this browser, as booleans only. Every build needs a Gemini key; Places and Pixabay only improve imagery. Key values are never readable or settable through tools.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "open_key_panel",
    description:
      "Open the key panel so the user can type an API key themselves. Use it when get_setup_status shows a missing key. Never ask the user to paste a key into the chat.",
    inputSchema: { type: "object", properties: {} },
  },
];

/** Tool groups in the order they appear on /webmcp. `build` is a slug from lib/builds. */
export const CATALOG = [
  { id: "site", title: "Every page", note: "Registered by the Shell, so they exist wherever the agent lands.", tools: SITE_TOOLS },
  { id: "taskboard", build: "taskboard", tools: TASKBOARD_TOOLS },
  { id: "this-or-that", build: "this-or-that", tools: [...THISORTHAT_TOOLS, ...THISORTHAT_FORMS] },
  { id: "policy-diff", build: "policy-diff", tools: POLICYDIFF_TOOLS },
  { id: "skill-gap", build: "skill-gap", tools: SKILLGAP_TOOLS },
  { id: "ambient", build: "ambient", tools: AMBIENT_TOOLS },
];

export const ALL_TOOLS = CATALOG.flatMap((g) => g.tools);
