/**
 * Policy Diff's WebMCP tools. Definitions only; handlers live in Differ.js.
 *
 * The pipeline is three stages, and the first is not a model: the diff is
 * computed from the text before anything runs, so the agents can only explain
 * changes that exist. The tools expose that same order.
 */

export const POLICYDIFF_SAMPLES = ["nimbus-terms"];

export const POLICYDIFF_TOOLS = [
  {
    name: "policydiff_get_state",
    description:
      "Read what is loaded and how far the run got: character counts for the old and new versions, the current pipeline stage, the deterministic diff stats once computed, how many substantive changes were found, and whether a ranked result is ready.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "policydiff_set_documents",
    description:
      "Paste the two versions of a policy into the page. Pass the full text of each; the diff is paragraph-based, so keep paragraph breaks. Either field may be omitted to leave what is already in that box.",
    inputSchema: {
      type: "object",
      properties: {
        oldText: { type: "string", description: "Full text of the earlier version." },
        newText: { type: "string", description: "Full text of the revised version." },
      },
    },
  },
  {
    name: "policydiff_load_sample",
    description:
      "Fill both boxes with a built-in sample pair: two versions of a cloud storage terms of service where an arbitration clause and a price rise are buried among renumbering. Use it to demo without documents in hand.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          enum: POLICYDIFF_SAMPLES,
          description: "Which sample pair. Only nimbus-terms exists today; defaults to it.",
        },
      },
    },
  },
  {
    name: "policydiff_run",
    description:
      "Run the pipeline on the loaded documents: a deterministic paragraph diff, then an extractor that drops renumbering noise and merges hunks into logical changes, then an explainer that translates each change into plain language and ranks it by real-world impact. Needs a Gemini key and both documents. Takes 20 to 60 seconds; the stages show on the page as they complete. Returns the stats, the changes with their exact before and after wording, and the ranked verdicts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "policydiff_get_result",
    description:
      "The last run's result: headline, who the revision favors, and every change ranked by impact with severity, plain-language explanation, who it lands on, what to do about it, and the verbatim wording. Fails if no run has finished.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "policydiff_reset",
    description:
      "Clear the result and go back to the two text boxes. The documents themselves stay loaded, so this is safe to call before a new run with edited text.",
    inputSchema: { type: "object", properties: {} },
  },
];
