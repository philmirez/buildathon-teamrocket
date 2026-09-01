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
 *   narrate-> does NOT decide anything. The table is picked by counting swipes
 *             in lib/decide.js, on the client, before this is ever called. All
 *             this stage does is say the already-made decision out loud in a
 *             voice worth reading. It is handed the counts and can only return
 *             prose; the winner is not one of its output fields.
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

const NARRATE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    why: { type: "string" },
    tradeoff: { type: "string" },
  },
  propertyOrdering: ["headline", "why", "tradeoff"],
  required: ["headline", "why"],
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
- Produce 8 places.

TRAVEL RADIUS
- "walking" means places someone would actually walk to from the stated point:
  roughly a 15 minute walk, about a kilometre. Do not include anywhere they
  would need a car for.
- "driving" means roughly a 20 minute drive, so a wider net across
  neighbourhoods is fine.
- Respect this strictly. A walkable request that returns a place across town is
  wrong even if the restaurant is excellent.

WHEN THE AREA IS COORDINATES
- The area may arrive as a "latitude, longitude" pair. Identify the
  neighbourhood and city those coordinates fall in, use it, and name it in the
  "area" field so the user can confirm you placed them correctly.`;

const NARRATE = `You read out a decision that has already been made.

A group swiped through a deck of restaurants. The winner was determined by
counting the yes votes — not by you, and not by anything you could argue with.
Your only job is to say it well.

Rules:
- The vote counts you are given are the complete evidence. Never invent a reason
  someone swiped the way they did: a swipe carries no reason, and guessing at
  one ("Allen wanted somewhere quieter") puts words in a real person's mouth.
- You may use the winning card's own details — its cuisine, price, vibe, hook,
  the dish — to say why the table will enjoy it. That is on the card, so it is
  fair game.
- "headline" is one short line to read out to the table. Confident, present
  tense, no hedging, no restating the vote count as a statistic.
- "why" is at most two sentences. Name the members who said yes, by name.
- "tradeoff" names who is compromising and says it kindly. Return an empty
  string when the vote was unanimous — do not manufacture a downside.
- Never name a restaurant other than the winner and the runner-up given to you.`;

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

      const mode = body.mode === "walking" ? "walking" : "driving";

      const deck = await geminiJSON({
        apiKey,
        system: DECK,
        schema: DECK_SCHEMA,
        temperature: 0.9,
        prompt: `AREA: ${where}
TRAVEL RADIUS: ${mode}
CRAVING / CONSTRAINTS: ${body.craving?.trim() || "open to anything"}
GROUP SIZE: ${body.members?.length || 2}`,
      });
      return Response.json(deck);
    }

    if (body.stage === "narrate") {
      const winner = (body.winner || "").trim();
      if (!winner) return Response.json({ error: "Nothing to narrate." }, { status: 400 });

      const copy = await geminiJSON({
        apiKey,
        system: NARRATE,
        schema: NARRATE_SCHEMA,
        temperature: 0.6,
        prompt: `THE TABLE IS: ${winner}${body.unanimous ? " (unanimous)" : ""}
RUNNER-UP: ${body.runnerUp || "none"}

THE WINNING CARD:
${JSON.stringify(body.card || {}, null, 1)}

WHO SAID YES: ${(body.yes || []).join(", ") || "nobody"}
WHO SAID NO: ${(body.no || []).join(", ") || "nobody"}

CONSTRAINTS STATED UP FRONT: ${body.craving || "none"}`,
      });
      return Response.json(copy);
    }

    return Response.json({ error: "Unknown stage." }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
