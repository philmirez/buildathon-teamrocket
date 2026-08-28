import Link from "next/link";
import HeroSlideshow from "@/components/HeroSlideshow";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { byTier } from "@/lib/builds";
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

/** GitHub handles, credited in the footer. */
const TEAM = ["philmirez", "aap7763", "mimersheree", "roboray01"];

export default function Home() {
  const tiers = byTier();

  return (
    <Shell>
      <section className={`container ${styles.hero}`}>
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
        <section key={tier.id} className={`container ${styles.tier}`}>
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

      <footer className={`container ${styles.footer}`}>
        <p className="t-xs t-secondary">Keys stay in your browser.</p>
        <ul className={styles.team}>
          {TEAM.map((handle) => (
            <li key={handle}>
              <a
                className={styles.member}
                href={`https://github.com/${handle}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon name="github" size={15} />
                {handle}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </Shell>
  );
}
