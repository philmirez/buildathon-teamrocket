import { geminiJSON, errorResponse, resolveKey } from "@/lib/gemini";

/**
 * Skill-gap pipeline, exposed as three stages so the client can show the
 * handoff between agents instead of one long opaque spinner.
 *
 *   extract -> two readers run in parallel, one on the posting and one on the
 *              resume, each producing structured claims
 *   diff    -> a judge reconciles the two lists into per-requirement verdicts
 *   plan    -> a planner turns the missing/partial items into 14 dated days
 *
 * Each stage only sees structured output from the last, never raw prose, which
 * is what keeps the verdicts anchored to evidence instead of vibes.
 */

const REQ_SCHEMA = {
  type: "object",
  properties: {
    role: { type: "string" },
    company: { type: "string" },
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          skill: { type: "string" },
          category: {
            type: "string",
            enum: ["language", "framework", "tool", "domain", "practice", "soft"],
          },
          importance: { type: "string", enum: ["must", "nice"] },
          evidence: { type: "string" },
        },
        required: ["skill", "category", "importance", "evidence"],
      },
    },
  },
  required: ["role", "requirements"],
};

const RESUME_SCHEMA = {
  type: "object",
  properties: {
    seniority: { type: "string" },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          skill: { type: "string" },
          strength: { type: "string", enum: ["strong", "some", "mentioned"] },
          evidence: { type: "string" },
        },
        required: ["skill", "strength", "evidence"],
      },
    },
  },
  required: ["skills"],
};

const DIFF_SCHEMA = {
  type: "object",
  properties: {
    fit: { type: "integer" },
    verdict: { type: "string" },
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          skill: { type: "string" },
          importance: { type: "string", enum: ["must", "nice"] },
          status: { type: "string", enum: ["have", "partial", "missing"] },
          why: { type: "string" },
          proof: { type: "string" },
        },
        required: ["skill", "importance", "status", "why"],
      },
    },
  },
  required: ["fit", "verdict", "results"],
};

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    focus: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "integer" },
          skill: { type: "string" },
          task: { type: "string" },
          proof: { type: "string" },
          resource: { type: "string" },
          url: { type: "string" },
          minutes: { type: "integer" },
        },
        required: ["day", "skill", "task", "proof", "resource", "minutes"],
      },
    },
  },
  required: ["focus", "days"],
};

const READ_JOB = `Extract what this posting actually requires.

- One row per distinct, checkable skill. Split bundles: "React/Node/GraphQL" is
  three rows.
- "must" means the posting states it as required. "nice" means preferred,
  bonus, or plus. When the posting is vague, judge by how central it is to the
  day-to-day work described.
- "evidence" is a short quote from the posting, in its own words.
- Ignore boilerplate: benefits, EEO statements, culture filler, "rockstar".
- Cap at the 14 requirements that most determine whether someone gets hired.`;

const READ_RESUME = `Extract what this candidate can demonstrably do.

- "strong" means they shipped or owned something with it, with a result or
  scope attached. "some" means real exposure without ownership. "mentioned"
  means it appears in a skills list with nothing behind it.
- "evidence" quotes or tightly paraphrases the line that backs it up.
- Credit skills that are clearly implied by the work described, not only ones
  named outright — someone who "built and deployed a Next.js dashboard on AWS"
  knows React whether or not the word appears.`;

const JUDGE = `You reconcile a job's requirements against a candidate's evidence.

For every requirement, decide:
- "have": the resume shows real, owned experience with it.
- "partial": adjacent or shallow experience — a related tool, or listed with no
  proof behind it. Say exactly what is thin.
- "missing": nothing in the resume supports it.

Rules:
- Judge only from the extracted evidence. Never assume unlisted skills.
- Treat genuine equivalents as "have" (Vue for React, Postgres for MySQL) and
  say so in "why".
- "why" is one specific sentence addressed to the candidate, in second person.
  "Your Vue work covers the component model, but the posting is React-specific."
  Not "Candidate lacks React."
- "proof" quotes the resume evidence when status is have or partial. Omit it
  when missing.
- "fit" is 0-100, weighted so a missing "must" costs far more than a missing
  "nice". Be honest — a real 40 is more useful than a polite 75.
- "verdict" is two sentences: where they actually stand, and the single thing
  that would move the needle most.`;

const PLANNER = `Build a 14-day plan that closes the biggest gaps.

Rules:
- Spend days in proportion to damage: missing "must" items first, then partial
  "must", then "nice". Ignore anything already "have".
- Consecutive days on one skill should build, not repeat. Day 3 assumes day 2.
- "task" is one concrete sitting's work, stated as an action. "Build a todo API
  with three endpoints and a Postgres table." Not "Learn backend basics."
- "proof" is the artifact that exists when the day is done — a repo, a deployed
  URL, a written page. Something they could link in an application.
- "resource" names a real, well-known, still-current source: official docs, MDN,
  freeCodeCamp, the framework's own tutorial, a standard textbook. "url" should
  be that source's canonical address — prefer a stable root over a deep link you
  are unsure of. Never invent a URL to fill the field; leave it empty instead.
- "minutes" is realistic for someone doing this after work: 45 to 120.
- Exactly 14 days, numbered 1 through 14.`;

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = resolveKey(body);
    const stage = body.stage;

    if (stage === "extract") {
      const job = (body.job || "").trim();
      const resume = (body.resume || "").trim();
      if (!job || !resume) {
        return Response.json({ error: "Paste both the posting and the resume." }, { status: 400 });
      }

      // Both readers are independent — run them at the same time.
      const [jobData, resumeData] = await Promise.all([
        geminiJSON({
          apiKey,
          system: READ_JOB,
          schema: REQ_SCHEMA,
          temperature: 0.2,
          prompt: `JOB POSTING:\n"""${job.slice(0, 14000)}"""`,
        }),
        geminiJSON({
          apiKey,
          system: READ_RESUME,
          schema: RESUME_SCHEMA,
          temperature: 0.2,
          prompt: `RESUME:\n"""${resume.slice(0, 14000)}"""`,
        }),
      ]);

      return Response.json({ job: jobData, resume: resumeData });
    }

    if (stage === "diff") {
      const diff = await geminiJSON({
        apiKey,
        system: JUDGE,
        schema: DIFF_SCHEMA,
        temperature: 0.3,
        prompt: `ROLE: ${body.job?.role || "the role"}

REQUIREMENTS:
${JSON.stringify(body.job?.requirements || [], null, 1)}

CANDIDATE EVIDENCE:
${JSON.stringify(body.resume?.skills || [], null, 1)}`,
      });
      return Response.json(diff);
    }

    if (stage === "plan") {
      const gaps = (body.results || []).filter((r) => r.status !== "have");
      if (!gaps.length) {
        return Response.json({
          focus: "No gaps to close — you meet every stated requirement.",
          days: [],
        });
      }
      const plan = await geminiJSON({
        apiKey,
        system: PLANNER,
        schema: PLAN_SCHEMA,
        temperature: 0.5,
        prompt: `TARGET ROLE: ${body.role || "the role"}

GAPS TO CLOSE:
${JSON.stringify(gaps, null, 1)}`,
      });
      return Response.json(plan);
    }

    return Response.json({ error: "Unknown stage." }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
