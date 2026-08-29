import { geminiText, errorResponse, resolveKey } from "@/lib/gemini";

/**
 * Document text extraction.
 *
 * Gemini reads PDFs natively, so a scanned or text PDF can be transcribed
 * without adding a parser dependency. The output is deliberately a verbatim
 * transcription, not a summary: Policy Diff computes its diff from this text
 * and quotes it back to the reader, so any paraphrasing here would corrupt the
 * guarantee downstream.
 *
 * The extracted text lands in the visible textarea rather than being consumed
 * silently, so the user can read and correct it before anything runs on it.
 */

// Base64 inflates by ~33%; this keeps the request comfortably inside limits.
export const MAX_BYTES = 5 * 1024 * 1024;

const TRANSCRIBER = `You transcribe a document to plain text. You are not summarising it.

Rules:
- Reproduce the body text VERBATIM, word for word. Never paraphrase, condense,
  correct, modernise, or improve the wording. Copy what is there.
- Preserve the document's structure: keep headings on their own lines, keep
  numbered clauses and their numbers, and separate paragraphs with a blank line.
- Drop page furniture only: page numbers, running headers and footers that
  repeat on every page, and watermarks.
- Reconstruct text broken across a page boundary into one continuous paragraph.
- Render tables as plain lines, one row per line, cells separated by " | ".
- Do not add commentary, notes, or a preamble. Output the document text alone.
- If the document is unreadable or contains no extractable text, output exactly:
  UNREADABLE`;

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = resolveKey(body);

    const data = body.data || "";
    const mimeType = body.mimeType || "application/pdf";

    if (!data) {
      return Response.json({ error: "No file content." }, { status: 400 });
    }
    // Length of the base64 payload, back-converted to raw bytes.
    if ((data.length * 3) / 4 > MAX_BYTES) {
      return Response.json(
        { error: "That file is over 5 MB. Paste the relevant sections instead." },
        { status: 413 }
      );
    }
    if (mimeType !== "application/pdf") {
      return Response.json(
        { error: `Cannot read ${mimeType}. Use a PDF or plain text, or paste it in.` },
        { status: 415 }
      );
    }

    const text = await geminiText({
      apiKey,
      system: TRANSCRIBER,
      temperature: 0,
      parts: [
        { inlineData: { mimeType, data } },
        { text: "Transcribe this document to plain text, verbatim." },
      ],
    });

    if (!text || text.trim() === "UNREADABLE") {
      return Response.json(
        { error: "No readable text in that PDF. Paste the text instead." },
        { status: 422 }
      );
    }

    return Response.json({ text: text.trim() });
  } catch (err) {
    return errorResponse(err);
  }
}
