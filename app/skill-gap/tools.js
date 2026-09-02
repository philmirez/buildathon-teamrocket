/**
 * Skill Gap's WebMCP tools. Definitions only; handlers live in GapFinder.js.
 *
 * Three stages, three requests: two readers extract claims from the posting
 * and the resume, a judge scores each requirement, a planner turns the gaps
 * into fourteen days. skillgap_analyze runs all three and returns the lot.
 */

export const SKILLGAP_SAMPLES = ["meridian-frontend"];

export const SKILLGAP_TOOLS = [
  {
    name: "skillgap_get_state",
    description:
      "Read what is loaded and where the run is: character counts for the posting and the resume, the current stage, the detected role, the fit score, how many requirements are not yet covered, and whether the plan is ready.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "skillgap_set_inputs",
    description:
      "Paste the job posting and the resume into the page. Pass full text; either field may be omitted to keep what is already in that box.",
    inputSchema: {
      type: "object",
      properties: {
        job: { type: "string", description: "Full text of the job posting." },
        resume: { type: "string", description: "Full text of the candidate's resume." },
      },
    },
  },
  {
    name: "skillgap_load_sample",
    description:
      "Fill both boxes with a built-in pair: a Frontend Engineer II posting at a health company and a resume that is close but not quite there. Use it to demo without documents in hand.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          enum: SKILLGAP_SAMPLES,
          description: "Which sample pair. Only meridian-frontend exists today; defaults to it.",
        },
      },
    },
  },
  {
    name: "skillgap_analyze",
    description:
      "Run the analysis on the loaded posting and resume: readers extract the requirements and the candidate's claims, a judge marks each requirement have, partial or missing with the evidence, and a planner writes a fourteen-day plan that closes the gaps. Needs a Gemini key and both texts. Takes 30 to 90 seconds; stages show on the page. Returns the role, fit score, verdict, every gap (status other than have) and the plan.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "skillgap_get_result",
    description:
      "The last analysis: role, fit score out of 100, verdict, every requirement with its status and evidence, and the day-by-day plan with time per day and suggested resources. Fails if no analysis has finished.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "skillgap_reset",
    description:
      "Clear the result and go back to the two text boxes. The posting and resume stay loaded, so it is safe to call before re-running with edits.",
    inputSchema: { type: "object", properties: {} },
  },
];
