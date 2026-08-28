"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { KEY_SPECS, clearKeys, setKey, useKeys } from "@/lib/keys";
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

  useEffect(() => {
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    ref.current?.querySelector("input")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.scrim} onMouseDown={onClose}>
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
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
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
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Shell({ children, accent }) {
  const keys = useKeys();
  const [open, setOpen] = useState(false);
  const ready = Boolean(keys.gemini);

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
    </div>
  );
}
