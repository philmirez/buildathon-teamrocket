"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Icon from "@/components/Icon";
import { getModelContext, hasWebMCP } from "@/lib/webmcp";
import s from "./webmcp.module.css";

const noop = () => () => {};

/**
 * What this browser actually sees. The catalog below is rendered from the
 * definitions; this box asks the live ModelContext for its tools so a judge
 * can compare the two without opening devtools.
 */
export default function Live() {
  const supported = useSyncExternalStore(noop, hasWebMCP, () => null);
  const [names, setNames] = useState(null);

  useEffect(() => {
    const ctx = getModelContext();
    if (!ctx?.getTools) return undefined;
    let dead = false;
    const refresh = () =>
      ctx
        .getTools()
        .then((tools) => !dead && setNames(tools.map((t) => t.name)))
        .catch(() => !dead && setNames([]));
    refresh();
    ctx.addEventListener?.("toolchange", refresh);
    return () => {
      dead = true;
      ctx.removeEventListener?.("toolchange", refresh);
    };
  }, []);

  if (supported === null) return null;

  if (!supported) {
    return (
      <div className="notice notice-info">
        <Icon name="warning" size={16} />
        <span>
          This browser is not exposing WebMCP, so nothing below is callable from here. Chrome 149+
          has it behind <code className={s.code}>chrome://flags/#enable-webmcp-testing</code>; the
          ChatGPT desktop browser has it built in.
        </span>
      </div>
    );
  }

  return (
    <div className="notice notice-ok">
      <Icon name="check" size={16} />
      <span>
        WebMCP is on in this browser.{" "}
        {names
          ? names.length
            ? `The page is exposing ${names.length} tools right now: ${names.join(", ")}.`
            : "No tools are registered on this page yet."
          : "Reading the live registry."}
      </span>
    </div>
  );
}
