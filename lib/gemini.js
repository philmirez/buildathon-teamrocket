/**
 * Server-side Gemini client.
 *
 * Every route receives the caller's own API key in the request body — we never
 * persist it, never log it, and never fall back to a shared server key unless
 * the deployment explicitly provides one. That keeps the "paste your own key"
 * testing story honest.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const TEXT_MODEL = "gemini-3.6-flash";
export const IMAGE_MODEL = "gemini-3.1-flash-image";

/**
 * Ordered fallbacks per model. Google's newest flash tiers go "high demand"
 * under load, which would otherwise kill a live demo mid-sentence, so a 429/503
 * silently steps down to the next model rather than surfacing an error.
 */
const FALLBACKS = {
  "gemini-3.6-flash": ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"],
  "gemini-3.7-flash": ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"],
  "gemini-3.1-flash-image": ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"],
};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class GeminiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

/** Pull the key from the request body, falling back to a deployment-level key. */
export function resolveKey(body, envName = "GEMINI_API_KEY") {
  const key = (body?.apiKey || "").trim() || (process.env[envName] || "").trim();
  if (!key) {
    throw new GeminiError(
      "No Gemini API key. Add one with the key button in the header.",
      401
    );
  }
  return key;
}

async function callOnce(model, key, payload) {
  let res;
  try {
    res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new GeminiError("Could not reach the Gemini API. Check your network.", 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let msg = `Gemini returned ${res.status}.`;
    try {
      const parsed = JSON.parse(detail);
      if (parsed?.error?.message) msg = parsed.error.message;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    if (res.status === 400 && /api key/i.test(msg)) msg = "That Gemini API key was rejected.";
    if (res.status === 429) msg = "Gemini rate limit hit. Wait a moment and retry.";
    throw new GeminiError(msg, res.status);
  }

  return res.json();
}

/** Try the requested model, stepping down the fallback chain on overload. */
async function call(model, key, payload) {
  const chain = [model, ...(FALLBACKS[model] || [])];
  let lastErr;
  for (const candidate of chain) {
    try {
      return await callOnce(candidate, key, payload);
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const overloaded = /high demand|overload|unavailable|no longer available/i.test(err?.message || "");
      if (!RETRYABLE.has(status) && !overloaded) throw err;
    }
  }
  throw lastErr;
}

function firstCandidate(data) {
  const cand = data?.candidates?.[0];
  if (!cand) throw new GeminiError("Gemini returned no candidates.", 502);
  if (cand.finishReason === "SAFETY") {
    throw new GeminiError("Gemini blocked that request under its safety filters.", 422);
  }
  return cand;
}

function textOf(data) {
  return (firstCandidate(data).content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();
}

/**
 * Structured generation. Passing `schema` constrains Gemini to emit JSON
 * matching it, so downstream agents can consume the output directly instead of
 * parsing prose.
 */
export async function geminiJSON({
  apiKey,
  model = TEXT_MODEL,
  system,
  prompt,
  schema,
  temperature = 0.7,
  parts,
}) {
  const payload = {
    contents: [{ role: "user", parts: parts || [{ text: prompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: "application/json",
      ...(schema ? { responseSchema: schema } : {}),
    },
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };

  const raw = textOf(await call(model, apiKey, payload));
  try {
    return JSON.parse(raw);
  } catch {
    // Schema mode occasionally wraps output in a fence; recover the JSON body.
    const match = raw.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through to the thrown error below */
      }
    }
    throw new GeminiError("Gemini returned malformed JSON.", 502);
  }
}

/** Plain text generation. */
export async function geminiText({
  apiKey,
  model = TEXT_MODEL,
  system,
  prompt,
  temperature = 0.7,
}) {
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature },
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  return textOf(await call(model, apiKey, payload));
}

/** Image generation. Resolves to a data URL ready to drop into an <img src>. */
export async function geminiImage({ apiKey, prompt, model = IMAGE_MODEL }) {
  const data = await call(model, apiKey, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const parts = firstCandidate(data).content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw new GeminiError("Gemini returned no image.", 502);
  const mime = img.inlineData.mimeType || "image/png";
  return `data:${mime};base64,${img.inlineData.data}`;
}

/** Uniform error -> Response mapping for every route in this app. */
export function errorResponse(err) {
  const status = err instanceof GeminiError ? err.status : 500;
  const message = err instanceof GeminiError ? err.message : "Something went wrong.";
  if (!(err instanceof GeminiError)) console.error(err);
  return Response.json({ error: message }, { status });
}
