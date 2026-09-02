"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and hydration, true after. The lint-clean way
 * to gate browser-only state (localStorage, feature detection) without a
 * setState inside an effect: read the value here, render as the server did
 * until it flips, and React re-renders once with the client value.
 */
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
