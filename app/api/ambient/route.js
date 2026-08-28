import { geminiJSON, geminiText, errorResponse, resolveKey } from "@/lib/gemini";


/**
 * Two-pass scribe agent.
 *
 * Pass 1 (planner) reads the raw transcript plus the current workspace and
 * decides the filing structure — which folders exist, which notes to create or
 * extend. It only writes a short brief per note.
 * Pass 2 (writers) run in parallel, each turning one brief into a finished
 * note body. Splitting it this way keeps the planner focused on organization
 * instead of burning its attention on prose, which is what made it file badly.
 */

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "create_folder",
              "create_note",
              "append_note",
              "rename_note",
              "move_note",
              "delete_note",
            ],
          },
          name: { type: "string" },
          folder: { type: "string" },
          title: { type: "string" },
          newTitle: { type: "string" },
          noteId: { type: "string" },
          brief: { type: "string" },
        },
        required: ["type"],
      },
    },
  },
  required: ["reply", "actions"],
};

const PLANNER_SYSTEM = `You are the organizing half of an ambient note-taking agent.

The user just spoke freely. They will never file anything by hand — every folder
and note name is your decision, and you must be decisive rather than asking them.

Rules:
- Choose folders that describe the user's actual life or work themes, not
  generic buckets. "Roof repair" beats "Home". "Q3 hiring" beats "Work".
- Reuse an existing folder whenever the content plausibly belongs there. Only
  create a new folder when nothing fits.
- One coherent topic per note. If the user covered three unrelated things in one
  breath, emit three notes in different folders.
- If the transcript clearly continues an existing note, append to it (pass its
  [id] as noteId) instead of creating a near-duplicate.
- Only delete or rename when the user explicitly asks for it.
- "brief" is an instruction to the writer agent: say what the note must capture,
  including the concrete details, names, numbers and dates from the transcript.
  Do not write the note body yourself.
- "reply" is one short sentence, as if spoken back. No preamble, no lists.
- If the transcript is empty or pure filler, return an empty actions array and
  say so in the reply.`;

const WRITER_SYSTEM = `You write a single note body, in Markdown.

- Start directly with content. Never repeat the note title as a heading.
- Preserve every concrete detail from the transcript: names, numbers, dates,
  amounts, decisions.
- Use "- " bullets for lists and "## " for sections, but only when the content
  genuinely has structure. Short thoughts stay as one tight paragraph.
- Write in the user's own voice and tense. Do not editorialize, do not add
  advice they did not ask for, and never invent facts to pad it out.
- Surface any explicit commitment as a "## Next" section with checkbox bullets
  ("- [ ] ..."). Omit the section entirely when there is nothing to do.`;

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = resolveKey(body);
    const transcript = (body.transcript || "").trim();
    const tree = body.tree || "(empty)";

    if (!transcript) {
      return Response.json({ reply: "I didn't catch anything.", actions: [] });
    }

    // --- Pass 1: plan the filing structure -------------------------------
    const plan = await geminiJSON({
      apiKey,
      system: PLANNER_SYSTEM,
      schema: PLAN_SCHEMA,
      temperature: 0.4,
      prompt: `CURRENT WORKSPACE:\n${tree}\n\nTRANSCRIPT:\n"""${transcript}"""`,
    });

    const actions = Array.isArray(plan.actions) ? plan.actions : [];

    // --- Pass 2: write the bodies, in parallel ---------------------------
    const needsBody = (a) => a.type === "create_note" || a.type === "append_note";

    const written = await Promise.all(
      actions.map(async (action) => {
        if (!needsBody(action)) return action;
        try {
          const content = await geminiText({
            apiKey,
            system: WRITER_SYSTEM,
            temperature: 0.6,
            prompt: `NOTE TITLE: ${action.title || "(continuing an existing note)"}
WHAT THIS NOTE MUST CAPTURE: ${action.brief || "Everything relevant in the transcript."}

FULL TRANSCRIPT FOR REFERENCE:
"""${transcript}"""

Write only the note body.`,
          });
          return { ...action, content };
        } catch {
          // A failed writer must not sink the whole turn — fall back to the
          // brief so the note still lands with something useful in it.
          return { ...action, content: action.brief || transcript };
        }
      })
    );

    return Response.json({ reply: plan.reply || "Filed.", actions: written });
  } catch (err) {
    return errorResponse(err);
  }
}
