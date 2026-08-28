import Differ from "./Differ";

export const metadata = {
  title: "Policy Diff",
  description: "Diff two versions of a policy and get the change in plain words, ranked by impact.",
};

export default function Page() {
  return <Differ />;
}
