"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { trackRunFinished, trackRunStarted } from "@/lib/analytics";
import { apiPost, getKey } from "@/lib/keys";
import { SAMPLE_TEXT } from "./sample";
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

  async function begin() {
    if (!getKey("gemini")) {
      setError("Add your Gemini key with the key button up top first.");
      return;
    }
    setBusy(true);
    trackRunStarted("captured");
    setError("");
    setNotice("");
    setImages({});
    try {
      const data = await apiPost("/api/captured", { stage: "scenes", text });
      if (!data.scenes?.length) throw new Error("No visual scenes found in that text.");
      setBook(data);
      setIdx(0);
      // Warm the first two so the reader never opens on an empty frame.
      render(data.scenes[0], 0);
      if (data.scenes[1]) render(data.scenes[1], 1);
      trackRunFinished("captured", "success");
    } catch (e) {
      setError(e.message);
      trackRunFinished("captured", "error");
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
