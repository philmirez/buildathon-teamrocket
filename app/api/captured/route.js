import { GeminiError, geminiImage, geminiJSON, errorResponse, resolveKey } from "@/lib/gemini";

/**
 * Scene pipeline for illustrating long-form text.
 *
 *   scenes -> a splitter finds the visual beats and quotes the line each one
 *             hangs on, then an art director turns those beats into image
 *             prompts sharing one style bible. The bible is the whole reason
 *             this reads as one book rather than eight unrelated pictures:
 *             character looks and palette are fixed once and restated in every
 *             prompt, because the image model has no memory between calls.
 *
 *   image  -> renders one scene, degrading through three sources so a missing
 *             image-gen quota does not take the reader down with it.
 */

const SCENE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    style: { type: "string" },
    palette: { type: "string" },
    cast: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, look: { type: "string" } },
        propertyOrdering: ["name", "look"],
        required: ["name", "look"],
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          beat: { type: "string" },
          quote: { type: "string" },
          passage: { type: "string" },
          subjects: { type: "array", items: { type: "string" } },
        },
        propertyOrdering: ["beat", "quote", "passage", "subjects"],
        required: ["beat", "quote", "passage"],
      },
    },
  },
  required: ["title", "style", "palette", "scenes"],
};

const PROMPT_SCHEMA = {
  type: "object",
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: { prompt: { type: "string" }, search: { type: "string" } },
        propertyOrdering: ["prompt", "search"],
        required: ["prompt", "search"],
      },
    },
  },
  required: ["prompts"],
};

const SPLITTER = `You find the moments in a text that are worth seeing.

- Return 5 to 8 scenes, in the order they occur.
- A scene is a distinct visual moment: a place, an action, a confrontation. Skip
  passages that are pure interiority or exposition — those have nothing to draw.
- "beat" describes what is literally visible in that moment. Concrete nouns:
  who, where, what light, what is happening. No plot summary, no interpretation.
- "quote" is one short verbatim line from the text that anchors the scene. Copy
  it exactly, do not paraphrase.
- "passage" is the span of text this scene covers, quoted verbatim from the
  source — this is what the reader reads while looking at the image. Every word
  of the source should land in exactly one passage, in order, so the passages
  reassemble into the original text.
- "cast" lists recurring people with a fixed physical description: age, build,
  hair, clothing. Invent specific details where the text is silent, and never
  contradict details it gives.
- "style" names one coherent visual treatment for the whole piece, matched to
  the text's tone. "Muted gouache illustration, soft edges." Pick one and commit.
- "palette" is 3 or 4 colours in words.`;

const DIRECTOR = `You write image prompts, one per scene.

The image model has NO MEMORY between calls. Every prompt must independently
restate the style, the palette, and the full physical description of anyone
appearing in it — otherwise the same character changes face between scenes.

Each "prompt" must:
- Open with the medium and style, verbatim from the style bible.
- Describe the moment concretely: subject, action, setting, time of day, light.
- Restate each present character's full look from the cast list, inline.
- End with the palette.
- Contain NO text, letters, words, captions, or logos. Say "no text" explicitly.
- Never name a real person, brand, or copyrighted character.
- Stay under 70 words.

"search" is a fallback: 2 to 4 plain words describing the scene's setting for a
stock photo library. "stormy lighthouse cliff", not the full prompt.`;

async function fromPixabay(query, key) {
  const url =
    `https://pixabay.com/api/?key=${encodeURIComponent(key)}` +
    `&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal` +
    `&safesearch=true&per_page=3`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const hit = data?.hits?.[0];
  return hit ? { url: hit.largeImageURL, credit: `${hit.user} / Pixabay`, source: "pixabay" } : null;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = resolveKey(body);

    // ---------- stage: scenes ----------
    if (body.stage === "scenes") {
      const text = (body.text || "").trim();
      if (text.length < 200) {
        return Response.json({ error: "Paste at least a few paragraphs." }, { status: 400 });
      }

      const split = await geminiJSON({
        apiKey,
        system: SPLITTER,
        schema: SCENE_SCHEMA,
        temperature: 0.5,
        prompt: `TEXT:\n"""${text.slice(0, 24000)}"""`,
      });

      const directed = await geminiJSON({
        apiKey,
        system: DIRECTOR,
        schema: PROMPT_SCHEMA,
        temperature: 0.7,
        prompt: `STYLE BIBLE
style: ${split.style}
palette: ${split.palette}
cast: ${JSON.stringify(split.cast || [])}

SCENES (write one prompt each, in order):
${JSON.stringify((split.scenes || []).map((s, i) => ({ i, beat: s.beat, subjects: s.subjects || [] })), null, 1)}`,
      });

      const prompts = directed.prompts || [];
      const scenes = (split.scenes || []).map((s, i) => ({
        ...s,
        prompt: prompts[i]?.prompt || s.beat,
        search: prompts[i]?.search || s.beat,
      }));

      return Response.json({ title: split.title, style: split.style, palette: split.palette, scenes });
    }

    // ---------- stage: image ----------
    if (body.stage === "image") {
      const prompt = (body.prompt || "").trim();
      if (!prompt) return Response.json({ error: "No prompt." }, { status: 400 });

      // 1. Real generation — what the build is actually for.
      try {
        const dataUrl = await geminiImage({ apiKey, prompt });
        return Response.json({ image: dataUrl, source: "gemini" });
      } catch (err) {
        const quota = err instanceof GeminiError && (err.status === 429 || err.status === 403);
        if (!quota) throw err;

        // 2. Stock fallback, when image-gen quota is unavailable.
        const pixabay = (body.pixabayKey || "").trim() || process.env.PIXABAY_API_KEY || "";
        if (pixabay) {
          const hit = await fromPixabay(body.search || prompt.slice(0, 60), pixabay);
          if (hit) return Response.json({ ...hit, degraded: "Gemini image quota unavailable." });
        }

        // 3. Nothing renders — say why plainly rather than showing a broken frame.
        return Response.json({
          image: null,
          source: "none",
          degraded:
            "Image generation needs a Gemini key with billing enabled, or a Pixabay key as fallback.",
        });
      }
    }

    return Response.json({ error: "Unknown stage." }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
