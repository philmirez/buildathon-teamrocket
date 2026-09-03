"use client";

import { useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { trackRunFinished, trackRunStarted } from "@/lib/analytics";
import { apiPost, getKey } from "@/lib/keys";
import { DOC_ACCEPT, readDocument } from "@/lib/files";
import { wordDiff } from "@/lib/textdiff";
import { fail, ok, requireKey, useWebMCPTools, withHandlers } from "@/lib/webmcp";
import { SAMPLE_NEW, SAMPLE_OLD } from "./samples";
import { POLICYDIFF_SAMPLES, POLICYDIFF_TOOLS } from "./tools";
import s from "./differ.module.css";

const STAGES = [
  { id: "diff", label: "Computing the real diff" },
  { id: "extract", label: "Separating substance from noise" },
  { id: "explain", label: "Translating and ranking by impact" },
];

const SEVERITY = {
  critical: { label: "Critical", cls: "badge-red" },
  significant: { label: "Significant", cls: "badge-yellow" },
  minor: { label: "Minor", cls: "" },
};

const DIRECTION = {
  favors_provider: "This revision favors the company",
  favors_user: "This revision favors you",
  mixed: "Mixed — some changes help you, some don't",
  neutral: "Broadly neutral",
};

/** Verbatim before/after with word-level highlighting — the reader's receipts. */
function Receipts({ before, after }) {
  const parts = useMemo(() => {
    if (!before || !after) return null;
    return wordDiff(before, after);
  }, [before, after]);

  if (parts) {
    return (
      <div className={s.receipt}>
        <p className={s.receiptLabel}>What the wording actually does</p>
        <p className={s.diffText}>
          {parts.map((t, i) =>
            t.t === "eq" ? (
              <span key={i}>{t.text}</span>
            ) : (
              <mark key={i} data-op={t.t}>
                {t.text}
              </mark>
            )
          )}
        </p>
      </div>
    );
  }

  return (
    <div className={s.receipt}>
      {before && (
        <>
          <p className={s.receiptLabel}>Removed</p>
          <p className={s.diffText}>
            <mark data-op="del">{before}</mark>
          </p>
        </>
      )}
      {after && (
        <>
          <p className={s.receiptLabel}>{before ? "Replaced with" : "Added"}</p>
          <p className={s.diffText}>
            <mark data-op="ins">{after}</mark>
          </p>
        </>
      )}
    </div>
  );
}

function ChangeCard({ rank, change, verdict, featured }) {
  const [open, setOpen] = useState(false);
  const sev = SEVERITY[verdict.severity] || SEVERITY.minor;

  return (
    <article className={`${s.change} ${featured ? s.featured : ""}`} data-dir={verdict.direction}>
      <div className={s.changeHead}>
        <span className={s.rank}>{rank}</span>
        <div className="grow">
          <div className="row-wrap" style={{ "--gap": "var(--s-2)" }}>
            <h3 className="t-h3">{change?.title || "Change"}</h3>
            <span className={`badge ${sev.cls}`}>{sev.label}</span>
            {verdict.direction === "better" && <span className="badge badge-green">Better for you</span>}
          </div>
        </div>
      </div>

      <p className={`t-body ${s.plain}`}>{verdict.plain}</p>
      <p className="t-sm t-secondary">{verdict.meaning}</p>

      {verdict.affected?.length > 0 && (
        <div className={s.affected}>
          <span className={s.affectedLabel}>Lands on</span>
          <div className="row-wrap" style={{ "--gap": "6px" }}>
            {verdict.affected.map((a, i) => (
              <span key={i} className="chip">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {verdict.action && (
        <p className={s.action}>
          <Icon name="check" size={15} />
          <span>{verdict.action}</span>
        </p>
      )}

      <button className={s.toggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
        {open ? "Hide the original wording" : "Show the original wording"}
      </button>

      {open && change && <Receipts before={change.before} after={change.after} />}
    </article>
  );
}

export default function Differ() {
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [stage, setStage] = useState(-1);
  const [stats, setStats] = useState(null);
  const [changes, setChanges] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(null);
  const oldFile = useRef(null);
  const newFile = useRef(null);

  const busy = stage >= 0 && stage < STAGES.length;
  const started = stats !== null;

  /** Upload -> plain text. PDFs are transcribed server-side by Gemini. */
  async function upload(file, setter, which) {
    if (!file) return;
    setError("");
    try {
      const text = await readDocument(file, {
        onStage: (s) => setReading({ which, stage: s }),
      });
      setter(text);
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(null);
    }
  }

  /**
   * The whole pipeline. Returns what it produced as well as setting state, so
   * the WebMCP tool can hand the same result to an agent. `docs` lets a tool
   * run on text it just set, before React has re-rendered with it.
   */
  async function run(docs = {}) {
    const a = docs.oldText ?? oldText;
    const b = docs.newText ?? newText;
    if (!getKey("gemini")) {
      const msg = "Add your Gemini key with the key button up top first.";
      setError(msg);
      return { error: msg };
    }
    setError("");
    setStats(null);
    setChanges(null);
    setResult(null);
    trackRunStarted("policy-diff");

    try {
      // Stage 0 is local and instant — the real diff lands before any model runs.
      setStage(0);
      const d = await apiPost("/api/policy-diff", { stage: "diff", oldText: a, newText: b });
      if (d.identical) {
        const msg = "These two versions are identical.";
        setError(msg);
        setStage(-1);
        return { error: msg };
      }
      setStats(d.stats);

      setStage(1);
      const e = await apiPost("/api/policy-diff", { stage: "extract", hunks: d.hunks });
      const found = e.changes || [];
      setChanges(found);

      setStage(2);
      const x = await apiPost("/api/policy-diff", {
        stage: "explain",
        docType: e.docType,
        changes: e.changes,
      });
      setResult(x);
      setStage(STAGES.length);
      trackRunFinished("policy-diff", "success");
      return { stats: d.stats, changes: found, result: x };
    } catch (err) {
      setError(err.message);
      setStage(-1);
      trackRunFinished("policy-diff", "error");
      return { error: err.message };
    }
  }

  function reset() {
    setStats(null);
    setChanges(null);
    setResult(null);
    setStage(-1);
    setError("");
  }

  const ranked = result?.ranked || [];
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  // --- WebMCP ------------------------------------------------------------
  // Tools fill the same boxes and run the same pipeline the buttons do, so
  // the stage list on screen advances while an agent waits on policydiff_run.
  const publicResult = (st, ch, res) => ({
    stats: st,
    headline: res.headline,
    direction: res.direction,
    directionMeaning: DIRECTION[res.direction] || DIRECTION.neutral,
    ranked: (res.ranked || []).map((v, i) => ({
      rank: i + 1,
      id: v.id,
      title: ch?.[v.id]?.title || "Change",
      severity: v.severity,
      direction: v.direction,
      plain: v.plain,
      meaning: v.meaning,
      affected: v.affected || [],
      action: v.action || undefined,
      before: ch?.[v.id]?.before ?? "",
      after: ch?.[v.id]?.after ?? "",
    })),
  });
  const setDocs = ({ oldText: a, newText: b }) => {
    if (typeof a === "string") setOldText(a);
    if (typeof b === "string") setNewText(b);
  };

  useWebMCPTools(
    withHandlers(POLICYDIFF_TOOLS, {
      policydiff_get_state: async () =>
        ok({
          oldChars: oldText.length,
          newChars: newText.length,
          stage: busy ? STAGES[stage].id : started && result ? "done" : "idle",
          busy,
          stats,
          changeCount: changes ? changes.length : null,
          hasResult: Boolean(result),
          error: error || undefined,
        }),

      policydiff_set_documents: async ({ oldText: a, newText: b }) => {
        if (busy) return fail("A run is in progress.", "Wait for policydiff_run to return, then set the documents.");
        if (typeof a !== "string" && typeof b !== "string") return fail("Pass oldText, newText or both.");
        setDocs({ oldText: a, newText: b });
        if (started) reset();
        return ok({
          oldChars: (a ?? oldText).length,
          newChars: (b ?? newText).length,
          next: "Call policydiff_run when both versions are loaded.",
        });
      },

      policydiff_load_sample: async ({ name = POLICYDIFF_SAMPLES[0] } = {}) => {
        if (busy) return fail("A run is in progress.", "Wait for policydiff_run to return first.");
        if (!POLICYDIFF_SAMPLES.includes(name)) return fail(`No sample called "${name}".`, `Available: ${POLICYDIFF_SAMPLES.join(", ")}.`);
        setDocs({ oldText: SAMPLE_OLD, newText: SAMPLE_NEW });
        if (started) reset();
        return ok({ loaded: name, oldChars: SAMPLE_OLD.length, newChars: SAMPLE_NEW.length, next: "Call policydiff_run." });
      },

      policydiff_run: async () => {
        if (busy) return fail("A run is already in progress.", "Wait for it to return, then call policydiff_get_result.");
        if (!oldText.trim() || !newText.trim()) {
          return fail("Both versions are needed.", "Call policydiff_set_documents with oldText and newText, or policydiff_load_sample.");
        }
        const missing = requireKey("gemini");
        if (missing) return missing;
        const res = await run();
        if (res.error) return fail(res.error, "The same message is showing on the page. Fix the cause, then call again.");
        return ok(publicResult(res.stats, res.changes, res.result));
      },

      policydiff_get_result: async () => {
        if (!result) {
          return fail(
            busy ? `Still running: ${STAGES[stage].label.toLowerCase()}.` : "No result yet.",
            busy ? "Call again when policydiff_run returns." : "Call policydiff_run first."
          );
        }
        return ok(publicResult(stats, changes, result));
      },

      policydiff_reset: async () => {
        if (busy) return fail("A run is in progress.", "Wait for it to return first.");
        reset();
        return ok({ reset: true, note: "Both documents are still loaded." });
      },
    })
  );

  return (
    <Shell>
      <div className="container-narrow" style={{ paddingBlock: "var(--s-6) var(--s-8)" }}>
        {!started ? (
          <div className={s.intake}>
            <span className={s.headIcon} aria-hidden="true">
              <Icon name="scales" size={24} />
            </span>
            <h1 className="t-h1 t-balance">What did they quietly change?</h1>
            <p className="t-body t-secondary t-balance">
              Drop in two versions of a policy. You get the real diff, rewritten for a human, and
              ranked by who it actually lands on — not by where it appears in the document.
            </p>

            <div className={s.pair}>
              {[
                { label: "Old version", value: oldText, set: setOldText, ref: oldFile, id: "old" },
                { label: "New version", value: newText, set: setNewText, ref: newFile, id: "new" },
              ].map((f) => (
                <div className="field" key={f.id}>
                  <div className={s.fieldHead}>
                    <label className="field-label" htmlFor={f.id} style={{ margin: 0 }}>
                      {f.label}
                    </label>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => f.ref.current?.click()}
                      disabled={busy || Boolean(reading)}
                    >
                      {reading?.which === f.id ? (
                        <span className="spinner" style={{ width: 13, height: 13 }} />
                      ) : (
                        <Icon name="upload" size={14} />
                      )}
                      {reading?.which === f.id
                        ? reading.stage === "extracting"
                          ? "Reading PDF"
                          : "Loading"
                        : "Upload"}
                    </button>
                    <input
                      ref={f.ref}
                      type="file"
                      accept={DOC_ACCEPT}
                      className="sr-only"
                      onChange={(e) => {
                        upload(e.target.files?.[0], f.set, f.id);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <textarea
                    id={f.id}
                    className={`textarea ${s.box}`}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder="Paste this version, or upload a PDF…"
                    disabled={busy}
                  />
                  {f.value && (
                    <p className="field-hint">{f.value.length.toLocaleString()} characters</p>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div className="notice notice-error" style={{ width: "100%" }}>
                <Icon name="warning" size={16} />
                <span>{error}</span>
              </div>
            )}

            {busy ? (
              <ol className={s.stages}>
                {STAGES.map((st, i) => (
                  <li key={st.id} data-state={i < stage ? "done" : i === stage ? "active" : "idle"}>
                    <span className={s.dot}>
                      {i < stage ? (
                        <Icon name="check" size={13} />
                      ) : i === stage ? (
                        <span className="spinner" style={{ width: 13, height: 13 }} />
                      ) : null}
                    </span>
                    <span className="t-sm">{st.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="spread" style={{ width: "100%" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setOldText(SAMPLE_OLD);
                    setNewText(SAMPLE_NEW);
                  }}
                >
                  <Icon name="sparkle" size={16} />
                  Load a sample pair
                </button>
                <button
                  className="btn btn-lg"
                  onClick={() => run()}
                  disabled={!oldText.trim() || !newText.trim()}
                >
                  Diff them
                  <Icon name="arrowRight" size={17} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={s.results}>
            {/* ---- deterministic stats land immediately ---- */}
            <div className={s.statsStrip}>
              <div className={s.stat}>
                <strong className="t-h1">{stats.total}</strong>
                <span className="t-xs t-secondary">real changes found</span>
              </div>
              <div className={s.statBreak}>
                <span>
                  <em>{stats.modified}</em> reworded
                </span>
                <span>
                  <em>{stats.added}</em> added
                </span>
                <span>
                  <em>{stats.removed}</em> removed
                </span>
              </div>
              <p className="t-xs t-secondary">
                Computed directly from the text, before any model ran.
              </p>
            </div>

            {busy && (
              <ol className={s.stages}>
                {STAGES.map((st, i) => (
                  <li key={st.id} data-state={i < stage ? "done" : i === stage ? "active" : "idle"}>
                    <span className={s.dot}>
                      {i < stage ? (
                        <Icon name="check" size={13} />
                      ) : i === stage ? (
                        <span className="spinner" style={{ width: 13, height: 13 }} />
                      ) : null}
                    </span>
                    <span className="t-sm">
                      {st.label}
                      {i === 1 && changes ? ` — ${changes.length} matter` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {error && (
              <div className="notice notice-error">
                <Icon name="warning" size={16} />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <>
                <div className={s.verdict} data-dir={result.direction}>
                  <p className="t-h2 t-balance">{result.headline}</p>
                  <span className="t-sm t-secondary">
                    {DIRECTION[result.direction] || DIRECTION.neutral}
                  </span>
                </div>

                <section className="stack">
                  <div className="spread">
                    <h2 className="t-h2">Read these three</h2>
                    <span className="t-sm t-secondary">of {ranked.length} that matter</span>
                  </div>
                  <div className={s.list}>
                    {top3.map((v, i) => (
                      <ChangeCard
                        key={v.id}
                        rank={i + 1}
                        change={changes?.[v.id]}
                        verdict={v}
                        featured
                      />
                    ))}
                  </div>
                </section>

                {rest.length > 0 && (
                  <section className="stack">
                    <h2 className="t-h2">Everything else that changed</h2>
                    <div className={s.list}>
                      {rest.map((v, i) => (
                        <ChangeCard key={v.id} rank={i + 4} change={changes?.[v.id]} verdict={v} />
                      ))}
                    </div>
                  </section>
                )}

                <button className="btn btn-tertiary" onClick={reset}>
                  <Icon name="arrowLeft" size={16} />
                  Diff another pair
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
