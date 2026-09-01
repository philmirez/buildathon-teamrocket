/**
 * Where the group is eating, decided by counting.
 *
 * This used to be a model call. It should not have been: every member swipes
 * every card, so the winner is a tally, and a tally has exactly one right
 * answer. Running it through a model bought nothing and cost three things —
 * a round trip, reproducibility, and the guarantee that the returned name is
 * actually in the deck.
 *
 * The model still writes the *prose* around this result (see the "narrate"
 * stage). It never chooses. Same swipes in, same table out, key or no key.
 */

/** "$$$" -> 3. Unknown or missing price sorts last so it never wins a tie. */
const priceRank = (p) => (typeof p?.price === "string" && p.price ? p.price.length : 99);

/** "Phil", "Phil and Allen", "Phil, Allen and Mimi". */
export function list(names) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Every place, ranked. Ordering, in strict priority:
 *
 *   1. most yes votes        — the whole point of swiping
 *   2. fewest no votes       — only separates cards when someone bailed early
 *   3. cheaper              — a tie broken in favour of nobody's wallet
 *   4. deck order           — stable, so the same swipes never reshuffle
 *
 * Note what is deliberately absent: any weighing of *why* someone said no.
 * A swipe carries no reason, so ranking a dietary "no" above a "too pricey"
 * one would be invention. The old prompt did exactly that.
 */
export function rank(places, members, votes) {
  return places
    .map((place, index) => {
      const yes = members.filter((m) => votes[m]?.yes?.includes(place.name));
      const no = members.filter((m) => votes[m]?.no?.includes(place.name));
      return { place, index, yes, no, score: yes.length };
    })
    .sort(
      (a, b) =>
        b.yes.length - a.yes.length ||
        a.no.length - b.no.length ||
        priceRank(a.place) - priceRank(b.place) ||
        a.index - b.index
    );
}

/**
 * The decision, plus prose that is true by construction.
 *
 * `headline`, `why` and `tradeoff` are written from the counts alone, so the
 * result screen is complete the instant the last card is swiped. The narrate
 * stage may replace those three strings with better-sounding ones; it cannot
 * replace the decision.
 *
 * Returns `winner: null` when no card got a single yes. That is a real outcome
 * and saying so is more useful than crowning something nobody wanted.
 */
export function decideTable({ places = [], members = [], votes = {} }) {
  if (!places.length || !members.length) return null;

  const ranked = rank(places, members, votes);
  const top = ranked[0];

  if (!top || !top.yes.length) {
    return {
      winner: null,
      runnerUp: null,
      unanimous: false,
      ranked,
      headline: "Nobody said yes to anything.",
      why: "Every card got passed on, so there is no overlap to work with. A new deck — wider area, or a looser craving — is the honest next move.",
      tradeoff: "",
    };
  }

  const unanimous = top.yes.length === members.length;
  const next = ranked.find((r) => r.place.name !== top.place.name && r.yes.length);

  const yesNames = top.yes;
  const noNames = top.no;

  const headline = unanimous
    ? "Everyone said yes."
    : yesNames.length > 1
      ? `${yesNames.length} of ${members.length} said yes — the widest overlap in the deck.`
      : "No overlap. This was the only yes left standing.";

  const why = unanimous
    ? `Every one of you swiped yes on ${top.place.name}. Nothing else in the deck was unanimous.`
    : `${list(yesNames)} swiped yes on it${
        noNames.length ? `, ${list(noNames)} didn't` : ""
      }. No other card in the deck got more.`;

  const tradeoff = unanimous || !noNames.length ? "" : `${list(noNames)} is the one compromising here.`;

  return {
    winner: top.place.name,
    runnerUp: next?.place.name || null,
    unanimous,
    ranked,
    headline,
    why,
    tradeoff,
  };
}
