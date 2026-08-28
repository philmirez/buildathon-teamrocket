import Board from "./Board";

export const metadata = {
  title: "Taskboard",
  description: "A kanban board whose cards are the segments of one weighted progress bar.",
};

export default function Page() {
  return <Board />;
}
