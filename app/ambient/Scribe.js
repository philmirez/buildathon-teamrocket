"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import Markdown from "@/components/Markdown";
import { trackRunFinished, trackRunStarted } from "@/lib/analytics";
import { apiPost, useKeys } from "@/lib/keys";
import {
  applyAction,
  clearWorkspace,
  describeWorkspace,
  emptyWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "@/lib/ambient-store";
import { fail, gate, ok, requireKey, useWebMCPTools, withHandlers } from "@/lib/webmcp";
import { AMBIENT_TOOLS } from "./tools";
import s from "./scribe.module.css";

const SAMPLE = `Okay so two things from the standup. The roof guy came back with a quote, eighteen hundred for the flashing and the gutter section, he can start the ninth. I want to get a second quote before I say yes. Also Priya is out the week of the twelfth so we need to move the design review, probably to the fifteenth, and someone has to own the migration checklist while she's gone — I think that's Marcus. And remind me, I keep forgetting, the car registration expires end of next month.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wrap the vendor-prefixed Web Speech API. Returns null when unavailable. */
function makeRecognizer() {
  if (typeof window === "undefined") return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  return rec;
}

export default function Scribe() {
  const keys = useKeys();
  const [ws, setWs] = useState(emptyWorkspace);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("voice");
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [log, setLog] = useState([]);
  const [error, setError] = useState("");
  const [speechOK, setSpeechOK] = useState(true);

  const recRef = useRef(null);
  const finalRef = useRef("");
  // What's actually on screen: finalized results plus the interim tail. The
  // tail is the whole point — a short sentence often never finalizes before
  // the session ends, and dropping it looked like the app ignoring you.
  const liveRef = useRef("");
  // Recognition callbacks are wired once per session; this keeps them filing
  // against the current run() (and so the current workspace), not a stale one.
  const runRef = useRef(null);
  // Set when recognition is ending because of an error, so onend doesn't file.
  const abortedRef = useRef(false);

  // --- persistence -------------------------------------------------------
  useEffect(() => {
    setWs(loadWorkspace());
    setHydrated(true);
    if (!makeRecognizer()) {
      setSpeechOK(false);
      setMode("type");
    }
  }, []);

  useEffect(() => {
    if (hydrated) saveWorkspace(ws);
  }, [ws, hydrated]);

  const selected = useMemo(
    () => ws.notes.find((n) => n.id === selectedId) || null,
    [ws.notes, selectedId]
  );

  // --- the agent turn ----------------------------------------------------
  const run = useCallback(
    async (text) => {
      const transcript = text.trim();
      if (!transcript || busy) return { error: busy ? "Still organizing the last one." : "Nothing to file." };
      if (!keys.gemini) {
        const msg = "Add your Gemini key with the key button up top first.";
        setError(msg);
        return { error: msg };
      }

      setBusy(true);
      trackRunStarted("ambient");
      setError("");
      setReply("");
      setLog([]);
      setLive("");
      setDraft("");

      try {
        const data = await apiPost("/api/ambient", {
          transcript,
          tree: describeWorkspace(ws),
        });

        setReply(data.reply || "");

        // Apply one action at a time so the user watches the workspace
        // assemble itself rather than seeing it snap into place.
        let current = ws;
        const entries = [];
        for (const action of data.actions || []) {
          const { workspace, log: entry } = applyAction(current, action);
          current = workspace;
          setWs(workspace);
          if (entry) {
            entries.push(entry);
            setLog((l) => [...l, entry]);
            if (entry.icon === "note" && entry.id) setSelectedId(entry.id);
            await sleep(320);
          }
        }

        if (!(data.actions || []).length) {
          setError(data.reply || "Nothing in there worth filing.");
        }
        trackRunFinished("ambient", "success");
        return { reply: data.reply || "", entries, workspace: current };
      } catch (e) {
        setError(e.message);
        trackRunFinished("ambient", "error");
        return { error: e.message };
      } finally {
        setBusy(false);
      }
    },
    [busy, keys.gemini, ws]
  );

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  // --- microphone --------------------------------------------------------

  /** Detach and stop the recognizer without filing anything. */
  const teardown = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      rec.onend = null;
      rec.onresult = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      recRef.current = null;
    }
    setListening(false);
  }, []);

  /** File everything heard so far, interim words included. */
  const fileCaptured = useCallback(() => {
    const text = (liveRef.current || finalRef.current).trim();
    finalRef.current = "";
    liveRef.current = "";
    if (text) runRef.current?.(text);
  }, []);

  const stopListening = useCallback(() => {
    teardown();
    fileCaptured();
  }, [teardown, fileCaptured]);

  /**
   * Hand off to the textarea instead of filing. Whatever the mic has heard so
   * far — including interim words that never finalized — moves into the draft
   * rather than being thrown away.
   */
  const switchToType = useCallback(() => {
    teardown();

    const captured = (liveRef.current || finalRef.current).trim();
    finalRef.current = "";
    liveRef.current = "";
    setLive("");
    if (captured) setDraft((d) => (d.trim() ? `${d.trim()} ${captured}` : captured));
    setMode("type");
  }, [teardown]);

  const startListening = useCallback(() => {
    const rec = makeRecognizer();
    if (!rec) {
      setSpeechOK(false);
      setMode("type");
      return;
    }
    finalRef.current = "";
    liveRef.current = "";
    abortedRef.current = false;
    setLive("");
    setError("");

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalRef.current += chunk + " ";
        else interim += chunk;
      }
      liveRef.current = (finalRef.current + interim).trim();
      setLive(liveRef.current);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone blocked. Allow access, or switch to typing.");
        setMode("type");
        abortedRef.current = true;
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(`Microphone error: ${event.error}`);
        abortedRef.current = true;
      }
      setListening(false);
    };
    // Chrome ends the session on its own after a pause, even with
    // continuous = true. File what we heard instead of dropping it on the
    // floor and quietly flipping the button back to idle.
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      if (abortedRef.current) {
        abortedRef.current = false;
        return;
      }
      fileCaptured();
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
    }
  }, [fileCaptured]);

  useEffect(
    () => () => {
      const rec = recRef.current;
      if (rec) {
        rec.onend = null;
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    },
    []
  );

  // --- derived tree ------------------------------------------------------
  const tree = useMemo(() => {
    const groups = ws.folders.map((f) => ({
      folder: f,
      notes: ws.notes.filter((n) => n.folderId === f.id),
    }));
    const loose = ws.notes.filter((n) => !n.folderId);
    if (loose.length) groups.push({ folder: { id: "__loose", name: "Unfiled" }, notes: loose });
    return groups;
  }, [ws]);

  const isEmpty = hydrated && !ws.notes.length;

  const reset = () => {
    clearWorkspace();
    setWs(emptyWorkspace());
    setSelectedId(null);
    setLog([]);
    setReply("");
    setError("");
  };

  // --- WebMCP ------------------------------------------------------------
  // Capture goes through run(), the same path as the microphone and the
  // textarea, so the sidebar assembles itself on screen while the agent
  // waits. Deleting goes through the confirm bar first.
  const folderName = (id) => ws.folders.find((f) => f.id === id)?.name || null;
  const publicNote = (n, full = false) => ({
    id: n.id,
    title: n.title,
    folderId: n.folderId,
    folder: folderName(n.folderId),
    updatedAt: new Date(n.updatedAt).toISOString(),
    ...(full ? { body: n.body } : { preview: n.body.slice(0, 140).replace(/\s+/g, " ") }),
  });
  const listing = (space = ws) => ({
    folders: space.folders.map((f) => ({
      id: f.id,
      name: f.name,
      noteCount: space.notes.filter((n) => n.folderId === f.id).length,
    })),
    notes: space.notes.map((n) => ({ ...publicNote(n), folder: space.folders.find((f) => f.id === n.folderId)?.name || null })),
    unfiled: space.notes.filter((n) => !n.folderId).length,
  });
  const noNote = (id) =>
    fail(
      `No note with id "${id}".`,
      ws.notes.length ? "Call ambient_list_workspace for current ids." : "The workspace is empty."
    );

  useWebMCPTools(
    withHandlers(AMBIENT_TOOLS, {
      ambient_list_workspace: async () => ok({ ...listing(), busy, selectedId }),

      ambient_capture: async ({ text }) => {
        const transcript = (text || "").trim();
        if (!transcript) return fail("text is required.", "Pass what the user said, verbatim.");
        if (busy) return fail("Still organizing the last capture.", "Call again when ambient_list_workspace reports busy: false.");
        const missing = requireKey("gemini");
        if (missing) return missing;
        // Show the words being filed, the way a typed capture would.
        setMode("type");
        setDraft(transcript);
        const res = await run(transcript);
        if (res.error) return fail(res.error, "The same message is showing on the page. Fix the cause, then call again.");
        return ok({
          reply: res.reply,
          filed: res.entries.map((e) => ({ action: e.verb, target: e.target, noteId: e.icon === "note" ? e.id : undefined })),
          workspace: listing(res.workspace),
        });
      },

      ambient_get_note: async ({ id }) => {
        const note = ws.notes.find((n) => n.id === id);
        if (!note) return noNote(id);
        setSelectedId(note.id);
        return ok(publicNote(note, true));
      },

      ambient_delete_note: async ({ id }, { signal }) => {
        const note = ws.notes.find((n) => n.id === id);
        if (!note) return noNote(id);
        const refused = await gate({
          toolName: "ambient_delete_note",
          title: `Delete the note "${note.title}"?`,
          detail: `It is filed under ${folderName(note.folderId) || "Unfiled"}. There is no undo.`,
          signal,
        });
        if (refused) return refused;
        const { workspace, log: entry } = applyAction(ws, { type: "delete_note", noteId: note.id });
        setWs(workspace);
        if (entry) setLog((l) => [...l, entry]);
        if (selectedId === note.id) setSelectedId(null);
        return ok({ deleted: { id: note.id, title: note.title }, notesLeft: workspace.notes.length });
      },

      ambient_clear_workspace: async (_input, { signal }) => {
        if (!ws.notes.length && !ws.folders.length) return ok({ cleared: true, note: "The workspace was already empty." });
        const refused = await gate({
          toolName: "ambient_clear_workspace",
          title: "Clear the whole workspace?",
          detail: `${ws.notes.length} notes in ${ws.folders.length} folders are deleted for good.`,
          signal,
        });
        if (refused) return refused;
        reset();
        return ok({ cleared: true });
      },
    })
  );

  return (
    <Shell>
      <div className={s.layout}>
        {/* ---------------- Sidebar ---------------- */}
        <aside className={s.sidebar}>
          <div className={s.sideHead}>
            <span className="badge badge-blue">
              {ws.notes.length} note{ws.notes.length === 1 ? "" : "s"}
            </span>
            {ws.notes.length > 0 && (
              <button className="btn btn-ghost btn-icon btn-sm" onClick={reset} aria-label="Clear workspace">
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>

          <div className={s.tree}>
            {tree.map(({ folder, notes }) => (
              <div key={folder.id} className={s.group}>
                <div className={s.folderRow}>
                  <Icon name="folder" size={15} />
                  <span className="truncate">{folder.name}</span>
                  <span className={`t-xs t-secondary ${s.count}`}>{notes.length}</span>
                </div>
                {notes.map((n) => (
                  <button
                    key={n.id}
                    className={`${s.noteRow} ${n.id === selectedId ? s.noteActive : ""}`}
                    onClick={() => setSelectedId(n.id)}
                  >
                    <Icon name="note" size={14} />
                    <span className="truncate">{n.title}</span>
                  </button>
                ))}
              </div>
            ))}

            {isEmpty && (
              <p className={`t-sm t-secondary ${s.sideEmpty}`}>
                Folders appear here once you talk.
              </p>
            )}
          </div>
        </aside>

        {/* ---------------- Main ---------------- */}
        <section className={s.main}>
          <div className={s.canvas}>
            {selected ? (
              <article className={s.note} key={selected.id}>
                <h1 className="t-h1">{selected.title}</h1>
                <Markdown>{selected.body}</Markdown>
              </article>
            ) : (
              <div className={s.empty}>
                <span className={s.emptyIcon} aria-hidden="true">
                  <Icon name="mic" size={30} />
                </span>
                <h1 className="t-h1 t-balance">Just talk.</h1>
                <p className="t-body t-secondary t-balance">
                  It decides the folders, writes the notes, and files them. You never organize
                  anything.
                </p>
                <button
                  className="btn btn-tertiary"
                  onClick={() => {
                    setMode("type");
                    setDraft(SAMPLE);
                  }}
                  disabled={busy}
                >
                  <Icon name="sparkle" size={16} />
                  Use a sample braindump
                </button>
              </div>
            )}
          </div>

          {/* ---------------- Capture dock ---------------- */}
          <div className={s.dock}>
            {(log.length > 0 || reply) && (
              <div className={s.activity}>
                {log.map((entry, i) => (
                  <div className={s.logRow} key={i} style={{ animationDelay: `${i * 40}ms` }}>
                    <Icon name={entry.icon} size={14} />
                    <span className="t-sm t-secondary">{entry.verb}</span>
                    <span className="t-sm">{entry.target}</span>
                  </div>
                ))}
                {reply && !busy && <p className={`t-sm ${s.reply}`}>{reply}</p>}
              </div>
            )}

            {error && (
              <div className={`notice notice-error ${s.err}`}>
                <Icon name="warning" size={16} />
                <span>{error}</span>
              </div>
            )}

            {mode === "voice" ? (
              <div className={s.voice}>
                {listening && (
                  /* Decorative — "Listening…" below already announces the state,
                     so this stays out of the accessibility tree. */
                  <Image
                    className={s.voiceArt}
                    src="/teamrocketsvoice.webp"
                    alt=""
                    aria-hidden="true"
                    width={355}
                    height={266}
                    unoptimized
                  />
                )}
                <p className={`t-sm ${s.liveText}`}>
                  {busy
                    ? "Organizing…"
                    : live || (listening ? "Listening…" : "Tap to start talking")}
                </p>
                <div className="row">
                  <button
                    className={`${s.mic} ${listening ? s.micLive : ""}`}
                    onClick={listening ? stopListening : startListening}
                    disabled={busy}
                    aria-label={listening ? "Stop and file" : "Start talking"}
                  >
                    {busy ? (
                      <span className="spinner" style={{ width: 22, height: 22 }} />
                    ) : (
                      <Icon name={listening ? "stop" : "mic"} size={24} />
                    )}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={switchToType}
                    disabled={busy}
                  >
                    Type instead
                  </button>
                </div>
              </div>
            ) : (
              <div className={s.typed}>
                <textarea
                  className="textarea"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Say everything on your mind. It sorts itself out."
                  rows={3}
                  disabled={busy}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(draft);
                  }}
                />
                <div className="spread">
                  {speechOK ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setMode("voice")}
                      disabled={busy}
                    >
                      <Icon name="mic" size={16} />
                      Talk instead
                    </button>
                  ) : (
                    <span className="t-xs t-secondary">
                      This browser has no speech API — typing works the same.
                    </span>
                  )}
                  <button className="btn" onClick={() => run(draft)} disabled={busy || !draft.trim()}>
                    {busy ? <span className="spinner" /> : <Icon name="sparkle" size={16} />}
                    {busy ? "Organizing" : "File it"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </Shell>
  );
}
