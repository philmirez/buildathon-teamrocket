/**
 * Ambient Scribe's WebMCP tools. Definitions only; handlers live in Scribe.js.
 *
 * The one action that matters is capture: hand over a braindump and the
 * scribe agent decides the folders, writes the notes and files them. Delete
 * and clear are the destructive pair and both wait on a human click.
 */

export const AMBIENT_TOOLS = [
  {
    name: "ambient_list_workspace",
    description:
      "List the workspace: every folder with its id and name, and every note with its id, title, folder and when it was last updated. Ids are what ambient_get_note and ambient_delete_note take.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "ambient_capture",
    description:
      "File a braindump the same way a spoken or typed one is filed: a scribe agent reads the text against the current workspace, decides which folders and notes it belongs in, writes each note in full, and files it, showing each step on screen. Pass raw, unstructured text; do not pre-organize it. Needs a Gemini key.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "What the user said or wrote, verbatim. Several topics in one go is the normal case.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "ambient_get_note",
    description: "Read one note in full by id (from ambient_list_workspace) and bring it up on screen.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The note id, which looks like n_abc123." },
      },
      required: ["id"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "ambient_delete_note",
    description:
      "Delete one note by id. Destructive: the page shows a confirm bar naming the note and this call waits until the user presses Confirm. Tell the user to look for it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The note id, which looks like n_abc123." },
      },
      required: ["id"],
    },
    annotations: { destructiveHint: true, consequentialHint: true },
  },
  {
    name: "ambient_clear_workspace",
    description:
      "Delete every folder and note. Destructive: waits for the user to press Confirm on the page.",
    inputSchema: { type: "object", properties: {} },
    annotations: { destructiveHint: true, consequentialHint: true },
  },
];
