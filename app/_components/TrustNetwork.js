import { t } from "../../public/site/site-i18n";

const members = [
  [64, 128], [133, 72], [223, 110], [310, 63], [391, 122],
  [115, 208], [212, 239], [307, 195],
];
const connections = [[0, 1], [0, 5], [1, 2], [1, 5], [2, 3], [2, 5], [2, 6], [2, 7], [3, 4], [4, 7], [5, 6], [6, 7]];
const invitations = [
  { from: 0, position: [44, 270] },
  { from: 6, position: [152, 311] },
  { from: 4, position: [433, 46] },
];
const Copy = ({ as: Tag = "span", id, elementId, className }) => (
  <Tag id={elementId} className={className} data-i18n={`home.trust.${id}`}>{t(`home.trust.${id}`)}</Tag>
);

function Member({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle className="loop-trust-halo" r="27" />
      <circle className="loop-trust-person" r="19" />
      <circle className="loop-trust-avatar" cy="-5" r="5" />
      <path className="loop-trust-avatar" d="M-9 10a9 9 0 0 1 18 0" />
      <g className="loop-trust-ballot" transform="translate(16 -18)">
        <circle r="9" />
        <path d="m-4 0 3 3 5-6" />
      </g>
    </g>
  );
}

export default function TrustNetwork() {
  return (
    <figure className="loop-trust" aria-labelledby="trust-title" aria-describedby="trust-description trust-note">
      <div className="loop-trust-header">
        <Copy id="eyebrow" className="loop-eyebrow" />
        <label className="loop-trust-control">
          <input className="loop-trust-toggle" type="checkbox" defaultChecked />
          <Copy id="animate" />
        </label>
      </div>
      <Copy as="h3" id="title" elementId="trust-title" className="loop-trust-title" />
      <svg className="loop-trust-visual" viewBox="0 0 480 350" aria-hidden="true">
        <g className="loop-trust-connections">
          {connections.map(([from, to]) => (
            <line x1={members[from][0]} y1={members[from][1]} x2={members[to][0]} y2={members[to][1]} key={`${from}-${to}`} />
          ))}
        </g>
        {invitations.map(({ from, position: [x, y] }, index) => (
          <g className={`loop-trust-growth loop-trust-growth-${index + 1}`} key={from}>
            <line className="loop-trust-invite" x1={members[from][0]} y1={members[from][1]} x2={x} y2={y} />
            <Member x={x} y={y} />
          </g>
        ))}
        <g className="loop-trust-review-links">
          {members.map(([x, y], index) => (
            <path d={`M${x} ${y} Q${x} 275 397 266`} key={index} />
          ))}
        </g>
        <g className="loop-trust-risk-link">
          <path d="M307 195 397 266M391 122 397 266" />
        </g>
        {members.map(([x, y]) => <Member x={x} y={y} key={`${x}-${y}`} />)}
        <g className="loop-trust-risk">
          <g transform="translate(397 266)">
            <circle className="loop-trust-review-ring" r="34" />
            <circle className="loop-trust-risk-person" r="21" />
            <path d="M0-10v12m0 6v1" />
            <g className="loop-trust-spam" transform="translate(22 -32)">
              <rect x="-17" y="-11" width="34" height="22" rx="6" />
              <path d="m-10 11-4 5v-7m5-12H9M-9 3H3" />
            </g>
          </g>
        </g>
        <g className="loop-trust-resolved" transform="translate(397 266)">
          <circle r="24" />
          <path d="m-7-7 14 14m0-14L-7 7" />
        </g>
      </svg>
      <figcaption>
        <ol className="loop-trust-stages">
          {["grow", "vote", "protect"].map((stage, index) => (
            <li className={`loop-trust-stage-${stage}`} key={stage}>
              <span className="loop-trust-step" aria-hidden="true">0{index + 1}</span>
              <Copy as="strong" id={`${stage}Title`} />
              <Copy id={`${stage}Body`} />
            </li>
          ))}
        </ol>
        <Copy as="p" id="description" elementId="trust-description" className="loop-trust-description" />
        <Copy as="p" id="note" elementId="trust-note" className="loop-trust-note" />
      </figcaption>
    </figure>
  );
}
