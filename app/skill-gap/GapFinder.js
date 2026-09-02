"use client";

import { useRef, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { trackRunFinished, trackRunStarted } from "@/lib/analytics";
import { apiPost, getKey } from "@/lib/keys";
import { DOC_ACCEPT, readDocument } from "@/lib/files";
import { fail, ok, requireKey, useWebMCPTools, withHandlers } from "@/lib/webmcp";
import { SAMPLE_JOB, SAMPLE_RESUME } from "./samples";
import { SKILLGAP_SAMPLES, SKILLGAP_TOOLS } from "./tools";
import s from "./gap.module.css";

const STAGES = [
  { id: "extract", label: "Reading both documents" },
  { id: "diff", label: "Diffing against requirements" },
  { id: "plan", label: "Drafting the two weeks" },
];

const STATUS = {
  have: { label: "Have it", badge: "badge-green", icon: "check" },
  partial: { label: "Thin", badge: "badge-yellow", icon: "warning" },
  missing: { label: "Missing", badge: "badge-red", icon: "x" },
};

/** Circular fit gauge. */
function Fit({ value }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const tone = pct >= 70 ? "var(--green-3)" : pct >= 45 ? "var(--yellow-3)" : "var(--red-3)";
  return (
    <div className={s.fit}>
      <svg viewBox="0 0 110 110" width="110" height="110" aria-hidden="true">
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          transform="rotate(-90 55 55)"
          className={s.fitArc}
        />
      </svg>
      <div className={s.fitLabel}>
        <span className="t-h1" style={{ color: tone }}>
          {pct}
        </span>
        <span className="t-xs t-secondary">fit</span>
      </div>
    </div>
  );
}

export default function GapFinder() {
  const [job, setJob] = useState("");
  const [resume, setResume] = useState("");
  const [stage, setStage] = useState(-1);
  const [diff, setDiff] = useState(null);
  const [plan, setPlan] = useState(null);
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(null);
  const jobFile = useRef(null);
  const resumeFile = useRef(null);

  const busy = stage >= 0 && stage < STAGES.length;

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
  const done = Boolean(diff);

  /**
   * All three stages. Returns what they produced as well as setting state,
   * so the WebMCP tool can hand the same result to an agent. `docs` lets a
   * tool analyze text it just set, before React has re-rendered with it.
   */
  async function analyze(docs = {}) {
    const posting = docs.job ?? job;
    const cv = docs.resume ?? resume;
    if (!getKey("gemini")) {
      const msg = "Add your Gemini key with the key button up top first.";
      setError(msg);
      return { error: msg };
    }
    setError("");
    setDiff(null);
    setPlan(null);
    trackRunStarted("skill-gap");

    try {
      setStage(0);
      const extracted = await apiPost("/api/skill-gap", { stage: "extract", job: posting, resume: cv });
      const detected = extracted.job?.role || "";
      setRole(detected);

      setStage(1);
      const diffed = await apiPost("/api/skill-gap", { stage: "diff", ...extracted });
      setDiff(diffed);

      setStage(2);
      const planned = await apiPost("/api/skill-gap", {
        stage: "plan",
        role: extracted.job?.role,
        results: diffed.results,
      });
      setPlan(planned);

      setStage(STAGES.length);
      trackRunFinished("skill-gap", "success");
      return { role: detected, diff: diffed, plan: planned };
    } catch (e) {
      setError(e.message);
      setStage(-1);
      trackRunFinished("skill-gap", "error");
      return { error: e.message };
    }
  }

  function reset() {
    setDiff(null);
    setPlan(null);
    setStage(-1);
    setError("");
  }

  const gaps = (diff?.results || []).filter((r) => r.status !== "have");
  const ordered = [...(diff?.results || [])].sort((a, b) => {
    const rank = { missing: 0, partial: 1, have: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return a.importance === b.importance ? 0 : a.importance === "must" ? -1 : 1;
  });

  // --- WebMCP ------------------------------------------------------------
  // Tools fill the same boxes and run the same three requests the button
  // does, so the stage list advances on screen while an agent waits.
  const publicResult = (r, d, p) => ({
    role: r || undefined,
    fit: d.fit,
    verdict: d.verdict,
    requirements: (d.results || []).map((x) => ({
      skill: x.skill,
      importance: x.importance,
      status: x.status,
      why: x.why,
      proof: x.proof || undefined,
    })),
    gaps: (d.results || []).filter((x) => x.status !== "have").map((x) => x.skill),
    plan: p
      ? {
          focus: p.focus,
          totalMinutes: (p.days || []).reduce((a, day) => a + (day.minutes || 0), 0),
          days: (p.days || []).map((day) => ({
            day: day.day,
            skill: day.skill,
            minutes: day.minutes,
            task: day.task,
            proof: day.proof,
            resource: day.resource || undefined,
            url: day.url || undefined,
          })),
        }
      : null,
    note: "Resources are model-suggested; check links before relying on them.",
  });
  const setInputs = ({ job: j, resume: r }) => {
    if (typeof j === "string") setJob(j);
    if (typeof r === "string") setResume(r);
  };

  useWebMCPTools(
    withHandlers(SKILLGAP_TOOLS, {
      skillgap_get_state: async () =>
        ok({
          jobChars: job.length,
          resumeChars: resume.length,
          stage: busy ? STAGES[stage].id : done ? "done" : "idle",
          busy,
          role: role || undefined,
          fit: diff?.fit,
          gapCount: diff ? gaps.length : null,
          requirementCount: diff ? diff.results.length : null,
          hasPlan: Boolean(plan),
          error: error || undefined,
        }),

      skillgap_set_inputs: async ({ job: j, resume: r }) => {
        if (busy) return fail("An analysis is in progress.", "Wait for skillgap_analyze to return first.");
        if (typeof j !== "string" && typeof r !== "string") return fail("Pass job, resume or both.");
        setInputs({ job: j, resume: r });
        if (done) reset();
        return ok({ jobChars: (j ?? job).length, resumeChars: (r ?? resume).length, next: "Call skillgap_analyze when both are loaded." });
      },

      skillgap_load_sample: async ({ name = SKILLGAP_SAMPLES[0] } = {}) => {
        if (busy) return fail("An analysis is in progress.", "Wait for skillgap_analyze to return first.");
        if (!SKILLGAP_SAMPLES.includes(name)) return fail(`No sample called "${name}".`, `Available: ${SKILLGAP_SAMPLES.join(", ")}.`);
        setInputs({ job: SAMPLE_JOB, resume: SAMPLE_RESUME });
        if (done) reset();
        return ok({ loaded: name, jobChars: SAMPLE_JOB.length, resumeChars: SAMPLE_RESUME.length, next: "Call skillgap_analyze." });
      },

      skillgap_analyze: async () => {
        if (busy) return fail("An analysis is already in progress.", "Wait for it to return, then call skillgap_get_result.");
        if (!job.trim() || !resume.trim()) {
          return fail("Both the posting and the resume are needed.", "Call skillgap_set_inputs with job and resume, or skillgap_load_sample.");
        }
        const missing = requireKey("gemini");
        if (missing) return missing;
        const res = await analyze();
        if (res.error) return fail(res.error, "The same message is showing on the page. Fix the cause, then call again.");
        return ok(publicResult(res.role, res.diff, res.plan));
      },

      skillgap_get_result: async () => {
        if (!diff) {
          return fail(
            busy ? `Still running: ${STAGES[stage].label.toLowerCase()}.` : "No analysis yet.",
            busy ? "Call again when skillgap_analyze returns." : "Call skillgap_analyze first."
          );
        }
        return ok(publicResult(role, diff, plan));
      },

      skillgap_reset: async () => {
        if (busy) return fail("An analysis is in progress.", "Wait for it to return first.");
        reset();
        return ok({ reset: true, note: "The posting and resume are still loaded." });
      },
    })
  );

  return (
    <Shell>
      <div className="container-narrow" style={{ paddingBlock: "var(--s-7)" }}>
        {!done ? (
          <div className={s.intake}>
            <header className={s.head}>
              <span className={s.headIcon} aria-hidden="true">
                <Icon name="target" size={24} />
              </span>
              <h1 className="t-h1 t-balance">What were you actually missing?</h1>
              <p className="t-body t-secondary t-balance">
                Paste a posting and a resume. You get the concrete gap, scored against the
                requirements, and fourteen days that close it.
              </p>
            </header>

            <div className={s.pair}>
              {[
                { id: "job", label: "Job posting", value: job, set: setJob, ref: jobFile,
                  placeholder: "Paste the full posting\u2026" },
                { id: "resume", label: "Resume", value: resume, set: setResume, ref: resumeFile,
                  placeholder: "Paste the resume\u2026" },
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
                    placeholder={f.placeholder}
                    disabled={busy}
                  />
                  {f.value && (
                    <p className="field-hint">{f.value.length.toLocaleString()} characters</p>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div className="notice notice-error">
                <Icon name="warning" size={16} />
                <span>{error}</span>
              </div>
            )}

            {busy ? (
              <ol className={s.stages}>
                {STAGES.map((st, i) => (
                  <li key={st.id} className={s.stage} data-state={i < stage ? "done" : i === stage ? "active" : "idle"}>
                    <span className={s.stageDot}>
                      {i < stage ? <Icon name="check" size={13} /> : i === stage ? <span className="spinner" style={{ width: 13, height: 13 }} /> : null}
                    </span>
                    <span className="t-sm">{st.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="spread">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setJob(SAMPLE_JOB);
                    setResume(SAMPLE_RESUME);
                  }}
                >
                  <Icon name="sparkle" size={16} />
                  Load a sample pair
                </button>
                <button className="btn btn-lg" onClick={analyze} disabled={!job.trim() || !resume.trim()}>
                  Find the gap
                  <Icon name="arrowRight" size={17} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={s.results}>
            <div className={s.verdict}>
              <Fit value={diff.fit} />
              <div className="stack" style={{ "--gap": "var(--s-2)" }}>
                {role && <span className="badge badge-blue">{role}</span>}
                <p className="t-body">{diff.verdict}</p>
              </div>
            </div>

            <section className="stack">
              <div className="spread">
                <h2 className="t-h2">Requirements</h2>
                <span className="t-sm t-secondary">
                  {gaps.length} of {diff.results.length} not yet covered
                </span>
              </div>

              <ul className={s.reqs}>
                {ordered.map((r, i) => {
                  const meta = STATUS[r.status] || STATUS.missing;
                  return (
                    <li key={i} className={s.req} data-status={r.status}>
                      <span className={s.reqIcon} aria-hidden="true">
                        <Icon name={meta.icon} size={14} />
                      </span>
                      <div className={s.reqBody}>
                        <div className="row-wrap" style={{ "--gap": "var(--s-2)" }}>
                          <strong className="t-h3">{r.skill}</strong>
                          {r.importance === "must" && <span className="badge">Required</span>}
                          <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        </div>
                        <p className="t-sm t-secondary">{r.why}</p>
                        {r.proof && <p className={`t-xs ${s.proof}`}>“{r.proof}”</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="stack">
              <div className="spread">
                <h2 className="t-h2">Two weeks</h2>
                {plan?.days?.length > 0 && (
                  <span className="t-sm t-secondary">
                    {plan.days.reduce((a, d) => a + (d.minutes || 0), 0) / 60 | 0}h total
                  </span>
                )}
              </div>

              {!plan ? (
                <div className="row t-sm t-secondary">
                  <span className="spinner" />
                  Drafting the plan…
                </div>
              ) : (
                <>
                  {plan.focus && <p className="t-body t-secondary">{plan.focus}</p>}
                  <ol className={s.plan}>
                    {(plan.days || []).map((d) => (
                      <li key={d.day} className={s.day}>
                        <div className={s.dayNum}>
                          <span className="t-xs t-secondary">Day</span>
                          <strong className="t-h3">{d.day}</strong>
                        </div>
                        <div className={s.dayBody}>
                          <div className="row-wrap" style={{ "--gap": "var(--s-2)" }}>
                            <span className="badge badge-blue">{d.skill}</span>
                            <span className="t-xs t-secondary">
                              <Icon name="clock" size={12} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                              {d.minutes}m
                            </span>
                          </div>
                          <p className="t-sm">{d.task}</p>
                          <p className={`t-xs t-secondary ${s.proofOut}`}>
                            <Icon name="check" size={12} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                            {d.proof}
                          </p>
                          {d.resource &&
                            (d.url ? (
                              <a className={`t-xs ${s.res}`} href={d.url} target="_blank" rel="noreferrer noopener">
                                <Icon name="link" size={12} />
                                {d.resource}
                              </a>
                            ) : (
                              <span className={`t-xs t-secondary ${s.res}`}>
                                <Icon name="book" size={12} />
                                {d.resource}
                              </span>
                            ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="t-xs t-secondary">
                    Resources are model-suggested — check each link before you rely on it.
                  </p>
                </>
              )}
            </section>

            <button className="btn btn-tertiary" onClick={reset}>
              <Icon name="arrowLeft" size={16} />
              Run another
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}
