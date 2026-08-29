"use client";

import { apiPost } from "./keys";

/**
 * Reading an uploaded document into plain text.
 *
 * Plain-text files are read directly in the browser. PDFs go to /api/extract,
 * which hands them to Gemini — that avoids a parser dependency and handles
 * scanned PDFs, which a text-layer parser cannot.
 *
 * Both paths end with text in a visible textarea, so nothing is consumed
 * without the user seeing it first.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Accept attribute shared by every upload control in the app. */
export const DOC_ACCEPT = ".txt,.md,.markdown,.text,.pdf,text/plain,text/markdown,application/pdf";

const isTextual = (file) =>
  file.type.startsWith("text/") || /\.(txt|md|markdown|text)$/i.test(file.name);

const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** Strip the `data:<mime>;base64,` prefix a FileReader data URL carries. */
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      if (comma === -1) reject(new Error("Could not read that file."));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Resolve a File to text.
 * `onStage` is called with "reading" or "extracting" so callers can show state,
 * since a PDF round-trip takes a few seconds.
 */
export async function readDocument(file, { onStage } = {}) {
  if (!file) throw new Error("No file selected.");

  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is over 5 MB. Paste the relevant sections instead.");
  }

  if (isTextual(file)) {
    onStage?.("reading");
    const text = await file.text();
    if (!text.trim()) throw new Error("That file is empty.");
    return text;
  }

  if (isPdf(file)) {
    onStage?.("reading");
    const data = await toBase64(file);
    onStage?.("extracting");
    const res = await apiPost("/api/extract", { data, mimeType: "application/pdf" });
    return res.text;
  }

  // .docx is the common miss here; Gemini cannot read it and a parser is a
  // heavier dependency than it is worth for an MVP.
  throw new Error(
    /\.docx?$/i.test(file.name)
      ? "Word files aren't supported. Export as PDF, or paste the text in."
      : "Use a PDF or a plain text file, or paste the text in."
  );
}
