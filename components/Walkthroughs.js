"use client";

import { useState } from "react";
import Icon from "./Icon";
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
            onClick={() => setActive(b.slug)}
          >
            <Icon name={b.icon} size={14} />
            {b.name}
          </button>
        ))}
      </div>

      <video
        key={current.slug}
        className={s.player}
        controls
        preload="none"
        playsInline
        poster={current.poster}
        aria-label={`${current.name} walkthrough`}
      >
        <source src={current.video} type="video/mp4" />
        Your browser can&apos;t play this video.{" "}
        <a href={current.video}>Download it instead.</a>
      </video>

      <p className="t-sm t-secondary">{current.solution}</p>
    </section>
  );
}
