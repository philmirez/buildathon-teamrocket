"""Transcribe final-timing audio to an SRT via Gemini."""
import base64, json, os, re, subprocess, sys, urllib.request

MODEL = "gemini-3.6-flash"
KEY = os.environ["GEMINI_API_KEY"]

SYSTEM = """You transcribe narration into subtitle cues.

- Transcribe VERBATIM. Never paraphrase, tidy, or summarise. Include the words
  actually spoken, with normal punctuation and capitalisation.
- Each cue is ONE short line of at most 42 characters. Split long sentences
  across consecutive cues at a natural phrase boundary. Never exceed 42
  characters — these are burned into the picture and will be clipped.
- Cue timings must match the audio precisely. A cue starts when its first word
  is spoken and ends when its last word finishes. Never overlap cues.
- Minimum cue duration 0.7s, maximum 4s.
- Skip stretches with no speech; do not emit empty or filler cues.
- Emit nothing but the cue list."""

SCHEMA = {
    "type": "object",
    "properties": {
        "cues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start": {"type": "number"},
                    "end": {"type": "number"},
                    "text": {"type": "string"},
                },
                "propertyOrdering": ["start", "end", "text"],
                "required": ["start", "end", "text"],
            },
        }
    },
    "required": ["cues"],
}

def ts(sec):
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

def main(audio, out):
    data = base64.b64encode(open(audio, "rb").read()).decode()
    dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
                                "-of","csv=p=0",audio],capture_output=True,text=True).stdout)
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [
            {"inlineData": {"mimeType": "audio/mpeg", "data": data}},
            {"text": f"Transcribe this {dur:.1f} second narration into subtitle cues."},
        ]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json",
                             "responseSchema": SCHEMA},
    }
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": KEY})
    body = json.loads(urllib.request.urlopen(req, timeout=300).read())
    text = "".join(p.get("text","") for p in body["candidates"][0]["content"]["parts"])
    cues = json.loads(text)["cues"]

    # Clamp into the clip and drop anything degenerate.
    clean = []
    for c in cues:
        s, e = max(0.0, float(c["start"])), min(dur, float(c["end"]))
        t = re.sub(r"\s+", " ", c["text"]).strip()
        if e - s < 0.25 or not t:
            continue
        if clean and s < clean[-1][1]:
            s = clean[-1][1] + 0.01
        if e > s:
            clean.append((s, e, t))

    with open(out, "w") as f:
        for i, (s, e, t) in enumerate(clean, 1):
            f.write(f"{i}\n{ts(s)} --> {ts(e)}\n{t}\n\n")

    over = [t for _, _, t in clean if len(t) > 42]
    print(json.dumps({"file": os.path.basename(out), "cues": len(clean),
                      "covers_to": round(clean[-1][1],1) if clean else 0,
                      "duration": round(dur,1), "over_42_chars": len(over)}))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
