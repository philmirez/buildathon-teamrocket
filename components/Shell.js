"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { KEY_SPECS, clearKeys, setKey, useKeys } from "@/lib/keys";
import { BUILDS, bySlug } from "@/lib/builds";
import { trackKeySaved } from "@/lib/analytics";
import { SITE_TOOLS } from "@/lib/webmcp-catalog";
import {
  fail,
  ok,
  useAgentActivity,
  useConfirmation,
  useWebMCPTools,
  withHandlers,
} from "@/lib/webmcp";
import styles from "./Shell.module.css";

/** Masked key input with a reveal toggle. */
function KeyField({ name, spec, value }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label className="field-label" htmlFor={`key-${name}`}>
        {spec.label}
      </label>
      <div className={styles.keyRow}>
        <input
          id={`key-${name}`}
          className="input"
          type={shown ? "text" : "password"}
          value={value}
          spellCheck={false}
          autoComplete="off"
          placeholder={spec.placeholder}
          onChange={(e) => setKey(name, e.target.value.trim())}
        />
        <button
          type="button"
          className="btn btn-tertiary btn-sm"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <p className="field-hint">
        {spec.help}{" "}
        <a href={spec.href} target="_blank" rel="noreferrer noopener">
          Get one
        </a>
      </p>
    </div>
  );
}

function KeyVault({ onClose }) {
  const keys = useKeys();
  const ref = useRef(null);
  // Which keys were already set when the dialog opened. setKey fires on every
  // keystroke, so tracking there would emit an event per character; instead we
  // compare once on close and report only newly-added keys.
  const atOpen = useRef(null);
  if (atOpen.current === null) {
    atOpen.current = Object.fromEntries(
      Object.keys(KEY_SPECS).map((n) => [n, Boolean(keys[n])])
    );
  }

  const close = () => {
    for (const name of Object.keys(KEY_SPECS)) {
      if (keys[name] && !atOpen.current[name]) trackKeySaved(name);
    }
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKeyDown);
    ref.current?.querySelector("input")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.scrim} onMouseDown={close}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-title"
        ref={ref}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="spread">
          <h2 className="t-h2" id="vault-title">
            API keys
          </h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <p className="t-sm t-secondary">
          Stored in this browser only and sent per request. Nothing is saved on the server.
        </p>

        <div className="stack" style={{ "--gap": "var(--s-5)" }}>
          {Object.entries(KEY_SPECS).map(([name, spec]) => (
            <KeyField key={name} name={name} spec={spec} value={keys[name] || ""} />
          ))}
        </div>

        <div className="spread">
          <button className="btn btn-ghost btn-sm" onClick={clearKeys}>
            <Icon name="trash" size={16} />
            Clear all
          </button>
          <button className="btn" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lights up while an agent is inside a tool call, naming the tool, and fades
 * once the call returns. Always mounted so the fade can run; hidden from
 * assistive tech while idle so it does not announce an empty pill.
 */
function AgentPill({ active, toolName }) {
  return (
    <div
      className={styles.agent}
      data-on={active ? "" : undefined}
      role="status"
      aria-live="polite"
      aria-hidden={!active}
    >
      <span className={styles.agentDot} aria-hidden="true" />
      <span className={styles.agentLabel}>Agent is driving</span>
      {toolName && <code className={styles.agentTool}>{toolName}</code>}
    </div>
  );
}

/**
 * The human gate for destructive tools. A tool that calls gate() blocks until
 * one of these buttons is pressed, so the agent cannot delete anything on its
 * own. Escape declines.
 */
function ConfirmBar({ pending }) {
  const { deny } = pending;
  useEffect(() => {
    const onKeyDown = (e) => e.key === "Escape" && deny();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deny]);

  return (
    <div
      className={styles.confirm}
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-detail"
    >
      <span className={styles.confirmIcon} aria-hidden="true">
        <Icon name="warning" size={18} />
      </span>
      <div className={styles.confirmText}>
        <strong className="t-sm" id="confirm-title">
          {pending.title}
        </strong>
        <span className="t-xs t-secondary" id="confirm-detail">
          {pending.detail} Asked by <code className={styles.agentTool}>{pending.toolName}</code>.
        </span>
      </div>
      <div className="row" style={{ "--gap": "var(--s-2)" }}>
        <button className="btn btn-tertiary btn-sm" onClick={pending.deny}>
          Cancel
        </button>
        <button className="btn btn-danger btn-sm" onClick={pending.approve} autoFocus>
          Confirm
        </button>
      </div>
    </div>
  );
}

export default function Shell({ children, accent }) {
  const keys = useKeys();
  const [open, setOpen] = useState(false);
  const ready = Boolean(keys.gemini);
  const router = useRouter();
  const agent = useAgentActivity();
  const pending = useConfirmation();

  // Site-wide tools. Registered here so they exist on every page, and so an
  // agent that lands anywhere can find the builds and check setup before it
  // touches one. Nothing in this group reads or writes a key value.
  useWebMCPTools(
    withHandlers(SITE_TOOLS, {
      list_builds: async () =>
        ok({
          builds: BUILDS.map((b) => ({
            slug: b.slug,
            name: b.name,
            tier: b.tier,
            problem: b.problem,
            solution: b.solution,
            url: `${window.location.origin}/${b.slug}`,
          })),
        }),
      open_build: async ({ slug }) => {
        const build = bySlug(slug);
        if (!build) {
          return fail(`No build called "${slug}".`, `Valid slugs: ${BUILDS.map((b) => b.slug).join(", ")}.`);
        }
        router.push(`/${build.slug}`);
        return ok({
          opened: build.slug,
          name: build.name,
          url: `${window.location.origin}/${build.slug}`,
          note: "That page's own tools appear once it has loaded.",
        });
      },
      get_setup_status: async () =>
        ok({
          hasGeminiKey: Boolean(keys.gemini),
          hasPlacesKey: Boolean(keys.places),
          hasPixabayKey: Boolean(keys.pixabay),
          note: "Gemini is required for every build. The user enters keys in the key panel; tools cannot read or set them.",
        }),
      open_key_panel: async () => {
        setOpen(true);
        return ok({ opened: true, note: "The key panel is open. Ask the user to paste the key there, not in chat." });
      },
    })
  );

  return (
    <div className={styles.wrap} style={accent ? { "--accent-local": accent } : undefined}>
      <header className={styles.header}>
        <div className={`container ${styles.bar}`}>
          <Link href="/" className={styles.home} aria-label="All builds">
            {/* The link already carries the label, so the mark is decorative. */}
            <Image
              className={styles.logo}
              src="/teamrocketlogo.png"
              alt=""
              /* Sized to its display box, not the source: passing the full
                 472px made Next serve a 1080px variant for a 30px mark. */
              width={30}
              height={29}
              priority
            />
          </Link>

          <div className="grow" />

          <AgentPill active={agent.active} toolName={agent.toolName} />

          <button
            className={`btn btn-tertiary btn-sm ${styles.keyBtn}`}
            onClick={() => setOpen(true)}
            aria-label={ready ? "API keys — Gemini key set" : "API keys — none set"}
          >
            <Icon name="key" size={16} />
            <span className={ready ? styles.dotOk : styles.dotOff} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      {open && <KeyVault onClose={() => setOpen(false)} />}
      {pending && <ConfirmBar pending={pending} />}
    </div>
  );
}
