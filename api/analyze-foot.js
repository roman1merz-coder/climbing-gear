// api/analyze-foot.js — Vercel Serverless Function
// Receives 3 foot photos + shoe size, calls Claude Vision API,
// returns structured foot shape analysis for climbing shoe fitting.
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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-5-20250929";

const ANALYSIS_PROMPT = `You are an expert foot shape analyst for climbing shoe fitting. You will receive 3 photos of a human foot taken from specific angles. Analyze them carefully.

PHOTOS PROVIDED:
1. TOP VIEW — looking straight down at the foot from above
2. SIDE VIEW — camera at ankle height, showing the full foot profile
3. HEEL VIEW — camera at ankle height, from directly behind

ANALYZE THE FOLLOWING:

## 1. TOE SHAPE (from top view)
Classify the toe taper pattern by examining relative toe lengths:
- "egyptian": Big toe is longest, each subsequent toe progressively shorter (smooth diagonal taper). ~50% of population.
- "greek": Second toe is noticeably longer than big toe (Morton's toe). ~25% of population.
- "roman": First 2–3 toes are approximately the same length, creating a squarer front. ~25% of population.

## 2. FOOT INDEX — width-to-length ratio (from top view)
Estimate the ratio of forefoot width (at the widest point, across the ball of the foot) to total foot length (heel to longest toe).
Population reference: mean = 0.386, SD = 0.022
- Below 0.365 = narrow foot
- 0.365–0.405 = average width
- Above 0.405 = wide foot
Return a value between 0.30 and 0.48.

## 3. INSTEP HEIGHT / VOLUME (from side view)
Estimate the Arch Height Index: the height of the dorsum (top of foot) at the midpoint of foot length, divided by foot length.
Population reference: standing mean = 0.340, SD = 0.031
- Below 0.310 = low volume / flat instep
- 0.310–0.360 = standard volume
- Above 0.360 = high volume
Return a value between 0.24 and 0.44.

## 4. HEEL WIDTH (from heel view)
Estimate heel width at its widest point as a proportion of the forefoot width you observed in the top view.
Population reference: heel is typically 60–70% of forefoot width.
- Below 0.58 = narrow heel
- 0.58–0.72 = medium heel
- Above 0.72 = wide heel
Return a value between 0.45 and 0.85.

## 5. ARCH-TO-LENGTH RATIO (from side view)
Estimate the distance from the ball of the foot (metatarsophalangeal joint — visible as bump/widening on the bottom) to the heel, divided by total foot length.
Population reference: average ~0.73 (Brannock standard)
- Below 0.71 = relatively long toes
- 0.71–0.75 = average
- Above 0.75 = relatively short toes
Return a value between 0.64 and 0.82.

## 6. CONFIDENCE
- "high": All 3 photos are clear, well-lit, correct angles, foot outline fully visible
- "medium": Acceptable but one or more photos slightly off-angle or partially obscured
- "low": Poor quality, wrong angle, or foot hard to distinguish

Return ONLY valid JSON, no markdown fences, no explanation:
{
  "toe_shape": "egyptian",
  "toe_confidence": 0.9,
  "width_ratio": 0.386,
  "instep_ratio": 0.340,
  "heel_ratio": 0.65,
  "arch_ratio": 0.73,
  "confidence": "high",
  "notes": "Brief one-sentence observation about this foot's notable characteristics for climbing shoe fitting."
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
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `${ANALYSIS_PROMPT}\n\nUser's EU street shoe size: ${shoe_size_eu}` },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: images.top } },
              { type: "text", text: "IMAGE 1 OF 3: TOP VIEW (looking straight down)" },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: images.side } },
              { type: "text", text: "IMAGE 2 OF 3: SIDE VIEW (camera at ankle height)" },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: images.heel } },
              { type: "text", text: "IMAGE 3 OF 3: HEEL VIEW (from behind, ankle height)" },
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
      console.error("Failed to parse Claude response:", content);
      return res.status(502).json({ error: "Failed to parse analysis results" });
    }

    // Validate, clamp to research-backed ranges, and derive ShoeFinder categories
    const width_ratio = clamp(parsed.width_ratio ?? 0.386, 0.30, 0.48);
    const instep_ratio = clamp(parsed.instep_ratio ?? 0.340, 0.24, 0.44);
    const heel_ratio = clamp(parsed.heel_ratio ?? 0.65, 0.45, 0.85);
    const arch_ratio = clamp(parsed.arch_ratio ?? 0.73, 0.64, 0.82);

    const result = {
      // Raw continuous values (for slider display)
      toe_shape: ["egyptian", "greek", "roman"].includes(parsed.toe_shape) ? parsed.toe_shape : "egyptian",
      toe_confidence: clamp(parsed.toe_confidence ?? 0.8, 0, 1),
      width_ratio,
      instep_ratio,
      heel_ratio,
      arch_ratio,
      confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
      notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 300) : "",

      // Derived categories for ShoeFinder URL params
      // Width: mean 0.386, narrow < 0.365, wide > 0.405
      volume: instep_ratio < 0.310 ? "low" : instep_ratio > 0.360 ? "high" : "standard",
      width: width_ratio < 0.365 ? "narrow" : width_ratio > 0.405 ? "wide" : "medium",
      heel_width: heel_ratio < 0.58 ? "narrow" : heel_ratio > 0.72 ? "wide" : "medium",
    };

    return res.status(200).json(result);

  } catch (err) {
    console.error("Foot analysis error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function clamp(val, min, max) {
  const n = Number(val);
  if (isNaN(n)) return (min + max) / 2;
  return Math.min(max, Math.max(min, n));
}
