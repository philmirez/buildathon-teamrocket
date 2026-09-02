import Link from "next/link";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { bySlug } from "@/lib/builds";
import { ALL_TOOLS, CATALOG } from "@/lib/webmcp-catalog";
import Live from "./Live";
import s from "./webmcp.module.css";

export const metadata = {
  title: "WebMCP",
  description:
    "Every tool this site registers for AI agents through WebMCP, with its schema, rendered from the same definitions the pages register.",
};

const gated = (t) => t.annotations?.destructiveHint || t.annotations?.consequentialHint;

function Params({ schema }) {
  const props = schema?.properties || {};
  const required = new Set(schema?.required || []);
  const rows = Object.entries(props);
  if (!rows.length) return <p className="t-sm t-secondary">No parameters.</p>;
  return (
    <table className={s.params}>
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, def]) => (
          <tr key={name}>
            <td>
              <span className={s.paramName}>{name}</span>
              {required.has(name) ? "" : <span className="t-secondary"> optional</span>}
            </td>
            <td>
              {def.type === "array" && def.items ? `array of ${def.items.enum ? def.items.enum.join(" | ") : def.items.type}` : def.enum ? def.enum.join(" | ") : def.type}
            </td>
            <td>{def.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tool({ tool }) {
  const a = tool.annotations || {};
  return (
    <li className={`card ${s.tool}`} id={tool.name}>
      <div className={s.toolHead}>
        <code className={s.toolName}>{tool.name}</code>
        {a.readOnlyHint && <span className="badge">Read only</span>}
        {gated(tool) && <span className="badge badge-red">Asks the user first</span>}
        {tool.declarative && <span className="badge badge-blue">HTML form</span>}
      </div>
      <p className="t-sm">{tool.description}</p>
      <Params schema={tool.inputSchema} />
      <details className={s.schema}>
        <summary>Input schema as registered</summary>
        <pre className={s.pre}>{JSON.stringify(tool.inputSchema || { type: "object", properties: {} }, null, 2)}</pre>
      </details>
    </li>
  );
}

export default function Page() {
  const gatedCount = ALL_TOOLS.filter(gated).length;
  const formCount = ALL_TOOLS.filter((t) => t.declarative).length;

  return (
    <Shell>
      <div className={`container-narrow ${s.page}`}>
        <header className={s.head}>
          <span className={s.headIcon} aria-hidden="true">
            <Icon name="bot" size={24} />
          </span>
          <h1 className="t-h1 t-balance">Every build here is drivable by an agent.</h1>
          <p className="t-body t-secondary t-balance">
            Each page registers tools through WebMCP, the W3C proposal that puts a{" "}
            <code className={s.code}>modelContext</code> on the document. An agent in a browser
            that supports it can list them, call them, and watch the same screen you do. This page
            is rendered from the same definitions the pages register, so it cannot drift from what
            is live.
          </p>
        </header>

        <Live />

        <div className={s.facts}>
          <div className={`card ${s.fact}`}>
            <strong>{ALL_TOOLS.length}</strong>
            <span className="t-xs t-secondary">tools across {CATALOG.length - 1} builds</span>
          </div>
          <div className={`card ${s.fact}`}>
            <strong>{gatedCount}</strong>
            <span className="t-xs t-secondary">wait for a human Confirm</span>
          </div>
          <div className={`card ${s.fact}`}>
            <strong>{formCount}</strong>
            <span className="t-xs t-secondary">declared on a real HTML form</span>
          </div>
          <div className={`card ${s.fact}`}>
            <strong>0</strong>
            <span className="t-xs t-secondary">ways to read or set an API key</span>
          </div>
        </div>

        <section className="stack">
          <h2 className="t-h2">How it stays safe</h2>
          <ul className={s.rules}>
            <li>
              <Icon name="check" size={16} />
              <span className="t-sm">
                <strong>The screen is the record.</strong> Every tool calls the same functions the
                buttons do, so whatever an agent changes is visible, and an &ldquo;Agent is driving&rdquo; pill
                in the header names the tool while it runs.
              </span>
            </li>
            <li>
              <Icon name="check" size={16} />
              <span className="t-sm">
                <strong>Keys never cross the boundary.</strong> Tools can ask whether a key is set,
                as a boolean, and can open the key panel. Entering, reading or changing a key stays
                a human action.
              </span>
            </li>
            <li>
              <Icon name="check" size={16} />
              <span className="t-sm">
                <strong>Deletes wait for you.</strong> Anything destructive blocks on a confirm bar
                at the bottom of the page and returns a failure if you cancel or walk away.
              </span>
            </li>
            <li>
              <Icon name="check" size={16} />
              <span className="t-sm">
                <strong>Failures are answers.</strong> Tools never throw; they return a structured
                error with the next step, so an agent can recover instead of guessing.
              </span>
            </li>
          </ul>
        </section>

        <section className="stack">
          <h2 className="t-h2">Try it</h2>
          <ol className={s.steps}>
            <li className="t-sm">
              In Chrome 149 or newer, enable{" "}
              <code className={s.code}>chrome://flags/#enable-webmcp-testing</code> and relaunch.
              The ChatGPT desktop browser needs no flag.
            </li>
            <li className="t-sm">
              Open any build, press the WebMCP button in the header, and ask your agent to do what
              the tool descriptions say. The pill lights up as it works.
            </li>
            <li className="t-sm">
              Or, from DevTools on any page:
              <pre className={s.pre}>{`const ctx = document.modelContext || navigator.modelContext;
const tools = await ctx.getTools();
const t = tools.find((x) => x.name === "list_builds");
JSON.parse(await ctx.executeTool(t, "{}"));`}</pre>
            </li>
          </ol>
        </section>

        {CATALOG.map((g) => {
          const build = g.build ? bySlug(g.build) : null;
          return (
            <section key={g.id} className={s.group}>
              <div className={s.groupHead}>
                <h2 className="t-h2">{build ? build.name : g.title}</h2>
                <span className="badge">{g.tools.length} tools</span>
                {build && (
                  <Link className="t-sm" href={`/${build.slug}`}>
                    Open the build
                  </Link>
                )}
              </div>
              <p className="t-sm t-secondary">{build ? build.solution : g.note}</p>
              <ul className={s.tools}>
                {g.tools.map((t) => (
                  <Tool key={t.name} tool={t} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
