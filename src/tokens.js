// ═══ Design Tokens — Earth palette (light mode) ═══
// Derived from nature-s-landing :root theme: warm parchment, sand, forest green accents
export const T = {
  bg: "#f5f0e8", surface: "#ede7db", card: "#ffffff", border: "#d5cdbf",
  text: "#2c3227", muted: "#7a7462",
  accent: "#c98a42", accentSoft: "rgba(201,138,66,0.10)",
  primary: "#3d7a52", primarySoft: "rgba(61,122,82,0.08)",
  green: "#3d7a52", greenSoft: "rgba(61,122,82,0.08)",
  red: "#c0392b", redSoft: "rgba(192,57,43,0.08)",
  yellow: "#b8860b", yellowSoft: "rgba(184,134,11,0.08)",
  blue: "#4a7fb5", blueSoft: "rgba(74,127,181,0.08)",
  purple: "#7c5cbf", purpleSoft: "rgba(124,92,191,0.08)",
  // Nav — light cream, blends with page
  navBg: "rgba(245,240,232,0.92)", navText: "#2c3227", navMuted: "#7a7462",
  font: "'DM Sans', 'Instrument Sans', system-ui, sans-serif",
  display: "'Playfair Display', Georgia, serif",
  mono: "'JetBrains Mono', 'DM Mono', monospace",
  radius: "14px", radiusSm: "10px", radiusXs: "6px",
};

export const BRAND_COLORS = {
  Scarpa: "#c2392a",
  "La Sportiva": "#b8960e",
  Unparallel: "#3b6fb6",
  "Mad Rock": "#7c5cbf",
  Butora: "#3d7a52",
  Evolv: "#c98a42",
  Tenaya: "#b5446e",
  "Black Diamond": "#6b7280",
};

export const GLOBAL_CSS = `
  /* Fonts loaded via index.html <link> */
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; color: ${T.text}; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .fade-up { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
  @keyframes compareSlideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;
