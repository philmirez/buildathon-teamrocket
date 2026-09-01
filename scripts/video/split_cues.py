"""Split over-long SRT cues at a word boundary, apportioning time by length."""
import re, sys

MAX = 42

def parse(p):
    out = []
    for block in re.split(r"\n\s*\n", open(p).read().strip()):
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        a, b = lines[1].split(" --> ")
        out.append((tc(a), tc(b), " ".join(lines[2:]).strip()))
    return out

def tc(s):
    h, m, rest = s.split(":")
    sec, ms = rest.split(",")
    return int(h)*3600 + int(m)*60 + int(sec) + int(ms)/1000

def fmt(t):
    ms = int(round(t*1000)); h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

def split(s, e, text):
    if len(text) <= MAX:
        return [(s, e, text)]
    words, lines, cur = text.split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > MAX:
            lines.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    total = sum(len(l) for l in lines) or 1
    out, t = [], s
    for i, l in enumerate(lines):
        share = (e - s) * (len(l) / total)
        end = e if i == len(lines) - 1 else min(e, t + share)
        out.append((t, end, l))
        t = end
    return out

cues = []
for s, e, t in parse(sys.argv[1]):
    cues.extend(split(s, e, t))

with open(sys.argv[1], "w") as f:
    for i, (s, e, t) in enumerate(cues, 1):
        f.write(f"{i}\n{fmt(s)} --> {fmt(e)}\n{t}\n\n")

print(f"{sys.argv[1].split('/')[-1]}: {len(cues)} cues, longest {max(len(t) for _,_,t in cues)} chars")
