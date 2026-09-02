/**
 * Taskboard's WebMCP tools. Definitions only: the handlers live in Board.js,
 * next to the state they touch. Keeping the schema in a plain module lets the
 * /webmcp page list the surface without mounting the board.
 */

const STAGE = {
  type: "string",
  enum: ["todo", "doing", "done"],
  description: 'Column id. "todo" is Not started, "doing" is In progress, "done" is Done.',
};

const TASK_ID = {
  type: "string",
  description: "The task id exactly as returned by taskboard_get_state (looks like t_abc123).",
};

export const TASKBOARD_TOOLS = [
  {
    name: "taskboard_get_state",
    description:
      "Read the whole board: goal, timeframe, every task with its id, stage, weight, when it last moved and how many days it has sat idle, the effort-weighted progress percent, and the latest triage verdict. Call this before moving or removing anything so you have real ids.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "taskboard_set_goal",
    description:
      "Set the goal and rough timeframe, then build the board from it: a planner agent breaks the goal into 5 to 9 effort-weighted tasks, all starting in todo. Needs a Gemini key. Fails if a board already exists; reset first or add tasks to it instead.",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "The outcome the user wants, in one or two sentences. Example: Ship the self-serve onboarding flow.",
        },
        horizon: {
          type: "string",
          description: 'Optional rough timeframe in words, like "about six weeks". Leave empty if the user gave none.',
        },
      },
      required: ["goal"],
    },
  },
  {
    name: "taskboard_add_task",
    description:
      "Add one card to the board. Use it for work the planner missed or that the user names later. Weight sizes the card's share of the progress bar.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Two to five words naming the deliverable." },
        detail: {
          type: "string",
          description: "Optional one sentence saying what done means for this task.",
        },
        stage: { ...STAGE, description: `${STAGE.description} Defaults to todo.` },
        weight: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "Effort from 1 (under an hour) to 5 (several days). Defaults to 3.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "taskboard_move_task",
    description:
      "Move a task to another column. Moving resets its idle clock. Use taskboard_get_state first to get the id.",
    inputSchema: {
      type: "object",
      properties: { id: TASK_ID, stage: STAGE },
      required: ["id", "stage"],
    },
    annotations: { idempotentHint: true },
  },
  {
    name: "taskboard_remove_task",
    description:
      "Delete a task from the board. Destructive: the page shows a confirm bar and this call waits until the user presses Confirm. Tell the user to look for it.",
    inputSchema: { type: "object", properties: { id: TASK_ID }, required: ["id"] },
    annotations: { destructiveHint: true, consequentialHint: true },
  },
  {
    name: "taskboard_triage",
    description:
      "Ask the triage agent what is being neglected. It weighs each task's effort against its idle days and returns a blunt headline, the one task to do next, and a per-task flag (neglected, watch or ok) that the board then shows on the cards. Needs a Gemini key and a non-empty board.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "taskboard_age_board",
    description:
      "Demo control: rewind every unfinished card's idle clock by 3 to 20 days so neglect is observable right now. Use it before taskboard_triage when the board was just built.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "taskboard_reset",
    description:
      "Clear the board and go back to the goal screen. Destructive: waits for the user to press Confirm on the page.",
    inputSchema: { type: "object", properties: {} },
    annotations: { destructiveHint: true, consequentialHint: true },
  },
];
