/**
 * Minimal Markdown renderer that emits React elements directly.
 *
 * Rendering to elements rather than an HTML string means model output never
 * touches dangerouslySetInnerHTML — worth the few dozen lines given every one
 * of these bodies is LLM-generated.
 *
 * Supports: #/##/### headings, - and * bullets, 1. ordered lists,
 * - [ ] / - [x] checkboxes, > quotes, --- rules, fenced code, and inline
 * **bold**, *italic*, `code`, and links.
 */

let keySeq = 0;
const k = () => `md${keySeq++}`;

const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

function inline(text) {
  const out = [];
  const parts = String(text).split(INLINE);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      out.push(<strong key={k()}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push(
        <code key={k()} className="t-mono">
          {part.slice(1, -1)}
        </code>
      );
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      out.push(<em key={k()}>{part.slice(1, -1)}</em>);
    } else if (part.startsWith("[")) {
      const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (m && /^https?:\/\//i.test(m[2])) {
        out.push(
          <a key={k()} href={m[2]} target="_blank" rel="noreferrer noopener">
            {m[1]}
          </a>
        );
      } else {
        out.push(m ? m[1] : part);
      }
    } else {
      out.push(part);
    }
  }
  return out;
}

export default function Markdown({ children, className }) {
  const src = String(children || "");
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code
    if (line.trim().startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k()} className="t-mono">
          <code>{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(<hr key={k()} className="divider" />);
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const Tag = `h${Math.min(h[1].length + 1, 5)}`;
      const cls = h[1].length === 1 ? "t-h2" : h[1].length === 2 ? "t-h3" : "t-sm";
      blocks.push(
        <Tag key={k()} className={cls}>
          {inline(h[2])}
        </Tag>
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={k()}>{inline(buf.join(" "))}</blockquote>
      );
      continue;
    }

    // Lists
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        let text = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, "");
        const task = text.match(/^\[([ xX])\]\s*(.*)$/);
        if (task) {
          items.push(
            <li key={k()} data-task={task[1].toLowerCase() === "x" ? "done" : "open"}>
              <input type="checkbox" readOnly checked={task[1].toLowerCase() === "x"} />
              <span>{inline(task[2])}</span>
            </li>
          );
        } else {
          items.push(<li key={k()}>{inline(text)}</li>);
        }
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={k()} data-checklist={items.some((it) => it.props["data-task"]) ? "" : undefined}>
          {items}
        </Tag>
      );
      continue;
    }

    // Paragraph
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("```")
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(<p key={k()}>{inline(buf.join(" "))}</p>);
  }

  return <div className={`prose ${className || ""}`}>{blocks}</div>;
}
