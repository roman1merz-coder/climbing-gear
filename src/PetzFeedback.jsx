import { useState, useMemo } from "react";
import { T } from "./tokens.js";
import SHOES from "./seed_data.json";
import usePageMeta from "./usePageMeta.js";

/*
 * PetzFeedback - Feedback questionnaire for the scanner demo event
 * at PETZ Boulderhalle Neustadt (2026-04-24).
 *
 * Co-branded with climbing-gear.com + PETZ Boulderhalle.
 * Submits via /api/petz-feedback (server-side writes to Supabase `feedback`
 * table with type='petz-event').
 */

/* ─── Small building blocks ─── */

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "6px" }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          aria-label={`${n} von 5`}
          style={{
            width: "48px", height: "48px", borderRadius: "50%",
            border: `1.5px solid ${n <= active ? T.accent : T.border}`,
            background: n <= active ? T.accent : T.surface,
            color: n <= active ? "#fff" : T.muted,
            fontSize: "18px", fontWeight: 700,
            cursor: "pointer", fontFamily: T.font,
            transition: "all 0.15s ease",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function ChipGroup({ options, value, onChange }) {
  return (
    <div style={{
      display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px",
    }}>
      {options.map(opt => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? "" : opt)}
            style={{
              padding: "10px 16px", borderRadius: "999px",
              border: `1.5px solid ${active ? T.accent : T.border}`,
              background: active ? T.accentSoft : T.surface,
              color: active ? T.accent : T.text,
              fontSize: "14px", fontWeight: active ? 700 : 500,
              cursor: "pointer", fontFamily: T.font,
              transition: "all 0.15s ease",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function QBlock({ num, label, children }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: T.radius, padding: "20px 22px", marginBottom: "14px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "10px" }}>
        <span style={{
          fontSize: "13px", fontWeight: 800, color: T.accent,
          background: T.accentSoft, padding: "2px 9px", borderRadius: "999px",
          letterSpacing: "0.5px",
        }}>
          {num}
        </span>
        <div style={{
          fontSize: "16px", fontWeight: 700, color: T.text,
          lineHeight: 1.4, flex: 1,
        }}>
          {label}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ─── Main page ─── */

export default function PetzFeedback() {
  usePageMeta(
    "Feedback · PETZ Boulderhalle × climbing-gear.com",
    "Feedback zum Kletterschuh-Scanner Event in der PETZ Boulderhalle Neustadt."
  );

  const [scanHelpful, setScanHelpful] = useState(0);
  const [desiredFeatures, setDesiredFeatures] = useState("");
  const [tryAtPetz, setTryAtPetz] = useState("");
  const [payPremium, setPayPremium] = useState("");
  const [brandToTry, setBrandToTry] = useState("");
  const [modelToTry, setModelToTry] = useState("");
  const [generalComment, setGeneralComment] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | success | error
  const [errorMsg, setErrorMsg] = useState("");

  // Build brand → models map from the shoe database (same source as the scanner).
  const SHOE_DB = useMemo(() => {
    const db = {};
    for (const s of SHOES) {
      if (!s.brand || !s.model) continue;
      if (!db[s.brand]) db[s.brand] = new Set();
      db[s.brand].add(s.model);
    }
    const out = {};
    Object.keys(db).sort((a, b) => a.localeCompare(b)).forEach(b => {
      out[b] = [...db[b]].sort((a, c) => a.localeCompare(c));
    });
    return out;
  }, []);
  const brands = useMemo(() => Object.keys(SHOE_DB), [SHOE_DB]);
  const models = brandToTry && SHOE_DB[brandToTry] ? SHOE_DB[brandToTry] : [];

  const hasContent =
    scanHelpful > 0 ||
    desiredFeatures.trim() ||
    tryAtPetz ||
    payPremium ||
    brandToTry ||
    modelToTry ||
    generalComment.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasContent || status === "sending") return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/petz-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_helpful: scanHelpful || null,
          desired_features: desiredFeatures.trim(),
          try_at_petz: tryAtPetz,
          pay_premium: payPremium,
          model_to_try: [brandToTry, modelToTry].filter(Boolean).join(" ").trim(),
          general_comment: generalComment.trim(),
          email: email.trim(),
          page_url: typeof window !== "undefined" ? window.location.href : "",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Unbekannter Fehler");
      }
      setStatus("success");
    } catch (err) {
      setErrorMsg(err.message || "Fehler");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4500);
    }
  };

  if (status === "success") {
    return (
      <div style={{
        minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
      }}>
        <div style={{
          maxWidth: "480px", textAlign: "center",
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: "18px", padding: "40px 30px",
        }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>{"\u{1F64F}"}</div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.4px" }}>
            Danke für dein Feedback!
          </h1>
          <p style={{ fontSize: "15px", color: T.muted, lineHeight: 1.7, margin: "0 0 22px" }}>
            Das hilft uns den Scanner und das Angebot für euch in Neustadt weiter zu verbessern. Viel Spaß beim Bouldern!
          </p>
          <a href="https://climbing-gear.com/" style={{
            display: "inline-block", padding: "10px 20px",
            borderRadius: "10px", background: T.accent, color: "#fff",
            fontSize: "13px", fontWeight: 700, textDecoration: "none",
          }}>
            Zur Seite climbing-gear.com
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text,
    }}>
      <div style={{
        maxWidth: "640px", margin: "0 auto", padding: "28px 18px 80px",
      }}>

        {/* Co-branded header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "18px", marginBottom: "22px", flexWrap: "wrap",
        }}>
          <img
            src="/images/logo.svg"
            alt="climbing-gear.com"
            width="48" height="48"
            style={{ display: "block", objectFit: "contain" }}
          />
          <div style={{ fontSize: "14px", fontWeight: 800, color: T.text, lineHeight: 1.2 }}>
            climbing-gear<span style={{ color: T.primary }}>.com</span>
          </div>
          <div style={{
            width: "1px", height: "36px", background: T.border,
          }} />
          <img
            src="/images/brands/petz-boulderhalle.svg"
            alt="PETZ Boulderhalle Neustadt"
            width="48" height="48"
            style={{ display: "block", objectFit: "contain" }}
          />
          <div style={{ fontSize: "14px", fontWeight: 800, color: T.text, lineHeight: 1.2 }}>
            PETZ Boulderhalle<br />
            <span style={{ color: T.muted, fontWeight: 500, fontSize: "12px" }}>Neustadt</span>
          </div>
        </div>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "26px" }}>
          <h1 style={{
            fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px",
            margin: "0 0 10px", lineHeight: 1.2,
          }}>
            Wie war dein Scanner-Erlebnis?
          </h1>
          <p style={{
            fontSize: "14px", color: T.muted, lineHeight: 1.7,
            maxWidth: "480px", margin: "0 auto",
          }}>
            Dein Feedback hilft uns den Fuß-Scanner besser zu machen und herauszufinden,
            ob lokales Probieren & Kaufen von Kletterschuhen in Neustadt Sinn macht.
            Dauert ca. 90 Sekunden.
          </p>
        </div>

        <form onSubmit={handleSubmit}>

          {/* Q1 - Scan hilfreich */}
          <QBlock num="01" label="Wie hilfreich war der Scan für dich?">
            <StarRating value={scanHelpful} onChange={setScanHelpful} />
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: "11px", color: T.muted, marginTop: "6px",
              padding: "0 4px",
            }}>
              <span>gar nicht</span><span>sehr hilfreich</span>
            </div>
          </QBlock>

          {/* Q2 - Welche Funktionen */}
          <QBlock num="02" label="Welche zusätzlichen Funktionen würdest du dir wünschen?">
            <textarea
              value={desiredFeatures}
              onChange={e => setDesiredFeatures(e.target.value)}
              placeholder="z.B. Vergleich zweier Schuhe, andere Disziplinen, …"
              rows={3}
              style={{
                width: "100%", padding: "12px", borderRadius: "10px",
                border: `1px solid ${T.border}`, background: T.surface, color: T.text,
                fontSize: "14px", fontFamily: T.font, resize: "vertical",
                outline: "none", lineHeight: 1.5, boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border}
            />
          </QBlock>

          {/* Q3 - Probieren/Kaufen im Petz */}
          <QBlock num="03" label="Wäre es hilfreich, die Schuhe direkt hier im PETZ probieren & kaufen zu können?">
            <ChipGroup
              options={["Ja, auf jeden Fall", "Vielleicht", "Nein", "Brauche keine neuen Schuhe"]}
              value={tryAtPetz}
              onChange={setTryAtPetz}
            />
          </QBlock>

          {/* Q4 - Premium */}
          <QBlock num="04" label="Wärst du bereit, 10–20 € mehr als online zu zahlen, dafür aber hier zu probieren & sofort mitzunehmen?">
            <ChipGroup
              options={["Ja", "Vielleicht", "Nein"]}
              value={payPremium}
              onChange={setPayPremium}
            />
          </QBlock>

          {/* Q5 - Modell (Brand + Model Dropdowns, gleiche Quelle wie der Scanner) */}
          <QBlock num="05" label="Welches Modell würdest du am liebsten lokal probieren?">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <select
                value={brandToTry}
                onChange={e => {
                  setBrandToTry(e.target.value);
                  setModelToTry("");
                }}
                style={{
                  width: "100%", padding: "12px", borderRadius: "10px",
                  border: `1px solid ${T.border}`, background: T.surface, color: T.text,
                  fontSize: "14px", fontFamily: T.font,
                  outline: "none", boxSizing: "border-box",
                  appearance: "none",
                  WebkitAppearance: "none",
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%237a7462' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  paddingRight: "32px",
                }}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              >
                <option value="">Marke wählen …</option>
                {brands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <select
                value={modelToTry}
                onChange={e => setModelToTry(e.target.value)}
                disabled={!brandToTry}
                style={{
                  width: "100%", padding: "12px", borderRadius: "10px",
                  border: `1px solid ${T.border}`,
                  background: brandToTry ? T.surface : T.bg,
                  color: brandToTry ? T.text : T.muted,
                  fontSize: "14px", fontFamily: T.font,
                  outline: "none", boxSizing: "border-box",
                  cursor: brandToTry ? "pointer" : "not-allowed",
                  appearance: "none",
                  WebkitAppearance: "none",
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%237a7462' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  paddingRight: "32px",
                }}
                onFocus={e => brandToTry && (e.target.style.borderColor = T.accent)}
                onBlur={e => e.target.style.borderColor = T.border}
              >
                <option value="">
                  {brandToTry ? "Modell wählen …" : "zuerst Marke wählen"}
                </option>
                {models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: "11px", color: T.muted, marginTop: "8px", lineHeight: 1.5 }}>
              Kein Wunsch-Modell dabei? Schreib's einfach unten in das Kommentarfeld.
            </div>
          </QBlock>

          {/* Q6 - General comment */}
          <QBlock num="06" label="Sonst noch was auf dem Herzen? (optional)">
            <textarea
              value={generalComment}
              onChange={e => setGeneralComment(e.target.value)}
              placeholder="Ideen, Lob, Kritik, was immer dir einfällt …"
              rows={2}
              style={{
                width: "100%", padding: "12px", borderRadius: "10px",
                border: `1px solid ${T.border}`, background: T.surface, color: T.text,
                fontSize: "14px", fontFamily: T.font, resize: "vertical",
                outline: "none", lineHeight: 1.5, boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border}
            />
          </QBlock>

          {/* Optional email */}
          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: T.radius, padding: "18px 22px", marginBottom: "18px",
          }}>
            <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "4px" }}>
              E-Mail (optional)
            </div>
            <div style={{ fontSize: "12px", color: T.muted, marginBottom: "10px", lineHeight: 1.5 }}>
              Nur wenn du willst, dass wir uns melden – z.B. wenn du ein Modell lokal probieren möchtest oder Neues vom Scanner hören willst.
            </div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="deine@email.de"
              style={{
                width: "100%", padding: "12px", borderRadius: "10px",
                border: `1px solid ${T.border}`, background: T.surface, color: T.text,
                fontSize: "14px", fontFamily: T.font,
                outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border}
            />
          </div>

          {/* Submit */}
          <div style={{
            position: "sticky", bottom: "12px",
            display: "flex", flexDirection: "column", gap: "8px",
          }}>
            <button
              type="submit"
              disabled={!hasContent || status === "sending"}
              style={{
                width: "100%", padding: "16px", borderRadius: "12px", border: "none",
                background: status === "error" ? T.red : hasContent ? T.accent : T.border,
                color: "#fff",
                fontSize: "16px", fontWeight: 800, fontFamily: T.font,
                cursor: hasContent && status !== "sending" ? "pointer" : "not-allowed",
                letterSpacing: "0.3px",
                boxShadow: hasContent ? "0 6px 18px rgba(201,138,66,0.25)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              {status === "sending" ? "Wird gesendet …" :
               status === "error" ? "Fehler – nochmal versuchen" :
               "Feedback senden"}
            </button>
            {status === "error" && errorMsg && (
              <div style={{
                fontSize: "12px", color: T.red, textAlign: "center",
                background: T.redSoft, padding: "8px", borderRadius: "8px",
              }}>
                {errorMsg}
              </div>
            )}
            {status === "idle" && !hasContent && (
              <div style={{ fontSize: "11px", color: T.muted, textAlign: "center" }}>
                Bitte mindestens eine Frage beantworten.
              </div>
            )}
          </div>

        </form>

        {/* Footer */}
        <div style={{
          marginTop: "24px", textAlign: "center",
          fontSize: "11px", color: T.muted, lineHeight: 1.6,
        }}>
          Live-Event in der PETZ Boulderhalle, 24. April 2026 · climbing-gear.com × PETZ
        </div>

      </div>
    </div>
  );
}
