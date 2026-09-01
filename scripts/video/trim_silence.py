"""
Shorten a screen recording to a target duration by compressing pauses only.

No spoken audio is removed. For each detected silence the cut is taken from the
*interior* of the gap, leaving padding on both sides so words are never clipped.
Long gaps (waiting on an agent) are compressed first; short natural pauses are
left alone entirely, which keeps the delivery sounding normal.
"""
import json, os, re, subprocess, sys

# All overridable by environment variable, so a clip that comes out wrong can be
# re-run more conservatively without editing this file.
NOISE    = os.environ.get("TRIM_NOISE", "-32dB")      # below this counts as silence
MIN_GAP  = float(os.environ.get("TRIM_MIN_GAP", 0.45))  # ignore gaps shorter than this
KEEP_PAD = float(os.environ.get("TRIM_KEEP_PAD", 0.30)) # silence kept either side of a cut
FLOOR    = float(os.environ.get("TRIM_FLOOR", 0.40))    # never shrink a gap below this

def probe_duration(path):
    out = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
                          "-of","csv=p=0",path], capture_output=True, text=True).stdout
    return float(out.strip())

def detect_silences(path):
    p = subprocess.run(["ffmpeg","-hide_banner","-nostats","-i",path,
                        "-af",f"silencedetect=noise={NOISE}:d={MIN_GAP}","-f","null","-"],
                       capture_output=True, text=True).stderr
    starts = [float(m) for m in re.findall(r"silence_start: ([\d.]+)", p)]
    ends   = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", p)]
    return list(zip(starts, ends))[:len(ends)]

def plan(silences, duration, target):
    need = duration - target
    if need <= 0:
        return [], 0.0
    # Longest gaps give up their time first.
    ranked = sorted(silences, key=lambda g: g[1]-g[0], reverse=True)
    cuts, recovered = [], 0.0
    for s, e in ranked:
        if recovered >= need:
            break
        gap = e - s
        spare = gap - max(FLOOR, KEEP_PAD * 2)
        if spare <= 0.05:
            continue
        take = min(spare, need - recovered)
        mid = (s + e) / 2
        cuts.append((mid - take/2, mid + take/2))
        recovered += take
    return sorted(cuts), recovered

def keep_segments(cuts, duration):
    segs, pos = [], 0.0
    for a, b in cuts:
        if a > pos:
            segs.append((pos, a))
        pos = b
    if pos < duration:
        segs.append((pos, duration))
    return segs

SPEED    = float(os.environ.get("TRIM_SPEED", 1.10))  # 1.0 disables the speed-up

# iOS rejects full-range (yuvj420p) H.264 and anything above roughly level 5.2.
# The source captures are yuvj420p 60fps, and concat inflated the level to 6.2,
# so both are pinned explicitly here.
IOS_SAFE = [
    "-c:v", "libx264", "-preset", "medium", "-crf", "23",
    "-profile:v", "high", "-level:v", "4.0",
    "-pix_fmt", "yuv420p", "-color_range", "tv",
    "-r", "30", "-fps_mode", "cfr",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
]

def main(src, dst, target, audio_only=False, subs=None):
    duration = probe_duration(src)
    sil = detect_silences(src)
    cuts, recovered = plan(sil, duration, target)
    segs = keep_segments(cuts, duration)

    parts, labels = [], []
    for i, (a, b) in enumerate(segs):
        if not audio_only:
            parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}]")
        parts.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}]")
        labels.append(f"[a{i}]" if audio_only else f"[v{i}][a{i}]")
    if audio_only:
        parts.append("".join(labels) + f"concat=n={len(segs)}:v=0:a=1[ac]")
    else:
        parts.append("".join(labels) + f"concat=n={len(segs)}:v=1:a=1[vc][ac]")
    # Speed, then range-correct and scale. loudnorm brings quiet narration up to
    # the -16 LUFS web norm without the clipping a flat gain would cause.
    vchain = f"[vc]setpts=PTS/{SPEED},scale=1280:720:in_range=full:out_range=limited,format=yuv420p"
    if audio_only:
        vchain = None
    if subs and vchain:
        vchain += f",subtitles={subs}:force_style='FontName=Helvetica,Fontsize=17,PrimaryColour=&H00FFFFFF,OutlineColour=&H99000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=28'"
    if vchain:
        parts.append(vchain + "[v]")
    parts.append(f"[ac]atempo={SPEED},loudnorm=I=-16:TP=-1.5:LRA=11[a]")

    script = dst + ".filter"
    open(script, "w").write(";\n".join(parts))

    if audio_only:
        cmd = (["ffmpeg","-loglevel","error","-y","-i",src,
                "-filter_complex_script",script,"-map","[a]",
                "-c:a","libmp3lame","-b:a","64k","-ar","16000","-ac","1", dst])
    else:
        cmd = (["ffmpeg","-loglevel","error","-y","-i",src,
                "-filter_complex_script",script,"-map","[v]","-map","[a]"]
               + IOS_SAFE + [dst])
    subprocess.run(cmd, check=True)
    os.remove(script)

    open(dst + ".cuts.json", "w").write(json.dumps(cuts))
    print(json.dumps({
        "file": os.path.basename(dst),
        "before": round(duration,1),
        "after": round(probe_duration(dst),1),
        "gaps_shortened": len(cuts),
        "seconds_recovered": round(recovered,1),
    }))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]),
         audio_only=("--audio-only" in sys.argv),
         subs=(sys.argv[sys.argv.index("--subs")+1] if "--subs" in sys.argv else None))
