import { Link, useLocation } from "react-router-dom";
import { T } from "./tokens.js";

const S = {
  page: { minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text },
  header: {
    padding: "20px 32px", borderBottom: `1px solid ${T.border}`,
    background: T.bg,
  },
  back: { display: "inline-flex", alignItems: "center", gap: "8px", color: T.text, textDecoration: "none", fontWeight: 600, fontSize: "14px" },
  wrap: { maxWidth: "720px", margin: "0 auto", padding: "48px 32px 80px" },
  h1: { fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: "8px" },
  subtitle: { fontSize: "13px", color: T.muted, marginBottom: "40px" },
  h2: { fontSize: "18px", fontWeight: 700, marginTop: "36px", marginBottom: "12px", color: T.text },
  p: { fontSize: "14px", color: T.muted, lineHeight: 1.8, marginBottom: "16px" },
};

function Impressum() {
  return (
    <>
      <h1 style={S.h1}>Impressum</h1>
      <p style={S.subtitle}>{"Angaben gem\u00e4\u00df \u00a7 5 TMG"}</p>

      <h2 style={S.h2}>Verantwortlich</h2>
      <p style={S.p}>
        Roman Merz<br />
        {"Von-Hutten-Stra\u00dfe 22"}<br />
        67489 Kirrweiler<br />
        Deutschland
      </p>

      <h2 style={S.h2}>Kontakt</h2>
      <p style={S.p}>E-Mail: roman@climbing-gear.com</p>

      <h2 style={S.h2}>Haftungsausschluss</h2>
      <p style={S.p}>
        {"Die Inhalte dieser Website werden mit gr\u00f6\u00dftm\u00f6glicher Sorgfalt erstellt. Der Anbieter \u00fcbernimmt jedoch keine Gew\u00e4hr f\u00fcr die Richtigkeit, Vollst\u00e4ndigkeit und Aktualit\u00e4t der bereitgestellten Inhalte."}
      </p>
      <p style={S.p}>
        {"Als Diensteanbieter sind wir gem\u00e4\u00df \u00a7 7 Abs. 1 TMG f\u00fcr eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach \u00a7\u00a7 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, \u00fcbermittelte oder gespeicherte fremde Informationen zu \u00fcberwachen."}
      </p>

      <h2 style={S.h2}>Affiliate-Links</h2>
      <p style={S.p}>
        {"Diese Website enth\u00e4lt Affiliate-Links zu Partnerh\u00e4ndlern. Wenn Sie \u00fcber diese Links ein Produkt kaufen, erhalten wir m\u00f6glicherweise eine Provision. Der Preis f\u00fcr Sie \u00e4ndert sich dadurch nicht. Wir empfehlen nur Produkte, von denen wir \u00fcberzeugt sind."}
      </p>

      <h2 style={S.h2}>Urheberrecht</h2>
      <p style={S.p}>
        {"Die durch den Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Produktbilder und -beschreibungen stammen von den jeweiligen Herstellern und H\u00e4ndlern und werden mit deren Genehmigung verwendet."}
      </p>
    </>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <h1 style={S.h1}>{"Datenschutzerkl\u00e4rung"}</h1>
      <p style={S.subtitle}>Privacy Policy</p>

      <h2 style={S.h2}>1. Verantwortlicher</h2>
      <p style={S.p}>
        {"Verantwortlich f\u00fcr die Datenverarbeitung auf dieser Website ist:"}<br />
        Roman Merz {"\u2014"} roman@climbing-gear.com
      </p>

      <h2 style={S.h2}>2. Hosting</h2>
      <p style={S.p}>
        Diese Website wird bei Vercel Inc. (San Francisco, USA) gehostet.
        Beim Besuch der Website werden automatisch Informationen (z.B. IP-Adresse,
        Browsertyp, Zeitpunkt des Zugriffs) in Server-Logfiles gespeichert.
        Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).
      </p>

      <h2 style={S.h2}>3. Datenbank</h2>
      <p style={S.p}>
        Produktdaten werden bei Supabase (Singapore Pte. Ltd.) gespeichert.
        Es werden keine personenbezogenen Daten der Nutzer in der Datenbank erfasst.
      </p>

      <h2 style={S.h2}>4. Cookies</h2>
      <p style={S.p}>
        Diese Website verwendet keine Cookies und keine Tracking-Tools.
        Es werden keine personenbezogenen Daten zu Werbezwecken erhoben.
      </p>

      <h2 style={S.h2}>5. Affiliate-Links</h2>
      <p style={S.p}>
        {"Wenn Sie auf einen Affiliate-Link klicken, werden Sie auf die Website des jeweiligen H\u00e4ndlers weitergeleitet. Dort gelten die Datenschutzbestimmungen des H\u00e4ndlers. Der Affiliate-Partner (AWIN) setzt ggf. ein Cookie zur Zuordnung der Transaktion. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO."}
      </p>

      <h2 style={S.h2}>6. Ihre Rechte</h2>
      <p style={S.p}>
        {"Sie haben das Recht auf Auskunft, Berichtigung, L\u00f6schung, Einschr\u00e4nkung der Verarbeitung, Daten\u00fcbertragbarkeit und Widerspruch. Wenden Sie sich dazu an: roman@climbing-gear.com"}
      </p>

      <h2 style={S.h2}>7. Beschwerderecht</h2>
      <p style={S.p}>
        {"Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbeh\u00f6rde zu beschweren."}
      </p>
    </>
  );
}

export default function Legal() {
  const location = useLocation();
  const isPrivacy = location.pathname === "/privacy";

  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to="/" style={S.back}>{"\u2190"} Home</Link>
      </header>
      <div style={S.wrap}>
        {isPrivacy ? <PrivacyPolicy /> : <Impressum />}
      </div>
    </div>
  );
}
