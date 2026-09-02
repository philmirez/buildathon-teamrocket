# Team Rocket — DC DevFest 2026 Buildathon

Six AI builds behind one Next.js app. Each lives at its own slug; the home page
links to all six.

**Result:** 🥉 Third place, DC DevFest 2026 Buildathon.

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
| This or That | [`/this-or-that`](/this-or-that) | Group swipes one restaurant deck; the overlap is counted, not asked. | Gemini, Google Places *(optional)*, Pixabay *(optional)* |
| Skill Gap | [`/skill-gap`](/skill-gap) | Diff a resume against a posting; get the gap and fourteen days. | Gemini |
| Policy Diff | [`/policy-diff`](/policy-diff) | Diff two policy versions; plain-language changes ranked by who they hit. | Gemini |

## WebMCP

Every build on the site is drivable by an AI agent through
[WebMCP](https://github.com/webmachinelearning/webmcp), the W3C proposal that
puts a `modelContext` on the document. Each page registers tools with a name,
a description, a JSON Schema and an `execute` function; an agent in a browser
that supports WebMCP lists them, calls them, and watches the same screen the
human does. The human UI stays the source of truth: every tool calls the same
functions the buttons call, so whatever an agent changes is visible on screen.

The live catalog, rendered from the same definitions the pages register, is at
[`/webmcp`](https://teamrocket.website/webmcp). The WebMCP button in the
header of every page lists the tools registered on that page.

### What the site exposes

- **Site-wide tools** on every page: discover the builds, navigate to one,
  check which keys are set (booleans only), and open the key panel for the
  human to type into.
- **One tool group per build**, registered while that build's page is mounted
  and unregistered when it unmounts. Definitions live in
  `app/<build>/tools.js`; handlers live in each build's client component next
  to the state they touch.
- **One declarative tool**: the real name form on This or That's "Who's
  eating" step carries `toolname`, `tooldescription`, `toolautosubmit` and a
  `toolparamdescription`, so the browser synthesises `thisorthat_add_member`
  from the markup and the submit handler answers agent-invoked submits with
  `respondWith()`.
- **An "Agent is driving" pill** in the header that names the tool while it
  runs, driven by the `toolactivated` and `toolcancel` events.

The bridge is `lib/webmcp.js`: `useWebMCPTools(tools, deps)` registers on
mount and unregisters through an AbortSignal, `ok()` and `fail()` build the
result shape with JSON payloads, `requireKey()` turns a missing key into a
structured failure, and `gate()` blocks a destructive tool on the confirm bar.
It checks `document.modelContext` (the current spec, Chrome 153+) and
`navigator.modelContext` (Chrome 149 to 152) and degrades to a `console.debug`
where neither exists.

### Tool catalog

Site-wide, on every page:

| Tool | Does |
|---|---|
| `list_builds` | Every build with slug, name, problem, solution, tier and URL |
| `open_build { slug }` | Client-side navigate to a build |
| `get_setup_status` | `hasGeminiKey`, `hasPlacesKey`, `hasPixabayKey`, booleans only |
| `open_key_panel` | Opens the key panel for the human to type into |

Taskboard (`/taskboard`):

| Tool | Does |
|---|---|
| `taskboard_get_state` | Goal, tasks with id, stage, weight, idle days and flags, progress percent |
| `taskboard_set_goal { goal, horizon? }` | Fills the form and runs the planner to build the board |
| `taskboard_add_task { title, detail?, stage?, weight? }` | Adds a card |
| `taskboard_move_task { id, stage }` | Moves a card between columns |
| `taskboard_remove_task { id }` | Deletes a card, after the human confirms |
| `taskboard_triage` | Runs the triage agent and returns headline, focus and per-task flags |
| `taskboard_age_board` | Demo control: rewinds idle clocks so triage has something to find |
| `taskboard_reset` | Clears the board, after the human confirms |

This or That (`/this-or-that`):

| Tool | Does |
|---|---|
| `thisorthat_get_state` | Phase, setup answers, whose turn, current card, tallies, result |
| `thisorthat_setup { where, mode?, tags?, craving?, members }` | Answers the wizard and deals the deck |
| `thisorthat_next_voter` | Starts the current person's turn from the handoff screen |
| `thisorthat_vote { choice }` | Swipes the card on screen; returns what comes next |
| `thisorthat_get_result` | The counted pick with a Maps link, runner-up and full ranking |
| `thisorthat_reset` | Discards the deck and votes, after the human confirms |
| `thisorthat_add_member` (form) | The page's own name form, exposed declaratively |

Policy Diff (`/policy-diff`):

| Tool | Does |
|---|---|
| `policydiff_get_state` | Character counts, stage, stats, change count |
| `policydiff_set_documents { oldText?, newText? }` | Pastes the two versions |
| `policydiff_load_sample { name? }` | Loads the built-in terms-of-service pair |
| `policydiff_run` | Deterministic diff, extract, explain; returns stats, changes and ranked verdicts |
| `policydiff_get_result` | Re-reads the last result |
| `policydiff_reset` | Back to the boxes, documents kept |

Skill Gap (`/skill-gap`):

| Tool | Does |
|---|---|
| `skillgap_get_state` | Character counts, stage, role, fit, gap count |
| `skillgap_set_inputs { job?, resume? }` | Pastes the posting and resume |
| `skillgap_load_sample { name? }` | Loads the built-in pair |
| `skillgap_analyze` | Extract, judge, plan; returns role, fit, requirements, gaps and the 14-day plan |
| `skillgap_get_result` | Re-reads the last result |
| `skillgap_reset` | Back to the boxes, texts kept |

Ambient Scribe (`/ambient`):

| Tool | Does |
|---|---|
| `ambient_list_workspace` | Folders and notes with ids and titles |
| `ambient_capture { text }` | Files a braindump the same way a spoken one is filed |
| `ambient_get_note { id }` | Reads a note in full and brings it on screen |
| `ambient_delete_note { id }` | Deletes a note, after the human confirms |
| `ambient_clear_workspace` | Deletes everything, after the human confirms |

Captured Memory (`/captured`):

| Tool | Does |
|---|---|
| `captured_get_state` | Text length, title, scene count, current scene, autoplay, images ready |
| `captured_load_text { text }` | Pastes a chapter or transcript |
| `captured_load_sample` | Loads the built-in chapter |
| `captured_start` | Finds the scenes and opens the reader |
| `captured_go_to_scene { index }` | Jumps to a scene by 1-based number |
| `captured_get_scene` | The scene on screen with its image status |
| `captured_set_playing { playing }` | Autoplay on or off |
| `captured_new_text` | Closes the reader, after the human confirms |

### Trying it

**Chrome 149 or newer.** Open `chrome://flags/#enable-webmcp-testing`, set it
to Enabled, relaunch. Then, on any page of the site, from DevTools:

```js
const ctx = document.modelContext || navigator.modelContext;
const tools = await ctx.getTools();
const t = tools.find((x) => x.name === "list_builds");
JSON.parse(await ctx.executeTool(t, "{}"));
```

Navigate to a build and `getTools()` again to see its group appear; the
`toolchange` event fires on the ModelContext each time.

**ChatGPT desktop browser.** WebMCP is built in. Open a build, then ask the
assistant to do what the tool descriptions say, for example "build me a
taskboard for shipping the onboarding flow in six weeks, age it, and tell me
what is being neglected". The "Agent is driving" pill in the header names each
tool as it runs, and the WebMCP button shows what is available before you ask.

### Safety model

- **Keys never cross the boundary.** No tool accepts, returns or sets a key.
  `get_setup_status` returns booleans; `open_key_panel` opens the dialog for
  the human to type into. A tool that needs a missing key returns a failure
  telling the agent to ask the user to add it in the panel, never to send it.
- **Destructive tools are gated.** Deleting a task or note, clearing a
  workspace or board, and discarding a deck or reader all block on a confirm
  bar at the bottom of the page. The call returns success only when the human
  presses Confirm, and a structured failure on Cancel, timeout, or agent
  abort. They also carry `destructiveHint` and `consequentialHint` annotations.
- **The screen is the record.** Tools call the same state setters the UI uses,
  so nothing happens off-screen, and the header pill names the running tool.
- **Failures are answers.** Tools never throw. Every error is a structured
  result with a `hint` for the next step.

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
