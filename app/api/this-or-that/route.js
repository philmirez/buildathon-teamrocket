import { geminiJSON, errorResponse, resolveKey } from "@/lib/gemini";

/**
 * Two agents, plus a photo lookup.
 *
 *   deck   -> proposes real restaurants for a place and a craving, with the one
 *             line that actually distinguishes each.
 *   photos -> not an agent. Turns each deck entry into real photographs of that
 *             restaurant via Google Places, so the cards show the place instead
 *             of a hashed gradient. Falls back to cuisine-matched stock and
 *             then to nothing at all; a card without photos still works.
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

/* --------------------------- restaurant photos --------------------------- */

const PHOTOS_PER_CARD = 4;
const TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText";

/**
 * Real photographs of the actual restaurant.
 *
 * Two hops: Text Search resolves the deck's name + neighborhood to a place and
 * its photo resource names, then each name has to be exchanged for a URL.
 * `skipHttpRedirect` makes that second hop answer with JSON instead of a 302,
 * which is what lets the visitor's key stay on this side of the wire — the
 * browser only ever sees the resulting googleusercontent URL.
 */
async function googlePhotos(place, area, key) {
  const res = await fetch(TEXT_SEARCH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.photos",
    },
    body: JSON.stringify({
      textQuery: `${place.name}, ${place.neighborhood || area}`,
      maxResultCount: 1,
    }),
  });
  if (!res.ok) return null;

  const hit = (await res.json().catch(() => null))?.places?.[0];
  if (!hit?.photos?.length) return null;

  const shots = await Promise.all(
    hit.photos.slice(0, PHOTOS_PER_CARD).map(async (photo) => {
      const media =
        `https://places.googleapis.com/v1/${photo.name}/media` +
        `?maxWidthPx=900&skipHttpRedirect=true&key=${encodeURIComponent(key)}`;
      const r = await fetch(media);
      if (!r.ok) return null;
      const body = await r.json().catch(() => null);
      if (!body?.photoUri) return null;
      // Places requires the contributor be credited wherever the photo shows.
      return { url: body.photoUri, credit: photo.authorAttributions?.[0]?.displayName || "" };
    })
  );

  const usable = shots.filter(Boolean);
  return usable.length ? { shots: usable, source: "places" } : null;
}

/**
 * Stock fallback. These are photos of the cuisine, not of the restaurant, so
 * the client labels them as such rather than passing them off as the real
 * thing.
 */
async function pixabayPhotos(place, key) {
  const query = [place.cuisine, place.dish].filter(Boolean).join(" ") || "restaurant";
  const url =
    `https://pixabay.com/api/?key=${encodeURIComponent(key)}` +
    `&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal` +
    `&safesearch=true&per_page=3`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const hits = (await res.json().catch(() => null))?.hits || [];
  if (!hits.length) return null;
  return {
    shots: hits.slice(0, 3).map((h) => ({
      url: h.largeImageURL,
      credit: `${h.user} / Pixabay`,
    })),
    source: "pixabay",
  };
}

export async function POST(req) {
  try {
    const body = await req.json();

    // Photos need no Gemini call, so they are answered before the key check.
    if (body.stage === "photos") {
      const deck = Array.isArray(body.places) ? body.places.slice(0, 12) : [];
      const placesKey = (body.placesKey || "").trim() || process.env.GOOGLE_PLACES_API_KEY || "";
      const stockKey = (body.pixabayKey || "").trim() || process.env.PIXABAY_API_KEY || "";

      if (!deck.length) return Response.json({ photos: {} });
      if (!placesKey && !stockKey) {
        return Response.json({
          photos: {},
          degraded: "Add a Google Places key with the key button to show real photos.",
        });
      }

      // One card's lookup failing must never cost the rest of the deck its
      // photos, so every place is isolated and resolves to null at worst.
      const found = await Promise.all(
        deck.map(async (place) => {
          try {
            const real = placesKey ? await googlePhotos(place, body.area || "", placesKey) : null;
            if (real) return [place.name, real];
            return [place.name, stockKey ? await pixabayPhotos(place, stockKey) : null];
          } catch {
            return [place.name, null];
          }
        })
      );

      return Response.json({ photos: Object.fromEntries(found.filter(([, v]) => v)) });
    }

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
