"use client";

import { useMemo, useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { apiPost, getKey } from "@/lib/keys";
import s from "./swipe.module.css";

/** Deterministic card art — a hashed hue pair, so no fake restaurant photos. */
function artFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return { "--h1": h, "--h2": (h + 48) % 360 };
}

const mapsUrl = (p, area) =>
  `https://maps.apple.com/?q=${encodeURIComponent(`${p.name}, ${p.neighborhood || area}`)}`;

export default function Swiper() {
  const [phase, setPhase] = useState("setup"); // setup | handoff | swipe | result
  const [where, setWhere] = useState("");
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
        craving,
        members,
      });
      if (!data.places?.length) throw new Error("No places came back. Try a broader area.");
      setPlaces(data.places);
      setArea(data.area || where);
      setVotes(Object.fromEntries(members.map((m) => [m, { yes: [], no: [] }])));
      setWho(0);
      setIdx(0);
      setPhase("handoff");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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
                <label className="field-label" htmlFor="where">
                  Where
                </label>
                <input
                  id="where"
                  className="input"
                  value={where}
                  onChange={(e) => setWhere(e.target.value)}
                  placeholder="Austin, TX"
                  disabled={busy}
                />
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
                <div className={s.art}>
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
                  <div className={s.winArt}>
                    <span className="badge badge-green">
                      {unanimous.includes(decision.winner) ? "Unanimous" : "Best overlap"}
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
