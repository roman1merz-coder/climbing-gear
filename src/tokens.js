// ═══ Design Tokens — Nature palette (dark mode) ═══
// Derived from nature-s-landing: deep greens, warm earth accent, organic feel
export const T = {
  bg: "#0f1a14", surface: "#152019", card: "#1a271f", border: "#2a3830",
  text: "#e8e5df", muted: "#8a9485",
  accent: "#c98a42", accentSoft: "rgba(201,138,66,0.12)",
  primary: "#3fa66b", primarySoft: "rgba(63,166,107,0.12)",
  green: "#3fa66b", greenSoft: "rgba(63,166,107,0.12)",
  red: "#ef4444", redSoft: "rgba(239,68,68,0.12)",
  yellow: "#d4a84b", yellowSoft: "rgba(212,168,75,0.12)",
  blue: "#60a5fa", blueSoft: "rgba(96,165,250,0.12)",
  purple: "#a78bfa", purpleSoft: "rgba(167,139,250,0.12)",
  font: "'DM Sans', 'Instrument Sans', system-ui, sans-serif",
  display: "'Playfair Display', Georgia, serif",
  mono: "'JetBrains Mono', 'DM Mono', monospace",
  radius: "14px", radiusSm: "10px", radiusXs: "6px",
};

export const BRAND_COLORS = {
  Scarpa: "#c2392a",
  "La Sportiva": "#f5b800",
  Unparallel: "#3b82f6",
  "Mad Rock": "#8b5cf6",
  Butora: "#10b981",
  Evolv: "#f59e0b",
  Tenaya: "#ec4899",
  "Black Diamond": "#6b7280",
};

export const GLOBAL_CSS = `
  /* Fonts self-hosted in /public/fonts/ — loaded via index.html <link> */
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .fade-up { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
  @keyframes compareSlideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;
