import { useEffect } from "react";
import usePageMeta from "./usePageMeta.js";
import useStructuredData from "./useStructuredData.js";

const ARTICLE_CSS = `
.bb-article /* latin-ext */

/* latin */

/* latin-ext */

/* latin */

/* latin-ext */

/* latin */

/* latin-ext */

/* latin */

/* latin-ext */

/* latin */

/* cyrillic */

/* vietnamese */

/* latin-ext */

/* latin */

/* cyrillic */

/* vietnamese */

/* latin-ext */

/* latin */

/* cyrillic */

/* vietnamese */

/* latin-ext */

/* latin */


.shoe-link {
  color: #c98a42;
  text-decoration: underline;
  text-decoration-color: rgba(201,138,66,0.45);
  text-underline-offset: 2px;
  font-weight: 600;
}
.bb-article .shoe-link:hover { text-decoration-color: #c98a42; color: #a76e2c; }
.bb-article .shoe-link::after { content: " \\2197"; font-size: 0.85em; opacity: 0.7; }

.bb-article .scanner-note {
  font-size: 12.5px;
  color: #7a7462;
  font-style: italic;
  line-height: 1.55;
  margin: 14px 0 8px;
}
.bb-article .scanner-note a {
  color: #c98a42;
  text-decoration: underline;
  text-decoration-color: rgba(201,138,66,0.45);
  text-underline-offset: 2px;
  font-weight: 600;
  font-style: normal;
}
.bb-article .scanner-note a:hover { color: #a76e2c; text-decoration-color: #c98a42; }



  .bb-article {
    --bg: #f5f0e8;
    --surface: #ffffff;
    --card: #ffffff;
    --border: #d5cdbf;
    --text: #2c3227;
    --muted: #7a7462;
    --accent: #c98a42;
    --accent-soft: rgba(201,138,66,0.10);
    --green: #3d7a52;
    --green-soft: rgba(61,122,82,0.08);
    --red: #c0392b;
    --red-soft: rgba(192,57,43,0.08);
    --yellow: #b8860b;
    --yellow-soft: rgba(184,134,11,0.08);
    --blue: #4a7fb5;
    --blue-soft: rgba(74,127,181,0.08);
    --purple: #7c5cbf;
    --purple-soft: rgba(124,92,191,0.08);
    --radius: 14px;
    --radius-sm: 10px;
    --font: 'DM Sans', system-ui, sans-serif;
    --display: 'Playfair Display', Georgia, serif;
  }
  .bb-article * { box-sizing: border-box; margin: 0; padding: 0; }
  .bb-article {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    line-height: 1.6;
    padding: 40px 24px 80px;
  }
  .bb-article .wrap { max-width: 820px; margin: 0 auto; }
  .bb-article .breadcrumb {
    margin-bottom: 20px;
    font-size: 12px;
    color: var(--muted);
  }
  .bb-article .breadcrumb a {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .bb-article .article {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px 36px;
    margin-bottom: 32px;
  }
  .bb-article .meta-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .bb-article .tag {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .bb-article .tag.shoes { color: var(--accent); background: var(--accent-soft); }
  .bb-article .tag.review { color: var(--green); background: var(--green-soft); }
  .bb-article h1 {
    font-family: var(--display);
    font-size: 32px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.5px;
    line-height: 1.2;
    margin: 0 0 10px;
  }
  .bb-article .subtitle {
    font-size: 15px;
    color: var(--muted);
    line-height: 1.6;
    margin: 0 0 4px;
  }
  .bb-article .byline {
    font-size: 12px;
    color: var(--muted);
    margin-top: 14px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--border);
  }
  .bb-article h2 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    margin-top: 32px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
  }
  .bb-article h3 {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    margin-top: 22px;
    margin-bottom: 8px;
  }
  .bb-article p {
    font-size: 14.5px;
    color: var(--text);
    line-height: 1.8;
    margin: 14px 0;
  }
  .bb-article ul, .bb-article ol {
    font-size: 14.5px;
    color: var(--text);
    line-height: 1.8;
    margin: 12px 0 12px 22px;
  }
  .bb-article li { margin: 4px 0; }
  .bb-article strong { font-weight: 700; }
  .bb-article .tldr {
    border-left: 3px solid var(--yellow);
    background: var(--yellow-soft);
    border-radius: 0 10px 10px 0;
    padding: 16px 20px;
    margin: 22px 0;
  }
  .bb-article .tldr-label {
    font-size: 11px;
    font-weight: 800;
    color: var(--yellow);
    text-transform: uppercase;
    letter-spacing: 0.7px;
    margin-bottom: 6px;
  }
  .bb-article .tldr p { margin: 6px 0; font-size: 14px; }
  .bb-article .key-insight {
    border-left: 3px solid var(--accent);
    background: var(--accent-soft);
    border-radius: 0 10px 10px 0;
    padding: 14px 18px;
    margin: 20px 0;
    font-size: 13.5px;
    line-height: 1.75;
  }
  .bb-article .stat-grid {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 20px 0;
  }
  .bb-article .stat {
    flex: 1 1 140px;
    background: #faf6ee;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    text-align: center;
  }
  .bb-article .stat-label {
    font-size: 10.5px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .bb-article .stat-value {
    font-size: 18px;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: -0.3px;
  }
  .bb-article .stat-sub {
    font-size: 10.5px;
    color: var(--muted);
    margin-top: 4px;
  }
  .bb-article .placeholder {
    border: 2px dashed var(--border);
    background: #faf6ee;
    border-radius: var(--radius);
    padding: 40px 16px;
    text-align: center;
    margin: 22px 0;
    color: var(--muted);
  }
  .bb-article .figure {
    margin: 22px 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: #fbf8f1;
  }
  .bb-article .figure img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 520px;
    object-fit: contain;
    background: #2c3227;
  }
  .bb-article .figure figcaption {
    padding: 12px 16px 14px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--muted);
    border-top: 1px solid var(--border);
  }
  .bb-article .figure figcaption strong {
    color: var(--text);
    font-weight: 700;
  }
  .bb-article .figure-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin: 22px 0;
    align-items: stretch;
  }
  .bb-article .figure-pair .figure {
    margin: 0;
    display: flex;
    flex-direction: column;
  }
  .bb-article .figure-pair .figure-img-wrap {
    background: #2c3227;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }
  .bb-article .figure-pair .figure img {
    width: 100%;
    height: auto;
    max-height: 460px;
    object-fit: contain;
  }
  @media (max-width: 640px) {
    .bb-article .figure-pair { grid-template-columns: 1fr; }
  }
  .bb-article .scan-card {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .bb-article .scan-card-head {
    padding: 10px 16px;
    border-bottom: 1px solid #eee8dc;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--accent);
  }
  .bb-article .scan-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin: 22px 0;
  }
  @media (max-width: 720px) { .bb-article .scan-pair { grid-template-columns: 1fr; } }
  .bb-article .scan-sole-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    flex: 1;
  }
  .bb-article .scan-side-body {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .bb-article .scan-img-wrap {
    background: #faf8f4;
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .bb-article .scan-sole-body .scan-img-wrap { border-right: 1px solid #eee8dc; }
  .bb-article .scan-side-body .scan-img-wrap { border-bottom: 1px solid #eee8dc; }
  .bb-article .scan-img-wrap img {
    display: block;
    max-width: 100%;
    height: auto;
    max-height: 320px;
    object-fit: contain;
    border-radius: 6px;
  }
  .bb-article .scan-meta {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    justify-content: center;
  }
  .bb-article .scan-side-body .scan-meta {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 14px 22px;
  }
  .bb-article .scan-side-body .scan-slider { flex: 1; min-width: 180px; }
  .bb-article .scan-toetype {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: var(--accent-soft);
    border: 1px solid #eee8dc;
    border-radius: 10px;
  }
  .bb-article .scan-toetype-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    text-transform: capitalize;
    margin-bottom: 2px;
  }
  .bb-article .scan-toetype-desc {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.4;
  }
  .bb-article .scan-toetype-icon {
    width: 56px;
    height: auto;
    flex-shrink: 0;
  }
  .bb-article .scan-toetype-icon img {
    display: block;
    width: 100%;
    height: auto;
  }
  .bb-article .scan-slider { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .bb-article .scan-slider-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 11.5px;
    white-space: nowrap;
  }
  .bb-article .scan-slider-label { font-weight: 600; color: var(--text); }
  .bb-article .scan-slider-val { font-weight: 700; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
  .bb-article .scan-slider-val.mid { color: var(--green); }
  .bb-article .scan-slider-val.low, .bb-article .scan-slider-val.high { color: var(--accent); }
  .bb-article .scan-slider-track {
    height: 8px;
    border-radius: 4px;
    position: relative;
    background: linear-gradient(to right, #ece5d4 0 33.333%, #d6cdb4 33.333% 66.666%, #ece5d4 66.666% 100%);
  }
  .bb-article .scan-slider-marker {
    position: absolute;
    top: -3px;
    transform: translateX(-50%);
    width: 4px;
    height: 14px;
    border-radius: 2px;
    box-shadow: 0 0 0 1.5px #fff;
  }
  .bb-article .scan-slider-marker.mid { background: var(--green); }
  .bb-article .scan-slider-marker.low, .bb-article .scan-slider-marker.high { background: var(--accent); }
  .bb-article .scan-slider-scale {
    display: flex;
    font-size: 9.5px;
    color: #a8a08e;
    text-transform: lowercase;
  }
  .bb-article .scan-slider-scale span { flex: 1; }
  .bb-article .scan-slider-scale span:nth-child(2) { text-align: center; }
  .bb-article .scan-slider-scale span:nth-child(3) { text-align: right; }
  .bb-article .placeholder-title {
    font-weight: 700;
    color: var(--text);
    font-size: 13px;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .bb-article .placeholder-note {
    font-size: 12px;
    font-style: italic;
  }
  .bb-article .alts-table-wrap {
    margin: 18px 0 22px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: #fbf8f1;
  }
  .bb-article .alts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    line-height: 1.55;
  }
  .bb-article .alts-table thead th {
    background: #efe7d4;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    text-align: left;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  .bb-article .alts-table tbody td {
    padding: 12px 14px;
    vertical-align: top;
    border-bottom: 1px solid var(--border);
    color: var(--text);
  }
  .bb-article .alts-table tbody tr:last-child td {
    border-bottom: none;
  }
  .bb-article .alts-table tbody tr:nth-child(even) td {
    background: #f7f1e2;
  }
  .bb-article .alts-table .alt-name {
    font-weight: 700;
    color: var(--text);
    font-size: 14px;
    white-space: nowrap;
  }
  .bb-article .alts-table .col-brand { width: 24%; }
  .bb-article .alts-table .col-desc { width: 38%; }
  .bb-article .alts-table .col-vs { width: 38%; }
  .bb-article .alt-pending {
    display: inline-block;
    color: var(--red);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-top: 4px;
    padding: 2px 6px;
    border: 1px solid var(--red);
    border-radius: 4px;
    white-space: nowrap;
  }
  @media (max-width: 640px) {
    .bb-article .alts-table, .bb-article .alts-table thead, .bb-article .alts-table tbody, .bb-article .alts-table tr, .bb-article .alts-table td, .bb-article .alts-table th { display: block; width: 100%; }
    .bb-article .alts-table thead { display: none; }
    .bb-article .alts-table tbody tr { border-bottom: 1px solid var(--border); padding: 4px 0; }
    .bb-article .alts-table tbody tr:last-child { border-bottom: none; }
    .bb-article .alts-table tbody td { border-bottom: none; padding: 6px 14px; }
    .bb-article .alts-table tbody td:first-child { padding-top: 12px; }
    .bb-article .alts-table tbody td:last-child { padding-bottom: 14px; }
    .bb-article .alts-table tbody td::before {
      content: attr(data-label);
      display: block;
      font-size: 10px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 2px;
    }
    .bb-article .alts-table tbody td:first-child::before { display: none; }
  }
  .bb-article .verdict {
    margin-top: 28px;
    padding: 22px 24px;
    background: linear-gradient(135deg, #faf6ee 0%, #f0e9da 100%);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .bb-article .verdict-label {
    font-size: 11px;
    font-weight: 800;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.7px;
    margin-bottom: 8px;
  }
  .bb-article .verdict-text {
    font-family: var(--display);
    font-size: 18px;
    line-height: 1.55;
    color: var(--text);
    font-weight: 600;
  }
  .bb-article .draft-banner {
    background: var(--red-soft);
    border: 1px solid var(--red);
    color: var(--red);
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 22px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
  }
  @media (max-width: 600px) {
    .bb-article { padding: 20px 12px 60px; }
    .bb-article .article { padding: 24px 18px; }
    .bb-article h1 { font-size: 26px; }
    .bb-article .verdict-text { font-size: 16px; }
  }

`;

const ARTICLE_HTML = `
<div class="wrap">
    <div class="breadcrumb">
      <a href="/insights">← All Insights</a> / Scarpa Blackbird Review
    </div>

    <article class="article">
      <div class="meta-row">
        <span class="tag shoes">Shoes</span>
        <span class="tag review">PRODUCT ReView</span>
      </div>

      <h1>Scarpa Blackbird: Stiff Carbon-infused Midsole meets soft XS Grip 2 and Extreme Price</h1>
      <p class="subtitle">Scarpa's first carbon-enhanced 3D midsole shoe pairs an ultra-stiff platform with rather thin and soft XS Grip2 rubber. I tested it on the vertical micro-edges of my local sandstone quarry. Here is what worked, what did not, and whether I recommend it.</p>
      <div class="byline">By Roman · April 2026 · Tested at my home crag in Edenkoben (sandstone quarry, vertical micro-smears &amp; edging)</div>

      <div class="tldr">
        <div class="tldr-label">TL;DR</div>
        <p>Interesting shoe, but for me not worth the money. Shoes like the <a class="shoe-link" href="https://www.climbing-gear.com/shoe/la-sportiva-otaki-mens">La Sportiva Otaki</a> or <a class="shoe-link" href="https://www.climbing-gear.com/shoe/scarpa-vapor-v-mens">Scarpa Vapor V</a> deliver comparable performance at roughly half the price. The thin XS Grip2 rubber will likely not last long, so you end up paying a huge premium for a shoe that needs a resole rather quickly. Only worth recommending if you genuinely need that last bit of performance and price is no object. Note: Only climbed once with it - will update after a few more sessions. The one thing that stood out indeed: Comfy from day 1 and literally zero break-in period.</p>
      </div>

      <h2>What is new about the Blackbird</h2>
      <p>The headline feature is Scarpa's first carbon-enhanced 3D molded midsole. It is a deliberately polarising design choice: a very stiff carbon platform combined with thin and relatively soft XS Grip2 rubber. The idea is that the carbon does the structural work (edging power, support) while the thin rubber retains sensitivity and friction.</p>
      <p>For my home crag, a sandstone quarry where vertical climbing on micro-smears and small edges is the name of the game, that combination sounded promising. A stiff platform that still lets you feel the rock and smear on blanks parts of the wall would be amazing for that style of climbing.</p>

      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Midsole</div>
          <div class="stat-value">Stiff</div>
          <div class="stat-sub">Carbon-enhanced, 3D-mold</div>
        </div>
        <div class="stat">
          <div class="stat-label">Rubber</div>
          <div class="stat-value">Soft</div>
          <div class="stat-sub">3.5mm XS Grip II</div>
        </div>
        <div class="stat">
          <div class="stat-label">Downturn</div>
          <div class="stat-value">Moderate</div>
        </div>
        <div class="stat">
          <div class="stat-label">Asymmetry</div>
          <div class="stat-value">Strong</div>
        </div>
      </div>

      <h2>Fit</h2>
      <p>The last is strongly asymmetric with a moderate downturn. The forefoot is narrow to medium, while the heel is a touch wider than I would have expected given Scarpa advertises the shoe as a narrow fit (unfortunate for me!).</p>
      <p>I am a street size 45.5 and I usually wear Scarpa in 44. Following Scarpa's own recommendation to size up by 0.5 from your usual Scarpa size, I went with 44.5, which worked well overall. And indeed, the shoe felt surprisingly comfortable out of the box. Unlike other stiff edging shoes.</p>

      <div class="scan-pair">
        <div class="scan-card">
          <div class="scan-card-head">MY Sole PROFILE for reference</div>
          <div class="scan-sole-body">
            <div class="scan-img-wrap">
              <img src="/images/insights/blackbird/sole-overlay.png" alt="Sole-view foot scan with measured outline overlay.">
            </div>
            <div class="scan-meta">
              <div class="scan-toetype">
                <div class="scan-toetype-icon"><img src="/images/insights/blackbird/egyptian-toe.png" alt="Egyptian toe shape diagram"></div>
                <div>
                  <div class="scan-toetype-name">Egyptian</div>
                  <div class="scan-toetype-desc">Big toe is the longest, toes descend in a smooth slope.</div>
                </div>
              </div>
              <div class="scan-slider">
                <div class="scan-slider-row"><span class="scan-slider-label">Forefoot Width</span><span class="scan-slider-val mid">mid</span></div>
                <div class="scan-slider-track"><div class="scan-slider-marker mid" style="left:40.58%;" title="0.349"></div></div>
                <div class="scan-slider-scale"><span>low</span><span>mid</span><span>high</span></div>
              </div>
              <div class="scan-slider">
                <div class="scan-slider-row"><span class="scan-slider-label">Arch Length</span><span class="scan-slider-val mid">mid</span></div>
                <div class="scan-slider-track"><div class="scan-slider-marker mid" style="left:46.97%;" title="0.721"></div></div>
                <div class="scan-slider-scale"><span>low</span><span>mid</span><span>high</span></div>
              </div>
              <div class="scan-slider">
                <div class="scan-slider-row"><span class="scan-slider-label">Heel Width</span><span class="scan-slider-val low">low</span></div>
                <div class="scan-slider-track"><div class="scan-slider-marker low" style="left:26.19%;" title="0.216"></div></div>
                <div class="scan-slider-scale"><span>low</span><span>mid</span><span>high</span></div>
              </div>
            </div>
          </div>

      <p class="scanner-note">These measurements were taken with our <a href="https://www.climbing-gear.com/scan">free Scanner</a> - feel free to run it for a direct comparison to my foot shape.</p>

        </div>
        <div class="scan-card">
          <div class="scan-card-head">MY Side Profile for reference</div>
          <div class="scan-side-body">
            <div class="scan-img-wrap">
              <img src="/images/insights/blackbird/side-overlay.png" alt="Side-view foot scan with measured outline overlay.">
            </div>
            <div class="scan-meta">
              <div class="scan-slider">
                <div class="scan-slider-row"><span class="scan-slider-label">Instep Height</span><span class="scan-slider-val low">low</span></div>
                <div class="scan-slider-track"><div class="scan-slider-marker low" style="left:29.29%;" title="0.243"></div></div>
                <div class="scan-slider-scale"><span>low</span><span>mid</span><span>high</span></div>
              </div>
              <div class="scan-slider">
                <div class="scan-slider-row"><span class="scan-slider-label">Heel Depth</span><span class="scan-slider-val mid">mid</span></div>
                <div class="scan-slider-track"><div class="scan-slider-marker mid" style="left:66.67%;" title="0.041"></div></div>
                <div class="scan-slider-scale"><span>low</span><span>mid</span><span>high</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="figure-pair">
        <figure class="figure">
          <div class="figure-img-wrap">
            <img src="/images/insights/blackbird/compare-katana.jpg" alt="Soles of the Scarpa Blackbird and <a class="shoe-link" href="https://www.climbing-gear.com/shoe/la-sportiva-katana-lace-mens">La Sportiva Katana Lace</a> held side by side, showing the narrower Blackbird forefoot and slightly wider heel.">
          </div>
          <figcaption><strong>Blackbird vs Katana Lace.</strong> I wear the Katana Lace slightly larger. The Blackbird forefoot is more narrow, while the heel runs a bit wider.</figcaption>
        </figure>
        <figure class="figure">
          <div class="figure-img-wrap">
            <img src="/images/insights/blackbird/compare-otaki.jpg" alt="Side view of the Scarpa Blackbird next to the La Sportiva Otaki, showing the similar toe-box construction.">
          </div>
          <figcaption><strong>Blackbird vs Sportiva Otaki.</strong> Similar toe construction, comparable downturn and a precise, supportive forefoot envelope that allows edging + pulling.</figcaption>
        </figure>
      </div>

      <h3>How it actually fits my foot</h3>
      <p>The forefoot and toes fit my low to mid volume foot very well; the front of the shoe is genuinely precise out of the box - indeed supportive yet sensitive. The heel is a different story for me: it feels loose and I am not entirely sure what the intent of this new construction is.&nbsp;</p>

      <div class="key-insight">
        Sizing recommendation: Scarpa's "+0.5 over your usual Scarpa" guidance held up. So 1 size down from street shoes is my recommendation. Likely fits well for egyptian toes, narrow-to-medium forefoot with medium-to-wide heels. In otehr words: If the Drago fits you, this one will likely, too.</div>

      <h2>Performance</h2>
      <p>The midsole is indeed extremely stiff and seems to extend through roughly three quarters of the shoe. Under the toes the forefoot is heavily concaved, more so than the typical Scarpa, and closer in feel to the La Sportiva Otaki or the 3D-molded Mad Rock shoes.</p>
      <p>The toe is genuinely very precise and, despite the stiffness, the shoe does not climb like a rigid board: there is real sensitivity at the very tip. On micro-edges that combination is indeed impressive.</p>
      <p>The catch: while my toe stayed firmly planted on the edge, the midfoot flexed surprisingly a lot. When I pushed maximum pressure onto the front of the shoe, it almost felt like my foot was slipping out of the back. I suspect this is a direct consequence of the loose heel rather than a construction issue, but the effect on the wall is the same: not sufficient stability on small edges when I have to load them with full body weight and then move upwards.</p>

      <figure class="figure">
        <div class="figure-img-wrap">
          <img src="/images/insights/blackbird/hero.jpg" alt="Side view of a Scarpa Blackbird toed in on a small edge in a stone wall, with the forefoot visibly bending under load.">
        </div>
        <figcaption><strong>Micro-edging in the garden.</strong> Forefoot bends surprisingly far under load despite the stiff carbon midsole, heel feels loose.</figcaption>
      </figure>

      <h3>Rubber and durability expectation</h3>
      <p>XS Grip2 is excellent rubber for friction on small features, which is exactly what you want on sandstone, but it obviously wears faster than stiff compounds. Combined with how aggressively you load the front of the shoe on micro-edges, my expectation is that the toe tip will wear through faster than on a typical edging shoe with thicker XS Edge rubber or similar. So you are paying a premium price for a shoe that will likely need a resole sooner than its peers.</p>

      <h2>Verdict</h2>
      <div class="verdict">
        <div class="verdict-label">Bottom line</div>
        <div class="verdict-text">"Interesting shoe, and the carbon-enhanced platform delivers on precise edging. But for me, the loose heel undermines the very thing the carbon is supposed to enable, and the thin + soft rubber means you will resole it sooner. At this price point, only buy the Blackbird if you truly need that last 5% of performance and it fits your entire foot. Otherwise the alternatives below give you comparable performance for half the money."</div>
      </div>

      <h2>Alternatives worth considering</h2>
      <p>Each of these tackles the same problem of precise edging on vertical to slightly overhanging terrain.</p>

      <div class="alts-table-wrap">
        <table class="alts-table">
          <thead>
            <tr>
              <th class="col-brand">Brand &amp; Model</th>
              <th class="col-desc">Description</th>
              <th class="col-vs">Comparison to Blackbird</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="alt-name"><a class="shoe-link" href="https://www.climbing-gear.com/shoe/la-sportiva-otaki-mens">La Sportiva Otaki</a></td>
              <td data-label="Description">Moderately aggressive shoe with a concave forefoot, XS Grip2 rubber and a stiff midsole tuned for small edges.</td>
              <td data-label="vs Blackbird">For me the most direct comparison. Not as extreme as carbon, but at roughly half the price the value proposition is hard to beat. Also a pretty similar fit.</td>
            </tr>
            <tr>
              <td class="alt-name"><a class="shoe-link" href="https://www.climbing-gear.com/shoe/la-sportiva-katana-lace-mens">La Sportiva Katana Lace</a></td>
              <td data-label="Description">Long-standing vertical edging benchmark. Less aggressive shape and laces may compensate for suboptimal fit.</td>
              <td data-label="vs Blackbird">Comparable edging precision but less good for 'pulling' on foot holds. Slightly wider forefoot but tighter heel cup.&nbsp;</td>
            </tr>
            <tr>
              <td class="alt-name"><a class="shoe-link" href="https://www.climbing-gear.com/shoe/scarpa-vapor-v-mens">Scarpa Vapor V</a></td>
              <td data-label="Description">Versatile all-rounder from Scarpa with a similar last philosophy but less aggressive.</td>
              <td data-label="vs Blackbird">A workhorse if you want a Scarpa edging shoe without committing to a carbon midsole. A bit flatter last, definitely a bit less performance.</td>
            </tr>
            <tr>
              <td class="alt-name"><a class="shoe-link" href="https://www.climbing-gear.com/shoe/scarpa-boostic">Scarpa Boostic</a></td>
              <td data-label="Description">More downturned, more aggressive Scarpa with a similar focus on precise toeing in.</td>
              <td data-label="vs Blackbird">Far less sensitive but might be better suited if your projects also include steeper terrain rather than pure vertical.</td>
            </tr>
            <tr>
              <td class="alt-name"><a class="shoe-link" href="https://www.climbing-gear.com/shoe/eb-strange">EB Strange</a></td>
              <td data-label="Description">Quirky outsider option with an unusual shape and construction, surprisingly capable on small edges and often overlooked.</td>
              <td data-label="vs Blackbird">Worth a look if you want something different from the mainstream. I only tried it in a shop, so can't go into details.</td>
            </tr>
            <tr>
              <td class="alt-name"><a class="shoe-link" href="https://www.climbing-gear.com/shoe/unparallel-up-beat">Unparallel Up Beat</a></td>
              <td data-label="Description">Unparallel's latest edging-focused shoe. A strong alternative for greek or roman toe profiles with less pointy toe box and less asymmetry.</td>
              <td data-label="vs Blackbird">Not as extreme on the very smallest edges, but far more versatile and forgiving for non-egyptian toe form.</td>
            </tr>
            <tr>
              <td class="alt-name"><a class="shoe-link" href="https://www.climbing-gear.com/shoe/evolv-geshido">Evolv Geshido</a></td>
              <td data-label="Description">Stiff edging shoe using Evolv's TRAX rubber, aimed at precise small-edge performance.</td>
              <td data-label="vs Blackbird">Worth a direct comparison if you are into Evolv. I didn't have the chance to try that shoe yet, so can't provide details.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Who should actually buy the Blackbird?</h2>
      <p>If you seek maximum performance on smallest edges but want to keep sensitivity and comfort, the price is not a blocker, and your foot has a wider heel than mine, the Blackbird might be a real step ahead. For everyone else, including me, the Otaki, Up Beat or Vapor V will get you most of the way there at a fraction of the cost.</p>

      <p style="font-size: 12px; color: var(--muted); margin-top: 28px; padding-top: 16px; border-top: 1px solid var(--border); font-style: italic;"><br></p>
    
</article>
  </div>
`;

/* Scarpa Blackbird review.
   Self-contained article body lifted from the static HTML draft.
   All CSS is scoped to .bb-article to avoid leaking to the rest of the site.
   NavBar + Footer are provided by the parent BrowserRouter layout in main.jsx. */
// JSON-LD Review schema. Mirrors the static schema injected by prerender.mjs
// so client-only navigations also expose the structured data.
const REVIEW_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Review",
  headline: "Scarpa Blackbird Review: Carbon Midsole, Real World Test",
  description:
    "First-person review of Scarpa's first carbon-enhanced midsole shoe, tested on vertical sandstone micro-edges. What works, what does not, plus seven alternatives compared head-to-head.",
  url: "https://www.climbing-gear.com/insights/scarpa-blackbird",
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: { "@type": "Organization", name: "climbing-gear.com" },
  publisher: {
    "@type": "Organization",
    name: "climbing-gear.com",
    url: "https://www.climbing-gear.com",
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://www.climbing-gear.com/insights/scarpa-blackbird",
  },
  image: "https://www.climbing-gear.com/images/insights/blackbird/hero.jpg",
  itemReviewed: {
    "@type": "Product",
    name: "Scarpa Blackbird",
    brand: { "@type": "Brand", name: "Scarpa" },
    category: "Climbing Shoes",
    url: "https://www.climbing-gear.com/shoe/scarpa-blackbird",
  },
  reviewRating: {
    "@type": "Rating",
    ratingValue: "6.5",
    bestRating: "10",
    worstRating: "1",
  },
};

export default function InsightBlackbird() {
  usePageMeta(
    "Scarpa Blackbird Review: Carbon Midsole, Real World Test",
    "First-person review of Scarpa's first carbon-enhanced midsole shoe, tested on vertical sandstone micro-edges. What works, what does not, and seven alternatives compared head-to-head.",
    { image: "https://www.climbing-gear.com/images/insights/blackbird/hero.jpg" }
  );
  useStructuredData(REVIEW_SCHEMA);

  // Scroll to top on mount (in case the user navigated within the SPA)
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <style>{ARTICLE_CSS}</style>
      <div className="bb-article" dangerouslySetInnerHTML={{ __html: ARTICLE_HTML }} />
    </>
  );
}
