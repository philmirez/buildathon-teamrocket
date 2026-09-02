"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { trackRunFinished, trackRunStarted } from "@/lib/analytics";
import { apiPost, getKey } from "@/lib/keys";
import { fail, gate, ok, requireKey, useWebMCPTools, withHandlers } from "@/lib/webmcp";
import { TASKBOARD_TOOLS } from "./tools";
import s from "./board.module.css";

const STORAGE_KEY = "broccoli.taskboard.v1";
const STAGES = [
  { id: "todo", label: "Not started" },
  { id: "doing", label: "In progress" },
  { id: "done", label: "Done" },
];
const DAY = 86400000;

const uid = () => `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// Wrapped so closures handed to the WebMCP hook read as pure to the compiler lint.
const stamp = () => Date.now();
const daysIdle = (t) => Math.max(0, Math.floor((Date.now() - t.movedAt) / DAY));

export default function Board() {
  const [goal, setGoal] = useState("");
  const [horizon, setHorizon] = useState("");
  const [tasks, setTasks] = useState([]);
  const [savedGoal, setSavedGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const [triage, setTriage] = useState(null);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [hoverStage, setHoverStage] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // --- persistence -------------------------------------------------------
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (raw?.tasks) {
        setTasks(raw.tasks);
        setSavedGoal(raw.goal || "");
      }
    } catch {
      /* corrupt state — start fresh */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ goal: savedGoal, tasks }));
    }
  }, [tasks, savedGoal, hydrated]);

  // --- weighted progress -------------------------------------------------
  const totals = useMemo(() => {
    const total = tasks.reduce((a, t) => a + t.weight, 0) || 1;
    const done = tasks.filter((t) => t.stage === "done").reduce((a, t) => a + t.weight, 0);
    const doing = tasks.filter((t) => t.stage === "doing").reduce((a, t) => a + t.weight, 0);
    return {
      total,
      donePct: Math.round((done / total) * 100),
      doingPct: Math.round((doing / total) * 100),
    };
  }, [tasks]);

  const flagFor = (id) => triage?.flags?.find((f) => f.id === id);

  // --- actions -----------------------------------------------------------
  // Both agent calls return what they did as well as setting state, so the
  // WebMCP tools below can hand the same result back to whoever called them.
  const NO_KEY = "Add your Gemini key with the key button up top first.";

  async function plan(nextGoal = goal, nextHorizon = horizon) {
    if (!getKey("gemini")) {
      setError(NO_KEY);
      return { error: NO_KEY };
    }
    setBusy(true);
    trackRunStarted("taskboard");
    setError("");
    setTriage(null);
    try {
      const data = await apiPost("/api/taskboard", {
        stage: "plan",
        goal: nextGoal,
        horizon: nextHorizon,
      });
      const now = stamp();
      const made = (data.tasks || []).map((t) => ({
        id: uid(),
        title: t.title,
        detail: t.detail,
        weight: t.weight,
        stage: "todo",
        movedAt: now,
      }));
      setSavedGoal(data.goal || nextGoal);
      setTasks(made);
      trackRunFinished("taskboard", "success");
      return { goal: data.goal || nextGoal, tasks: made };
    } catch (e) {
      setError(e.message);
      trackRunFinished("taskboard", "error");
      return { error: e.message };
    } finally {
      setBusy(false);
    }
  }

  async function runTriage() {
    if (!getKey("gemini")) {
      setError(NO_KEY);
      return { error: NO_KEY };
    }
    setTriaging(true);
    setError("");
    try {
      const data = await apiPost("/api/taskboard", {
        stage: "triage",
        goal: savedGoal,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          weight: t.weight,
          stage: t.stage,
          daysIdle: daysIdle(t),
        })),
      });
      setTriage(data);
      return data;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setTriaging(false);
    }
  }

  function move(id, stage) {
    setTasks((ts) =>
      ts.map((t) => (t.id === id && t.stage !== stage ? { ...t, stage, movedAt: Date.now() } : t))
    );
  }

  function advance(t) {
    const i = STAGES.findIndex((x) => x.id === t.stage);
    move(t.id, STAGES[Math.min(i + 1, STAGES.length - 1)].id);
  }

  /** Demo control: rewind every card's clock so neglect is observable now. */
  function ageBoard() {
    setTasks((ts) =>
      ts.map((t, i) => ({
        ...t,
        movedAt: t.stage === "done" ? t.movedAt : Date.now() - (3 + i * 2.5) * DAY,
      }))
    );
    setTriage(null);
  }

  function reset() {
    setTasks([]);
    setSavedGoal("");
    setTriage(null);
    setGoal("");
    setError("");
  }

  const hasBoard = tasks.length > 0;

  // --- WebMCP ------------------------------------------------------------
  // Agents drive the same functions the buttons call, so the board on screen
  // is always the record of what a tool did. Ids are the real card ids.
  const publicTask = (t) => {
    const flag = flagFor(t.id);
    return {
      id: t.id,
      title: t.title,
      detail: t.detail,
      weight: t.weight,
      stage: t.stage,
      movedAt: new Date(t.movedAt).toISOString(),
      daysIdle: daysIdle(t),
      ...(flag ? { flag: flag.severity, flagNote: flag.note } : {}),
    };
  };
  const snapshot = () => ({
    hasBoard,
    goal: savedGoal,
    horizon,
    progressPercent: totals.donePct,
    underwayPercent: totals.doingPct,
    stages: STAGES.map((x) => ({ id: x.id, label: x.label })),
    tasks: tasks.map(publicTask),
    triage: triage ? { headline: triage.headline, focus: triage.focus } : null,
    busy: busy || triaging,
  });
  const validStage = (stage) => STAGES.some((x) => x.id === stage);
  const badStage = (stage) => fail(`Unknown stage "${stage}".`, "Use todo, doing or done.");
  const unknownTask = (id) =>
    fail(
      `No task with id "${id}".`,
      tasks.length
        ? `Known ids: ${tasks.map((t) => t.id).join(", ")}. Call taskboard_get_state for their titles.`
        : "The board is empty. Build one with taskboard_set_goal first."
    );

  useWebMCPTools(
    withHandlers(TASKBOARD_TOOLS, {
      taskboard_get_state: async () => ok(snapshot()),

      taskboard_set_goal: async ({ goal: g, horizon: h }) => {
        const nextGoal = (g || "").trim();
        const nextHorizon = (h || "").trim();
        if (!nextGoal) return fail("goal is required.", "Pass the outcome the user wants, in a sentence or two.");
        if (hasBoard) {
          return fail(
            "A board already exists.",
            "Add to it with taskboard_add_task, or call taskboard_reset (the user will confirm) and set the goal again."
          );
        }
        setGoal(nextGoal);
        setHorizon(nextHorizon);
        const missing = requireKey("gemini");
        if (missing) return missing;
        const res = await plan(nextGoal, nextHorizon);
        if (res.error) return fail(res.error, "The same message is showing on the page. Fix the cause, then call again.");
        return ok({ goal: res.goal, horizon: nextHorizon, tasks: res.tasks.map(publicTask) });
      },

      taskboard_add_task: async ({ title, detail = "", stage = "todo", weight = 3 }) => {
        const name = (title || "").trim();
        if (!name) return fail("title is required.", "Two to five words naming the deliverable.");
        if (!validStage(stage)) return badStage(stage);
        const task = {
          id: uid(),
          title: name,
          detail: (detail || "").trim(),
          weight: Math.max(1, Math.min(5, Math.round(Number(weight)) || 3)),
          stage,
          movedAt: stamp(),
        };
        if (!hasBoard) setSavedGoal(savedGoal || goal.trim() || "Untitled goal");
        setTasks((ts) => [...ts, task]);
        return ok({ added: publicTask(task) });
      },

      taskboard_move_task: async ({ id, stage }) => {
        const t = tasks.find((x) => x.id === id);
        if (!t) return unknownTask(id);
        if (!validStage(stage)) return badStage(stage);
        if (t.stage === stage) return ok({ id, title: t.title, stage, unchanged: true });
        move(id, stage);
        return ok({ id, title: t.title, from: t.stage, to: stage });
      },

      taskboard_remove_task: async ({ id }, { signal }) => {
        const t = tasks.find((x) => x.id === id);
        if (!t) return unknownTask(id);
        const refused = await gate({
          toolName: "taskboard_remove_task",
          title: `Remove "${t.title}" from the board?`,
          detail: "The card is deleted for good. There is no undo.",
          signal,
        });
        if (refused) return refused;
        setTasks((ts) => ts.filter((x) => x.id !== id));
        return ok({ removed: { id, title: t.title } });
      },

      taskboard_triage: async () => {
        if (!hasBoard) return fail("The board is empty.", "Build one with taskboard_set_goal first.");
        const missing = requireKey("gemini");
        if (missing) return missing;
        const res = await runTriage();
        if (res.error) return fail(res.error, "The same message is showing on the page. Fix the cause, then call again.");
        return ok({ headline: res.headline, focus: res.focus, flags: res.flags });
      },

      taskboard_age_board: async () => {
        if (!hasBoard) return fail("The board is empty.", "Build one with taskboard_set_goal first.");
        ageBoard();
        return ok({
          aged: true,
          note: "Unfinished cards now read as idle for 3 to 20 days. Call taskboard_triage to see what gets flagged.",
        });
      },

      taskboard_reset: async (_input, { signal }) => {
        if (!hasBoard) return ok({ reset: true, note: "The board was already empty." });
        const refused = await gate({
          toolName: "taskboard_reset",
          title: "Clear the whole board?",
          detail: `Every card under "${savedGoal}" is deleted and the goal screen comes back.`,
          signal,
        });
        if (refused) return refused;
        reset();
        return ok({ reset: true });
      },
    })
  );

  return (
    <Shell>
      <div className="container" style={{ paddingBlock: "var(--s-6) var(--s-8)" }}>
        {!hasBoard ? (
          <div className={s.intake}>
            <span className={s.headIcon} aria-hidden="true">
              <Icon name="board" size={24} />
            </span>
            <h1 className="t-h1 t-balance">What are you trying to finish?</h1>
            <p className="t-body t-secondary t-balance">
              No deadlines here on purpose. The bar is weighted by real effort, so the heavy
              things can&apos;t hide behind the easy ones.
            </p>

            <div className={s.form}>
              <div className="field">
                <label className="field-label" htmlFor="goal">
                  Goal
                </label>
                <textarea
                  id="goal"
                  className="textarea"
                  rows={3}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Ship the self-serve onboarding flow"
                  disabled={busy}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="horizon">
                  Rough timeframe
                </label>
                <input
                  id="horizon"
                  className="input"
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value)}
                  placeholder="about six weeks"
                  disabled={busy}
                />
              </div>

              {error && (
                <div className="notice notice-error">
                  <Icon name="warning" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="spread">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setGoal("Ship the self-serve onboarding flow for our B2B dashboard");
                    setHorizon("about six weeks");
                  }}
                  disabled={busy}
                >
                  <Icon name="sparkle" size={16} />
                  Use an example
                </button>
                <button className="btn btn-lg" onClick={plan} disabled={busy || !goal.trim()}>
                  {busy ? <span className="spinner" /> : null}
                  {busy ? "Breaking it down" : "Build the board"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ "--gap": "var(--s-5)" }}>
            {/* ---- goal + weighted bar ---- */}
            <header className={s.top}>
              <div className="spread">
                <h1 className="t-h2">{savedGoal}</h1>
                <div className="row" style={{ "--gap": "var(--s-2)" }}>
                  <button className="btn btn-ghost btn-sm" onClick={ageBoard} title="Simulate time passing, to demo neglect detection">
                    <Icon name="clock" size={16} />
                    Age board
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={reset} aria-label="Start over">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>

              <div className={s.barWrap}>
                <div className={s.bar} role="img" aria-label={`${totals.donePct}% complete by effort`}>
                  {tasks.map((t) => {
                    const flag = flagFor(t.id);
                    return (
                      <span
                        key={t.id}
                        className={s.seg}
                        data-stage={t.stage}
                        data-flag={flag?.severity === "neglected" ? "" : undefined}
                        style={{ flexGrow: t.weight }}
                        title={`${t.title} · weight ${t.weight} · ${STAGES.find((x) => x.id === t.stage).label}`}
                      />
                    );
                  })}
                </div>
                <div className="spread">
                  <span className="t-xs t-secondary">
                    Each segment is a card, sized by effort
                  </span>
                  <span className="t-sm">
                    <strong>{totals.donePct}%</strong>{" "}
                    <span className="t-secondary">done · {totals.doingPct}% underway</span>
                  </span>
                </div>
              </div>
            </header>

            {/* ---- triage ---- */}
            <div className={s.coach}>
              {triage ? (
                <div className="stack" style={{ "--gap": "var(--s-2)" }}>
                  <div className="row">
                    <Icon name="warning" size={16} />
                    <strong className="t-h3">{triage.headline}</strong>
                  </div>
                  {triage.focus && <p className="t-sm t-secondary">{triage.focus}</p>}
                </div>
              ) : (
                <p className="t-sm t-secondary">
                  Nothing here has a deadline. Ask what&apos;s quietly rotting.
                </p>
              )}
              <button className="btn btn-secondary btn-sm" onClick={runTriage} disabled={triaging}>
                {triaging ? <span className="spinner" /> : <Icon name="sparkle" size={16} />}
                {triaging ? "Checking" : triage ? "Re-check" : "What's being neglected?"}
              </button>
            </div>

            {error && (
              <div className="notice notice-error">
                <Icon name="warning" size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* ---- columns ---- */}
            <div className={s.columns}>
              {STAGES.map((stage) => {
                const items = tasks.filter((t) => t.stage === stage.id);
                return (
                  <div
                    key={stage.id}
                    className={s.column}
                    data-hover={hoverStage === stage.id ? "" : undefined}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setHoverStage(stage.id);
                    }}
                    onDragLeave={() => setHoverStage((h) => (h === stage.id ? null : h))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) move(dragId, stage.id);
                      setDragId(null);
                      setHoverStage(null);
                    }}
                  >
                    <div className={s.colHead}>
                      <span className="t-sm" style={{ fontWeight: 600 }}>
                        {stage.label}
                      </span>
                      <span className="badge">{items.length}</span>
                    </div>

                    <div className={s.cards}>
                      {items.map((t) => {
                        const flag = flagFor(t.id);
                        const idle = daysIdle(t);
                        return (
                          <article
                            key={t.id}
                            className={s.card}
                            data-flag={flag?.severity}
                            draggable
                            onDragStart={() => setDragId(t.id)}
                            onDragEnd={() => {
                              setDragId(null);
                              setHoverStage(null);
                            }}
                          >
                            <div className="spread">
                              <strong className="t-sm">{t.title}</strong>
                              <span className={s.weight} title={`Effort ${t.weight} of 5`}>
                                {"▪".repeat(t.weight)}
                              </span>
                            </div>
                            <p className="t-xs t-secondary">{t.detail}</p>

                            {flag && flag.severity !== "ok" && (
                              <p className={s.flagNote} data-sev={flag.severity}>
                                <Icon name="warning" size={12} />
                                {flag.note}
                              </p>
                            )}

                            <div className={s.cardFoot}>
                              <span className="t-xs t-secondary">
                                {t.stage === "done"
                                  ? "complete"
                                  : idle === 0
                                    ? "moved today"
                                    : `idle ${idle}d`}
                              </span>
                              {t.stage !== "done" && (
                                <button
                                  className="btn btn-ghost btn-sm btn-icon"
                                  onClick={() => advance(t)}
                                  aria-label={`Move ${t.title} forward`}
                                >
                                  <Icon name="arrowRight" size={15} />
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}

                      {!items.length && <p className={s.colEmpty}>—</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
