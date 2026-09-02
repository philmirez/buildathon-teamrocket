"use client";

import { track } from "@vercel/analytics";

/**
 * Custom events.
 *
 * Vercel bills Web Analytics per collected event — page views and custom
 * events alike — and the Pro plan includes no free allowance. So the rule here
 * is one event per *decision*, never per interaction. Swipes, keystrokes, card
 * expands and per-stage pipeline progress are all deliberately untracked: This
 * or That alone would emit ~24 swipe events per session and tell us nothing a
 * single run event doesn't.
 *
 * Pro also caps custom events at TWO properties. Every call below stays within
 * that; adding a third silently drops it.
 *
 * Together these answer four questions:
 *   1. Does bring-your-own-key kill adoption?  key_saved / build page views
 *   2. Which build earns real use?             run_started by build
 *   3. Which build is unreliable?              run_finished status=error
 *   4. Is the top banner worth its space?      banner_click
 *   5. Does the video-led hero convert?        walkthrough_cta
 */

/** A user kicked off an agent pipeline. One per run, not per stage. */
export const trackRunStarted = (build) => track("run_started", { build });

/** How that run ended. `status` is "success" or "error". */
export const trackRunFinished = (build, status) => track("run_finished", { build, status });

/** Fired at most once per visit to the key dialog, not per keystroke. */
export const trackKeySaved = (provider) => track("key_saved", { provider });

/**
 * Walkthrough -> build page. This is the conversion event for the video-led
 * hero: without it there is no way to tell whether leading with a walkthrough
 * actually sends people into a build.
 */
export const trackWalkthroughCta = (build) => track("walkthrough_cta", { build });

/** The strip above the hero. One event, whatever it happens to be pointing at. */
export const trackBannerClick = () => track("banner_click");
