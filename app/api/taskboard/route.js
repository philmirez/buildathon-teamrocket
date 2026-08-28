import { geminiJSON, errorResponse, resolveKey } from "@/lib/gemini";

/**
 * Two agents behind one board.
 *
 *   plan   -> decomposes a fuzzy goal into weighted tasks. Weight is the whole
 *             trick: it makes the progress bar honest, so finishing three
 *             trivial tasks does not look like real progress.
 *   triage -> reads the live board (stage + days idle + weight) and names what
 *             is being neglected. It consumes the planner's structured output,
 *             never the original prose.
 */

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    goal: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          weight: { type: "integer" },
        },
        propertyOrdering: ["title", "detail", "weight"],
        required: ["title", "detail", "weight"],
      },
    },
  },
  required: ["goal", "tasks"],
};

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    focus: { type: "string" },
    flags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          severity: { type: "string", enum: ["neglected", "watch", "ok"] },
          note: { type: "string" },
        },
        propertyOrdering: ["id", "severity", "note"],
        required: ["id", "severity", "note"],
      },
    },
  },
  required: ["headline", "focus", "flags"],
};

const PLANNER = `You break a goal into the tasks that actually complete it.

- Produce 5 to 9 tasks. Fewer than 5 hides the real work; more than 9 turns the
  board into a chore.
- Each task is a distinct deliverable someone could finish and point at. Order
  them so earlier tasks unblock later ones.
- "title" is 2 to 5 words. "detail" is one sentence saying what "done" means for
  that task specifically — the test someone could apply to check.
- "weight" is 1 to 5, sized by real effort, not importance. A 5 is several days
  of work; a 1 is under an hour. Vary them honestly: a plan where everything is
  a 3 is a plan nobody thought about.
- Never invent a deadline. These tasks deliberately have none.`;

const TRIAGE = `You watch a board of deadline-free tasks and say what is rotting.

The danger with no deadlines is that heavy, unpleasant tasks sit untouched while
easy ones churn. Your whole job is catching that.

For each task decide:
- "neglected": material weight, sitting idle long enough to threaten the goal.
  Heavy tasks stuck in "todo" are the classic case, and so is anything parked in
  "doing" without moving — started but abandoned is worse than never started.
- "watch": drifting, not yet a problem.
- "ok": done, or moving fine.

Rules:
- Weigh idle days against weight. A weight-5 task idle 9 days is far worse than
  a weight-1 task idle 20.
- Anything already "done" is always "ok".
- "note" is one specific sentence to the user, in second person, naming the real
  consequence. "Your schema migration is the heaviest thing here and hasn't
  moved in nine days — everything downstream is waiting on it." Not "This task
  is stale."
- "headline" is one blunt sentence about the board's overall health.
- "focus" names the single task to do next and why that one.
- Use the exact "id" given for each task.`;

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = resolveKey(body);

    if (body.stage === "plan") {
      const goal = (body.goal || "").trim();
      if (!goal) return Response.json({ error: "Describe the goal first." }, { status: 400 });

      const plan = await geminiJSON({
        apiKey,
        system: PLANNER,
        schema: PLAN_SCHEMA,
        temperature: 0.6,
        prompt: `GOAL: ${goal}${body.horizon ? `\nROUGH TIMEFRAME: ${body.horizon}` : ""}`,
      });

      // Clamp weights so one bad value cannot distort the progress bar.
      plan.tasks = (plan.tasks || []).map((t) => ({
        ...t,
        weight: Math.max(1, Math.min(5, Number(t.weight) || 3)),
      }));

      return Response.json(plan);
    }

    if (body.stage === "triage") {
      const tasks = body.tasks || [];
      if (!tasks.length) return Response.json({ headline: "Nothing on the board yet.", focus: "", flags: [] });

      const triage = await geminiJSON({
        apiKey,
        system: TRIAGE,
        schema: TRIAGE_SCHEMA,
        temperature: 0.4,
        prompt: `GOAL: ${body.goal || "(unstated)"}

BOARD:
${JSON.stringify(tasks, null, 1)}`,
      });
      return Response.json(triage);
    }

    return Response.json({ error: "Unknown stage." }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
