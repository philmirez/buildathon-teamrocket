"use client";

import { useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { trackRunFinished, trackRunStarted } from "@/lib/analytics";
import { apiPost, getKey } from "@/lib/keys";
import { decideTable } from "@/lib/decide";
import s from "./swipe.module.css";

/**
 * Deterministic card art — a hashed hue pair. It is the backdrop every card
 * starts on, and stays the whole card when no photo of the place exists. We
 * never generate a fake storefront for a real business.
 */
function artFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return { "--h1": h, "--h2": (h + 48) % 360 };
}

/**
 * Photo strip for one card.
 *
 * Advancing is a tap on the left or right half rather than a horizontal drag,
 * because horizontal on this card already means yes/no. Panels that 404 drop
 * themselves out rather than leaving a broken frame in the strip.
 */
function Thumbs({ shots, source, name }) {
  const [i, setI] = useState(0);
  const [dead, setDead] = useState(() => new Set());

  const live = shots.filter((sh) => !dead.has(sh.url));
  if (!live.length) return null;

  const at = Math.min(i, live.length - 1);
  const step = (d) => setI((n) => (n + d + live.length) % live.length);

  return (
    <>
      <div className={s.track} style={{ transform: `translateX(-${at * 100}%)` }}>
        {live.map((sh) => (
          <img
            key={sh.url}
            className={s.shot}
            src={sh.url}
            alt={`${name}${source === "pixabay" ? " — representative photo" : ""}`}
            draggable={false}
            onError={() => setDead((prev) => new Set(prev).add(sh.url))}
          />
        ))}
      </div>

      {live.length > 1 && (
        <>
          <button className={`${s.tapZone} ${s.tapLeft}`} onClick={() => step(-1)} aria-label="Previous photo">
            <Icon name="arrowLeft" size={18} />
          </button>
          <button className={`${s.tapZone} ${s.tapRight}`} onClick={() => step(1)} aria-label="Next photo">
            <Icon name="arrowRight" size={18} />
          </button>
          <div className={s.dots} aria-hidden="true">
            {live.map((sh, n) => (
              <span key={sh.url} className={s.dot} data-on={n === at || undefined} />
            ))}
          </div>
        </>
      )}

      <span className={s.credit}>
        {source === "pixabay" ? "Stock photo — not this restaurant" : live[at].credit}
      </span>
    </>
  );
}

/**
 * The setup is asked one question at a time. Order matters: "where" gates the
 * whole deck, so it goes first and everything after it is optional.
 */
const STEPS = ["where", "distance", "craving", "who"];

const DISTANCES = [
  { id: "walking", label: "Walking distance", hint: "About 15 minutes on foot." },
  { id: "driving", label: "Driving distance", hint: "About 20 minutes by car." },
];

/**
 * Pre-canned constraints. `phrase` is what the deck agent actually reads, so
 * each one is written as the sentence a person would say, not as a keyword.
 * They stack — vegetarian AND quiet is the common real case — so these are
 * multi-select rather than one-of.
 */
const CRAVINGS = [
  { id: "cheap", label: "Cheap eats", phrase: "keep it cheap" },
  { id: "quiet", label: "Somewhere we can talk", phrase: "quiet enough to actually hold a conversation" },
  { id: "veg", label: "Vegetarian-friendly", phrase: "at least one of us is vegetarian, so every option has to work for them" },
  { id: "new", label: "Somewhere new", phrase: "somewhere none of us would have thought of" },
  { id: "comfort", label: "Comfort food", phrase: "comfort food" },
  { id: "fast", label: "In and out fast", phrase: "we want to be in and out quickly" },
  { id: "drinks", label: "Good drinks", phrase: "a real bar — we want drinks before we eat" },
  { id: "outside", label: "Sit outside", phrase: "outdoor seating" },
];

/**
 * Stand-in names, for when the group would rather not type four of them. Kept
 * deliberately varied — a pool of Bobs and Sarahs makes the app feel like it
 * was built for one kind of table.
 */
const NAME_POOL = [
  "Ana", "Marcus", "Priya", "Devon", "Yuki", "Sam", "Noor", "Theo",
  "Rosa", "Kwame", "Ines", "Jonah", "Mei", "Diego", "Farrah", "Otis",
  "Leila", "Ravi", "Nina", "Cole", "Tomas", "Bex", "Hana", "Amari",
];

/** `count` names nobody at the table is already using. */
function randomNames(count, taken) {
  const pool = NAME_POOL.filter((n) => !taken.includes(n));
  const picked = [];
  while (picked.length < count && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}

const PARTY_SIZES = [2, 3, 4, 5];

const DEALING = [
  "Reading the area…",
  "Throwing out the places nobody would pick…",
  "Spreading it across price points…",
  "Writing the one line that matters on each card…",
  "Shuffling…",
];

/**
 * Optional selfie for a member, so the handoff screen shows a face instead of
 * a letter. The frame is mirrored on capture to match the preview the user was
 * just looking at — an unmirrored snap of yourself reads as somebody else.
 * Nothing leaves the browser: the result is a data URL held in React state.
 */
function SelfieCam({ name, onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        // The effect can be torn down before permission resolves; without this
        // the camera light stays on with nothing rendering it.
        if (dead) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(() => setErr("No camera here, or permission was denied. A selfie is optional — skip it."));
    return () => {
      dead = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const SIZE = 240;
    const crop = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, (v.videoWidth - crop) / 2, (v.videoHeight - crop) / 2, crop, crop, 0, 0, SIZE, SIZE);
    onCapture(canvas.toDataURL("image/jpeg", 0.72));
  };

  return (
    <div className={s.camScrim} role="dialog" aria-modal="true" aria-label={`Take ${name}'s photo`}>
      <div className={s.cam}>
        <div className={s.camStage}>
          <video ref={videoRef} className={s.camVideo} playsInline muted />
          {!ready && !err && <span className="spinner" />}
          {err && <p className={`t-sm t-secondary ${s.camErr}`}>{err}</p>}
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={snap} disabled={!ready}>
            <Icon name="camera" size={16} />
            Take it
          </button>
        </div>
      </div>
    </div>
  );
}

/** A member's face, or their initial when they skipped the selfie. */
function Avatar({ member, size = 40 }) {
  return (
    <span className={s.avatarImg} style={{ width: size, height: size }}>
      {member.photo ? (
        // A data: URL straight off the camera — next/image has nothing to fetch
        // or optimize here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.photo} alt="" />
      ) : (
        <span aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}

const mapsUrl = (p, area) =>
  `https://maps.apple.com/?q=${encodeURIComponent(`${p.name}, ${p.neighborhood || area}`)}`;

export default function Swiper() {
  const [phase, setPhase] = useState("setup"); // setup | handoff | swipe | result
  const [where, setWhere] = useState("");
  const [mode, setMode] = useState("driving");
  const [locating, setLocating] = useState(false);
  const [usingGps, setUsingGps] = useState(false);
  const [tags, setTags] = useState([]);
  const [customOn, setCustomOn] = useState(false);
  const [customCraving, setCustomCraving] = useState("");
  // Nobody is named by default. A table of two called Phil and Allen is our
  // table, not the user's, and pre-filling it means most groups swipe under
  // somebody else's names.
  const [members, setMembers] = useState([]);
  const [size, setSize] = useState(2);
  const [places, setPlaces] = useState([]);
  const [area, setArea] = useState("");
  const [votes, setVotes] = useState({});
  const [who, setWho] = useState(0);
  const [idx, setIdx] = useState(0);
  const [leaving, setLeaving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState(null);
  const [narrating, setNarrating] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState({}); // name -> { shots, source }

  // --- setup wizard ---
  const [step, setStep] = useState(0);
  const [whereMode, setWhereMode] = useState(null); // null | "near" | "else"
  const [camFor, setCamFor] = useState(null); // index of the member being shot
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [dealLine, setDealLine] = useState(0);

  const current = places[idx];
  const member = members[who];
  const names = members.map((m) => m.name);

  /** The chips and the free-text box collapse into the one line the deck reads. */
  const craving = [
    ...tags.map((id) => CRAVINGS.find((c) => c.id === id)?.phrase).filter(Boolean),
    customOn ? customCraving.trim() : "",
  ]
    .filter(Boolean)
    .join("; ");

  const missing = Math.max(0, size - members.length);

  // The constraints step is genuinely optional, so the button admits it rather
  // than making an empty "Next" look like something was left undone.
  const nextLabel =
    step === STEPS.length - 1 ? "Find us a place" : step === 2 && !craving ? "Skip" : "Next";
  const canAdvance =
    step === 0 ? Boolean(where.trim()) : step === STEPS.length - 1 ? missing === 0 : true;

  // Rotates the status line while the deck builds. No setState in the effect
  // body itself — start() resets the index, so this only ever fires on a tick.
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => setDealLine((i) => (i + 1) % DEALING.length), 1800);
    return () => clearInterval(t);
  }, [busy]);

  /** Names are the vote keys, so a second "Sam" has to become "Sam 2". */
  function addMember(raw) {
    const name = raw.trim();
    if (!name || members.length >= 5) return;
    let unique = name;
    let n = 2;
    while (members.some((m) => m.name.toLowerCase() === unique.toLowerCase())) unique = `${name} ${n++}`;
    setMembers([...members, { name: unique, photo: null }]);
    // Naming a sixth person is a statement about the party size, so the target
    // follows the names rather than blocking them.
    if (members.length + 1 > size) setSize(members.length + 1);
    setNewName("");
    setAdding(false);
  }

  /** Fills the empty seats only — never overwrites a name somebody typed. */
  function fillRandom() {
    if (!missing) return;
    setMembers([...members, ...randomNames(missing, names).map((n) => ({ name: n, photo: null }))]);
    setAdding(false);
  }

  function removeMember(i) {
    setMembers(members.filter((_, j) => j !== i));
    // Otherwise the seat they vacated lingers as an empty slot the user has to
    // fill again before they can move on.
    setSize(Math.max(2, size - 1));
  }

  /** Shrinking the party drops the people who no longer fit. */
  function resize(n) {
    setSize(n);
    if (members.length > n) setMembers(members.slice(0, n));
  }

  /**
   * The two ways of answering are exclusive, so switching clears whatever the
   * other one set. Picking "nearby" is the location request — there is no
   * second button to press, which is the whole point.
   */
  function pickWhere(m) {
    setWhereMode(m);
    setUsingGps(false);
    setWhere("");
    setError("");
    if (m === "near") requestLocation();
  }

  async function start() {
    if (!getKey("gemini")) {
      setError("Add your Gemini key with the key button up top first.");
      return;
    }
    setBusy(true);
    setDealLine(0);
    trackRunStarted("this-or-that");
    setError("");
    try {
      const data = await apiPost("/api/this-or-that", {
        stage: "deck",
        where,
        mode,
        craving,
        members: names,
      });
      if (!data.places?.length) throw new Error("No places came back. Try a broader area.");
      setPlaces(data.places);
      setArea(data.area || where);
      setVotes(Object.fromEntries(names.map((n) => [n, { yes: [], no: [] }])));
      setWho(0);
      setIdx(0);
      setPhotos({});
      setPhase("handoff");
      loadPhotos(data.places, data.area || where);
      trackRunFinished("this-or-that", "success");
    } catch (e) {
      setError(e.message);
      trackRunFinished("this-or-that", "error");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Photos are a garnish, not a gate: this runs after the deck is already on
   * screen and a failure leaves the gradient art in place without an error.
   */
  async function loadPhotos(deck, areaName) {
    try {
      const data = await apiPost("/api/this-or-that", {
        stage: "photos",
        places: deck,
        area: areaName,
        placesKey: getKey("places"),
        pixabayKey: getKey("pixabay"),
      });
      setPhotos(data.photos || {});
    } catch {
      /* no photos, no problem — the cards render on their hashed art */
    }
  }

  /**
   * Ask the browser for coordinates and hand them straight to the deck agent,
   * which names the neighbourhood back. That avoids a geocoding key, and the
   * returned area is shown so the user can confirm it placed them correctly.
   */
  function requestLocation() {
    if (!navigator.geolocation) {
      setWhereMode(null);
      setError("This browser can't share a location. Pick \u201cSomewhere else\u201d and type it in.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setWhere(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        setUsingGps(true);
        setLocating(false);
        // Answered — move on, after a beat long enough to see it land.
        setTimeout(() => setStep((n) => (n === 0 ? 1 : n)), 460);
      },
      (err) => {
        setLocating(false);
        setWhereMode(null);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "No location permission. Pick \u201cSomewhere else\u201d and type it in."
            : "Couldn't find you. Pick \u201cSomewhere else\u201d and type it in."
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function swipe(liked) {
    if (leaving || !current) return;
    setLeaving(liked ? "yes" : "no");

    // Built here rather than inside the updater so the last swipe can hand the
    // complete tally straight to decide() — no reading state back out of React.
    const mine = votes[member.name] || { yes: [], no: [] };
    const next = {
      ...votes,
      [member.name]: liked
        ? { ...mine, yes: [...mine.yes, current.name] }
        : { ...mine, no: [...mine.no, current.name] },
    };
    setVotes(next);

    setTimeout(() => {
      setLeaving(null);
      if (idx + 1 < places.length) {
        setIdx(idx + 1);
      } else if (who + 1 < members.length) {
        setWho(who + 1);
        setIdx(0);
        setPhase("handoff");
      } else {
        decide(next);
      }
    }, 260);
  }

  /**
   * Counted, not asked. The table is settled locally and rendered immediately —
   * there is no request between the last swipe and the answer, and the same
   * swipes always produce the same table.
   */
  function decide(finalVotes) {
    setPhase("result");
    const result = decideTable({ places, members: names, votes: finalVotes });
    setDecision(result);
    if (result?.winner) narrate(result);
  }

  /**
   * Prose, and only prose. The result is already on screen; this replaces its
   * three sentences with better-written ones when they arrive. Every failure
   * path here is silent on purpose — the counted copy it would overwrite is
   * already correct, so an error message would be describing a non-problem.
   */
  async function narrate(result) {
    const top = result.ranked[0];
    setNarrating(true);
    try {
      const copy = await apiPost("/api/this-or-that", {
        stage: "narrate",
        winner: result.winner,
        runnerUp: result.runnerUp,
        unanimous: result.unanimous,
        card: top.place,
        yes: top.yes,
        no: top.no,
        craving,
      });
      setDecision((d) =>
        d && d.winner === result.winner
          ? {
              ...d,
              headline: copy.headline?.trim() || d.headline,
              why: copy.why?.trim() || d.why,
              // An empty tradeoff is a real answer on a unanimous pick, so it
              // is taken as written rather than falling back to the counted one.
              tradeoff: typeof copy.tradeoff === "string" ? copy.tradeoff.trim() : d.tradeoff,
              narrated: true,
            }
          : d
      );
    } catch {
      /* the counted wording stands */
    } finally {
      setNarrating(false);
    }
  }

  const winner = places.find((p) => p.name === decision?.winner);
  const runnerUp = places.find((p) => p.name === decision?.runnerUp);

  function reset() {
    setPhase("setup");
    setPlaces([]);
    setPhotos({});
    setVotes({});
    setDecision(null);
    setNarrating(false);
    setError("");
    setIdx(0);
    setWho(0);
    setStep(0);
    setWhereMode(null);
    setAdding(false);
    setCamFor(null);
  }

  return (
    <Shell>
      <div className="container-narrow" style={{ paddingBlock: "var(--s-6) var(--s-8)" }}>
        {/* ---------------- setup ---------------- */}
        {phase === "setup" && !busy && (
          <div className={s.setup}>
            <div className={s.wizHead}>
              <span className={s.headIcon} aria-hidden="true">
                <Icon name="fork" size={22} />
              </span>
              <div className={s.pips} role="presentation">
                {STEPS.map((id, i) => (
                  <span key={id} className={`${s.pip} ${i === step ? s.pipOn : ""}`} />
                ))}
              </div>
            </div>

            {/* Keyed on the step so each question animates in as its own screen. */}
            <div className={s.step} key={step}>
              {step === 0 && (
                <>
                  <h1 className="t-h1 t-balance">Where are you eating?</h1>
                  <div className={s.stepBody}>
                    <button
                      className={`${s.choice} ${whereMode === "near" ? s.choiceOn : ""}`}
                      onClick={() => pickWhere("near")}
                      disabled={locating}
                      aria-pressed={whereMode === "near"}
                    >
                      <span className={s.choiceIcon} aria-hidden="true">
                        {locating ? <span className="spinner" /> : <Icon name="pin" size={20} />}
                      </span>
                      <span className={s.choiceText}>
                        <span className="t-body">Nearby</span>
                        <span className="t-sm t-secondary">
                          {locating
                            ? "Finding you…"
                            : usingGps && where
                              ? "Using your location"
                              : "Places around me right now"}
                        </span>
                      </span>
                      {usingGps && where && <Icon name="check" size={18} />}
                    </button>

                    <button
                      className={`${s.choice} ${whereMode === "else" ? s.choiceOn : ""}`}
                      onClick={() => pickWhere("else")}
                      aria-pressed={whereMode === "else"}
                    >
                      <span className={s.choiceIcon} aria-hidden="true">
                        <Icon name="search" size={20} />
                      </span>
                      <span className={s.choiceText}>
                        <span className="t-body">Somewhere else</span>
                        <span className="t-sm t-secondary">I&apos;ll type it in</span>
                      </span>
                    </button>

                    {whereMode === "else" && (
                      <>
                        <input
                          id="where"
                          className="input"
                          value={where}
                          autoFocus
                          onChange={(e) => setWhere(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && where.trim()) setStep(1);
                          }}
                          placeholder="City or neighborhood"
                          aria-label="Where you are eating"
                        />
                        {!where.trim() && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setWhere("Austin, TX")}
                          >
                            <Icon name="sparkle" size={14} />
                            Try Austin, TX
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <h1 className="t-h1 t-balance">How far are you willing to go?</h1>
                  <div className={s.stepBody}>
                    {DISTANCES.map((opt) => (
                      <button
                        key={opt.id}
                        className={`${s.choice} ${mode === opt.id ? s.choiceOn : ""}`}
                        aria-pressed={mode === opt.id}
                        onClick={() => {
                          setMode(opt.id);
                          // A single-choice step answers itself — the beat is
                          // just long enough to see the selection land.
                          setTimeout(() => setStep((n) => (n === 1 ? 2 : n)), 220);
                        }}
                      >
                        <span className={s.choiceText}>
                          <span className="t-body">{opt.label}</span>
                          <span className="t-sm t-secondary">{opt.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <h1 className="t-h1 t-balance">Anything we should know?</h1>
                  <div className={s.stepBody}>
                    <div className="row-wrap" style={{ "--gap": "var(--s-2)" }}>
                      {CRAVINGS.map((c) => {
                        const on = tags.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            className={`chip ${on ? "chip-selected" : ""}`}
                            aria-pressed={on}
                            onClick={() =>
                              setTags(on ? tags.filter((t) => t !== c.id) : [...tags, c.id])
                            }
                          >
                            {on && <Icon name="check" size={13} />}
                            {c.label}
                          </button>
                        );
                      })}
                      <button
                        className={`chip ${customOn ? "chip-selected" : ""}`}
                        aria-pressed={customOn}
                        onClick={() => setCustomOn(!customOn)}
                      >
                        <Icon name={customOn ? "check" : "plus"} size={13} />
                        Something else
                      </button>
                    </div>

                    {customOn && (
                      <input
                        className="input"
                        value={customCraving}
                        autoFocus
                        onChange={(e) => setCustomCraving(e.target.value)}
                        placeholder="nothing too loud, no cilantro"
                        aria-label="Your own constraint"
                      />
                    )}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h1 className="t-h1 t-balance">Who&apos;s eating?</h1>
                  <p className="t-body t-secondary t-balance">
                    Everyone swipes the same places, one after another. Type their names,
                    or let us pick some.
                  </p>
                  <div className={s.stepBody}>
                    <div className="row-wrap" style={{ "--gap": "var(--s-2)" }}>
                      <span className="t-sm t-secondary">How many of you?</span>
                      {PARTY_SIZES.map((n) => (
                        <button
                          key={n}
                          className={`chip ${size === n ? "chip-selected" : ""}`}
                          aria-pressed={size === n}
                          onClick={() => resize(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>

                    <div className={s.people}>
                      {members.map((m, i) => (
                        <div className={s.person} key={`${m.name}-${i}`}>
                          <button
                            className={s.avatar}
                            onClick={() => setCamFor(i)}
                            aria-label={`Take ${m.name}'s photo`}
                          >
                            <Avatar member={m} size={64} />
                            <span className={s.avatarCam} aria-hidden="true">
                              <Icon name="camera" size={13} />
                            </span>
                          </button>
                          <span className="t-sm truncate">{m.name}</span>
                          <button
                            className={s.personX}
                            onClick={() => removeMember(i)}
                            aria-label={`Remove ${m.name}`}
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </div>
                      ))}

                      {/* The empty seats are drawn, so "two more to go" is
                          something you can see rather than count. */}
                      {Array.from({ length: missing }, (_, i) => (
                        <button
                          key={`empty-${i}`}
                          className={s.seat}
                          onClick={() => setAdding(true)}
                          aria-label="Name someone"
                        >
                          <Icon name="plus" size={18} />
                        </button>
                      ))}
                    </div>

                    {missing > 0 && !adding && (
                      <button className={s.choice} onClick={() => setAdding(true)}>
                        <span className={s.choiceIcon} aria-hidden="true">
                          <Icon name="plus" size={20} />
                        </span>
                        <span className={s.choiceText}>
                          <span className="t-body">Type a name</span>
                          <span className="t-sm t-secondary">Add them one at a time</span>
                        </span>
                      </button>
                    )}

                    {missing > 0 && (
                      <button className={s.choice} onClick={fillRandom}>
                        <span className={s.choiceIcon} aria-hidden="true">
                          <Icon name="sparkle" size={20} />
                        </span>
                        <span className={s.choiceText}>
                          <span className="t-body">Name them for me</span>
                          <span className="t-sm t-secondary">
                            We&apos;ll fill {missing === 1 ? "the last seat" : "the empty seats"}
                          </span>
                        </span>
                      </button>
                    )}

                    {missing === 0 && members.length > 0 && (
                      <p className="t-xs t-secondary">
                        Tap a face for a selfie — it only ever lives in this browser.
                      </p>
                    )}

                    {adding && (
                      <form
                        className="row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          addMember(newName);
                        }}
                      >
                        <input
                          className="input"
                          value={newName}
                          autoFocus
                          maxLength={24}
                          onChange={(e) => setNewName(e.target.value)}
                          // Implicit form submission is easy to lose to a
                          // stray wrapper; the key is handled outright.
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addMember(newName);
                            }
                          }}
                          placeholder="Name"
                          aria-label="Their name"
                        />
                        <button className="btn btn-sm" type="submit" disabled={!newName.trim()}>
                          Add
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => {
                            setAdding(false);
                            setNewName("");
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="notice notice-error">
                <Icon name="warning" size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className={s.wizNav}>
              <button
                className="btn btn-ghost"
                onClick={() => setStep(step - 1)}
                disabled={step === 0}
              >
                <Icon name="arrowLeft" size={16} />
                Back
              </button>
              <button
                className="btn btn-lg"
                onClick={() => (step === STEPS.length - 1 ? start() : setStep(step + 1))}
                disabled={!canAdvance}
              >
                {nextLabel}
                <Icon name="arrowRight" size={17} />
              </button>
            </div>
          </div>
        )}

        {camFor !== null && members[camFor] && (
          <SelfieCam
            name={members[camFor].name}
            onClose={() => setCamFor(null)}
            onCapture={(photo) => {
              setMembers(members.map((m, i) => (i === camFor ? { ...m, photo } : m)));
              setCamFor(null);
            }}
          />
        )}

        {/* ---------------- dealing ---------------- */}
        {phase === "setup" && busy && (
          <div className={s.dealing}>
            <div className={s.dealStack} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className={`t-body t-secondary ${s.dealLine}`} key={dealLine} aria-live="polite">
              {DEALING[dealLine]}
            </p>
          </div>
        )}

        {/* ---------------- handoff ---------------- */}
        {phase === "handoff" && (
          <div className={s.handoff}>
            {member.photo ? (
              <Avatar member={member} size={72} />
            ) : (
              <span className={s.headIcon} aria-hidden="true">
                <Icon name="users" size={24} />
              </span>
            )}
            <h1 className="t-h1">{member.name}&apos;s turn</h1>
            <p className="t-body t-secondary t-balance">
              {who === 0
                ? `${places.length} places in ${area}. Swipe on what you'd actually eat.`
                : "Pass the phone. No peeking at the last round."}
            </p>
            <button className="btn btn-lg" onClick={() => setPhase("swipe")}>
              Start swiping
              <Icon name="arrowRight" size={17} />
            </button>
          </div>
        )}

        {/* ---------------- swipe ---------------- */}
        {phase === "swipe" && current && (
          <div className={s.deck}>
            <div className="spread">
              <span className={s.turn}>
                <Avatar member={member} size={22} />
                <span className="t-sm">{member.name}</span>
              </span>
              <span className="t-sm t-secondary">
                {idx + 1} / {places.length}
              </span>
            </div>

            <div className={s.cardStack}>
              {places[idx + 1] && (
                <article className={`${s.card} ${s.behind}`} style={artFor(places[idx + 1].name)} aria-hidden="true">
                  <div className={s.art} />
                </article>
              )}

              <article
                key={current.name}
                className={s.card}
                data-leaving={leaving || undefined}
                style={artFor(current.name)}
              >
                <div className={s.art} data-photo={photos[current.name] ? "" : undefined}>
                  {photos[current.name] && (
                    <Thumbs
                      shots={photos[current.name].shots}
                      source={photos[current.name].source}
                      name={current.name}
                    />
                  )}
                  <span className={s.price}>{current.price}</span>
                  <span className={s.cuisine}>{current.cuisine}</span>
                </div>
                <div className={s.cardBody}>
                  <h2 className="t-h2">{current.name}</h2>
                  <p className="t-sm t-secondary">
                    {current.neighborhood} · {current.vibe}
                  </p>
                  <p className="t-body">{current.hook}</p>
                  <p className={`t-sm ${s.dish}`}>
                    <Icon name="sparkle" size={14} />
                    Order the {current.dish}
                  </p>
                  <a
                    className={`t-xs ${s.maps}`}
                    href={mapsUrl(current, area)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Icon name="pin" size={13} />
                    Open in Maps
                  </a>
                </div>
              </article>
            </div>

            <div className={s.actions}>
              <button className={`${s.swipeBtn} ${s.nope}`} onClick={() => swipe(false)} aria-label="Pass">
                <Icon name="x" size={26} />
              </button>
              <button className={`${s.swipeBtn} ${s.yep}`} onClick={() => swipe(true)} aria-label="Would eat here">
                <Icon name="heart" size={26} />
              </button>
            </div>
          </div>
        )}

        {/* ---------------- result ---------------- */}
        {phase === "result" && (
          <div className={s.result}>
            {decision?.winner ? (
              <>
                <div className={s.winner} style={winner ? artFor(winner.name) : undefined}>
                  <div className={s.winArt} data-photo={winner && photos[winner.name] ? "" : undefined}>
                    {winner && photos[winner.name] && (
                      <Thumbs
                        shots={photos[winner.name].shots}
                        source={photos[winner.name].source}
                        name={winner.name}
                      />
                    )}
                    <span className={s.winBadge}>
                      <span className="badge badge-green">
                        {decision.unanimous ? "Unanimous" : "Best overlap"}
                      </span>
                    </span>
                  </div>
                  <div className={s.cardBody}>
                    <h1 className="t-h1">{decision.winner}</h1>
                    <p className="t-body">{decision.headline}</p>
                    {winner && (
                      <a
                        className="btn btn-secondary btn-sm"
                        href={mapsUrl(winner, area)}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Icon name="pin" size={15} />
                        Open in Maps
                      </a>
                    )}
                  </div>
                </div>

                {/* Keyed on `narrated` so the counted wording visibly gives way
                    to the written one instead of silently mutating mid-read. */}
                <div className={`card stack ${s.reasoning}`} key={decision.narrated ? "written" : "counted"}>
                  <p className="t-body">{decision.why}</p>
                  {decision.tradeoff && (
                    <p className="t-sm t-secondary">
                      <Icon name="users" size={14} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                      {decision.tradeoff}
                    </p>
                  )}
                  {runnerUp && (
                    <p className="t-sm t-secondary">
                      If it&apos;s booked: <strong>{runnerUp.name}</strong>
                    </p>
                  )}
                </div>

                <div className={s.tally}>
                  {members.map((m) => (
                    <div key={m.name} className={s.tallyRow}>
                      <Avatar member={m} size={26} />
                      <span className="badge">{m.name}</span>
                      <span className="t-sm t-secondary truncate">
                        {(votes[m.name]?.yes || []).join(", ") || "passed on everything"}
                      </span>
                    </div>
                  ))}
                </div>

                <p className={`t-xs t-secondary ${s.counted}`}>
                  {narrating ? "Counted from the swipes. Writing it up…" : "Counted from the swipes — the same votes always pick the same table."}
                </p>

                <button className="btn btn-tertiary" onClick={reset}>
                  <Icon name="refresh" size={16} />
                  Go again
                </button>
              </>
            ) : decision ? (
              <div className="card stack">
                <h1 className="t-h2">{decision.headline}</h1>
                <p className="t-body t-secondary">{decision.why}</p>
                <button className="btn" onClick={reset}>
                  <Icon name="refresh" size={16} />
                  Try somewhere else
                </button>
              </div>
            ) : (
              <div className="notice notice-error">
                <Icon name="warning" size={16} />
                <span>{error || "Something went wrong."}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
