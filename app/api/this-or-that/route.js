import { geminiJSON, errorResponse, resolveKey } from "@/lib/gemini";

/**
 * Two agents.
 *
 *   deck   -> proposes real restaurants for a place and a craving, with the one
 *             line that actually distinguishes each.
 *   decide -> reads every member's swipes and picks the table. This is the part
 *             a plain intersection cannot do: when nobody's likes overlap, it
 *             has to reason about whose constraint is hard and whose is a
 *             preference, and say so out loud.
 */

const DECK_SCHEMA = {
  type: "object",
  properties: {
    area: { type: "string" },
    places: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          cuisine: { type: "string" },
          neighborhood: { type: "string" },
          price: { type: "string", enum: ["$", "$$", "$$$", "$$$$"] },
          vibe: { type: "string" },
          hook: { type: "string" },
          dish: { type: "string" },
        },
        propertyOrdering: ["name", "cuisine", "neighborhood", "price", "vibe", "hook", "dish"],
        required: ["name", "cuisine", "neighborhood", "price", "vibe", "hook", "dish"],
      },
    },
  },
  required: ["area", "places"],
};

const DECIDE_SCHEMA = {
  type: "object",
  properties: {
    winner: { type: "string" },
    headline: { type: "string" },
    why: { type: "string" },
    tradeoff: { type: "string" },
    runnerUp: { type: "string" },
  },
  propertyOrdering: ["winner", "headline", "why", "tradeoff", "runnerUp"],
  required: ["winner", "headline", "why"],
};

const DECK = `You propose restaurants a group could actually go to tonight.

- Every place must be REAL and in or near the stated area. Use restaurants you
  genuinely know exist there. If you are not confident a place is real, leave it
  out — a short honest deck beats a padded invented one.
- Spread the deck across price points and cuisines so the swiping has real
  choices in it. Never fill it with eight versions of the same restaurant.
- Respect stated constraints absolutely. "Vegetarian" means every card works for
  a vegetarian. "Not sushi" means no sushi.
- "hook" is the one sentence that makes this place different from the others in
  the deck — the thing a local would actually say. Not marketing copy, and never
  a generic "great food and atmosphere".
- "vibe" is two or three words: "loud, communal tables".
- "dish" is the single thing to order.
- Produce 8 places.`;

const DECIDE = `You settle where a group is eating.

You get each member's yes and no swipes. Decide the table.

Rules:
- A place everyone swiped yes on wins almost automatically — say so plainly.
- When nothing is unanimous, do the real work: find the option with the widest
  yes coverage and no hard objection against it. Someone's dietary "no" is a
  hard constraint; someone's "too expensive" is softer; a mild preference is
  softest.
- Never pick a place a member explicitly swiped no on when an alternative
  exists. If you must, say whose no you are overriding and why.
- "headline" is one short line to read out to the table. Confident, not hedged.
- "why" is two sentences naming which members' picks this satisfies.
- "tradeoff" names who compromised and on what. Omit only when the pick was
  unanimous.
- "runnerUp" is the fallback if the winner is booked.
- "winner" and "runnerUp" must be exact names from the deck.`;

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = resolveKey(body);

    if (body.stage === "deck") {
      const where = (body.where || "").trim();
      if (!where) return Response.json({ error: "Where are you eating?" }, { status: 400 });

      const deck = await geminiJSON({
        apiKey,
        system: DECK,
        schema: DECK_SCHEMA,
        temperature: 0.9,
        prompt: `AREA: ${where}
CRAVING / CONSTRAINTS: ${body.craving?.trim() || "open to anything"}
GROUP SIZE: ${body.members?.length || 2}`,
      });
      return Response.json(deck);
    }

    if (body.stage === "decide") {
      const decision = await geminiJSON({
        apiKey,
        system: DECIDE,
        schema: DECIDE_SCHEMA,
        temperature: 0.4,
        prompt: `DECK:
${JSON.stringify(body.places || [], null, 1)}

SWIPES BY MEMBER:
${JSON.stringify(body.votes || {}, null, 1)}

CONSTRAINTS STATED UP FRONT: ${body.craving || "none"}`,
      });
      return Response.json(decision);
    }

    return Response.json({ error: "Unknown stage." }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
