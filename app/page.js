import Link from "next/link";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { BUILDS } from "@/lib/builds";
import styles from "./page.module.css";

export default function Home() {
  return (
    <Shell>
      <section className={`container ${styles.hero}`}>
        <h1 className="t-display t-balance">
          Six builds,
          <br />
          one afternoon.
        </h1>
        <p className={`t-body t-secondary t-balance ${styles.sub}`}>
          Each one runs on your own Gemini key — paste it once with the key button above and
          every build below works.
        </p>
      </section>

      <section className={`container ${styles.grid}`}>
        {BUILDS.map((b) => (
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
              <h2 className="t-h3">{b.name}</h2>
              <p className="t-sm t-secondary">{b.solution}</p>
            </div>

            <span className={styles.tileGo} aria-hidden="true">
              <Icon name="arrowRight" size={18} />
            </span>
          </Link>
        ))}
      </section>

      <footer className={`container ${styles.footer}`}>
        <p className="t-xs t-secondary">Keys stay in your browser.</p>
      </footer>
    </Shell>
  );
}
