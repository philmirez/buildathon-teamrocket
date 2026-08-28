"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Browser-local API key store.
 *
 * Keys live in localStorage only. They are sent to this app's own API routes
 * per request (so the calls to Gemini happen server-side, away from CORS and
 * key-in-URL problems) and are never persisted anywhere on the server.
 */

const STORAGE_KEY = "broccoli.keys.v1";
const listeners = new Set();

export const KEY_SPECS = {
  gemini: {
    label: "Gemini API key",
    placeholder: "AIza…",
    help: "Free key from aistudio.google.com/apikey",
    href: "https://aistudio.google.com/apikey",
  },
  pixabay: {
    label: "Pixabay API key",
    placeholder: "optional",
    help: "Optional fallback imagery. Set on the server too.",
    href: "https://pixabay.com/api/docs/",
  },
  places: {
    label: "Google Places API key",
    placeholder: "optional",
    help: "Real restaurant photos for This or That. Places API (New), billing on.",
    href: "https://console.cloud.google.com/google/maps-apis/api-list",
  },
};

function read() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

let cache = null;
function snapshot() {
  if (cache === null) cache = read();
  return cache;
}
function serverSnapshot() {
  return EMPTY;
}
const EMPTY = {};

function emit() {
  cache = read();
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setKey(name, value) {
  const next = { ...read() };
  if (value) next[name] = value;
  else delete next[name];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emit();
}

export function clearKeys() {
  window.localStorage.removeItem(STORAGE_KEY);
  emit();
}

export function getKey(name) {
  return read()[name] || "";
}

/** All stored keys, reactive. */
export function useKeys() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** A single key plus its setter. */
export function useKey(name) {
  const keys = useKeys();
  const set = useCallback((v) => setKey(name, v), [name]);
  return [keys[name] || "", set];
}

/**
 * POST JSON to one of this app's API routes, attaching the stored Gemini key.
 * Throws an Error carrying the server's message so callers can surface it.
 */
export async function apiPost(path, body, { signal } = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, apiKey: getKey("gemini") }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}
