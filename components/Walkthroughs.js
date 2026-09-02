"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import Icon from "./Icon";
import { trackWalkthroughCta } from "@/lib/analytics";
import { CATALOG } from "@/lib/webmcp-catalog";
import s from "./Walkthroughs.module.css";

const toolCount = (slug) => CATALOG.find((g) => g.build === slug)?.tools.length || 0;

/**
 * Every build, tabbed, with one player underneath.
 *
 * A build without a walkthrough still gets a tab: its watch card says so and
 * the player is left out, so the count up top matches the hero's "six".
 *
 * `preload="metadata"` fetches only the header of the selected clip — a few KB,
 * not the whole file — so page load stays cheap while iOS still has an element
 * it can start playback from. Switching tabs remounts via `key` so the new
 * source actually takes.
 */
export default function Walkthroughs({ builds: all }) {
  // Builds you can watch first, in their own order; the rest trail.
  const builds = [...all.filter((b) => b.video), ...all.filter((b) => !b.video)];
  const [active, setActive] = useState(builds[0]?.slug);
  // The overlay only covers the un-started state; once playing, the native
  // controls take over. Switching tabs remounts the video, so this resets too.
  const [started, setStarted] = useState(false);
  // Which updated builds the visitor has actually looked at this session. A dot
  // that never clears is just decoration; this one behaves like a notification.
  const [seen, setSeen] = useState(() => new Set());
  // Which clip the player holds. A build gains an "agent" clip by setting
  // `agentVideo` in lib/builds.js; until then the agent card links to the
  // build's tool list instead.
  const [clip, setClip] = useState("human");
  const videoRef = useRef(null);
  // Set by a card that also swaps the clip: the new <video> starts itself as
  // soon as it mounts, inside the same user gesture, without a frame timer.
  const wantPlay = useRef(false);

  const select = (slug) => {
    setActive(slug);
    setStarted(false);
    setClip("human");
    setSeen((prev) => new Set(prev).add(slug));
  };

  /** Start playback, revealing the native controls either way. */
  const play = (el = videoRef.current) => {
    if (!el) return;
    const p = el.play();
    if (p?.catch) p.then(() => setStarted(true)).catch(() => setStarted(true));
    else setStarted(true);
  };

  const setVideo = (el) => {
    videoRef.current = el;
    if (el && wantPlay.current) {
      wantPlay.current = false;
      play(el);
    }
  };

  /** Show `which` clip and play it, whether or not that means a new element. */
  const watch = (which) => {
    videoRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (which === clip) {
      play();
      return;
    }
    wantPlay.current = true;
    setStarted(false);
    setClip(which);
  };

  if (!builds.length) return null;
  const current = builds.find((b) => b.slug === active) || builds[0];
  const src = clip === "agent" && current.agentVideo ? current.agentVideo : current.video;
  const tools = toolCount(current.slug);

  return (
    <section className={s.wrap}>
      <header className={s.head}>
        <h2 className="t-h3">Builds</h2>
        <span className={s.count}>{builds.length}</span>
      </header>

      <div className={s.tabs} role="tablist" aria-label="Builds">
        {builds.map((b) => (
          <button
            key={b.slug}
            role="tab"
            aria-selected={b.slug === current.slug}
            className={`chip ${b.slug === current.slug ? "chip-selected" : ""}`}
            onClick={() => select(b.slug)}
          >
            <Icon name={b.icon} size={14} />
            {b.name}
            {b.updated && !seen.has(b.slug) && (
              <>
                <span className={s.dot} aria-hidden="true" />
                <span className="sr-only">has updates</span>
              </>
            )}
          </button>
        ))}
      </div>

      {/* The three things a visitor can do with the selected build, right
          under the tabs where the choice was made. */}
      <div className={s.actions}>
        <Link
          className={s.action}
          href={`/${current.slug}`}
          onClick={() => trackWalkthroughCta(current.slug)}
        >
          <span className={s.actionIcon} aria-hidden="true">
            <Icon name="arrowRight" size={18} />
          </span>
          <span className={s.actionText}>
            <span className={s.actionTitle}>Let me test it</span>
            <span className={s.actionSub}>Open {current.name} and run it yourself</span>
          </span>
        </Link>

        {current.video ? (
          <button type="button" className={s.action} onClick={() => watch("human")}>
            <span className={s.actionIcon} aria-hidden="true">
              <Icon name="play" size={18} />
            </span>
            <span className={s.actionText}>
              <span className={s.actionTitle}>Watch the walkthrough</span>
              <span className={s.actionSub}>
                {current.recorded ? `Recorded ${current.recorded}` : "About 90 seconds"}
              </span>
            </span>
          </button>
        ) : (
          <div className={`${s.action} ${s.actionStatic}`}>
            <span className={s.actionIcon} aria-hidden="true">
              <Icon name="clock" size={18} />
            </span>
            <span className={s.actionText}>
              <span className={s.actionTitle}>No walkthrough yet</span>
              <span className={s.actionSub}>
                The build runs and its agent tools are live.{current.wip ? ` ${current.wip}` : ""}
              </span>
            </span>
          </div>
        )}

        {current.agentVideo ? (
          <button
            type="button"
            className={s.action}
            onClick={() => watch("agent")}
          >
            <span className={s.actionIcon} aria-hidden="true">
              <Icon name="bot" size={18} />
            </span>
            <span className={s.actionText}>
              <span className={s.actionTitle}>Watch an agent drive it</span>
              <span className={s.actionSub}>Through WebMCP, hands off</span>
            </span>
          </button>
        ) : (
          <Link className={s.action} href={`/webmcp#${current.slug}`}>
            <span className={s.actionIcon} aria-hidden="true">
              <Icon name="bot" size={18} />
            </span>
            <span className={s.actionText}>
              <span className={s.actionTitle}>See what an agent can do</span>
              <span className={s.actionSub}>
                {tools} WebMCP {tools === 1 ? "tool" : "tools"} for this build
              </span>
            </span>
          </Link>
        )}
      </div>

      {current.video && (
      <div className={s.stage}>
        <video
          key={`${current.slug}-${clip}`}
          ref={setVideo}
          className={s.player}
          controls
          /* iOS will not start a JS-initiated play() on an element with no
             loaded data, which made the overlay tap do nothing. Metadata is a
             few KB and gives the element something to start from. */
          preload="metadata"
          playsInline
          poster={current.poster}
          onPlay={() => setStarted(true)}
          aria-label={`${current.name} walkthrough`}
        >
          <source src={src} type="video/mp4" />
          Your browser can&apos;t play this video.{" "}
          <a href={src}>Download it instead.</a>
        </video>

        {!started && (
          <button
            type="button"
            className={s.overlay}
            onClick={() => play()}
            aria-label={`Play the ${current.name} walkthrough`}
          >
            <span className={s.play} aria-hidden="true">
              <Icon name="play" size={26} />
            </span>
          </button>
        )}
      </div>
      )}

      {current.updated && (
        /* Carries its own weight rather than trailing off the date stamp — this
           is the reason to go back to a build you have already watched. */
        <p className={s.whatsNew} style={{ "--tint": current.tint }}>
          <Icon name="sparkle" size={14} />
          <span className="t-sm">
            <strong>New {current.updated.on}</strong> — {current.updated.note}.
          </span>
        </p>
      )}

      <div className={s.foot}>
        <div className={s.blurb}>
          <p className="t-sm t-secondary">{current.solution}</p>
          {current.recorded && (
            /* The clips are a dated record of the buildathon, not documentation
               that tracks the live build. Saying so is what lets the apps keep
               changing without the videos silently going stale. */
            <p className={`t-xs t-secondary ${s.stamp}`}>
              Recorded {current.recorded} at the DC DevFest buildathon
              {current.updated
                ? " — so this clip is from before the change above."
                : " — the live build may have moved on since."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
