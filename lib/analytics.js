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
 *   4. Does the video-led hero convert?        walkthrough_cta
 *   5. Does anyone arrive with WebMCP on?      webmcp_support
 *   6. Which tools do agents actually use?     agent_tool (once per tool per page visit)
 *   7. What happens at the confirm bar?        agent_gate
 *
 * Agent tool calls follow the same rule as swipes: a This or That run is
 * around thirty calls, so agent_tool fires once per tool name per page
 * mount, not per call. Runs an agent starts still land in run_started like
 * any other run.
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

/**
 * Once per browser session, whether the visitor's browser exposes WebMCP.
 * Sessions where it is on are the ones an agent can drive, so this is the
 * denominator for everything below.
 */
export const trackWebMCPSupport = (supported) =>
  track("webmcp_support", { supported: supported ? "yes" : "no" });

/** An agent used this tool on this page, first time this visit. */
export const trackAgentTool = (tool, page) => track("agent_tool", { tool, page });

/** How a destructive tool's confirm bar ended: approved, declined, timeout, cancelled, busy. */
export const trackAgentGate = (tool, outcome) => track("agent_gate", { tool, outcome });
