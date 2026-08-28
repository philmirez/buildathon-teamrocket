import Scribe from "./Scribe";

export const metadata = {
  title: "Ambient Scribe",
  description: "Talk. An agent writes the note, names it, and files it for you.",
};

export default function Page() {
  return <Scribe />;
}
