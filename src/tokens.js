// ═══ Design Tokens ═══
export const T = {
  bg: "#0e1015", surface: "#161920", card: "#1c2029", border: "#252a35",
  text: "#e8e9ec", muted: "#717889",
  accent: "#E8734A", accentSoft: "rgba(232,115,74,0.12)",
  green: "#34d399", greenSoft: "rgba(52,211,153,0.12)",
  red: "#ef4444", redSoft: "rgba(239,68,68,0.12)",
  yellow: "#fbbf24", yellowSoft: "rgba(251,191,36,0.12)",
  blue: "#60a5fa", blueSoft: "rgba(96,165,250,0.12)",
  purple: "#a78bfa", purpleSoft: "rgba(167,139,250,0.12)",
  font: "'Instrument Sans', 'DM Sans', system-ui, sans-serif",
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
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .fade-up { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
  @keyframes compareSlideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;
