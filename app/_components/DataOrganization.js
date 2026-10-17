import { t } from "../../public/site/site-i18n";
import { cloudProviderMarks } from "../../public/site/cloud-providers";

const Copy = ({ as: Tag = "p", name, className, elementId }) => (
  <Tag id={elementId} className={className} data-i18n={`home.data.${name}`}>{t(`home.data.${name}`)}</Tag>
);
const types = [
  { key: "text", blocks: 5, color: "#5c9eff", path: "M5 5h14M12 5v14M8 19h8" },
  { key: "image", blocks: 8, color: "#76d7b7", path: "M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M16 7h.01" },
  { key: "video", blocks: 4, color: "#b4a0ff", path: "M3 5h18v14H3zM10 9l5 3-5 3z" },
  { key: "audio", blocks: 3, color: "#f3b943", path: "M9 17V5l11-2v12M9 5l11-2M9 17a3 3 0 1 1-3-3h3M20 15a3 3 0 1 1-3-3h3" },
  { key: "file", blocks: 6, color: "#f1957e", path: "M4 5h6l2 3h8v12H4z" },
];

export default function DataOrganization() {
  return (
    <section className="loop-section loop-data-library" id="my-data" aria-labelledby="my-data-title">
      <div className="loop-data-intro">
        <div>
          <Copy name="eyebrow" className="loop-eyebrow" />
          <Copy as="h2" name="title" elementId="my-data-title" />
          <Copy name="body" className="loop-section-lede" />
          <ul className="loop-data-benefits">
            <li><span aria-hidden="true">01</span><div><Copy as="h3" name="organizeTitle" /><Copy name="organizeBody" /></div></li>
            <li><span aria-hidden="true">02</span><div><Copy as="h3" name="cloudTitle" /><Copy name="cloudBody" /></div></li>
          </ul>
        </div>
        <figure className="loop-data-preview" aria-labelledby="data-preview-title" aria-describedby="data-preview-note">
          <div className="loop-data-preview-header">
            <Copy as="strong" name="previewTitle" elementId="data-preview-title" />
            <Copy as="span" name="previewLabel" className="loop-data-preview-badge" />
          </div>
          <Copy name="previewBody" />
          <div className="loop-data-bars" aria-hidden="true">
            {types.map(({ key, blocks, color, path }) => (
              <div className="loop-data-bar" key={key}>
                <div className="loop-data-blocks">
                  {Array.from({ length: 8 }, (_, index) => (
                    <span key={index} style={{ background: index >= 8 - blocks ? color : undefined }} />
                  ))}
                </div>
                <svg viewBox="0 0 24 24"><path d={path} /></svg>
                <Copy as="span" name={`type.${key}`} />
              </div>
            ))}
          </div>
          <div className="loop-data-tags">
            {["travel", "work", "ideas"].map((tag) => <Copy as="span" name={`tag.${tag}`} key={tag} />)}
          </div>
          <figcaption><Copy name="previewNote" elementId="data-preview-note" /></figcaption>
        </figure>
      </div>
      <div className="loop-data-cloud-heading"><Copy as="h3" name="providersTitle" /><Copy as="span" name="planned" /></div>
      <ul className="loop-data-providers">
        {Object.entries(cloudProviderMarks).map(([provider, mark]) => (
          <li key={provider}>
            <svg className="loop-provider-logo" data-provider-icon={mark.icon} aria-hidden="true" viewBox="0 0 24 24"><path d={mark.path} /></svg>
            <strong>{provider}</strong><Copy as="span" name="disconnected" />
          </li>
        ))}
      </ul>
      <Copy name="cloudNote" className="loop-caption" />
      <aside className="loop-data-nas" aria-labelledby="personal-nas-title">
        <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 6.5h6m4 0h.01M7 17.5h6m4 0h.01M12 10v4" /></svg>
        <div>
          <Copy as="h3" name="nasTitle" elementId="personal-nas-title" />
          <Copy name="nasBody" />
          <Copy as="span" name="nasStatus" className="loop-data-nas-status" />
        </div>
      </aside>
    </section>
  );
}
