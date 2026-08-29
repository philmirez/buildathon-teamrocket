# Team Rocket — DC DevFest 2026 Buildathon

Six AI builds behind one Next.js app. Each lives at its own slug; the home page
links to all six.

**Live:** [teamrocket.website](https://teamrocket.website)

**Repo:** [github.com/philmirez/buildathon-teamrocket](https://github.com/philmirez/buildathon-teamrocket)

### Team Rocket

| | GitHub | LinkedIn |
|---|---|---|
| **Phil Ramirez** | [@philmirez](https://github.com/philmirez) | [philmirez](https://www.linkedin.com/in/philmirez/) |
| **Allen Pang** | [@aap7763](https://github.com/aap7763) | [allenanpang](https://www.linkedin.com/in/allenanpang/) |
| **Mimi Pomephimkham** | [@mimersheree](https://github.com/mimersheree) | [mimiphim](https://www.linkedin.com/in/mimiphim/) |
| **Ray Gil** | [@roboray01](https://github.com/roboray01) | [raymundogil](https://www.linkedin.com/in/raymundogil/) |

| Build | Slug | What it does | Keys used |
|---|---|---|---|
| Ambient Scribe | [`/ambient`](/ambient) | Talk. An agent decides the folders, writes the notes, and files them. | Gemini |
| Captured Memory | [`/captured`](/captured) | Paste a chapter or transcript; each scene illustrates itself. | Gemini **(billing on)**, Pixabay *(optional)* |
| Taskboard | [`/taskboard`](/taskboard) | Kanban cards double as segments of one effort-weighted progress bar. | Gemini |
| This or That | [`/this-or-that`](/this-or-that) | Group swipes one restaurant deck; an agent resolves the overlap. | Gemini, Google Places *(optional)*, Pixabay *(optional)* |
| Skill Gap | [`/skill-gap`](/skill-gap) | Diff a resume against a posting; get the gap and fourteen days. | Gemini |
| Policy Diff | [`/policy-diff`](/policy-diff) | Diff two policy versions; plain-language changes ranked by who they hit. | Gemini |

## Keys

**A Gemini key is required. All six builds need one and nothing runs without
it.** Get a free one at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey), then paste it
into the key button in the site header. The other two keys are optional and
only affect imagery.

| Key | Required | Powers | Without it |
|---|---|---|---|
| **Gemini** | **Yes — all six builds** | Every agent pipeline in the app | Nothing runs |
| Gemini with **billing enabled** | Only for Captured Memory | Scene image generation | Free-tier keys return `limit: 0` on every image model, so scenes fall back to Pixabay, then to an explicit message. The rest of that build — scene splitting, style bible, per-scene prompts — runs fine on a free key |
| Google Places | No | Real restaurant photographs in This or That | Cards fall back to Pixabay stock, then to generated card art. Restaurants and the decision agent are unaffected |
| Pixabay | No | Image fallback for Captured Memory and This or That | Those two fall through to their last tier: an explicit message, and generated card art |

### How keys reach the app

Keys are pasted in the browser, held in `localStorage`, and sent per request to
this app's own API routes — they are never written to a server. The API call to
Google happens server-side so the key never rides in a URL and never hits CORS.

Environment variables exist only as a **deployment-level fallback** for when a
visitor has not pasted their own key. None are needed to run or deploy the app;
setting `GEMINI_API_KEY` just means visitors can try it without their own key,
billed to whoever deployed it.

| Variable | Falls back for |
|---|---|
| `GEMINI_API_KEY` | The Gemini key above |
| `PIXABAY_API_KEY` | The Pixabay key above |
| `GOOGLE_PLACES_API_KEY` | The Google Places key above (Places API **New**) |

## Local development

```bash
npm install
npm run dev
```

Optionally, to avoid pasting a key on every reload:

```bash
echo 'GEMINI_API_KEY=your_key' > .env.local
```

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

## Verification

Every pipeline was run against the live Gemini API before shipping, not just
type-checked. Notable results: Policy Diff narrowed 12 real hunks to 9
substantive changes and ranked a quiet arbitration clause above a visible price
rise; Taskboard's triage agent flagged an abandoned in-progress task while
deliberately *not* flagging the longest-idle one because it was trivial; and
Captured Memory produced byte-identical character descriptions across
non-adjacent scenes.
