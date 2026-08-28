"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import Markdown from "@/components/Markdown";
import { apiPost, useKeys } from "@/lib/keys";
import {
  applyAction,
  clearWorkspace,
  describeWorkspace,
  emptyWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "@/lib/ambient-store";
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
      if (!transcript || busy) return;
      if (!keys.gemini) {
        setError("Add your Gemini key with the key button up top first.");
        return;
      }

      setBusy(true);
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
        for (const action of data.actions || []) {
          const { workspace, log: entry } = applyAction(current, action);
          current = workspace;
          setWs(workspace);
          if (entry) {
            setLog((l) => [...l, entry]);
            if (entry.icon === "note" && entry.id) setSelectedId(entry.id);
            await sleep(320);
          }
        }

        if (!(data.actions || []).length) {
          setError(data.reply || "Nothing in there worth filing.");
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
    [busy, keys.gemini, ws]
  );

  // --- microphone --------------------------------------------------------
  const stopListening = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      recRef.current = null;
    }
    setListening(false);
    const text = finalRef.current.trim();
    finalRef.current = "";
    if (text) run(text);
  }, [run]);

  const startListening = useCallback(() => {
    const rec = makeRecognizer();
    if (!rec) {
      setSpeechOK(false);
      setMode("type");
      return;
    }
    finalRef.current = "";
    setLive("");
    setError("");

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalRef.current += chunk + " ";
        else interim += chunk;
      }
      setLive((finalRef.current + interim).trim());
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone blocked. Allow access, or switch to typing.");
        setMode("type");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(`Microphone error: ${event.error}`);
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
    }
  }, []);

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
                    onClick={() => setMode("type")}
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
