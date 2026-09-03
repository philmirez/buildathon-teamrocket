import Link from "next/link";
import RocketArt from "@/components/RocketArt";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { BUILDS } from "@/lib/builds";
import { TEAM, initials } from "@/lib/team";
import Walkthroughs from "@/components/Walkthroughs";
import styles from "./page.module.css";

const REPO = "https://github.com/philmirez/buildathon-teamrocket";
const DEVFEST = "https://www.devfestdc.org/";
const CLAUDE_CODE = "https://claude.com/product/claude-code";
const WEBMCP_CHALLENGE = "https://openai.com/webmcp-challenge/";
const VERCEL = "https://vercel.com";
const GEMINI = "https://ai.google.dev/gemini-api";

export default function Home() {

  return (
    <Shell>
      <div className={styles.layout}>
      <aside className={styles.side}>
        <RocketArt className={styles.sideArt} />

        <header className={styles.tierHead}>
          <h2 className="t-h3">Team Rocket</h2>
          <span className={styles.tierCount}>{TEAM.length}</span>
        </header>

        <ul className={styles.roster}>
          {TEAM.map((m) => (
            <li key={m.github} className={`card card-hover ${styles.person}`} style={{ "--tint": m.tint }}>
              {m.photo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img className={styles.avatar} src={m.photo} alt="" width={72} height={72} />
              ) : (
                <span className={styles.monogram} aria-hidden="true">
                  {initials(m.name)}
                </span>
              )}

              <h3 className="t-h3">{m.name}</h3>

              <div className={styles.links}>
                {m.site && (
                  <a
                    className={styles.social}
                    href={m.site}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`${m.name}'s website`}
                  >
                    <Icon name="globe" size={17} />
                  </a>
                )}
                <a
                  className={styles.social}
                  href={m.linkedin}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${m.name} on LinkedIn`}
                >
                  <Icon name="linkedin" size={17} />
                </a>
                <a
                  className={styles.social}
                  href={`https://github.com/${m.github}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${m.name} on GitHub`}
                >
                  <Icon name="github" size={17} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      </aside>


      <div className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className="t-display t-balance">
            Six builds,
            <br />
            one Team Rocket.
          </h1>
          <ul className={`t-body t-secondary ${styles.subList}`}>
            <li>
              <Icon name="trophy" size={16} />
              <span>
                Third place at the{" "}
                <a href={DEVFEST} target="_blank" rel="noreferrer noopener">
                  DC DevFest 2026 Buildathon
                </a>
                .
              </span>
            </li>
            <li>
              <Icon name="sparkle" size={16} />
              <span>
                Written with{" "}
                <a href={CLAUDE_CODE} target="_blank" rel="noreferrer noopener">
                  Claude Code
                </a>
                .
              </span>
            </li>
            <li>
              <Icon name="key" size={16} />
              <span>
                Run on{" "}
                <a href={GEMINI} target="_blank" rel="noreferrer noopener">
                  Gemini
                </a>{" "}
                with your own key. Paste it once with the key button above.
              </span>
            </li>
            <li>
              <Icon name="globe" size={16} />
              <span>
                Hosted on{" "}
                <a href={VERCEL} target="_blank" rel="noreferrer noopener">
                  Vercel
                </a>
                .
              </span>
            </li>
            <li>
              <Icon name="bot" size={16} />
              <span>
                We heard about the{" "}
                <a href={WEBMCP_CHALLENGE} target="_blank" rel="noreferrer noopener">
                  OpenAI WebMCP Challenge
                </a>{" "}
                and, being the AI obsessives we are, could not help ourselves. Every build can
                now be driven by an AI agent through <Link href="/webmcp">WebMCP</Link>.
              </span>
            </li>
          </ul>
        </div>

        <Walkthroughs builds={BUILDS} />
      </section>

      <footer className={styles.footer}>
        <div className={styles.footCol}>
          <a className={styles.repo} href={REPO} target="_blank" rel="noreferrer noopener">
            <Icon name="github" size={16} />
            philmirez/buildathon-teamrocket
          </a>
          <p className="t-xs t-secondary">
            Keys stay in your browser. Every build is drivable by an agent through{" "}
            <Link href="/webmcp">WebMCP</Link>.
          </p>
        </div>

      </footer>
      </div>
      </div>
    </Shell>
  );
}
