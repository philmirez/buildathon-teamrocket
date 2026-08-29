"use client";

import { useMemo, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { apiPost, getKey } from "@/lib/keys";
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

const mapsUrl = (p, area) =>
  `https://maps.apple.com/?q=${encodeURIComponent(`${p.name}, ${p.neighborhood || area}`)}`;

export default function Swiper() {
  const [phase, setPhase] = useState("setup"); // setup | handoff | swipe | result
  const [where, setWhere] = useState("");
  const [mode, setMode] = useState("driving");
  const [locating, setLocating] = useState(false);
  const [usingGps, setUsingGps] = useState(false);
  const [craving, setCraving] = useState("");
  const [members, setMembers] = useState(["Phil", "Allen"]);
  const [places, setPlaces] = useState([]);
  const [area, setArea] = useState("");
  const [votes, setVotes] = useState({});
  const [who, setWho] = useState(0);
  const [idx, setIdx] = useState(0);
  const [leaving, setLeaving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState(null);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState({}); // name -> { shots, source }

  const current = places[idx];
  const member = members[who];

  async function start() {
    if (!getKey("gemini")) {
      setError("Add your Gemini key with the key button up top first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiPost("/api/this-or-that", {
        stage: "deck",
        where,
        mode,
        craving,
        members,
      });
      if (!data.places?.length) throw new Error("No places came back. Try a broader area.");
      setPlaces(data.places);
      setArea(data.area || where);
      setVotes(Object.fromEntries(members.map((m) => [m, { yes: [], no: [] }])));
      setWho(0);
      setIdx(0);
      setPhotos({});
      setPhase("handoff");
      loadPhotos(data.places, data.area || where);
    } catch (e) {
      setError(e.message);
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
  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("This browser can't share a location. Type an area instead.");
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
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Type an area instead."
            : "Couldn't get your location. Type an area instead."
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function swipe(liked) {
    if (leaving || !current) return;
    setLeaving(liked ? "yes" : "no");

    setVotes((v) => {
      const mine = v[member] || { yes: [], no: [] };
      return {
        ...v,
        [member]: liked
          ? { ...mine, yes: [...mine.yes, current.name] }
          : { ...mine, no: [...mine.no, current.name] },
      };
    });

    setTimeout(() => {
      setLeaving(null);
      if (idx + 1 < places.length) {
        setIdx(idx + 1);
      } else if (who + 1 < members.length) {
        setWho(who + 1);
        setIdx(0);
        setPhase("handoff");
      } else {
        decide();
      }
    }, 260);
  }

  async function decide() {
    setPhase("result");
    setBusy(true);
    try {
      // Read the freshest votes rather than the possibly-stale closure value.
      setVotes((v) => {
        apiPost("/api/this-or-that", { stage: "decide", places, votes: v, craving })
          .then(setDecision)
          .catch((e) => setError(e.message))
          .finally(() => setBusy(false));
        return v;
      });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const unanimous = useMemo(() => {
    if (!places.length) return [];
    return places
      .map((p) => p.name)
      .filter((n) => members.every((m) => votes[m]?.yes.includes(n)));
  }, [places, members, votes]);

  const winner = places.find((p) => p.name === decision?.winner);
  const runnerUp = places.find((p) => p.name === decision?.runnerUp);

  function reset() {
    setPhase("setup");
    setPlaces([]);
    setPhotos({});
    setVotes({});
    setDecision(null);
    setError("");
    setIdx(0);
    setWho(0);
  }

  return (
    <Shell>
      <div className="container-narrow" style={{ paddingBlock: "var(--s-6) var(--s-8)" }}>
        {/* ---------------- setup ---------------- */}
        {phase === "setup" && (
          <div className={s.setup}>
            <span className={s.headIcon} aria-hidden="true">
              <Icon name="fork" size={24} />
            </span>
            <h1 className="t-h1 t-balance">Stop arguing about dinner.</h1>
            <p className="t-body t-secondary t-balance">
              Everyone swipes the same deck, one after another. What the table agrees on
              decides itself.
            </p>

            <div className={s.form}>
              <div className="field">
                <div className={s.fieldHead}>
                  <label className="field-label" htmlFor="where" style={{ margin: 0 }}>
                    Where
                  </label>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={useMyLocation}
                    disabled={busy || locating}
                  >
                    {locating ? (
                      <span className="spinner" style={{ width: 13, height: 13 }} />
                    ) : (
                      <Icon name="pin" size={14} />
                    )}
                    {locating ? "Locating" : "Use my location"}
                  </button>
                </div>
                <input
                  id="where"
                  className="input"
                  value={where}
                  onChange={(e) => {
                    setWhere(e.target.value);
                    setUsingGps(false);
                  }}
                  placeholder="Austin, TX"
                  disabled={busy}
                />
                {usingGps && (
                  <p className="field-hint">
                    Using your current coordinates. The deck will name the neighbourhood back
                    so you can check it.
                  </p>
                )}
              </div>

              <div className="field">
                <span className="field-label">How far are you willing to go?</span>
                <div className="row-wrap" style={{ "--gap": "var(--s-2)" }}>
                  {[
                    { id: "walking", label: "Walking distance", hint: "about 15 min on foot" },
                    { id: "driving", label: "Driving distance", hint: "about 20 min by car" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      className={`chip ${mode === opt.id ? "chip-selected" : ""}`}
                      onClick={() => setMode(opt.id)}
                      disabled={busy}
                      aria-pressed={mode === opt.id}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="field-hint">
                  {mode === "walking" ? "About 15 minutes on foot." : "About 20 minutes by car."}
                </p>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="craving">
                  Craving or constraints
                </label>
                <input
                  id="craving"
                  className="input"
                  value={craving}
                  onChange={(e) => setCraving(e.target.value)}
                  placeholder="one of us is vegetarian, nothing too loud"
                  disabled={busy}
                />
              </div>

              <div className="field">
                <span className="field-label">Who&apos;s eating</span>
                <div className="row-wrap">
                  {members.map((m, i) => (
                    <span key={i} className="chip">
                      {m}
                      {members.length > 2 && (
                        <button
                          className={s.chipX}
                          onClick={() => setMembers(members.filter((_, j) => j !== i))}
                          aria-label={`Remove ${m}`}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                  {members.length < 5 && (
                    <button
                      className="chip"
                      onClick={() => {
                        const name = prompt("Name?");
                        if (name?.trim()) setMembers([...members, name.trim()]);
                      }}
                    >
                      <Icon name="plus" size={13} />
                      Add
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <div className="notice notice-error">
                  <Icon name="warning" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="spread">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setWhere("Austin, TX");
                    setCraving("one of us is vegetarian, somewhere we can actually talk");
                  }}
                  disabled={busy}
                >
                  <Icon name="sparkle" size={16} />
                  Use an example
                </button>
                <button className="btn btn-lg" onClick={start} disabled={busy || !where.trim()}>
                  {busy ? <span className="spinner" /> : null}
                  {busy ? "Building the deck" : "Deal the deck"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- handoff ---------------- */}
        {phase === "handoff" && (
          <div className={s.handoff}>
            <span className={s.headIcon} aria-hidden="true">
              <Icon name="users" size={24} />
            </span>
            <h1 className="t-h1">{member}&apos;s turn</h1>
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
              <span className="badge badge-blue">{member}</span>
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
            {busy && !decision ? (
              <div className={s.thinking}>
                <span className="spinner" style={{ width: 22, height: 22 }} />
                <p className="t-body t-secondary">Reading everyone&apos;s swipes…</p>
              </div>
            ) : decision ? (
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
                        {unanimous.includes(decision.winner) ? "Unanimous" : "Best overlap"}
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

                <div className="card stack">
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
                    <div key={m} className={s.tallyRow}>
                      <span className="badge">{m}</span>
                      <span className="t-sm t-secondary truncate">
                        {(votes[m]?.yes || []).join(", ") || "passed on everything"}
                      </span>
                    </div>
                  ))}
                </div>

                <button className="btn btn-tertiary" onClick={reset}>
                  <Icon name="refresh" size={16} />
                  Go again
                </button>
              </>
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
