"use client";

import Icon from "./Icon";
import { trackReferralClick } from "@/lib/analytics";

/**
 * Client component purely so the click can be tracked — the home page itself
 * stays a server component.
 */
export default function ReferralBanner({ href, classNames: c }) {
  return (
    <div className={c.wrap}>
      <a
        className={c.banner}
        href={href}
        target="_blank"
        rel="noopener"
        onClick={trackReferralClick}
      >
        <span className={c.icon} aria-hidden="true">
          <Icon name="sparkle" size={16} />
        </span>
        <span className={c.text}>
          Every one of these six builds was written with <strong>Claude Code</strong>.
        </span>
        <span className={c.cta}>
          Try it
          <Icon name="arrowRight" size={15} />
        </span>
      </a>
    </div>
  );
}
