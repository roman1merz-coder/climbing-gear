// api/analyze-foot.js — Vercel Serverless Function
// Receives 3 foot photos + shoe size, calls vision API,
// returns structured foot shape analysis for climbing shoe fitting.
//
// Architecture: Landmark-based approach
//   1. Vision model identifies 16 anatomical landmarks as pixel coordinates
//   2. Backend computes all ratios mathematically from coordinates
//   3. Separates perception (AI) from calculation (math) for accuracy
//
// Env vars needed (set in Vercel dashboard):
//   ANTHROPIC_API_KEY — from console.anthropic.com
//
// Research-backed anthropometric references:
//   Width/length (foot index): mean 38.6% ±2.2 (IOSR Journal, Nepalese study)
//   Arch Height Index (AHI): standing mean 0.34 ±0.03 (PMC3396578)
//     High arch > 0.356, Low arch < 0.275
//   Arch-to-total ratio: ~0.72–0.74 avg (Brannock device standard)
//   Heel width: typically 60–70% of forefoot width
//
// Landmark sources:
//   Structure SDK 3.5 (8 landmarks), TU Delft parametric model (22 landmarks),
//   IBV/PLOS ONE (5 physical + 22 measurements), INFOOT scanner (20 points),
//   Standard podiatric practice (6 bony landmarks)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-5-20250929";

const ANALYSIS_PROMPT = `You are a foot landmark detector for climbing shoe fitting. You will receive 3 photos of a bare human foot taken from specific angles. Your ONLY job is to identify anatomical landmarks and return their pixel coordinates.

PHOTOS PROVIDED:
1. TOP VIEW — phone held horizontally above the foot, looking straight down
2. SIDE VIEW — phone held horizontally on the floor beside the foot, shooting the medial (inner) profile
3. HEEL VIEW — phone held horizontally on the floor behind the foot, shooting the rear

TASK: For each photo, identify the specified landmarks and return their [x, y] pixel coordinates. The origin [0, 0] is the top-left corner of each image.

## TOP VIEW LANDMARKS (8 points)
Identify these on IMAGE 1:
- toe_1: Tip of the 1st (big) toe — the most anterior point of the big toe
- toe_2: Tip of the 2nd toe
- toe_3: Tip of the 3rd (middle) toe
- toe_4: Tip of the 4th toe
- toe_5: Tip of the 5th (little) toe — the most anterior point of the pinky toe
- met_tibiale: Metatarsal tibiale — the most medial (inner) point at the ball of the foot, where the foot is widest
- met_fibulare: Metatarsal fibulare — the most lateral (outer) point at the ball of the foot, where the foot is widest
- pternion: Pternion — the most posterior (rearmost) point of the heel

## SIDE VIEW LANDMARKS (5 points)
Identify these on IMAGE 2 (medial/inner profile, toes pointing right):
- heel_floor: Where the heel contacts the ground — bottom-rear of the heel
- toe_floor: Where the front of the foot meets the ground — bottom of the toes at ground level
- instep_apex: The highest point on the dorsum (top surface) of the foot, typically at or near the midfoot
- mtp_joint: The 1st metatarsophalangeal joint — the bump/widening visible on the bottom profile at the ball of the foot
- navicular: The navicular tuberosity — the bony bump on the inner arch, roughly between the heel and ball of foot

## HEEL VIEW LANDMARKS (3 points)
Identify these on IMAGE 3 (posterior view):
- heel_medial: The widest point of the heel on the medial (inner) side
- heel_lateral: The widest point of the heel on the lateral (outer) side
- achilles_mid: The midpoint of the Achilles tendon at the top-center of the heel contour

## CONFIDENCE
- "high": All 3 photos clear, correct angles, foot outline fully visible, all landmarks identifiable
- "medium": Acceptable but some landmarks uncertain due to angle, lighting, or partial occlusion
- "low": Poor quality, wrong angle, or foot hard to distinguish

CRITICAL: If any image does NOT clearly show a bare human foot, set "foot_detected" to false and return null for that image's landmarks. Do NOT guess.

Return ONLY valid JSON, no markdown fences, no explanation:
{
  "foot_detected": true,
  "confidence": "high",
  "top": {
    "toe_1": [x, y],
    "toe_2": [x, y],
    "toe_3": [x, y],
    "toe_4": [x, y],
    "toe_5": [x, y],
    "met_tibiale": [x, y],
    "met_fibulare": [x, y],
    "pternion": [x, y]
  },
  "side": {
    "heel_floor": [x, y],
    "toe_floor": [x, y],
    "instep_apex": [x, y],
    "mtp_joint": [x, y],
    "navicular": [x, y]
  },
  "heel": {
    "heel_medial": [x, y],
    "heel_lateral": [x, y],
    "achilles_mid": [x, y]
  },
  "notes": "Brief observation about landmark visibility or any issues."
}`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured. Add it to Vercel environment variables." });
  }

  try {
    const { images, shoe_size_eu } = req.body;

    if (!images?.top || !images?.side || !images?.heel) {
      return res.status(400).json({ error: "All 3 photos required (top, side, heel)" });
    }
    if (!shoe_size_eu) {
      return res.status(400).json({ error: "Shoe size required" });
    }

    // Call Claude Vision API with all 3 images
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `${ANALYSIS_PROMPT}\n\nUser's EU street shoe size: ${shoe_size_eu}` },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: images.top } },
              { type: "text", text: "IMAGE 1 OF 3: TOP VIEW (phone horizontal above foot, looking straight down)" },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: images.side } },
              { type: "text", text: "IMAGE 2 OF 3: SIDE VIEW (phone horizontal on floor beside foot, medial profile, toes pointing right)" },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: images.heel } },
              { type: "text", text: "IMAGE 3 OF 3: HEEL VIEW (phone horizontal on floor behind foot, posterior view)" },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Anthropic API error:", response.status, errBody);
      return res.status(502).json({ error: "AI analysis failed. Please try again." });
    }

    const apiResult = await response.json();
    const content = apiResult.content?.[0]?.text;

    if (!content) {
      return res.status(502).json({ error: "Empty response from AI" });
    }

    // Parse JSON (strip any accidental markdown fencing)
    let parsed;
    try {
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return res.status(502).json({ error: "Failed to parse analysis results" });
    }

    // Validate foot detection
    if (!parsed.foot_detected) {
      return res.status(200).json({
        foot_detected: false,
        confidence: "low",
        notes: parsed.notes || "Could not detect a foot in the provided images.",
      });
    }

    // --- Compute ratios from landmarks ---
    const { top, side, heel } = parsed;

    // Helper: Euclidean distance between two [x,y] points
    const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);

    // TOP VIEW: foot length, forefoot width, toe shape
    const foot_length = dist(top.pternion, farthestToe(top));
    const forefoot_width = dist(top.met_tibiale, top.met_fibulare);
    const width_ratio = clamp(forefoot_width / foot_length, 0.30, 0.48);

    // TOP VIEW: toe shape classification
    // Project all toe tips onto the heel-to-longest-toe axis to get relative lengths
    const toe_shape = classifyToeShape(top);

    // SIDE VIEW: instep height index (volume proxy)
    // instep_apex height above ground line / total foot length along ground
    const ground_length_side = Math.abs(side.toe_floor[0] - side.heel_floor[0]);
    const ground_y = side.heel_floor[1]; // ground level = heel floor y
    const instep_height = ground_y - side.instep_apex[1]; // y axis is inverted (top=0)
    const instep_ratio = clamp(
      ground_length_side > 0 ? instep_height / ground_length_side : 0.34,
      0.24, 0.44
    );

    // SIDE VIEW: arch-to-length ratio
    // Distance from MTP joint to heel along ground / total ground length
    const mtp_to_heel = Math.abs(side.mtp_joint[0] - side.heel_floor[0]);
    const arch_ratio = clamp(
      ground_length_side > 0 ? mtp_to_heel / ground_length_side : 0.73,
      0.64, 0.82
    );

    // HEEL VIEW: heel width ratio (relative to forefoot width from top view)
    // We can't directly compare pixel distances across different photos,
    // so we compute heel_width / heel_height as a shape ratio, then map it
    // to the forefoot-relative scale using the known population range.
    // Alternative: use the heel view's own proportions.
    const heel_pixel_width = dist(heel.heel_medial, heel.heel_lateral);
    const heel_height = Math.abs(heel.achilles_mid[1] - ((heel.heel_medial[1] + heel.heel_lateral[1]) / 2));
    // Heel aspect ratio: wider heel = higher ratio
    // Map to forefoot-relative range using population reference (0.60-0.70 average)
    const heel_aspect = heel_height > 0 ? heel_pixel_width / heel_height : 1.0;
    // Empirical mapping: heel_aspect ~1.5–3.0 maps to heel_ratio ~0.45–0.85
    const heel_ratio = clamp(mapRange(heel_aspect, 1.2, 3.5, 0.45, 0.85), 0.45, 0.85);

    // Compute navicular height for future use (arch type indicator)
    const navicular_height = ground_y - side.navicular[1];
    const navicular_ratio = ground_length_side > 0 ? navicular_height / ground_length_side : null;

    const confidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium";

    const result = {
      foot_detected: true,

      // Core measurements (same API shape as before for backward compat)
      toe_shape: toe_shape.classification,
      toe_confidence: toe_shape.confidence,
      width_ratio,
      instep_ratio,
      heel_ratio,
      arch_ratio,
      confidence,
      notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 300) : "",

      // Derived categories for ShoeFinder URL params
      volume: instep_ratio < 0.310 ? "low" : instep_ratio > 0.360 ? "high" : "standard",
      width: width_ratio < 0.365 ? "narrow" : width_ratio > 0.405 ? "wide" : "medium",
      heel_width: heel_ratio < 0.58 ? "narrow" : heel_ratio > 0.72 ? "wide" : "medium",

      // Raw landmarks for database storage and future visualization
      landmarks: {
        top: top,
        side: side,
        heel: heel,
      },

      // Additional computed metrics for database
      navicular_ratio: navicular_ratio ? clamp(navicular_ratio, 0.05, 0.30) : null,
    };

    return res.status(200).json(result);

  } catch (err) {
    console.error("Foot analysis error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- Toe shape classification ---
// Uses relative y-coordinates of toe tips (top view, toes pointing up = lower y = longer toe)
function classifyToeShape(top) {
  const toes = [
    { name: "toe_1", y: top.toe_1[1] },
    { name: "toe_2", y: top.toe_2[1] },
    { name: "toe_3", y: top.toe_3[1] },
    { name: "toe_4", y: top.toe_4[1] },
    { name: "toe_5", y: top.toe_5[1] },
  ];

  // Lower y = more anterior = longer toe (image origin is top-left)
  // But we need to account for foot orientation. Use pternion as reference.
  // Project toe tips onto the pternion→acropodion axis for orientation-independent lengths.
  const pternion = top.pternion;
  const acropodion = farthestToe(top); // the longest toe tip

  // Foot axis vector
  const axis = [acropodion[0] - pternion[0], acropodion[1] - pternion[1]];
  const axisLen = Math.sqrt(axis[0] ** 2 + axis[1] ** 2);
  if (axisLen === 0) return { classification: "egyptian", confidence: 0.5 };
  const axisNorm = [axis[0] / axisLen, axis[1] / axisLen];

  // Project each toe onto the foot axis (scalar projection = relative length)
  const projections = toes.map(t => {
    const dx = top[t.name][0] - pternion[0];
    const dy = top[t.name][1] - pternion[1];
    return { name: t.name, proj: dx * axisNorm[0] + dy * axisNorm[1] };
  });

  // Normalize: longest = 1.0
  const maxProj = Math.max(...projections.map(p => p.proj));
  const normalized = projections.map(p => ({
    ...p,
    rel: maxProj > 0 ? p.proj / maxProj : 0,
  }));

  const [t1, t2, t3, t4, t5] = normalized.map(n => n.rel);

  // Classification logic
  // Egyptian: t1 > t2 > t3 (descending from big toe)
  // Greek: t2 > t1 and t2 > t3 (second toe longest)
  // Roman: t1 ≈ t2 ≈ t3 (first three roughly equal)
  const tolerance = 0.03; // ~3% of foot length

  if (t2 - t1 > tolerance && t2 - t3 > tolerance) {
    // 2nd toe clearly the longest
    const margin = Math.min(t2 - t1, t2 - t3);
    return { classification: "greek", confidence: clamp(0.7 + margin * 2, 0.6, 0.98) };
  }

  if (Math.abs(t1 - t2) <= tolerance && Math.abs(t2 - t3) <= tolerance) {
    // First 3 toes roughly equal length
    const spread = Math.max(t1, t2, t3) - Math.min(t1, t2, t3);
    return { classification: "roman", confidence: clamp(0.9 - spread * 5, 0.6, 0.98) };
  }

  if (t1 >= t2 - tolerance && t1 > t3 + tolerance) {
    // Big toe longest (or tied with 2nd), clearly longer than 3rd
    const margin = t1 - t3;
    return { classification: "egyptian", confidence: clamp(0.7 + margin * 2, 0.6, 0.98) };
  }

  // Fallback: pick the most likely
  if (t1 >= t2) return { classification: "egyptian", confidence: 0.6 };
  if (t2 > t1) return { classification: "greek", confidence: 0.6 };
  return { classification: "roman", confidence: 0.5 };
}

// Find the toe tip farthest from pternion (= acropodion)
function farthestToe(top) {
  const pternion = top.pternion;
  const toeKeys = ["toe_1", "toe_2", "toe_3", "toe_4", "toe_5"];
  let maxDist = 0;
  let farthest = top.toe_1;
  for (const key of toeKeys) {
    const d = Math.sqrt((top[key][0] - pternion[0]) ** 2 + (top[key][1] - pternion[1]) ** 2);
    if (d > maxDist) {
      maxDist = d;
      farthest = top[key];
    }
  }
  return farthest;
}

// Linear interpolation: map value from [inMin, inMax] to [outMin, outMax]
function mapRange(val, inMin, inMax, outMin, outMax) {
  return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function clamp(val, min, max) {
  const n = Number(val);
  if (isNaN(n)) return (min + max) / 2;
  return Math.min(max, Math.max(min, n));
}
