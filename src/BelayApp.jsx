import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { fmt, ensureArray } from "./utils/format.js";
import useIsMobile from "./useIsMobile.js";
import HeartButton from "./HeartButton.jsx";

// ═══ SCORING FUNCTIONS ═══

const PROX = {
  skill_level: ["beginner", "intermediate", "advanced", "expert"],
};

function sProx(uvs, svs, sc) {
  if (!svs?.length || !uvs?.length) return 0;
  const v = Array.isArray(svs) ? svs : [svs];
  let t = 0;
  for (const u of uvs) {
    const ui = sc.indexOf(u);
    if (ui < 0) continue;
    let b = 99;
    for (const s of v) {
      const si = sc.indexOf(s);
      if (si >= 0) b = Math.min(b, Math.abs(ui - si));
    }
    if (b === 0) t += 1;
    else if (b === 1) t += 0.5;
    else if (b === 2) t += 0.25;
  }
  return t / uvs.length;
}

function sSet(uvs, svs) {
  if (!svs) return 0;
  const v = Array.isArray(svs) ? svs : [svs];
  if (!v.length) return 0;
  return uvs.filter((u) => v.includes(u)).length / uvs.length;
}

function sRng(mn, mx, v) {
  if (v == null) return 0;
  if (v >= mn && v <= mx) return 1;
  const sp = mx - mn || 1;
  const g = sp * 0.1;
  const d = v < mn ? mn - v : v - mx;
  return d <= g ? 0.5 : 0;
}

// Rope diameter coverage: does device range cover user's desired diameter?
function sRopeCoverage(userMin, userMax, devMin, devMax) {
  if (devMin == null || devMax == null) return 0;
  const mn = userMin ?? 0;
  const mx = userMax ?? 99;
  if (devMin <= mn && devMax >= mx) return 1; // full coverage
  if (devMin <= mx && devMax >= mn) return 0.5; // partial overlap
  return 0;
}

function score(belays, filters) {
  const active = Object.entries(filters).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v) && !v.length) return false;
    if (typeof v === "object" && !Array.isArray(v) && v.min == null && v.max == null) return false;
    return true;
  });
  if (!active.length)
    return belays.map((b) => ({ belay_data: b, match_score: -1 })).sort(() => Math.random() - 0.5);
  return belays
    .map((belay) => {
      let tot = 0;
      let cnt = 0;
      for (const [k, val] of active) {
        let s = 0;
        if (k === "rope_diameter" && typeof val === "object") {
          s = sRopeCoverage(val.min, val.max, belay.rope_diameter_min_mm, belay.rope_diameter_max_mm);
        } else if (PROX[k] && Array.isArray(val)) {
          const sv = Array.isArray(belay[k]) ? belay[k] : [belay[k]];
          s = sProx(val, sv, PROX[k]);
        } else if (Array.isArray(val) && val.length) {
          // sSet for multi-select arrays; for lowering_type treat as single value match
          if (k === "lowering_type") {
            s = val.includes(belay[k]) ? 1 : 0;
          } else {
            s = sSet(val, belay[k]);
          }
        } else if (typeof val === "object" && !Array.isArray(val)) {
          s = sRng(val.min ?? 0, val.max ?? Infinity, belay[k]);
        } else if (typeof val === "boolean") {
          s = belay[k] === val ? 1 : 0;
        } else if (typeof val === "number" && k === "rope_slots") {
          s = belay[k] === val ? 1 : 0;
        }
        tot += s;
        cnt++;
      }
      return { belay_data: belay, match_score: cnt ? Math.round((tot / cnt) * 100) : -1 };
    })
    .sort((a, b) =>
      b.match_score !== a.match_score ? b.match_score - a.match_score : Math.random() - 0.5
    );
}

// ═══ FILTER GROUP DEFINITIONS ═══

const USE_CASES_ALL = [
  "gym", "sport_single", "trad_multi", "alpine",
  "big_wall", "top_rope", "ice_mixed", "projecting",
];

function getGroups(activeTypes) {
  const hasActive = activeTypes.includes("active_assisted");
  const tubeOnly = activeTypes.length > 0 && !activeTypes.includes("active_assisted") && !activeTypes.includes("passive_assisted");

  const groups = [
    {
      id: "climbing", label: "Your Climbing", icon: "🧗",
      filters: [
        { key: "best_use_cases", label: "Discipline", type: "multi", options: USE_CASES_ALL },
        { key: "skill_level", label: "Skill Level", type: "multi", options: ["beginner", "intermediate", "advanced", "expert"] },
      ],
    },
    {
      id: "specs", label: "Device Specs", icon: "⚙️",
      filters: [
        { key: "weight_g", label: "Weight (g)", type: "range", min: 50, max: 250, step: 5 },
        { key: "rope_diameter", label: "Rope Diameter (mm)", type: "range", min: 7.0, max: 11.5, step: 0.1 },
        { key: "rope_slots", label: "Rope Slots", type: "single_num", options: [1, 2] },
        { key: "compatible_rope_types", label: "Rope Types", type: "multi", options: ["single", "half", "twin"] },
      ],
    },
    {
      id: "features", label: "Features & Safety", icon: "🛡️",
      filters: [
        { key: "guide_mode", label: "Guide Mode", type: "bool" },
        ...(tubeOnly ? [] : [{ key: "anti_panic", label: "Anti-Panic", type: "bool" }]),
        ...(tubeOnly ? [] : [{ key: "lead_top_switch", label: "Lead/TR Switch", type: "bool" }]),
        { key: "lowering_type", label: "Lowering", type: "multi", options: ["friction_only", "lever", "thumb_loop"] },
      ],
    },
    {
      id: "rappel", label: "Rappel & Versatility", icon: "🪢",
      filters: [
        { key: "rappel_single_strand", label: "Single Strand Rappel", type: "bool" },
        { key: "rappel_double_strand", label: "Double Strand Rappel", type: "bool" },
        { key: "eco_design", label: "Eco Design", type: "bool" },
      ],
    },
    {
      id: "price", label: "Price", icon: "💰",
      filters: [
        { key: "price_eur_min", label: "Price (€)", type: "range", min: 15, max: 160, step: 5 },
      ],
    },
  ];
  return groups;
}

// ═══ UI PRIMITIVES ═══

function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: "20px",
        border: active ? "1.5px solid #E8734A" : "1.5px solid #3a3f47",
        background: active ? "rgba(232,115,74,0.15)" : "transparent",
        color: active ? "#E8734A" : "#9ca3af",
        fontSize: "12px", fontFamily: "'DM Sans',sans-serif",
        fontWeight: active ? 600 : 400, cursor: "pointer",
        transition: "all .2s", textTransform: "capitalize", whiteSpace: "nowrap",
      }}
    >
      {String(label).replace(/_/g, " ")}
    </button>
  );
}

function SingleNum({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {options.map((o) => (
        <Chip key={o} label={o} active={value === o} onClick={() => onChange(value === o ? null : o)} />
      ))}
    </div>
  );
}

function Multi({ options, value = [], onChange }) {
  const toggle = (o) => {
    const next = value.includes(o) ? value.filter((v) => v !== o) : [...value, o];
    onChange(next);
  };
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {options.map((o) => (
        <Chip key={o} label={o} active={value.includes(o)} onClick={() => toggle(o)} />
      ))}
    </div>
  );
}

function Range({ min, max, step, value = {}, onChange }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <input
        type="number" placeholder={min} min={min} max={max} step={step}
        value={value.min ?? ""}
        onChange={(e) => onChange({ ...value, min: e.target.value ? Number(e.target.value) : null })}
        style={{
          width: "72px", padding: "6px 8px", borderRadius: "8px",
          border: "1px solid #3a3f47", background: "#1a1d23", color: "#e5e7eb",
          fontSize: "12px", fontFamily: "'DM Mono',monospace",
        }}
      />
      <span style={{ color: "#6b7280", fontSize: "12px" }}>–</span>
      <input
        type="number" placeholder={max} min={min} max={max} step={step}
        value={value.max ?? ""}
        onChange={(e) => onChange({ ...value, max: e.target.value ? Number(e.target.value) : null })}
        style={{
          width: "72px", padding: "6px 8px", borderRadius: "8px",
          border: "1px solid #3a3f47", background: "#1a1d23", color: "#e5e7eb",
          fontSize: "12px", fontFamily: "'DM Mono',monospace",
        }}
      />
    </div>
  );
}

function Bool({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      <Chip label="Yes" active={value === true} onClick={() => onChange(value === true ? null : true)} />
      <Chip label="No" active={value === false} onClick={() => onChange(value === false ? null : false)} />
    </div>
  );
}

// ═══ BELAY DEVICE SVG ═══

function BelaySVG({ device, width = 120, height = 100 }) {
  const c1 = device.device_color_1 || "#4a4a4a";
  const c2 = device.device_color_2 || "#e8734a";
  const isActive = device.device_type === "active_assisted";
  const isTube = device.device_type === "tube" || device.device_type === "tube_guide";
  const isPassive = device.device_type === "passive_assisted";

  if (isActive) {
    // Cam device shape — rounded rectangle with lever
    return (
      <svg viewBox="0 0 120 100" width={width} height={height}>
        <defs>
          <linearGradient id={`bg-${device.slug}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        {/* Body */}
        <rect x="25" y="15" width="55" height="65" rx="12" fill={`url(#bg-${device.slug})`} opacity="0.9" />
        {/* Plate opening */}
        <rect x="35" y="22" width="35" height="18" rx="5" fill="#0d1117" opacity="0.6" />
        {/* Cam arc */}
        <path d="M50 40 Q60 55 70 40" stroke={c2} strokeWidth="2.5" fill="none" opacity="0.8" />
        {/* Lever */}
        <rect x="68" y="50" width="22" height="8" rx="4" fill={c2} opacity="0.7" />
        {/* Carabiner hole */}
        <circle cx="52" cy="75" r="5" fill="none" stroke="#9ca3af" strokeWidth="1.5" opacity="0.5" />
        {/* Rope line */}
        <path d="M52 10 Q48 22 52 40 Q56 58 52 75" stroke="#e8734a" strokeWidth="1.5" fill="none" strokeDasharray="3,2" opacity="0.4" />
      </svg>
    );
  }

  if (isPassive) {
    // Passive tube with thumb loop
    return (
      <svg viewBox="0 0 120 100" width={width} height={height}>
        <defs>
          <linearGradient id={`bg-${device.slug}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        {/* Body — thinner than active */}
        <rect x="30" y="18" width="45" height="55" rx="8" fill={`url(#bg-${device.slug})`} opacity="0.9" />
        {/* Rope slots */}
        <ellipse cx="45" cy="35" rx="6" ry="9" fill="#0d1117" opacity="0.6" />
        {device.rope_slots === 2 && <ellipse cx="60" cy="35" rx="6" ry="9" fill="#0d1117" opacity="0.6" />}
        {/* Thumb loop */}
        <path d="M65 55 Q78 50 75 65 Q72 75 65 72" stroke={c2} strokeWidth="2" fill="none" opacity="0.7" />
        {/* Cable/attachment */}
        <circle cx="52" cy="70" r="4" fill="none" stroke="#9ca3af" strokeWidth="1.5" opacity="0.5" />
        {/* Brake assist indicator */}
        <circle cx="42" cy="60" r="2" fill={c2} opacity="0.6" />
      </svg>
    );
  }

  // Tube / Tube Guide
  return (
    <svg viewBox="0 0 120 100" width={width} height={height}>
      <defs>
        <linearGradient id={`bg-${device.slug}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      {/* Body — slim plate shape */}
      <rect x="28" y="20" width="50" height="50" rx="10" fill={`url(#bg-${device.slug})`} opacity="0.9" />
      {/* Rope slots */}
      <ellipse cx="43" cy="38" rx="6" ry="10" fill="#0d1117" opacity="0.6" />
      {device.rope_slots === 2 && <ellipse cx="63" cy="38" rx="6" ry="10" fill="#0d1117" opacity="0.6" />}
      {/* Guide mode loop (if applicable) */}
      {device.guide_mode && (
        <path d="M53 20 Q53 12 60 12 Q67 12 67 20" stroke="#9ca3af" strokeWidth="1.5" fill="none" opacity="0.5" />
      )}
      {/* Cable/attachment */}
      <circle cx="53" cy="66" r="4" fill="none" stroke="#9ca3af" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

// ═══ TYPE BADGE ═══

const TYPE_COLORS = {
  active_assisted: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", icon: "⚡" },
  passive_assisted: { bg: "rgba(168,85,247,0.15)", color: "#a855f7", icon: "🔒" },
  tube_guide: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", icon: "🔄" },
  tube: { bg: "rgba(107,114,128,0.15)", color: "#9ca3af", icon: "⊘" },
};

function TypeBadge({ type }) {
  const t = TYPE_COLORS[type] || TYPE_COLORS.tube;
  const label = String(type).replace(/_/g, " ");
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        padding: "3px 10px", borderRadius: "12px",
        background: t.bg, color: t.color,
        fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {t.icon} {label}
    </span>
  );
}

// ═══ SMALL TAGS ═══

function SmallTag({ label, variant = "default" }) {
  const styles = {
    default: { bg: "rgba(107,114,128,0.15)", color: "#9ca3af" },
    safety: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
    feature: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
    eco: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  };
  const s = styles[variant] || styles.default;
  return (
    <span
      style={{
        padding: "2px 8px", borderRadius: "8px",
        background: s.bg, color: s.color,
        fontSize: "10px", fontWeight: 500, whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function getTags(d) {
  const tags = [];
  if (d.anti_panic) tags.push({ label: "Anti-Panic", variant: "safety" });
  if (d.guide_mode) tags.push({ label: "Guide Mode", variant: "feature" });
  if (d.lead_top_switch) tags.push({ label: "Lead/TR Switch", variant: "safety" });
  if (d.rappel_double_strand) tags.push({ label: "Double Rappel", variant: "feature" });
  if (d.eco_design) tags.push({ label: "Eco", variant: "eco" });
  if (d.mechanical_advantage) tags.push({ label: d.mechanical_advantage, variant: "feature" });
  return tags;
}

// ═══ BELAY CARD ═══

function BelayCard({ belay, matchScore, onClick }) {
  const d = belay;
  const tags = getTags(d);
  const price = d.price_eur_min || d.price_uvp_eur;
  const hasDiscount = d.price_eur_min && d.price_uvp_eur && d.price_eur_min < d.price_uvp_eur;

  return (
    <div
      onClick={onClick}
      style={{
        background: "#14171c", borderRadius: "16px", padding: "20px",
        border: "1px solid #23272f", cursor: "pointer",
        transition: "all .2s", position: "relative",
        display: "flex", flexDirection: "column", gap: "12px",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#23272f"; e.currentTarget.style.transform = "none"; }}
    >
      {/* Heart + Match badge */}
      <HeartButton type="belay" slug={d.slug} style={{
        position: "absolute", top: "12px", right: "12px", zIndex: 2,
      }} />
      {matchScore >= 0 && (
        <div
          style={{
            position: "absolute", top: "12px", right: "40px",
            background: matchScore >= 75 ? "rgba(34,197,94,0.15)" : matchScore >= 50 ? "rgba(234,179,8,0.15)" : "rgba(239,68,68,0.15)",
            color: matchScore >= 75 ? "#22c55e" : matchScore >= 50 ? "#eab308" : "#ef4444",
            padding: "4px 10px", borderRadius: "10px",
            fontSize: "12px", fontWeight: 700, fontFamily: "'DM Mono',monospace",
          }}
        >
          {matchScore}%
        </div>
      )}

      {/* SVG + Info */}
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0 }}>
          <BelaySVG device={d} width={90} height={75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "4px" }}>
            <TypeBadge type={d.device_type} />
          </div>
          <div style={{ color: "#9ca3af", fontSize: "11px", fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            {d.brand}
          </div>
          <div style={{ color: "#e5e7eb", fontSize: "16px", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
            {d.model}
          </div>
        </div>
      </div>

      {/* Quick specs */}
      <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>
        <span>{d.weight_g}g</span>
        <span>{d.rope_diameter_min_mm}–{d.rope_diameter_max_mm}mm</span>
        <span>{d.rope_slots === 2 ? "2 slots" : "1 slot"}</span>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {tags.slice(0, 4).map((t, i) => (
            <SmallTag key={i} label={t.label} variant={t.variant} />
          ))}
        </div>
      )}

      {/* Price */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "auto" }}>
        <span style={{ color: "#e5e7eb", fontSize: "18px", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
          €{fmt(price)}
        </span>
        {hasDiscount && (
          <>
            <span style={{ color: "#6b7280", fontSize: "12px", textDecoration: "line-through" }}>
              €{fmt(d.price_uvp_eur)}
            </span>
            <span style={{ color: "#22c55e", fontSize: "11px", fontWeight: 600 }}>
              -{Math.round(((d.price_uvp_eur - d.price_eur_min) / d.price_uvp_eur) * 100)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ═══ FILTER SIDEBAR ═══

function FilterSidebarContent({ groups, filters, setFilter, activeTypes, setActiveTypes }) {
  const [openGroup, setOpenGroup] = useState("climbing");
  const activeCount = Object.entries(filters).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v) && !v.length) return false;
    if (typeof v === "object" && !Array.isArray(v) && v.min == null && v.max == null) return false;
    return true;
  }).length;

  const DEVICE_TYPES = [
    { key: "active_assisted", label: "Cam ⚡", color: "#ef4444" },
    { key: "passive_assisted", label: "Passive 🔒", color: "#a855f7" },
    { key: "tube_guide", label: "Tube Guide 🔄", color: "#3b82f6" },
    { key: "tube", label: "Tube ⊘", color: "#9ca3af" },
  ];

  return (
    <>
      {/* Hard filter: Device type */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ color: "#6b7280", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
          Device Type
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {DEVICE_TYPES.map(({ key, label, color }) => {
            const active = activeTypes.includes(key);
            return (
              <button
                key={key}
                onClick={() =>
                  setActiveTypes(
                    active ? activeTypes.filter((t) => t !== key) : [...activeTypes, key]
                  )
                }
                style={{
                  padding: "5px 12px", borderRadius: "16px",
                  border: `1.5px solid ${active ? color : "#3a3f47"}`,
                  background: active ? `${color}22` : "transparent",
                  color: active ? color : "#6b7280",
                  fontSize: "11px", fontWeight: active ? 600 : 400,
                  cursor: "pointer", transition: "all .2s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active filter count + reset */}
      {activeCount > 0 && (
        <button
          onClick={() => {
            groups.forEach((g) => g.filters.forEach((f) => setFilter(f.key, f.type === "multi" ? [] : null)));
          }}
          style={{
            width: "100%", padding: "6px", borderRadius: "8px",
            border: "1px solid #3a3f47", background: "transparent",
            color: "#ef4444", fontSize: "11px", cursor: "pointer",
            marginBottom: "12px",
          }}
        >
          Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
        </button>
      )}

      {/* Filter groups */}
      {groups.map((g) => {
        const isOpen = openGroup === g.id;
        const groupActive = g.filters.some((f) => {
          const v = filters[f.key];
          if (v == null) return false;
          if (Array.isArray(v) && !v.length) return false;
          if (typeof v === "object" && !Array.isArray(v) && v.min == null && v.max == null) return false;
          return true;
        });
        return (
          <div key={g.id} style={{ marginBottom: "4px" }}>
            <button
              onClick={() => setOpenGroup(isOpen ? null : g.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 12px", borderRadius: "10px",
                border: "none", background: isOpen ? "#1a1d23" : "transparent",
                color: "#e5e7eb", fontSize: "13px", fontWeight: 500,
                cursor: "pointer", textAlign: "left", transition: "all .15s",
              }}
            >
              <span>{g.icon}</span>
              <span style={{ flex: 1 }}>{g.label}</span>
              {groupActive && (
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#E8734A" }} />
              )}
              <span style={{ color: "#6b7280", fontSize: "11px" }}>{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "8px 12px 16px", display: "flex", flexDirection: "column", gap: "14px" }}>
                {g.filters.map((f) => (
                  <div key={f.key}>
                    <div style={{ color: "#9ca3af", fontSize: "11px", fontWeight: 500, marginBottom: "6px" }}>
                      {f.label}
                    </div>
                    {f.type === "multi" && (
                      <Multi options={f.options} value={filters[f.key] || []} onChange={(v) => setFilter(f.key, v)} />
                    )}
                    {f.type === "single_num" && (
                      <SingleNum options={f.options} value={filters[f.key]} onChange={(v) => setFilter(f.key, v)} />
                    )}
                    {f.type === "range" && (
                      <Range min={f.min} max={f.max} step={f.step} value={filters[f.key] || {}} onChange={(v) => setFilter(f.key, v)} />
                    )}
                    {f.type === "bool" && (
                      <Bool value={filters[f.key]} onChange={(v) => setFilter(f.key, v)} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ═══ MAIN APP ═══

export default function BelayApp({ belays = [], src }) {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const [activeTypes, setActiveTypes] = useState([]);
  const [filters, setFilters] = useState({});
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const setFilter = (k, v) => setFilters((p) => ({ ...p, [k]: v }));

  const groups = useMemo(() => getGroups(activeTypes), [activeTypes]);

  const filtered = useMemo(() => {
    let pool = belays;
    if (activeTypes.length) pool = pool.filter((b) => activeTypes.includes(b.device_type));
    return score(pool, filters);
  }, [belays, activeTypes, filters]);

  const ac = Object.entries(filters).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v) && !v.length) return false;
    if (typeof v === "object" && !Array.isArray(v) && v.min == null && v.max == null) return false;
    return true;
  }).length;

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#e5e7eb", fontFamily: "'DM Sans',sans-serif" }}>
      {/* Sub-header: filters + count */}
      <header style={{
        position: "sticky", top: isMobile ? "44px" : "50px", zIndex: 100,
        display: "flex", alignItems: "center", gap: isMobile ? "8px" : "16px",
        flexWrap: isMobile ? "wrap" : "nowrap",
        padding: isMobile ? "8px 12px" : "0 24px",
        minHeight: isMobile ? undefined : "50px",
        background: "rgba(13,17,23,.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #23272f",
      }}>
        {isMobile && (
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            style={{
              padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 500,
              color: ac > 0 ? "#E8734A" : "#6b7280",
              cursor: "pointer", border: `1px solid ${ac > 0 ? "#E8734A" : "#3a3f47"}`,
              background: ac > 0 ? "rgba(232,115,74,0.1)" : "transparent",
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            ☰ Filters{ac > 0 ? ` (${ac})` : ""}
          </button>
        )}

        <span style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap", marginLeft: isMobile ? "auto" : undefined }}>
          {filtered.length} device{filtered.length !== 1 ? "s" : ""}
        </span>

        {ac > 0 && (
          <button
            onClick={() => { setFilters({}); setActiveTypes([]); }}
            style={{
              padding: "6px 16px", borderRadius: "20px",
              border: "1px solid #3a3f47", background: "transparent",
              color: "#9ca3af", fontSize: "12px", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
              marginLeft: isMobile ? undefined : "auto",
            }}
          >
            Clear all
          </button>
        )}
      </header>

      {/* Mobile filter overlay */}
      {isMobile && showMobileFilters && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
          background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)",
        }} onClick={() => setShowMobileFilters(false)}>
          <div
            style={{
              position: "absolute", top: 0, right: 0, bottom: 0,
              width: "85vw", maxWidth: "340px", background: "#14171c",
              overflowY: "auto", borderLeft: "1px solid #23272f",
              animation: "slideInRight .25s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #23272f" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#f0f0f0" }}>Filters</span>
              <button
                onClick={() => setShowMobileFilters(false)}
                style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "22px", cursor: "pointer", padding: "4px" }}
              >×</button>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <FilterSidebarContent
                groups={groups}
                filters={filters}
                setFilter={setFilter}
                activeTypes={activeTypes}
                setActiveTypes={setActiveTypes}
              />
            </div>
            <div style={{ padding: "16px 20px" }}>
              <button
                onClick={() => setShowMobileFilters(false)}
                style={{
                  width: "100%", padding: "12px", borderRadius: "10px",
                  background: "#E8734A", color: "#fff", border: "none",
                  fontSize: "14px", fontWeight: 600, cursor: "pointer",
                }}
              >
                Show {filtered.length} device{filtered.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ display: "flex", gap: "24px", padding: isMobile ? "16px 12px" : "24px 32px", alignItems: "flex-start" }}>
        {/* Desktop sidebar */}
        {!isMobile && (
          <div style={{ width: "280px", flexShrink: 0 }}>
            <FilterSidebarContent
              groups={groups}
              filters={filters}
              setFilter={setFilter}
              activeTypes={activeTypes}
              setActiveTypes={setActiveTypes}
            />
          </div>
        )}

        {/* Results */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {isMobile ? (
              <>
                <span style={{ color: "#6b7280", fontSize: "12px", fontFamily: "'DM Mono',monospace" }}>
                  {filtered.length} device{filtered.length !== 1 ? "s" : ""}
                </span>
                {(ac > 0 || activeTypes.length > 0) && (
                  <button
                    onClick={() => { setFilters({}); setActiveTypes([]); }}
                    style={{ padding: "4px 12px", borderRadius: "16px", border: "1px solid #3a3f47", background: "transparent", color: "#9ca3af", fontSize: "11px", cursor: "pointer" }}
                  >Clear all</button>
                )}
              </>
            ) : (
              <span style={{ color: "#6b7280", fontSize: "13px" }}>
                {filtered.length} device{filtered.length !== 1 ? "s" : ""}
                {src && <span style={{ marginLeft: "8px", fontSize: "11px", color: "#4b5563" }}>({src})</span>}
              </span>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))",
              gap: isMobile ? "14px" : "16px",
            }}
          >
            {filtered.map(({ belay_data: d, match_score: ms }) => (
              <BelayCard
                key={d.slug}
                belay={d}
                matchScore={ms}
                onClick={() => nav(`/belay/${d.slug}`)}
              />
            ))}
          </div>
          {!filtered.length && (
            <div style={{ textAlign: "center", padding: isMobile ? "40px 12px" : "60px 20px", color: "#6b7280" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔗</div>
              <div style={{ fontSize: "16px" }}>No devices match your filters</div>
              <div style={{ fontSize: "13px", marginTop: "8px" }}>Try broadening your criteria</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
