"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { trackRunFinished, trackRunStarted } from "@/lib/analytics";
import { apiPost, getKey } from "@/lib/keys";
import { fail, gate, ok, requireKey, useWebMCPTools, withHandlers } from "@/lib/webmcp";
import { SAMPLE_TEXT } from "./sample";
import { CAPTURED_TOOLS } from "./tools";
import s from "./reader.module.css";

const AUTOPLAY_MS = 9000;

export default function Reader() {
  const [text, setText] = useState("");
  const [book, setBook] = useState(null);
  const [images, setImages] = useState({}); // index -> {image, credit, source, degraded}
  const [pending, setPending] = useState({});
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const imagesRef = useRef(images);
  imagesRef.current = images;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  /** Render one scene. Safe to call repeatedly — it de-dupes in flight. */
  const render = useCallback(
    async (scene, i) => {
      if (!scene || imagesRef.current[i] || pendingRef.current[i]) return;
      setPending((p) => ({ ...p, [i]: true }));
      try {
        const data = await apiPost("/api/captured", {
          stage: "image",
          prompt: scene.prompt,
          search: scene.search,
          pixabayKey: getKey("pixabay"),
        });
        setImages((m) => ({ ...m, [i]: data }));
        if (data.degraded) setNotice(data.degraded);
      } catch (e) {
        setImages((m) => ({ ...m, [i]: { image: null, degraded: e.message } }));
      } finally {
        setPending((p) => {
          const next = { ...p };
          delete next[i];
          return next;
        });
      }
    },
    []
  );

  /** Split the text into scenes. Returns the book, or the error, for the tool. */
  async function begin(source = text) {
    if (!getKey("gemini")) {
      const msg = "Add your Gemini key with the key button up top first.";
      setError(msg);
      return { error: msg };
    }
    setBusy(true);
    trackRunStarted("captured");
    setError("");
    setNotice("");
    setImages({});
    try {
      const data = await apiPost("/api/captured", { stage: "scenes", text: source });
      if (!data.scenes?.length) throw new Error("No visual scenes found in that text.");
      setBook(data);
      setIdx(0);
      // Warm the first two so the reader never opens on an empty frame.
      render(data.scenes[0], 0);
      if (data.scenes[1]) render(data.scenes[1], 1);
      trackRunFinished("captured", "success");
      return { book: data };
    } catch (e) {
      setError(e.message);
      trackRunFinished("captured", "error");
      return { error: e.message };
    } finally {
      setBusy(false);
    }
  }

  // Keep one scene ahead rendered, so moving forward feels instant.
  useEffect(() => {
    if (!book) return;
    render(book.scenes[idx], idx);
    if (book.scenes[idx + 1]) render(book.scenes[idx + 1], idx + 1);
  }, [book, idx, render]);

  // Autoplay — the "podcast is running" mode.
  useEffect(() => {
    if (!playing || !book) return;
    const t = setTimeout(() => {
      setIdx((i) => (i + 1 < book.scenes.length ? i + 1 : (setPlaying(false), i)));
    }, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [playing, idx, book]);

  useEffect(() => {
    if (!book) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, book.scenes.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [book]);

  const scene = book?.scenes[idx];
  const shot = images[idx];
  const loading = pending[idx];

  // --- WebMCP ------------------------------------------------------------
  // Tools move the same index the arrows and ticks move, so the image stage
  // follows the agent scene by scene.
  const sceneAt = (i) => {
    const sc = book?.scenes[i];
    if (!sc) return null;
    const img = images[i];
    return {
      index: i + 1,
      of: book.scenes.length,
      beat: sc.beat,
      passage: sc.passage,
      quote: sc.quote || undefined,
      image: img?.image
        ? { status: "ready", source: img.source, credit: img.credit || undefined }
        : pending[i]
          ? { status: "rendering" }
          : { status: "none", reason: img?.degraded || "Not rendered yet." },
    };
  };
  const noBook = () => fail("The scenes have not been found yet.", "Call captured_start once text is loaded.");

  useWebMCPTools(
    withHandlers(CAPTURED_TOOLS, {
      captured_get_state: async () =>
        ok({
          textChars: text.length,
          busy,
          hasBook: Boolean(book),
          title: book?.title,
          sceneCount: book?.scenes.length ?? 0,
          currentScene: book ? idx + 1 : null,
          playing,
          imagesReady: Object.values(images).filter((m) => m?.image).length,
          notice: notice || undefined,
          error: error || undefined,
        }),

      captured_load_text: async ({ text: t }) => {
        const body = (t || "").trim();
        if (body.length < 200) return fail("Need at least 200 characters.", "Pass a few paragraphs of the chapter or transcript.");
        if (busy) return fail("Still finding the scenes.", "Wait for captured_start to return first.");
        if (book) return fail("The reader is open.", "Call captured_new_text (the user will confirm) before loading new text.");
        setText(body);
        return ok({ textChars: body.length, next: "Call captured_start." });
      },

      captured_load_sample: async () => {
        if (busy) return fail("Still finding the scenes.", "Wait for captured_start to return first.");
        if (book) return fail("The reader is open.", "Call captured_new_text (the user will confirm) before loading new text.");
        setText(SAMPLE_TEXT);
        return ok({ textChars: SAMPLE_TEXT.length, next: "Call captured_start." });
      },

      captured_start: async () => {
        if (busy) return fail("Already finding the scenes.", "Wait for this call to return.");
        if (book) return ok({ alreadyOpen: true, title: book.title, sceneCount: book.scenes.length, currentScene: idx + 1 });
        if (text.trim().length < 200) return fail("No text loaded.", "Call captured_load_text or captured_load_sample first.");
        const missing = requireKey("gemini");
        if (missing) return missing;
        const res = await begin();
        if (res.error) return fail(res.error, "The same message is showing on the page. Fix the cause, then call again.");
        return ok({
          title: res.book.title,
          style: res.book.style,
          scenes: res.book.scenes.map((sc, i) => ({ index: i + 1, beat: sc.beat })),
          note: "Images render one scene ahead. Call captured_get_scene to see whether the current one is ready.",
        });
      },

      captured_go_to_scene: async ({ index }) => {
        if (!book) return noBook();
        const n = Number(index);
        if (!Number.isInteger(n) || n < 1 || n > book.scenes.length) {
          return fail(`Scene ${index} does not exist.`, `Use 1 to ${book.scenes.length}.`);
        }
        setIdx(n - 1);
        return ok(sceneAt(n - 1));
      },

      captured_get_scene: async () => (book ? ok(sceneAt(idx)) : noBook()),

      captured_set_playing: async ({ playing: on }) => {
        if (!book) return noBook();
        setPlaying(Boolean(on));
        return ok({ playing: Boolean(on), currentScene: idx + 1, of: book.scenes.length });
      },

      captured_new_text: async (_input, { signal }) => {
        if (!book) return ok({ closed: true, note: "The reader was not open." });
        const refused = await gate({
          toolName: "captured_new_text",
          title: `Close "${book.title}"?`,
          detail: `${Object.values(images).filter((m) => m?.image).length} rendered images are dropped. The text stays in the box.`,
          signal,
        });
        if (refused) return refused;
        setBook(null);
        setPlaying(false);
        setNotice("");
        return ok({ closed: true });
      },
    })
  );

  return (
    <Shell>
      {!book ? (
        <div className="container-narrow" style={{ paddingBlock: "var(--s-7)" }}>
          <div className={s.intake}>
            <span className={s.headIcon} aria-hidden="true">
              <Icon name="image" size={24} />
            </span>
            <h1 className="t-h1 t-balance">See what you&apos;re reading.</h1>
            <p className="t-body t-secondary t-balance">
              Paste a chapter or a transcript. It finds the visual beats, fixes one look for
              the whole piece, and illustrates each one as you move through it.
            </p>

            <div className="field" style={{ width: "100%", marginTop: "var(--s-4)" }}>
              <label className="field-label" htmlFor="text">
                Chapter or transcript
              </label>
              <textarea
                id="text"
                className="textarea"
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste a few pages…"
                disabled={busy}
              />
            </div>

            {error && (
              <div className="notice notice-error" style={{ width: "100%" }}>
                <Icon name="warning" size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="spread" style={{ width: "100%" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setText(SAMPLE_TEXT)} disabled={busy}>
                <Icon name="sparkle" size={16} />
                Use a sample chapter
              </button>
              <button className="btn btn-lg" onClick={begin} disabled={busy || text.trim().length < 200}>
                {busy ? <span className="spinner" /> : null}
                {busy ? "Finding the scenes" : "Start reading"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className={s.reader}>
          {/* ---- image stage ---- */}
          <figure className={s.stage}>
            {shot?.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={idx} className={s.shot} src={shot.image} alt={scene.beat} />
            ) : loading ? (
              <div className={`skeleton ${s.shotSkeleton}`}>
                <span className="row t-sm t-secondary">
                  <span className="spinner" />
                  Illustrating this scene…
                </span>
              </div>
            ) : (
              <div className={s.shotEmpty}>
                <Icon name="image" size={28} />
                <p className="t-sm t-secondary t-balance">{shot?.degraded || "No image for this scene."}</p>
              </div>
            )}

            <figcaption className={s.caption}>
              <span className="t-xs t-secondary">{scene.beat}</span>
              {shot?.credit && <span className="t-xs t-secondary">{shot.credit}</span>}
            </figcaption>
          </figure>

          {/* ---- passage ---- */}
          <div className={s.pane}>
            <div className={s.paneHead}>
              <div className="row" style={{ "--gap": "var(--s-2)" }}>
                <Icon name="book" size={16} />
                <strong className="t-sm truncate">{book.title}</strong>
              </div>
              <span className="t-xs t-secondary">
                {idx + 1} / {book.scenes.length}
              </span>
            </div>

            <div className={s.passage} key={idx}>
              <p className="t-body">{scene.passage}</p>
              {scene.quote && <p className={s.quote}>“{scene.quote}”</p>}
            </div>

            {notice && (
              <div className={`notice notice-info ${s.notice}`}>
                <Icon name="warning" size={15} />
                <span className="t-xs">{notice}</span>
              </div>
            )}

            <div className={s.track} aria-hidden="true">
              {book.scenes.map((_, i) => (
                <button
                  key={i}
                  className={s.tick}
                  data-state={i === idx ? "on" : images[i] ? "ready" : "idle"}
                  onClick={() => setIdx(i)}
                  aria-label={`Scene ${i + 1}`}
                />
              ))}
            </div>

            <div className={s.controls}>
              <button
                className="btn btn-tertiary btn-icon"
                onClick={() => setIdx(Math.max(idx - 1, 0))}
                disabled={idx === 0}
                aria-label="Previous scene"
              >
                <Icon name="arrowLeft" size={18} />
              </button>

              <button className="btn" onClick={() => setPlaying((p) => !p)}>
                <Icon name={playing ? "pause" : "play"} size={16} />
                {playing ? "Pause" : "Play through"}
              </button>

              <button
                className="btn btn-tertiary btn-icon"
                onClick={() => setIdx(Math.min(idx + 1, book.scenes.length - 1))}
                disabled={idx === book.scenes.length - 1}
                aria-label="Next scene"
              >
                <Icon name="arrowRight" size={18} />
              </button>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setBook(null);
                  setPlaying(false);
                  setNotice("");
                }}
              >
                New text
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
