#!/usr/bin/env python3
"""
Sonnet API module for generating foot scan interpretations and recommendations.

Uses the Anthropic Sonnet API instead of the local fine-tuned LLM.
Pre-filtered 50 shoe candidates + scan data -> structured JSON output.

Cost: ~$0.07 per scan (Sonnet 4, pre-filtered 50 shoes).
Latency: ~45-55 seconds per call.

Usage:
    from scan_llm_sonnet import generate_interpretation_sonnet

    result = generate_interpretation_sonnet(
        scan_data={"sex": "male", "shoes": [...], ...},
        shoe_candidates=[{"slug": "...", "brand": "...", ...}, ...],
    )
    # result = {"interpretation": [...], "recommendations": [...]}
"""
import json
import os
import re
import time
from pathlib import Path
from typing import Optional

import anthropic

# Prompt template (same one used by the fine-tuned model)
TEMPLATE_PATH = Path(__file__).parent / "benchmark" / "prompt_template.txt"
_prompt_template = None

# API key from env or CLAUDE-README default
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
if not ANTHROPIC_API_KEY:
    raise RuntimeError("ANTHROPIC_API_KEY environment variable is required")


def _load_template() -> str:
    """Load the prompt template once, cache globally."""
    global _prompt_template
    if _prompt_template is None:
        with open(TEMPLATE_PATH) as f:
            _prompt_template = f.read()
    return _prompt_template


def _build_prompt(scan_data: dict, shoe_candidates: list) -> str:
    """Build prompt using the same template format as the fine-tuned model.

    Shoe candidates are formatted as compact JSON with the fields the LLM
    needs for selection and reasoning.
    """
    template = _load_template()

    compact_candidates = []
    for c in shoe_candidates:
        entry = {
            "slug": c["slug"],
            "brand": c["brand"],
            "model": c["model"],
            "width": c.get("width"),
            "toe_form": c.get("toe_form"),
            "asymmetry": c.get("asymmetry"),
            "downturn": c.get("downturn"),
            "feel": c.get("feel"),
            "closure": c.get("closure"),
            "gender": c.get("gender"),
            "forefoot_volume": c.get("forefoot_volume"),
            "heel_volume": c.get("heel_volume"),
            "use_cases": c.get("use_cases"),
            "skill_level": c.get("skill_level"),
            "no_edge": c.get("no_edge", False),
            "recommended_size_eu": c.get("_recommended_size_eu"),
            "computed_stiffness": c.get("_computed_stiffness"),
        }
        if c.get("_category"):
            entry["_category"] = c["_category"]
        if c.get("_best_price_eur") is not None:
            entry["_best_price_eur"] = c["_best_price_eur"]
        compact_candidates.append(entry)

    shoes_json = json.dumps(compact_candidates, separators=(",", ":"))
    scan_json = json.dumps(scan_data, indent=2)

    prompt = template.replace("{shoes_database}", shoes_json)
    prompt = prompt.replace("{scan_data}", scan_json)
    return prompt


def _extract_json(text: str) -> Optional[dict]:
    """Extract JSON from LLM output, handling common formatting issues."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object in the text
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Try to fix trailing commas
    cleaned = re.sub(r",\s*([}\]])", r"\1", text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    return None


def _validate_shoe_fit_claims(result: dict, scan_data: dict) -> None:
    """Check interpretation text for misrepresented shoe fit data.

    Appends a correction paragraph if the LLM claims 'perfect fit overall'
    when individual dimensions are not perfect. Mirrors the same safety net
    from scan_llm.py.
    """
    shoes = scan_data.get("shoes", [])
    if not shoes:
        return

    shoe_issues = {}
    for shoe in shoes:
        fit = shoe.get("fit", {})
        display = f"{shoe.get('brand', '')} {shoe.get('model', '')}".strip()
        non_perfect = {k: v for k, v in fit.items() if v and v != "perfect"}
        if non_perfect:
            shoe_issues[display] = non_perfect

    if not shoe_issues:
        return

    overgeneralize_patterns = [
        "perfect fit across the board",
        "perfect fit overall",
        "provides a perfect fit",
        "perfect across the board",
        "perfect fit in the same size",
        "fits perfectly in the same size",
        "fits perfectly overall",
    ]

    shoe_fit_block = None
    for block in result.get("interpretation", []):
        title = block.get("title", "").lower()
        if "current shoe" in title or "shoe fit" in title:
            shoe_fit_block = block
            break

    if shoe_fit_block is None:
        return

    interp_text = " ".join(p.lower() for p in shoe_fit_block.get("paragraphs", []))
    errors_found = []

    for display, issues in shoe_issues.items():
        name_lower = display.lower()
        for pattern in overgeneralize_patterns:
            if pattern not in interp_text:
                continue
            pat_idx = interp_text.find(pattern)
            window = interp_text[max(0, pat_idx - 300):pat_idx + len(pattern) + 100]
            name_parts = name_lower.split()
            model_parts = name_parts[1:] if len(name_parts) > 1 else name_parts
            model_found = all(part in window for part in model_parts if len(part) > 1)
            if model_found:
                dims = ", ".join(f"{k}: {v}" for k, v in issues.items())
                errors_found.append((display, dims, pattern))

    if not errors_found:
        return

    corrections = []
    seen = set()
    for display, dims, _pattern in errors_found:
        shoe = f"the {display}"
        if shoe not in seen:
            seen.add(shoe)
            corrections.append(f"{shoe} actually has {dims} (not a perfect fit overall)")

    correction_text = (
        "Important correction based on the actual fit data: "
        + "; ".join(corrections)
        + ". Both shoes share the empty heel pattern, which is the key finding "
        "for recommendations."
    )
    shoe_fit_block["paragraphs"].append(correction_text)
    result["_fit_corrections_applied"] = True
    print(f"[scan_llm_sonnet] Appended fit correction: {correction_text[:100]}...")


def _inject_hallux_image(result: dict, scan_data: dict) -> None:
    """Inject hallux valgus visual at end of first interpretation paragraph if detected.

    Modifies result in-place by appending image reference to first paragraph.
    """
    hallux_class = scan_data.get("hallux_valgus_class", "normal")
    if hallux_class not in ("mild", "pronounced"):
        return

    # Image path for hallux visualization
    hallux_image = "/images/hallux-visual.png"

    interpretation = result.get("interpretation", [])
    if not interpretation or not isinstance(interpretation[0], dict):
        return

    first_section = interpretation[0]
    paragraphs = first_section.get("paragraphs", [])
    if not paragraphs:
        return

    # Append image reference to first paragraph (simple markdown-style notation)
    # Frontend will render this as <img> with the path
    last_para = paragraphs[-1]
    paragraphs[-1] = f"{last_para}\n\n[Hallux Valgus Visual: {hallux_image}]"


def generate_interpretation_sonnet(
    scan_data: dict,
    shoe_candidates: list,
    max_tokens: int = 8192,
    model: str = "claude-sonnet-4-20250514",
) -> Optional[dict]:
    """Generate interpretation + recommendations using the Anthropic Sonnet API.

    Args:
        scan_data: Full scan profile (measurements, user preferences, shoes).
        shoe_candidates: Pre-filtered list of ~50 shoe candidates with
            _category and _best_price_eur tags.
        max_tokens: Maximum tokens to generate.
        model: Anthropic model identifier.

    Returns:
        dict with "interpretation" and "recommendations", or None on failure.
    """
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt_content = _build_prompt(scan_data, shoe_candidates)

    print(f"[scan_llm_sonnet] Calling {model} with ~{len(prompt_content)//4} est. tokens...")
    t0 = time.time()

    try:
        message = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt_content}],
        )
    except anthropic.APIError as e:
        print(f"[scan_llm_sonnet] API error: {e}")
        return None

    elapsed = time.time() - t0
    response_text = message.content[0].text
    usage = message.usage

    print(f"[scan_llm_sonnet] Response in {elapsed:.1f}s "
          f"(input: {usage.input_tokens}, output: {usage.output_tokens})")

    # Parse JSON from response
    result = _extract_json(response_text)
    if result is None:
        print(f"[scan_llm_sonnet] Failed to parse JSON from response")
        print(f"[scan_llm_sonnet] Raw response (first 500 chars): {response_text[:500]}")
        return None

    # Validate structure
    if "interpretation" not in result or "recommendations" not in result:
        print(f"[scan_llm_sonnet] Missing interpretation or recommendations in response")
        return None

    # Run fit claim validation (same safety net as local LLM)
    _validate_shoe_fit_claims(result, scan_data)

    # Inject hallux valgus visual if detected
    _inject_hallux_image(result, scan_data)

    recs = result.get("recommendations", [])
    print(f"[scan_llm_sonnet] Got {len(recs)} recommendations")
    for r in recs:
        print(f"  [{r.get('category', '?')}] {r.get('brand', '')} {r.get('model', '')} "
              f"- size {r.get('recommended_size_eu', '?')}")

    return result
