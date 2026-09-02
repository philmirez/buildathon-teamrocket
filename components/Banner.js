"use client";

import Icon from "./Icon";
import { trackBannerClick } from "@/lib/analytics";

/**
 * The strip above the hero. Client component purely so the click can be
 * tracked — the home page itself stays a server component.
 *
 * Content is passed in rather than baked here: this slot is the first thing
 * anyone sees, so what it says is a page-level decision, not a component one.
 */
export default function Banner({ href, icon = "sparkle", cta, classNames: c, children }) {
  return (
    <div className={c.wrap}>
      <a
        className={c.banner}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={trackBannerClick}
      >
        <span className={c.icon} aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <span className={c.text}>{children}</span>
        <span className={c.cta}>
          <span>{cta}</span>
          <Icon name="arrowRight" size={15} />
        </span>
      </a>
    </div>
  );
}
