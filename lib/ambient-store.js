/**
 * Workspace state for the Ambient Scribe.
 *
 * The agent emits actions; this module is the only thing that mutates state.
 * Keeping the reducer pure means the transcript -> action -> workspace path is
 * easy to reason about (and to replay in a demo).
 */

const STORAGE_KEY = "broccoli.ambient.v1";

export const emptyWorkspace = () => ({ folders: [], notes: [] });

export function loadWorkspace() {
  if (typeof window === "undefined") return emptyWorkspace();
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || !Array.isArray(raw.folders) || !Array.isArray(raw.notes)) return emptyWorkspace();
    return raw;
  } catch {
    return emptyWorkspace();
  }
}

export function saveWorkspace(ws) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
  } catch {
    /* quota or private mode — the in-memory workspace still works */
  }
}

const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Resolve a folder by id, exact name, or slug — the agent may use any of them. */
function findFolder(ws, ref) {
  if (!ref) return null;
  const want = slug(ref);
  return (
    ws.folders.find((f) => f.id === ref) ||
    ws.folders.find((f) => slug(f.name) === want) ||
    null
  );
}

function findNote(ws, ref) {
  if (!ref) return null;
  const want = slug(ref);
  return ws.notes.find((n) => n.id === ref) || ws.notes.find((n) => slug(n.title) === want) || null;
}

/**
 * Apply one agent action. Returns { workspace, log } where `log` describes what
 * actually happened so the UI can narrate it.
 */
export function applyAction(ws, action) {
  const now = Date.now();
  const next = { folders: [...ws.folders], notes: [...ws.notes] };

  switch (action.type) {
    case "create_folder": {
      const existing = findFolder(next, action.name);
      if (existing) return { workspace: ws, log: null };
      const folder = {
        id: uid("f"),
        name: action.name || "Untitled",
        icon: action.icon || "folder",
        createdAt: now,
      };
      next.folders.push(folder);
      return { workspace: next, log: { verb: "Filed under", target: folder.name, icon: "folder", id: folder.id } };
    }

    case "create_note": {
      let folder = findFolder(next, action.folder);
      if (!folder && action.folder) {
        folder = { id: uid("f"), name: action.folder, icon: "folder", createdAt: now };
        next.folders.push(folder);
      }
      const note = {
        id: uid("n"),
        title: action.title || "Untitled note",
        body: action.content || "",
        folderId: folder ? folder.id : null,
        createdAt: now,
        updatedAt: now,
      };
      next.notes.push(note);
      return { workspace: next, log: { verb: "Wrote", target: note.title, icon: "note", id: note.id } };
    }

    case "append_note": {
      const note = findNote(next, action.noteId || action.title);
      if (!note) return { workspace: ws, log: null };
      const i = next.notes.indexOf(note);
      next.notes[i] = {
        ...note,
        body: `${note.body}\n\n${action.content || ""}`.trim(),
        updatedAt: now,
      };
      return { workspace: next, log: { verb: "Added to", target: note.title, icon: "note", id: note.id } };
    }

    case "rename_note": {
      const note = findNote(next, action.noteId || action.title);
      if (!note || !action.newTitle) return { workspace: ws, log: null };
      const i = next.notes.indexOf(note);
      next.notes[i] = { ...note, title: action.newTitle, updatedAt: now };
      return { workspace: next, log: { verb: "Renamed to", target: action.newTitle, icon: "note", id: note.id } };
    }

    case "move_note": {
      const note = findNote(next, action.noteId || action.title);
      if (!note) return { workspace: ws, log: null };
      let folder = findFolder(next, action.folder);
      if (!folder && action.folder) {
        folder = { id: uid("f"), name: action.folder, icon: "folder", createdAt: now };
        next.folders.push(folder);
      }
      const i = next.notes.indexOf(note);
      next.notes[i] = { ...note, folderId: folder ? folder.id : null, updatedAt: now };
      return {
        workspace: next,
        log: { verb: "Moved to", target: folder ? folder.name : "Unfiled", icon: "folder", id: note.id },
      };
    }

    case "delete_note": {
      const note = findNote(next, action.noteId || action.title);
      if (!note) return { workspace: ws, log: null };
      next.notes = next.notes.filter((n) => n.id !== note.id);
      return { workspace: next, log: { verb: "Deleted", target: note.title, icon: "trash", id: null } };
    }

    default:
      return { workspace: ws, log: null };
  }
}

/** Compact view of the workspace handed to the agent as context. */
export function describeWorkspace(ws) {
  if (!ws.notes.length && !ws.folders.length) return "(empty — nothing filed yet)";
  const lines = [];
  for (const f of ws.folders) {
    lines.push(`FOLDER "${f.name}" [${f.id}]`);
    for (const n of ws.notes.filter((x) => x.folderId === f.id)) {
      lines.push(`  NOTE "${n.title}" [${n.id}] — ${n.body.slice(0, 120).replace(/\s+/g, " ")}`);
    }
  }
  const loose = ws.notes.filter((n) => !n.folderId);
  if (loose.length) {
    lines.push("UNFILED");
    for (const n of loose) lines.push(`  NOTE "${n.title}" [${n.id}]`);
  }
  return lines.join("\n");
}

export function clearWorkspace() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
