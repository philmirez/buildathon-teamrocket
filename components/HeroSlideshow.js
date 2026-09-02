"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import s from "./HeroSlideshow.module.css";

const INTERVAL = 5500;

/**
 * Crossfades between the hero animations.
 *
 * Both frames stay mounted and are toggled with opacity rather than swapped —
 * remounting an animated source restarts it from frame 0 and drops a beat.
 * The two assets have different aspect ratios, so the frame is a fixed box and
 * each image is contained inside it; cropping would cut the captions.
 */
export default function HeroSlideshow({ slides, className }) {
  const [index, setIndex] = useState(0);
  // Slides mount lazily and never unmount: mounting all of them upfront pulls
  // every animation on first paint, and unmounting one would restart it.
  const [mounted, setMounted] = useState(() => new Set([0, 1]));
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    const onChange = (e) => {
      reduced.current = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Every change of slide goes through here, so the slide being shown and the
  // one after it are mounted in the same update rather than from an effect.
  const go = useCallback(
    (i) => {
      setIndex(i);
      setMounted((prev) => {
        const next = new Set(prev).add(i).add((i + 1) % slides.length);
        return next.size === prev.size ? prev : next;
      });
    },
    [slides.length]
  );

  useEffect(() => {
    // Someone who asked for less motion gets a single still frame, not a
    // carousel that advances underneath them.
    if (paused || reduced.current || slides.length < 2) return;
    const t = setTimeout(() => go((index + 1) % slides.length), INTERVAL);
    return () => clearTimeout(t);
  }, [index, paused, slides.length, go]);

  return (
    <div
      className={`${s.wrap} ${className || ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className={s.frame}>
        {slides.map((slide, i) =>
          !mounted.has(i) ? null : (
            <Image
              key={slide.src}
              className={s.slide}
              src={slide.src}
              alt={slide.alt}
              width={slide.width}
              height={slide.height}
              unoptimized
              /* Deferral is handled by mounting, not by the viewport: these
                 frames sit at opacity 0, and next/image's default lazy loading
                 never fetched them, so a transition landed on a blank frame. */
              {...(i === 0 ? { priority: true } : { loading: "eager" })}
              data-active={i === index ? "" : undefined}
              aria-hidden={i === index ? undefined : "true"}
            />
          )
        )}
      </div>

      {slides.length > 1 && (
        <div className={s.dots}>
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              className={s.dot}
              data-active={i === index ? "" : undefined}
              onClick={() => go(i)}
              aria-label={`Show image ${i + 1} of ${slides.length}`}
              aria-current={i === index ? "true" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
