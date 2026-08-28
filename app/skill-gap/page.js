import GapFinder from "./GapFinder";

export const metadata = {
  title: "Skill Gap",
  description: "Diff a resume against a posting and get the fourteen days that close it.",
};

export default function Page() {
  return <GapFinder />;
}
