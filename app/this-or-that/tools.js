/**
 * This or That's WebMCP tools. Definitions only; handlers live in Swiper.js.
 *
 * The flow an agent drives is the same one a table drives by hand: set up
 * once, then each person swipes every card in turn, and the overlap is
 * counted. There is no tool that picks the restaurant, because nothing in the
 * app does: lib/decide.js tallies the swipes.
 */

export const THISORTHAT_TOOLS = [
  {
    name: "thisorthat_get_state",
    description:
      "Read where the table is: phase (setup, dealing, handoff, swipe or result), the setup answers, whose turn it is, the card on screen, how many cards that voter has left, every member's yes and no lists, and the result once counted. Call this before voting.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "thisorthat_setup",
    description:
      "Answer the whole setup at once and deal the deck: where the group is, how far they will go, any constraints, and who is eating. A deck agent then proposes 8 real restaurants (needs a Gemini key) and the first person's turn begins. Fails if a deck is already in play; reset first.",
    inputSchema: {
      type: "object",
      properties: {
        where: {
          type: "string",
          description: 'City, neighborhood or address, like "Austin, TX" or "Adams Morgan, DC".',
        },
        mode: {
          type: "string",
          enum: ["walking", "driving"],
          description: "walking keeps it to about 15 minutes on foot; driving allows about 20 minutes by car. Defaults to driving.",
        },
        tags: {
          type: "array",
          items: {
            type: "string",
            enum: ["cheap", "quiet", "veg", "new", "comfort", "fast", "drinks", "outside"],
          },
          description:
            "Preset constraints, any number: cheap (cheap eats), quiet (can hold a conversation), veg (vegetarian-friendly), new (somewhere new), comfort (comfort food), fast (in and out), drinks (a real bar), outside (outdoor seating).",
        },
        craving: {
          type: "string",
          description: 'Anything else in the user\'s own words, like "no cilantro" or "nothing too loud". Optional.',
        },
        members: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 5,
          description:
            "First names of everyone eating, 2 to 5 people. Each one swipes the deck in this order. If fewer than two are given, seats are filled with stand-in names.",
        },
      },
      required: ["where", "members"],
    },
  },
  {
    name: "thisorthat_next_voter",
    description:
      "Start the current person's turn from the handoff screen, the same as pressing Start swiping. Returns who is up and their first card. Use it whenever get_state says the phase is handoff.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "thisorthat_vote",
    description:
      "Swipe the card on screen for the person whose turn it is: yes means they would eat there, no means pass. Returns the next card, or the handoff to the next person, or the counted result after the last swipe. Only ask the user for a preference when they have not already told you.",
    inputSchema: {
      type: "object",
      properties: {
        choice: {
          type: "string",
          enum: ["yes", "no"],
          description: "yes to swipe right (would eat here), no to pass.",
        },
      },
      required: ["choice"],
    },
  },
  {
    name: "thisorthat_get_result",
    description:
      "The table's pick once everyone has swiped: winner with a Maps link, runner-up, whether it was unanimous, the counted reasoning, and the full ranking with who said yes to what. Fails with whose turn it still is if the deck is not finished.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "thisorthat_reset",
    description:
      "Throw away the current deck and every vote and go back to setup. Destructive once a deck exists: waits for the user to press Confirm on the page.",
    inputSchema: { type: "object", properties: {} },
    annotations: { destructiveHint: true, consequentialHint: true },
  },
];

/**
 * Declarative tools: real forms on the page carrying toolname and
 * tooldescription, which the browser turns into tools on its own. Listed
 * here so the header sheet and /webmcp can show them; the attributes on the
 * form are the source of truth.
 */
export const THISORTHAT_FORMS = [
  {
    name: "thisorthat_add_member",
    declarative: true,
    description:
      "Add one person to the table by name. This is the page's own name form, exposed as a tool; it only exists while the name field is open on the Who's eating step.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The person's first name, up to 24 characters." },
      },
      required: ["name"],
    },
  },
];
