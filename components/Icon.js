/**
 * Single-source icon set. 24px grid, 1.75 stroke, inherits currentColor so
 * icons pick up whatever text colour their container sets.
 */

const PATHS = {
  broccoli: (
    <>
      <path d="M12 21v-6" />
      <path d="M8.5 15h7l1-3.2a3.2 3.2 0 0 0 1.8-5.3A3.4 3.4 0 0 0 15 3.6a3.4 3.4 0 0 0-6 0 3.4 3.4 0 0 0-3.3 2.9A3.2 3.2 0 0 0 7.5 11.8Z" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9m-3 0v3m-2.5-3v2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M3.5 17l4.6-4.2a2 2 0 0 1 2.7 0L16 17.5m1.6-2.2a1.8 1.8 0 0 1 2.5 0l1.4 1.3" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  fork: (
    <>
      <path d="M6 2.5v6a2.5 2.5 0 0 0 5 0v-6M8.5 11v10.5" />
      <path d="M17.5 2.5c-1.6 1.2-2.4 3-2.4 5.2 0 1.7.7 2.9 2.4 3.3v10.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
      <path d="M10.5 11v5.5M13.5 11v5.5" />
    </>
  ),
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h3.2l2 2.4h7.8a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />,
  note: (
    <>
      <path d="M5 3.5h9.5L19 8v12.5H5Z" />
      <path d="M14 3.5V8h5M8.5 12h7M8.5 16h4.5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.9 4.9L18.8 9.8 13.9 11.7 12 16.6 10.1 11.7 5.2 9.8l4.9-1.9Z" />
      <path d="M18.5 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
    </>
  ),
  heart: <path d="M12 20.3S3.8 15.2 3.8 9.6A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 8.2 2.7c0 5.6-8.2 10.7-8.2 10.7Z" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  undo: <path d="M4 9h10a5.5 5.5 0 0 1 0 11h-3M4 9l4-4M4 9l4 4" />,
  arrowRight: <path d="M4 12h15m-5-6 6 6-6 6" />,
  arrowLeft: <path d="M20 12H5m5-6-6 6 6 6" />,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  play: <path d="M7 4.5v15l13-7.5Z" />,
  pause: <path d="M8.5 4.5v15M15.5 4.5v15" />,
  stop: <rect x="5.5" y="5.5" width="13" height="13" rx="2" />,
  upload: <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />,
  link: <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3m-1.8 4.9a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.3-1.3" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.3l3.3 2" />
    </>
  ),
  book: <path d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v13a2 2 0 0 0-2-2H4Zm16 0h-5.5A2.5 2.5 0 0 0 12 7v13a2 2 0 0 1 2-2h6Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s6.5-6.4 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.6 12 21 12 21Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0M16 5.2a3.4 3.4 0 0 1 0 5.6M17.6 14.4A6.2 6.2 0 0 1 21.2 20" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />,
  download: <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M4 18.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-.5" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5v-3a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h3" />
    </>
  ),
  github: (
    <path
      d="M9 19.3c-4.6 1.4-4.6-2.5-6.4-3m12.8 5.2v-3.6a3.1 3.1 0 0 0-.9-2.4c2.9-.3 6-1.4 6-6.4a5 5 0 0 0-1.4-3.5 4.6 4.6 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.4 0C6.5 1.8 5.4 2.1 5.4 2.1a4.6 4.6 0 0 0-.1 3.5A5 5 0 0 0 3.9 9.2c0 4.9 3.1 6 6 6.4a3.1 3.1 0 0 0-.9 2.3v3.6"
      strokeWidth="1.6"
    />
  ),
  scales: (
    <>
      <path d="M12 4.2v16M7.5 20.3h9M4.6 7.4l14.8-1.9" />
      <path d="M4.6 7.4 1.9 13.6a2.8 2.8 0 0 0 5.5 0Zm14.8-1.9-2.7 6.2a2.8 2.8 0 0 0 5.5 0Z" />
      <circle cx="12" cy="4" r="1.4" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4.5 21 20H3Z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
};

export default function Icon({ name, size = 20, className, style, strokeWidth = 1.75 }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flex: "none", ...style }}
    >
      {d}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS);
