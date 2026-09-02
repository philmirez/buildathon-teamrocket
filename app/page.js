import Link from "next/link";
import HeroSlideshow from "@/components/HeroSlideshow";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { BUILDS } from "@/lib/builds";
import { TEAM, initials } from "@/lib/team";
import Banner from "@/components/Banner";
import Walkthroughs from "@/components/Walkthroughs";
import styles from "./page.module.css";

/*
 * All three are animated; next/image runs them unoptimized so the frames
 * survive. Slide 2 is an animated-WebP re-encode of the source GIF (same 19
 * frames, 71% smaller) — the .gif is kept in public/ as the original.
 */
const HERO_SLIDES = [
  {
    src: "/teamrocket1.webp",
    alt: "Team Rocket silhouette above the caption \u201cPrepare for trouble\u201d",
    width: 500,
    height: 344,
  },
  {
    src: "/teamrocket2.webp",
    alt: "The Team Rocket trio striking their entrance pose on an open road",
    width: 540,
    height: 432,
  },
  {
    src: "/teamrocket3.webp",
    alt: "Team Rocket animation over a field of pink sparkles and roses",
    width: 499,
    height: 374,
  },
];

const REPO = "https://github.com/philmirez/buildathon-teamrocket";
const DEVFEST = "https://www.devfestdc.org/";
const CLAUDE_CODE = "https://claude.com/product/claude-code";
const WEBMCP_CHALLENGE = "https://openai.com/webmcp-challenge/";
const VERCEL = "https://vercel.com";
const GEMINI = "https://ai.google.dev/gemini-api";

export default function Home() {

  return (
    <Shell>
      <Banner
        href={DEVFEST}
        icon="trophy"
        cta="DevFest DC"
        classNames={{
          wrap: styles.bannerWrap,
          banner: styles.banner,
          icon: styles.bannerIcon,
          text: styles.bannerText,
          cta: styles.bannerCta,
        }}
      >
        <strong>Third place</strong> at the DC DevFest 2026 Buildathon.
      </Banner>

      <div className={styles.layout}>
      <aside className={styles.side}>
        <HeroSlideshow className={styles.sideArt} slides={HERO_SLIDES} />

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
          <p className={`t-body t-secondary t-balance ${styles.sub}`}>
            Watch any of them run, then try it yourself below.
          </p>
          <ul className={`t-body t-secondary ${styles.subList}`}>
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
                Drivable by an AI agent through WebMCP, our entry in the{" "}
                <a href={WEBMCP_CHALLENGE} target="_blank" rel="noreferrer noopener">
                  OpenAI WebMCP Challenge
                </a>
                .
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
