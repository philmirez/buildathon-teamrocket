import { geminiJSON, errorResponse, resolveKey } from "@/lib/gemini";
import { buildHunks, diffStats, splitParagraphs } from "@/lib/textdiff";

/**
 * Plain-language policy diff.
 *
 * Stage 0 (`diff`) is deterministic and runs in this file, not in a model:
 * lib/textdiff.js computes the real paragraph-level hunks. The agents that
 * follow may only describe hunks that exist. That ordering is the whole
 * trustworthiness argument — a tool that invents a clause change is worse than
 * no tool, and an LLM asked to "diff" two long documents will absolutely
 * invent one.
 *
 * Stage 1 (`extract`) separates substance from noise: renumbering, version
 * strings and reformatting are dropped, and hunks belonging to one logical
 * change are merged.
 * Stage 2 (`explain`) translates each change and ranks it by who it actually
 * lands on. Ranking needs to see every change at once, so it is one call.
 */

const MAX_HUNKS = 60;
const MAX_HUNK_CHARS = 1400;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    docType: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: {
            type: "string",
            enum: [
              "rights",
              "money",
              "privacy",
              "data-retention",
              "legal-recourse",
              "access",
              "obligations",
              "other",
            ],
          },
          hunkIds: { type: "array", items: { type: "integer" } },
          before: { type: "string" },
          after: { type: "string" },
        },
        propertyOrdering: ["title", "category", "hunkIds", "before", "after"],
        required: ["title", "category", "hunkIds", "before", "after"],
      },
    },
  },
  required: ["docType", "changes"],
};

const EXPLAIN_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    direction: {
      type: "string",
      enum: ["favors_provider", "favors_user", "mixed", "neutral"],
    },
    ranked: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          plain: { type: "string" },
          meaning: { type: "string" },
          severity: { type: "string", enum: ["critical", "significant", "minor"] },
          direction: { type: "string", enum: ["worse", "better", "neutral"] },
          affected: { type: "array", items: { type: "string" } },
          action: { type: "string" },
        },
        propertyOrdering: [
          "id",
          "plain",
          "meaning",
          "severity",
          "direction",
          "affected",
          "action",
        ],
        required: ["id", "plain", "meaning", "severity", "direction", "affected"],
      },
    },
  },
  required: ["headline", "direction", "ranked"],
};

const EXTRACTOR = `You are given real, already-computed diff hunks between two versions of a
document. You do not decide what changed — that is settled. You decide what
MATTERS.

Rules:
- Drop pure noise entirely: version numbers, effective dates in a header,
  clause renumbering, reformatting, and rewording that leaves the obligation
  identical. If a hunk changes no one's rights, money, data, or options, it is
  noise.
- Merge hunks that are one logical change. A clause deleted in one hunk and
  replaced by two new hunks is ONE change — list all three ids in "hunkIds".
- "before" and "after" must be quoted VERBATIM from the hunks. Copy the exact
  wording, never a paraphrase — the reader uses these to check your work. If
  something is newly added, "before" is an empty string; if deleted, "after" is
  an empty string.
- "title" is 3 to 7 words naming the change neutrally: "Arbitration replaces
  court", "Free storage cut". Not a verdict.
- Order does not matter here. Another agent ranks them.
- Return every substantive change, even minor ones. Do not cap the list.`;

const EXPLAINER = `You explain document changes to someone with no legal training, and rank them
by who they actually land on.

Voice:
- Write to the reader as "you". Short sentences. No legal vocabulary unless you
  immediately define it in the same sentence.
- "plain" says what changed, concretely, in one or two sentences. Name real
  numbers. "Free storage drops from 15 GB to 5 GB." Not "storage terms were
  revised."
- "meaning" says what actually happens to the reader as a result — the
  consequence, not a restatement. For the storage cut: "If you are storing more
  than 5 GB today, you will have to delete files or start paying."
- Never soften a bad change, and never manufacture alarm about a neutral one.
  If a change genuinely helps the reader, say so.

Ranking:
- Order "ranked" hardest-hitting first. The top of this list is what someone
  reads if they read nothing else.
- Rank by real-world impact: how many people it touches, how much it costs
  them, whether they can undo it, and whether they would ever have noticed.
  A quietly added arbitration clause outranks a visible price rise, because the
  price rise is obvious and the arbitration clause is not.
- "severity": "critical" means it removes a right, costs real money, or changes
  what happens to their data. "significant" means a genuine practical effect.
  "minor" means technically real but low consequence.
- "affected" names the concrete groups this lands on — "anyone storing more
  than 5 GB", "users who would want to join a class action", "people who have
  already closed their account". Never "all users" unless it truly is everyone.
- "action" is the one thing the reader can do about it, if anything: an opt-out
  with its deadline, a setting to change, a decision to make. Omit it when
  there is genuinely nothing they can do.

"headline" is one sentence a person could say out loud summarizing the update.
"direction" judges who the revision as a whole favors.`;

export async function POST(req) {
  try {
    const body = await req.json();

    // ---------- stage 0: deterministic diff, no model ----------
    if (body.stage === "diff") {
      const a = splitParagraphs(body.oldText);
      const b = splitParagraphs(body.newText);
      if (!a.length || !b.length) {
        return Response.json({ error: "Both versions need text." }, { status: 400 });
      }
      const hunks = buildHunks(a, b);
      if (!hunks.length) {
        return Response.json({ hunks: [], stats: diffStats([]), identical: true });
      }
      return Response.json({ hunks, stats: diffStats(hunks) });
    }

    const apiKey = resolveKey(body);

    // ---------- stage 1: substance vs noise ----------
    if (body.stage === "extract") {
      const hunks = (body.hunks || []).slice(0, MAX_HUNKS).map((h) => ({
        id: h.id,
        kind: h.kind,
        before: String(h.before || "").slice(0, MAX_HUNK_CHARS),
        after: String(h.after || "").slice(0, MAX_HUNK_CHARS),
      }));

      const out = await geminiJSON({
        apiKey,
        system: EXTRACTOR,
        schema: EXTRACT_SCHEMA,
        temperature: 0.2,
        prompt: `DIFF HUNKS (computed deterministically — these are the only real changes):
${JSON.stringify(hunks, null, 1)}`,
      });
      return Response.json(out);
    }

    // ---------- stage 2: translate and rank ----------
    if (body.stage === "explain") {
      const changes = body.changes || [];
      if (!changes.length) {
        return Response.json({ headline: "No substantive changes.", direction: "neutral", ranked: [] });
      }

      const out = await geminiJSON({
        apiKey,
        system: EXPLAINER,
        schema: EXPLAIN_SCHEMA,
        temperature: 0.4,
        prompt: `DOCUMENT TYPE: ${body.docType || "policy document"}

CHANGES (the "id" is the array index — use it in "ranked"):
${JSON.stringify(changes.map((c, i) => ({ id: i, ...c })), null, 1)}`,
      });
      return Response.json(out);
    }

    return Response.json({ error: "Unknown stage." }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
