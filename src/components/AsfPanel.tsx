import { ASF_TOOLS, ASF_URL, DATASETS, NISAR_FILTERS, SCENE_EXAMPLE, SCENE_PARTS, asfUrl } from "@/lib/asf";

/** Where the radar data lives: the ASF Data Search catalogue, in plain words. */
export function AsfPanel({ at }: { at?: readonly [number, number] }) {
  const href = at ? asfUrl(at[0], at[1]) : `${ASF_URL}#/?dataset=NISAR`;
  return (
    <div className="asf">
      <p>NASA&apos;s Alaska Satellite Facility (ASF DAAC) archives and shares the world&apos;s radar data, free with an Earthdata login. Its Data Search is the front door to every dataset below.</p>
      <p><a className="btn primary" href={href} target="_blank" rel="noopener noreferrer">{at ? "Search NISAR scenes here on ASF" : "Open ASF Data Search"}</a></p>

      <h3>17 datasets</h3>
      <ul className="asf-grid">
        {DATASETS.map((d) => (
          <li key={d.name} className={d.searchable ? "" : "off"}>
            <b>{d.name}{d.tag && <em>{d.tag}</em>}</b>
            <small>{d.years} · {d.by}</small>
            <p>{d.note}</p>
          </li>
        ))}
      </ul>

      <h3>Filters for NISAR</h3>
      <dl className="asf-filters">
        {NISAR_FILTERS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>

      <h3>Reading a NISAR scene name</h3>
      <p className="asf-code" aria-label="Example scene name">{SCENE_EXAMPLE}</p>
      <dl className="asf-filters">
        {SCENE_PARTS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>

      <h3>In the search tool</h3>
      <ul>{ASF_TOOLS.map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="asf-note">Summarised from the public ASF Data Search page; datasets and filters change, so check the site for today&apos;s list.</p>
    </div>
  );
}
