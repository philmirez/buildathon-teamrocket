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
 *   4. Is the referral banner worth its space? referral_click
 */

/** A user kicked off an agent pipeline. One per run, not per stage. */
export const trackRunStarted = (build) => track("run_started", { build });

/** How that run ended. `status` is "success" or "error". */
export const trackRunFinished = (build, status) => track("run_finished", { build, status });

/** Fired at most once per visit to the key dialog, not per keystroke. */
export const trackKeySaved = (provider) => track("key_saved", { provider });

/** Claude Code referral banner. */
export const trackReferralClick = () => track("referral_click");
