# Broccoli — five AI builds

Six MVPs behind one Next.js app. Each lives at its own slug; the home page
links to all five.

| Build | Slug | What it does |
|---|---|---|
| Ambient Scribe | [`/ambient`](/ambient) | Talk. An agent decides the folders, writes the notes, and files them. |
| Captured Memory | [`/captured`](/captured) | Paste a chapter or transcript; each scene illustrates itself. |
| Taskboard | [`/taskboard`](/taskboard) | Kanban cards double as segments of one effort-weighted progress bar. |
| This or That | [`/this-or-that`](/this-or-that) | Group swipes one restaurant deck; an agent resolves the overlap. |
| Skill Gap | [`/skill-gap`](/skill-gap) | Diff a resume against a posting; get the gap and fourteen days. |
| Policy Diff | [`/policy-diff`](/policy-diff) | Diff two policy versions; plain-language changes ranked by who they hit. |

## Bring your own key

Every build runs on the visitor's own Gemini key, pasted via the key button in
the header. Keys are held in `localStorage` and sent per request to this app's
own API routes; they are never stored server-side. A deployment-level
`GEMINI_API_KEY` is used only when the visitor hasn't supplied one.

Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## Local development

```bash
npm install
npm run dev
```

Optionally, to run without pasting a key each time:

```bash
echo 'GEMINI_API_KEY=your_key' > .env.local
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | no | Fallback key when a visitor hasn't pasted their own. |
| `PIXABAY_API_KEY` | no | Stock-image fallback for Captured Memory and This or That. |
| `GOOGLE_PLACES_API_KEY` | no | Real restaurant photos for This or That. Places API (New). |

## Architecture notes

Every build is an LLM-to-LLM pipeline rather than a single prompt. Each stage
consumes the previous stage's **structured** output (Gemini `responseSchema`),
never its prose:

- **Ambient Scribe** — a planner decides the filing structure and writes only a
  brief per note; parallel writer agents expand each brief. Splitting these
  stopped the planner from filing badly while distracted by prose.
- **Skill Gap** — two readers extract claims from posting and resume in
  parallel, a judge reconciles them into per-requirement verdicts, a planner
  turns the gaps into 14 days. Staged across three requests so the handoffs are
  visible in the UI.
- **Taskboard** — a planner assigns effort weights (which is what makes the
  progress bar honest), then a triage agent reads stage + idle days + weight to
  name what's being neglected.
- **This or That** — a deck agent proposes real restaurants, then a decider
  reasons about hard constraints vs soft preferences instead of taking a naive
  set intersection. Card photos are looked up, not generated: Google Places
  supplies real photographs of the actual restaurant, degrading to labelled
  cuisine stock and then to generative card art. No model ever invents a
  storefront for a real business.
- **Policy Diff** — the diff itself is computed deterministically in
  `lib/textdiff.js` *before* any model runs, so the agents can only describe
  changes that actually exist. An extractor then separates substance from
  renumbering noise and merges hunks belonging to one logical change, and an
  explainer translates and ranks them by real-world impact.
- **Captured Memory** — a splitter finds visual beats and quotes passages
  verbatim; an art director fixes one style bible and restates cast look and
  palette in *every* prompt, because the image model has no memory between
  calls.

`lib/gemini.js` wraps all of it, with a fallback chain that steps down a model
on 429/503 rather than failing a live demo.

## Known limitation

Gemini's image models return `limit: 0` on free-tier keys — image generation is
billing-gated. Captured Memory therefore degrades **Gemini → Pixabay → an
explicit message**. Its text pipeline (scene splitting, style bible, per-scene
prompts) runs fine on a free key; only the render step needs billing enabled or
a Pixabay key.
