/**
 * Captured Memory's WebMCP tools. Definitions only; handlers live in Reader.js.
 *
 * Scene splitting runs on any Gemini key; the images need a key with billing
 * on, and degrade to stock or to an explicit message without one. The tools
 * report that state rather than hiding it.
 */

export const CAPTURED_TOOLS = [
  {
    name: "captured_get_state",
    description:
      "Read the reader: whether text is loaded and how long it is, whether the scenes have been found, the title, how many scenes there are, which one is showing, whether autoplay is on, and how many scenes already have an image.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "captured_load_text",
    description:
      "Paste a chapter or transcript into the page. At least 200 characters; a few pages works best. Replaces whatever is in the box.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The full passage, verbatim." },
      },
      required: ["text"],
    },
  },
  {
    name: "captured_load_sample",
    description: "Fill the box with the built-in sample chapter, a short piece about a late ferry crossing.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "captured_start",
    description:
      "Find the scenes in the loaded text and open the reader on the first one: a splitter picks the visual beats and quotes each passage verbatim, an art director fixes one style for the whole piece, and images render one scene ahead as you move. Needs a Gemini key; images need billing on that key. Returns the title and the list of scenes.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "captured_go_to_scene",
    description: "Jump the reader to a scene by its 1-based number, the same as clicking a tick on the track.",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "integer", minimum: 1, description: "Scene number, starting at 1." },
      },
      required: ["index"],
    },
  },
  {
    name: "captured_get_scene",
    description:
      "The scene on screen: its number, beat, passage, quote, and the image status (ready, rendering, or why there is none) with its source and credit.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "captured_set_playing",
    description: "Turn autoplay on or off. On, the reader advances one scene every nine seconds until the end.",
    inputSchema: {
      type: "object",
      properties: { playing: { type: "boolean", description: "true to play through, false to pause." } },
      required: ["playing"],
    },
  },
  {
    name: "captured_new_text",
    description:
      "Leave the reader and go back to the text box. The rendered images are dropped, so this waits for the user to press Confirm on the page.",
    inputSchema: { type: "object", properties: {} },
    annotations: { destructiveHint: true, consequentialHint: true },
  },
];
