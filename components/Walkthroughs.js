"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import Icon from "./Icon";
import { trackWalkthroughCta } from "@/lib/analytics";
import s from "./Walkthroughs.module.css";

/**
 * One player, tabbed across builds.
 *
 * `preload="none"` matters: six clips at a few MB each would otherwise be
 * fetched on page load. Only the selected clip loads, and switching tabs
 * remounts the element via `key` so the new source actually takes.
 */
export default function Walkthroughs({ builds }) {
  const withVideo = builds.filter((b) => b.video);
  const [active, setActive] = useState(withVideo[0]?.slug);
  // The overlay only covers the un-started state; once playing, the native
  // controls take over. Switching tabs remounts the video, so this resets too.
  const [started, setStarted] = useState(false);
  const videoRef = useRef(null);

  const select = (slug) => {
    setActive(slug);
    setStarted(false);
  };

  if (!withVideo.length) return null;
  const current = withVideo.find((b) => b.slug === active) || withVideo[0];

  return (
    <section className={s.wrap}>
      <header className={s.head}>
        <h2 className="t-h3">Walkthroughs</h2>
        <span className={s.count}>{withVideo.length}</span>
      </header>

      <div className={s.tabs} role="tablist" aria-label="Build walkthroughs">
        {withVideo.map((b) => (
          <button
            key={b.slug}
            role="tab"
            aria-selected={b.slug === current.slug}
            className={`chip ${b.slug === current.slug ? "chip-selected" : ""}`}
            onClick={() => select(b.slug)}
          >
            <Icon name={b.icon} size={14} />
            {b.name}
          </button>
        ))}
      </div>

      <div className={s.stage}>
        <video
          key={current.slug}
          ref={videoRef}
          className={s.player}
          controls
          preload="none"
          playsInline
          poster={current.poster}
          onPlay={() => setStarted(true)}
          aria-label={`${current.name} walkthrough`}
        >
          <source src={current.video} type="video/mp4" />
          Your browser can&apos;t play this video.{" "}
          <a href={current.video}>Download it instead.</a>
        </video>

        {!started && (
          <button
            type="button"
            className={s.overlay}
            onClick={() => videoRef.current?.play()}
            aria-label={`Play the ${current.name} walkthrough`}
          >
            <span className={s.play} aria-hidden="true">
              <Icon name="play" size={26} />
            </span>
          </button>
        )}
      </div>

      <div className={s.foot}>
        <p className="t-sm t-secondary">{current.solution}</p>
        <Link
          className="btn"
          href={`/${current.slug}`}
          onClick={() => trackWalkthroughCta(current.slug)}
        >
          Let me test it
          <Icon name="arrowRight" size={16} />
        </Link>
      </div>
    </section>
  );
}
