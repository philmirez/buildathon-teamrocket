import Link from "next/link";
import HeroSlideshow from "@/components/HeroSlideshow";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { byTier } from "@/lib/builds";
import { TEAM, initials } from "@/lib/team";
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

export default function Home() {
  const tiers = byTier();

  return (
    <Shell>
      <div className={styles.layout}>
      <aside className={styles.side}>
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
            Each one runs on your own Gemini key — paste it once with the key button above and
            every build below works.
          </p>
        </div>

        <HeroSlideshow className={styles.heroArt} slides={HERO_SLIDES} />

      </section>

      {tiers.map((tier) => (
        <section key={tier.id} className={styles.tier}>
          <header className={styles.tierHead}>
            <h2 className="t-h3">{tier.name}</h2>
            <span className={styles.tierCount}>{tier.builds.length}</span>
          </header>

          {tier.note && <p className={`t-sm t-secondary ${styles.tierNote}`}>{tier.note}</p>}

          <div className={styles.grid}>
            {tier.builds.map((b) => (
              <Link
                key={b.slug}
                href={`/${b.slug}`}
                className={`card card-hover ${styles.tile}`}
                style={{ "--tint": b.tint }}
              >
                <span className={styles.tileIcon} aria-hidden="true">
                  <Icon name={b.icon} size={22} />
                </span>

                <div className={styles.tileBody}>
                  <h3 className="t-h3">{b.name}</h3>
                  <p className="t-sm t-secondary">{b.solution}</p>
                </div>

                <span className={styles.tileGo} aria-hidden="true">
                  <Icon name="arrowRight" size={18} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <footer className={styles.footer}>
        <div className={styles.footCol}>
          <a className={styles.repo} href={REPO} target="_blank" rel="noreferrer noopener">
            <Icon name="github" size={16} />
            philmirez/buildathon-teamrocket
          </a>
          <p className="t-xs t-secondary">Keys stay in your browser.</p>
        </div>

      </footer>
      </div>
      </div>
    </Shell>
  );
}
