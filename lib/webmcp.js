"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { KEY_SPECS, getKey } from "./keys";
import { trackAgentGate, trackAgentTool, trackWebMCPSupport } from "./analytics";

/**
 * WebMCP bridge.
 *
 * The W3C proposal (webmachinelearning/webmcp) hangs a ModelContext off the
 * document: `document.modelContext` in the current spec and Chrome 153+. Chrome
 * 149 to 152 shipped the same interface on `navigator`. Both are checked. Tools
 * are registered with an AbortSignal, which is how the spec unregisters them;
 * the older unregisterTool(name) is called as well where it still exists.
 *
 * Chrome fires `toolactivated` and `toolcancel` at the window when an agent
 * runs or abandons a tool, each carrying `event.toolName`. Those drive the
 * "Agent is driving" indicator in the Shell, together with a start/end signal
 * from the wrapper around every execute so the pill can fade when a call ends.
 *
 * Nothing in this file throws when the API is missing. The site has to keep
 * working in every browser, so the whole layer degrades to a console.debug.
 */

export function getModelContext() {
  if (typeof window === "undefined") return null;
  return document.modelContext || navigator.modelContext || null;
}

/** Whether this browser exposes WebMCP at all. */
export const hasWebMCP = () => Boolean(getModelContext());

// --- result shapes -------------------------------------------------------

const text = (t) => ({ content: [{ type: "text", text: t }] });

/** Success. Objects are JSON-stringified so agents get structure back. */
export function ok(data) {
  return text(typeof data === "string" ? data : JSON.stringify(data));
}

/** Structured failure. `hint` tells the agent what to do next. Never throw. */
export function fail(message, hint) {
  return { ...text(JSON.stringify({ error: message, ...(hint ? { hint } : {}) })), isError: true };
}

/**
 * The one rule about keys: tools never read, accept or set them. A tool that
 * needs one and finds it missing returns this and stops.
 */
export function requireKey(name = "gemini") {
  if (getKey(name)) return null;
  const label = KEY_SPECS[name]?.label || `${name} key`;
  return fail(
    `No ${label} is set in this browser.`,
    `Ask the user to paste their ${label} into the key panel themselves: the key button in the header, or call open_key_panel to open it for them. Do not ask them to send the key to you.`
  );
}

// --- tiny external stores -----------------------------------------------

function store(initial) {
  let snap = initial;
  const listeners = new Set();
  return {
    get: () => snap,
    set(next) {
      snap = next;
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

// --- agent activity ------------------------------------------------------

const IDLE = { active: false, toolName: "" };
const activity = store(IDLE);
let fadeTimer = null;

function noteStart(toolName) {
  clearTimeout(fadeTimer);
  activity.set({ active: true, toolName });
}

/** Keep the name while the pill fades, so the text does not vanish mid-fade. */
function noteEnd(toolName, delay = 1800) {
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => {
    if (activity.get().toolName === toolName) activity.set({ active: false, toolName });
  }, delay);
}

const SUPPORT_PING = "broccoli.webmcp.pinged";

/** `{ active, toolName }` for whatever tool an agent is running right now. */
export function useAgentActivity() {
  // Reported once per browser session, from the first Shell that mounts.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SUPPORT_PING)) return;
      window.sessionStorage.setItem(SUPPORT_PING, "1");
    } catch {
      /* no sessionStorage: report anyway, at worst once per page */
    }
    trackWebMCPSupport(hasWebMCP());
  }, []);

  useEffect(() => {
    const on = (e) => noteStart(e.toolName || e.name || "");
    const off = (e) => noteEnd(e.toolName || e.name || "", 0);
    window.addEventListener("toolactivated", on);
    window.addEventListener("toolcancel", off);
    // The declarative explainer spells it with the extra "ed"; listen for both.
    window.addEventListener("toolcanceled", off);
    return () => {
      window.removeEventListener("toolactivated", on);
      window.removeEventListener("toolcancel", off);
      window.removeEventListener("toolcanceled", off);
    };
  }, []);
  return useSyncExternalStore(activity.subscribe, activity.get, () => IDLE);
}

// --- human confirmation --------------------------------------------------

const confirmation = store(null);

/**
 * Block a tool call on a human click. The Shell renders whatever is in this
 * store as a confirm bar; the promise settles when the user presses Confirm or
 * Cancel, the agent cancels, or nobody answers in time.
 */
export function requestConfirmation({ toolName, title, detail, signal, timeoutMs = 60000 }) {
  return new Promise((resolve) => {
    if (confirmation.get()) {
      resolve({ approved: false, reason: "busy" });
      return;
    }
    let timer = null;
    const finish = (approved, reason) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      confirmation.set(null);
      resolve({ approved, reason });
    };
    const onAbort = () => finish(false, "cancelled");
    timer = setTimeout(() => finish(false, "timeout"), timeoutMs);
    signal?.addEventListener("abort", onAbort);
    confirmation.set({
      toolName,
      title,
      detail,
      approve: () => finish(true, "approved"),
      deny: () => finish(false, "declined"),
    });
  });
}

/** The pending confirmation, or null. The Shell draws it. */
export function useConfirmation() {
  return useSyncExternalStore(confirmation.subscribe, confirmation.get, () => null);
}

const REFUSALS = {
  busy: "Another confirmation is already waiting on screen.",
  timeout: "Nobody confirmed within a minute.",
  cancelled: "The call was cancelled.",
  declined: "The user declined.",
};

/**
 * For destructive tools. Resolves to null once the human approves, otherwise
 * to a fail() result the tool should return as is.
 */
export async function gate(opts) {
  const { approved, reason } = await requestConfirmation(opts);
  trackAgentGate(opts.toolName, reason);
  if (approved) return null;
  return fail(
    `Not done. ${REFUSALS[reason]}`,
    reason === "declined"
      ? "Do not retry unless the user asks for it again."
      : "Tell the user to press Confirm in the bar at the bottom of the page, then call this tool again."
  );
}

// --- live registry -------------------------------------------------------

/**
 * What is registered on this page right now, kept in parallel with the
 * browser's own registry so the header can show visitors the surface before
 * an agent ever calls it, in browsers without WebMCP too. Each entry is one
 * useWebMCPTools call: `scope` is "site" for the Shell's tools and "page"
 * for a build's.
 */
const registry = store([]);

function addRegistration(entry) {
  registry.set([...registry.get(), entry]);
  return () => registry.set(registry.get().filter((e) => e !== entry));
}

/** Registrations on the current page, site-wide first, as `{ scope, tools }`. */
export function useRegisteredTools() {
  return useSyncExternalStore(registry.subscribe, registry.get, () => EMPTY);
}
const EMPTY = [];

/**
 * List declarative tools, the ones a <form toolname> carries, in the same
 * registry while `active`. The browser registers those itself from the
 * markup; this only makes them visible in the header sheet.
 */
export function useDeclaredTools(defs, active = true) {
  useEffect(() => {
    if (!active || !defs.length) return undefined;
    return addRegistration({
      scope: "form",
      tools: defs.map(({ name, description, inputSchema, declarative }) => ({
        name,
        description,
        inputSchema,
        declarative,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

// --- registration --------------------------------------------------------

/**
 * Pair static tool definitions (name, description, inputSchema, annotations)
 * with the handlers a component builds from its own state. Definitions stay
 * in a plain module so the /webmcp page can list them without mounting the
 * build.
 */
export function withHandlers(defs, handlers) {
  return defs.map((def) => {
    const execute = handlers[def.name];
    if (!execute) console.debug(`[webmcp] ${def.name} has no handler on this page`);
    return {
      ...def,
      execute: execute || (async () => fail(`${def.name} is not wired up on this page.`)),
    };
  });
}

/**
 * Register `tools` while the component is mounted. Handlers are read through
 * a ref on every call, so they always see current state without a
 * re-registration per render; `deps` only needs to change when the set of
 * tools itself changes. `scope` labels the group in the header's tool list.
 */
export function useWebMCPTools(tools, deps = [], scope = "page") {
  const latest = useRef(tools);
  useEffect(() => {
    latest.current = tools;
  });

  useEffect(() => {
    const names = tools.map((t) => t.name);
    const unlist = addRegistration({
      scope,
      tools: tools.map(({ name, description, inputSchema, annotations }) => ({
        name,
        description,
        inputSchema,
        annotations,
      })),
    });

    const ctx = getModelContext();
    if (!ctx) {
      console.debug("[webmcp] modelContext is not available here; not registering", names);
      return unlist;
    }

    const ac = new AbortController();
    // One analytics event per tool per mount, however many times it is called.
    const seen = new Set();
    for (const def of tools) {
      const tool = {
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema || { type: "object", properties: {} },
        ...(def.annotations ? { annotations: def.annotations } : {}),
        async execute(input, options) {
          noteStart(def.name);
          if (!seen.has(def.name)) {
            seen.add(def.name);
            trackAgentTool(def.name, window.location.pathname.slice(1) || "home");
          }
          try {
            const current = latest.current.find((t) => t.name === def.name) || def;
            const result = await current.execute(input || {}, options || {});
            return result ?? ok({ done: true });
          } catch (err) {
            return fail(err?.message || "The tool failed.", "Look at the page for an error message, then try again.");
          } finally {
            noteEnd(def.name);
          }
        },
      };
      try {
        Promise.resolve(ctx.registerTool(tool, { signal: ac.signal })).catch((err) =>
          console.debug(`[webmcp] could not register ${def.name}:`, err?.message || err)
        );
      } catch (err) {
        console.debug(`[webmcp] could not register ${def.name}:`, err?.message || err);
      }
    }

    return () => {
      unlist();
      ac.abort();
      if (typeof ctx.unregisterTool === "function") {
        for (const name of names) {
          try {
            ctx.unregisterTool(name);
          } catch {
            /* already gone */
          }
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
