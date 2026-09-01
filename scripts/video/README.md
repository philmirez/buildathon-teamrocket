# Walkthrough video pipeline

Turns a raw screen capture into a submission-ready clip: under 91 seconds,
audible, captioned, and playable on iOS.

Requires `ffmpeg`/`ffprobe` on PATH and `GEMINI_API_KEY` in the environment
(only for the captioning step).

## Why each step exists

**Trimming compresses pauses, it does not cut content.** `trim_silence.py`
detects silences and removes only the *interior* of each gap, keeping 0.3s of
padding on both sides, so a word can never be clipped. The longest gaps — the
dead air while an agent pipeline runs — give up their time first, so natural
speech rhythm survives. Verified on the original five: across 58 cuts the
loudest audio inside any cut window peaked at −32.5 dB, far below speech.

**The iOS-safe encode settings are not optional.** The screen captures are
full-range `yuvj420p` at 60fps, and a naive concat pushes the H.264 level to
6.2. Safari's hardware decoder rejects both, so clips play on desktop and fail
silently on iPhone. The script pins `yuv420p`, `color_range tv`, `level 4.0`
and 30fps CFR.

**Captions are generated against the final audio, not the source**, because the
speed-up shifts every timestamp. Hence the three-step order below.

## Usage

Order matters — the audio pass must run before captioning.

```bash
# 1. Final-timing audio (trim + speed + loudness, no video encode — fast)
python3 scripts/video/trim_silence.py public/videos/NAME.mov /tmp/NAME.mp3 97 --audio-only

# 2. Transcribe it to SRT
python3 scripts/video/caption.py /tmp/NAME.mp3 public/videos/captions/NAME.srt

# 3. Split any cue over 42 characters so it cannot clip when burned in
python3 scripts/video/split_cues.py public/videos/captions/NAME.srt

# 4. Final encode: trim + speed + loudness + burned captions + iOS-safe
python3 scripts/video/trim_silence.py public/videos/NAME.mov \
  public/videos/web/NAME.mp4 97 --subs public/videos/captions/NAME.srt

# 5. Poster frame, taken from 45% in — the opening seconds are usually
#    a recording of the site's own home page
ffmpeg -ss "$(ffprobe -v error -show_entries format=duration -of csv=p=0 \
  public/videos/web/NAME.mp4 | awk '{printf "%.1f", $1*0.45}')" \
  -i public/videos/web/NAME.mp4 -frames:v 1 -q:v 4 \
  public/videos/web/posters/NAME.jpg
```

The `97` is the target duration **before** the speed-up. At the default 1.10x
that lands around 88s. Raising it means gentler silence trimming; lower it only
if a clip still comes out over 91s.

Finally, register the clip in `lib/builds.js`:

```js
video:  "/videos/web/NAME.mp4",
poster: "/videos/web/posters/NAME.jpg",
```

## Tuning

| Variable | Default | Effect |
|---|---|---|
| `TRIM_SPEED` | `1.10` | Playback rate. `1.0` disables the speed-up. |
| `TRIM_NOISE` | `-32dB` | Louder threshold = more counted as silence. |
| `TRIM_MIN_GAP` | `0.45` | Ignore gaps shorter than this. |
| `TRIM_KEEP_PAD` | `0.30` | Silence retained either side of every cut. |
| `TRIM_FLOOR` | `0.40` | Never shrink a gap below this total length. |

If a clip sounds clipped, raise `TRIM_KEEP_PAD` and `TRIM_FLOOR` and re-run.
To check a run rather than trust it, the script writes its cut plan next to the
output as `NAME.mp4.cuts.json`; measure each window against the source with
`ffmpeg -ss A -to B -i SOURCE -af volumedetect -f null -`. Anything above about
−26 dB means speech was inside a cut.

## Known gaps

- `.docx`-style inputs aren't relevant here, but **Captured Memory has no
  walkthrough** — five clips exist for six builds.
- Captions are model-transcribed. They read accurately on the current set, but
  a wrong word is burned in permanently, so skim one before submitting.
