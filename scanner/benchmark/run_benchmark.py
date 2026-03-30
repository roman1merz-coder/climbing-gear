#!/usr/bin/env python3
"""
Climbing Shoe Fitting LLM Benchmark
====================================
Compares local models on real foot scan data against Opus ground truth.

Usage:
    python3 run_benchmark.py                    # Run all models on all test cases
    python3 run_benchmark.py --models nemotron  # Run only Nemotron
    python3 run_benchmark.py --scans 2          # Run only first 2 test cases
    python3 run_benchmark.py --dry-run          # Show prompts without calling models

Requirements:
    - Ollama running locally (ollama serve)
    - Models pulled: see MODELS dict below
    - pip install requests (usually pre-installed)
"""

import json
import time
import argparse
import os
import sys
from pathlib import Path
from datetime import datetime

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed. Run: pip3 install requests")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OLLAMA_URL = "http://localhost:11434"

# Models to benchmark - Ollama model tags
# After pulling, verify with: ollama list
MODELS = {
    "nemotron-nano": {
        "tag": "nemotron-3-nano:30b-a3b-q4_K_M",
        "description": "NVIDIA Nemotron 3 Nano 30B (3.5B active MoE, Mamba-Transformer hybrid) ~24GB",
        "pull_name": "nemotron-3-nano:30b-a3b-q4_K_M",
    },
    "qwen3": {
        "tag": "qwen3:30b",
        "description": "Qwen 3 30B (dense transformer, newest Qwen) ~19GB",
        "pull_name": "qwen3:30b",
    },
    "qwen2.5": {
        "tag": "qwen2.5:32b",
        "description": "Qwen 2.5 32B Instruct (dense transformer, battle-tested) ~20GB",
        "pull_name": "qwen2.5:32b",
    },
    "gemma3": {
        "tag": "gemma3:27b",
        "description": "Google Gemma 3 27B IT (dense, Apache 2.0) ~17GB",
        "pull_name": "gemma3:27b",
    },
}

BENCHMARK_DIR = Path(__file__).parent
RESULTS_DIR = BENCHMARK_DIR / "results"

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------

def load_prompt_template():
    with open(BENCHMARK_DIR / "prompt_template.txt") as f:
        return f.read()

def load_shoes_database():
    with open(BENCHMARK_DIR / "shoes_database.json") as f:
        return json.load(f)

def load_test_cases():
    with open(BENCHMARK_DIR / "test_cases.json") as f:
        return json.load(f)

def prefilter_shoes(scan, shoes, max_candidates=40):
    """Pre-filter shoes based on scan profile, like the production pipeline."""
    candidates = []
    sex = scan.get('sex', 'male')
    toe = scan.get('toe_shape', 'egyptian')
    pref = scan.get('next_shoe_preference', 'performance')

    for s in shoes:
        # Gender: exclude opposite-gender-only (but keep unisex for everyone)
        g = s.get('gender', 'unisex')
        if sex == 'female' and g == 'mens':
            continue
        if sex == 'male' and g == 'womens':
            pass  # cross-gender is valid for males

        # Toe form compatibility
        tf = s.get('toe_form', [])
        if tf and toe not in tf:
            continue

        # Use case filter (loose - keep if any overlap)
        uc = s.get('use_cases', [])
        if pref == 'performance' and uc:
            if not any(u in uc for u in ['bouldering', 'sport', 'competition', 'all-around']):
                continue
        elif pref == 'comfort' and uc:
            if not any(u in uc for u in ['all-around', 'trad', 'gym', 'beginner', 'comfort']):
                continue

        # Compact representation for prompt
        candidates.append({
            'slug': s['slug'], 'brand': s['brand'], 'model': s['model'],
            'width': s.get('width'), 'toe_form': s.get('toe_form'),
            'asymmetry': s.get('asymmetry'), 'downturn': s.get('downturn'),
            'feel': s.get('feel'), 'closure': s.get('closure'),
            'gender': s.get('gender'),
            'forefoot_volume': s.get('forefoot_volume'),
            'heel_volume': s.get('heel_volume'),
            'use_cases': s.get('use_cases'),
            'skill_level': s.get('skill_level'),
        })

    return candidates[:max_candidates]


def build_prompt(template, shoes_db, scan_input):
    """Build the full prompt for a single test case with pre-filtered shoes."""
    filtered = prefilter_shoes(scan_input, shoes_db)
    shoes_json = json.dumps(filtered, separators=(',', ':'))
    scan_json = json.dumps(scan_input, indent=2)
    return template.replace("{shoes_database}", shoes_json).replace("{scan_data}", scan_json)

# ---------------------------------------------------------------------------
# Ollama interaction
# ---------------------------------------------------------------------------

def check_ollama():
    """Verify Ollama is running and return available models."""
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
        return models
    except Exception as e:
        print(f"ERROR: Cannot reach Ollama at {OLLAMA_URL}")
        print(f"  {e}")
        print(f"\nMake sure Ollama is running: ollama serve")
        sys.exit(1)

def query_model(model_tag, prompt, timeout=600):
    """Send prompt to Ollama and return response + timing."""
    start = time.time()

    try:
        r = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model_tag,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "top_p": 0.9,
                    "num_predict": 4096,
                    "num_ctx": 16384,
                },
            },
            timeout=timeout,
        )
        r.raise_for_status()
        data = r.json()
        elapsed = time.time() - start

        response_text = data.get("response", "")
        eval_count = data.get("eval_count", 0)
        prompt_eval_count = data.get("prompt_eval_count", 0)

        return {
            "response": response_text,
            "elapsed_seconds": round(elapsed, 1),
            "tokens_generated": eval_count,
            "tokens_prompt": prompt_eval_count,
            "tokens_per_second": round(eval_count / elapsed, 1) if elapsed > 0 else 0,
        }
    except requests.exceptions.Timeout:
        return {
            "response": "",
            "elapsed_seconds": timeout,
            "tokens_generated": 0,
            "tokens_prompt": 0,
            "tokens_per_second": 0,
            "error": f"Timeout after {timeout}s",
        }
    except Exception as e:
        return {
            "response": "",
            "elapsed_seconds": time.time() - start,
            "tokens_generated": 0,
            "tokens_prompt": 0,
            "tokens_per_second": 0,
            "error": str(e),
        }

# ---------------------------------------------------------------------------
# Parse and score
# ---------------------------------------------------------------------------

def parse_json_response(text):
    """Try to extract JSON from model response."""
    # Try direct parse first
    text = text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        start = 1
        end = len(lines) - 1
        for i, line in enumerate(lines):
            if i > 0 and line.strip().startswith("```"):
                end = i
                break
        text = "\n".join(lines[start:end]).strip()

    # Try to find JSON object
    try:
        # Find first { and last }
        first_brace = text.index("{")
        last_brace = text.rindex("}") + 1
        json_str = text[first_brace:last_brace]
        return json.loads(json_str)
    except (ValueError, json.JSONDecodeError):
        return None

def score_response(parsed, expected, shoes_db):
    """Score a parsed response against ground truth. Returns dict of scores."""
    scores = {}
    slugs_in_db = {s["slug"] for s in shoes_db}

    if parsed is None:
        return {
            "valid_json": False,
            "total_score": 0,
            "details": "Failed to parse JSON from response",
        }

    scores["valid_json"] = True

    # --- Interpretation scoring ---
    interp = parsed.get("interpretation", [])
    expected_interp = expected.get("interpretation", [])

    scores["has_interpretation"] = isinstance(interp, list) and len(interp) > 0
    scores["interpretation_sections"] = len(interp) if isinstance(interp, list) else 0
    scores["expected_sections"] = len(expected_interp)

    # Check structure: each section has title + paragraphs array
    valid_sections = 0
    if isinstance(interp, list):
        for section in interp:
            if (isinstance(section, dict)
                and isinstance(section.get("title"), str)
                and isinstance(section.get("paragraphs"), list)
                and len(section["paragraphs"]) > 0
                and all(isinstance(p, str) for p in section["paragraphs"])):
                valid_sections += 1
    scores["valid_interpretation_sections"] = valid_sections

    # Check section titles match expected pattern
    expected_titles = {"Your Foot Shape", "What Your Current Shoe Fit Tells Us", "What to Look For"}
    actual_titles = set()
    if isinstance(interp, list):
        actual_titles = {s.get("title", "") for s in interp if isinstance(s, dict)}
    scores["correct_section_titles"] = len(actual_titles & expected_titles)

    # --- Recommendation scoring ---
    recs = parsed.get("recommendations", [])
    expected_recs = expected.get("recommendations", [])

    scores["has_recommendations"] = isinstance(recs, list) and len(recs) > 0
    scores["recommendation_count"] = len(recs) if isinstance(recs, list) else 0
    scores["expected_recommendation_count"] = len(expected_recs)
    scores["exactly_6_recommendations"] = len(recs) == 6 if isinstance(recs, list) else False

    # Check each recommendation structure and validity
    valid_recs = 0
    valid_slugs = 0
    has_sizing = 0
    brands_used = set()
    expected_slugs = {r["slug"] for r in expected_recs}
    matched_slugs = set()

    if isinstance(recs, list):
        for rec in recs:
            if not isinstance(rec, dict):
                continue

            # Structure check
            has_required = all(k in rec for k in ["slug", "brand", "model", "why"])
            if has_required:
                valid_recs += 1

            # Slug exists in DB
            slug = rec.get("slug", "")
            if slug in slugs_in_db:
                valid_slugs += 1

            # Slug matches ground truth
            if slug in expected_slugs:
                matched_slugs.add(slug)

            # Has sizing
            if rec.get("recommended_size_eu") is not None:
                has_sizing += 1

            # Brand diversity
            brands_used.add(rec.get("brand", "unknown"))

    scores["valid_recommendation_structure"] = valid_recs
    scores["valid_slugs_in_db"] = valid_slugs
    scores["slugs_matching_ground_truth"] = len(matched_slugs)
    scores["recommendations_with_sizing"] = has_sizing
    scores["brand_diversity"] = len(brands_used)

    # Check for em dashes (banned)
    full_text = json.dumps(parsed)
    scores["em_dash_violations"] = full_text.count("\u2014") + full_text.count("\u2013")

    # --- Composite score (0-100) ---
    total = 0
    max_score = 0

    # JSON validity (10 pts)
    total += 10 if scores["valid_json"] else 0
    max_score += 10

    # Interpretation structure (20 pts)
    section_score = min(valid_sections, 3) / 3 * 15
    title_score = scores["correct_section_titles"] / 3 * 5
    total += section_score + title_score
    max_score += 20

    # Recommendation count (10 pts)
    total += 10 if scores["exactly_6_recommendations"] else (5 if 4 <= scores["recommendation_count"] <= 8 else 0)
    max_score += 10

    # Recommendation structure (10 pts)
    total += (valid_recs / max(scores["recommendation_count"], 1)) * 10 if scores["recommendation_count"] > 0 else 0
    max_score += 10

    # Valid slugs (20 pts) - most important
    total += (valid_slugs / max(scores["recommendation_count"], 1)) * 20 if scores["recommendation_count"] > 0 else 0
    max_score += 20

    # Slug overlap with ground truth (15 pts)
    total += (len(matched_slugs) / max(len(expected_slugs), 1)) * 15
    max_score += 15

    # Sizing provided (10 pts)
    total += (has_sizing / max(scores["recommendation_count"], 1)) * 10 if scores["recommendation_count"] > 0 else 0
    max_score += 10

    # Brand diversity (5 pts)
    total += min(scores["brand_diversity"], 4) / 4 * 5
    max_score += 5

    # Em dash penalty (-5 per violation, min 0)
    total = max(0, total - scores["em_dash_violations"] * 5)

    scores["total_score"] = round(total, 1)
    scores["max_score"] = max_score

    return scores

# ---------------------------------------------------------------------------
# Sizing accuracy check
# ---------------------------------------------------------------------------

def check_sizing_accuracy(recs, expected_recs):
    """Compare recommended sizes against ground truth for matching shoes."""
    comparisons = []
    expected_by_slug = {r["slug"]: r for r in expected_recs}

    if not isinstance(recs, list):
        return comparisons

    for rec in recs:
        if not isinstance(rec, dict):
            continue
        slug = rec.get("slug", "")
        if slug in expected_by_slug:
            exp = expected_by_slug[slug]
            rec_size = rec.get("recommended_size_eu")
            exp_size = exp.get("recommended_size_eu")
            if rec_size is not None and exp_size is not None:
                diff = abs(float(rec_size) - float(exp_size))
                comparisons.append({
                    "slug": slug,
                    "model_size": rec_size,
                    "expected_size": exp_size,
                    "difference": diff,
                    "within_half_size": diff <= 0.5,
                    "exact_match": diff == 0,
                })
    return comparisons

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Climbing shoe LLM benchmark")
    parser.add_argument("--models", nargs="+", choices=list(MODELS.keys()) + ["all"], default=["all"],
                        help="Which models to test (default: all)")
    parser.add_argument("--scans", type=int, default=0,
                        help="Limit to first N test cases (0 = all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show prompt for first test case without calling models")
    parser.add_argument("--timeout", type=int, default=600,
                        help="Timeout per model call in seconds (default: 600)")
    args = parser.parse_args()

    # Load data
    print("Loading data...")
    template = load_prompt_template()
    shoes_db = load_shoes_database()
    test_cases = load_test_cases()

    if args.scans > 0:
        test_cases = test_cases[:args.scans]

    print(f"  {len(shoes_db)} shoes in database")
    print(f"  {len(test_cases)} test cases to run")

    # Build prompts
    prompts = []
    for tc in test_cases:
        prompt = build_prompt(template, shoes_db, tc["input"])
        prompts.append(prompt)

    print(f"  Prompt size: ~{len(prompts[0])/1024:.0f} KB ({len(prompts[0].split()):.0f} words)")

    if args.dry_run:
        print("\n=== DRY RUN - First prompt ===\n")
        print(prompts[0][:2000])
        print(f"\n... ({len(prompts[0])} chars total)")
        print("\n=== Expected output (first test case) ===\n")
        exp = test_cases[0]["expected_output"]
        print(f"Interpretation: {len(exp['interpretation'])} sections")
        for s in exp["interpretation"]:
            print(f"  - {s['title']}: {len(s['paragraphs'])} paragraphs")
        print(f"Recommendations: {len(exp['recommendations'])} shoes")
        for r in exp["recommendations"]:
            print(f"  - {r['slug']} | EU {r.get('recommended_size_eu', '?')}")
        return

    # Check Ollama
    print("\nChecking Ollama...")
    available_models = check_ollama()
    print(f"  Available models: {available_models}")

    # Determine which models to run
    if "all" in args.models:
        models_to_run = list(MODELS.keys())
    else:
        models_to_run = args.models

    # Check which requested models are actually pulled
    missing = []
    ready = []
    for name in models_to_run:
        tag = MODELS[name]["tag"]
        # Ollama list shows name:tag, check if any available model starts with the tag
        found = any(tag in m or m.startswith(tag.split(":")[0]) for m in available_models)
        if not found:
            # Try a looser match
            found = any(name.replace(".", "") in m.replace(".", "") for m in available_models)
        if found:
            ready.append(name)
        else:
            missing.append(name)

    if missing:
        print(f"\n  WARNING: These models are not pulled yet: {missing}")
        print(f"  Pull them with:")
        for name in missing:
            print(f"    ollama pull {MODELS[name]['pull_name']}")
        print(f"\n  Proceeding with available models: {ready}")
        if not ready:
            print("  No models available. Pull at least one model and retry.")
            sys.exit(1)

    models_to_run = ready

    # Create results directory
    RESULTS_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = RESULTS_DIR / f"run_{timestamp}"
    run_dir.mkdir()

    # Run benchmark
    all_results = {}

    for model_name in models_to_run:
        model_info = MODELS[model_name]
        print(f"\n{'='*60}")
        print(f"MODEL: {model_name} ({model_info['description']})")
        print(f"{'='*60}")

        model_results = []

        for i, (tc, prompt) in enumerate(zip(test_cases, prompts)):
            scan_id = tc["input"]["scan_id"]
            print(f"\n  Test case {i+1}/{len(test_cases)}: {scan_id}")
            print(f"    Sending to {model_info['tag']}...", end="", flush=True)

            result = query_model(model_info["tag"], prompt, timeout=args.timeout)

            if result.get("error"):
                print(f" ERROR: {result['error']}")
            else:
                print(f" {result['elapsed_seconds']}s, {result['tokens_generated']} tokens ({result['tokens_per_second']} tok/s)")

            # Parse response
            parsed = parse_json_response(result["response"])

            # Score against ground truth
            scores = score_response(parsed, tc["expected_output"], shoes_db)

            # Check sizing accuracy
            sizing = []
            if parsed:
                sizing = check_sizing_accuracy(
                    parsed.get("recommendations", []),
                    tc["expected_output"].get("recommendations", [])
                )

            # Print summary
            print(f"    Score: {scores.get('total_score', 0)}/100")
            print(f"    Valid JSON: {scores.get('valid_json', False)}")
            print(f"    Interpretation sections: {scores.get('valid_interpretation_sections', 0)}/{scores.get('expected_sections', 0)}")
            print(f"    Recommendations: {scores.get('recommendation_count', 0)} (valid slugs: {scores.get('valid_slugs_in_db', 0)}, match ground truth: {scores.get('slugs_matching_ground_truth', 0)})")
            print(f"    Brand diversity: {scores.get('brand_diversity', 0)}")
            if sizing:
                exact = sum(1 for s in sizing if s["exact_match"])
                close = sum(1 for s in sizing if s["within_half_size"])
                print(f"    Sizing: {exact} exact, {close} within 0.5 EU (of {len(sizing)} comparable)")

            model_results.append({
                "scan_id": scan_id,
                "timing": {
                    "elapsed_seconds": result["elapsed_seconds"],
                    "tokens_generated": result["tokens_generated"],
                    "tokens_prompt": result["tokens_prompt"],
                    "tokens_per_second": result["tokens_per_second"],
                },
                "error": result.get("error"),
                "raw_response": result["response"],
                "parsed_response": parsed,
                "scores": scores,
                "sizing_accuracy": sizing,
            })

        all_results[model_name] = model_results

        # Save per-model results
        with open(run_dir / f"{model_name}_results.json", "w") as f:
            json.dump(model_results, f, indent=2, ensure_ascii=False)

    # ---------------------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------------------

    print(f"\n\n{'='*70}")
    print(f"BENCHMARK SUMMARY")
    print(f"{'='*70}")

    summary = {}

    for model_name, results in all_results.items():
        scores_list = [r["scores"].get("total_score", 0) for r in results]
        avg_score = sum(scores_list) / len(scores_list) if scores_list else 0

        timings = [r["timing"]["elapsed_seconds"] for r in results if not r.get("error")]
        avg_time = sum(timings) / len(timings) if timings else 0

        tok_rates = [r["timing"]["tokens_per_second"] for r in results if r["timing"]["tokens_per_second"] > 0]
        avg_tok = sum(tok_rates) / len(tok_rates) if tok_rates else 0

        valid_json_pct = sum(1 for r in results if r["scores"].get("valid_json", False)) / len(results) * 100

        all_sizing = []
        for r in results:
            all_sizing.extend(r.get("sizing_accuracy", []))
        exact_sizing = sum(1 for s in all_sizing if s["exact_match"])
        close_sizing = sum(1 for s in all_sizing if s["within_half_size"])

        valid_slug_pcts = []
        for r in results:
            sc = r["scores"]
            if sc.get("recommendation_count", 0) > 0:
                valid_slug_pcts.append(sc["valid_slugs_in_db"] / sc["recommendation_count"] * 100)
        avg_slug_valid = sum(valid_slug_pcts) / len(valid_slug_pcts) if valid_slug_pcts else 0

        summary[model_name] = {
            "avg_score": round(avg_score, 1),
            "avg_time_seconds": round(avg_time, 1),
            "avg_tokens_per_second": round(avg_tok, 1),
            "valid_json_rate": round(valid_json_pct, 1),
            "avg_valid_slug_rate": round(avg_slug_valid, 1),
            "sizing_exact": exact_sizing,
            "sizing_within_half": close_sizing,
            "sizing_total_comparable": len(all_sizing),
            "individual_scores": scores_list,
        }

        desc = MODELS[model_name]["description"]
        print(f"\n{model_name} ({desc})")
        print(f"  Average Score:     {avg_score:.1f}/100")
        print(f"  Valid JSON:        {valid_json_pct:.0f}%")
        print(f"  Valid Slugs:       {avg_slug_valid:.0f}%")
        print(f"  Sizing Accuracy:   {exact_sizing} exact, {close_sizing} within 0.5 EU (of {len(all_sizing)})")
        print(f"  Avg Time:          {avg_time:.1f}s per scan")
        print(f"  Avg Speed:         {avg_tok:.1f} tok/s")
        print(f"  Per-scan scores:   {scores_list}")

    # Rank
    print(f"\n{'='*70}")
    print(f"RANKING (by average score)")
    print(f"{'='*70}")
    ranked = sorted(summary.items(), key=lambda x: x[1]["avg_score"], reverse=True)
    for i, (name, s) in enumerate(ranked, 1):
        print(f"  #{i}  {name:20s}  Score: {s['avg_score']:5.1f}  |  JSON: {s['valid_json_rate']:3.0f}%  |  Slugs: {s['avg_valid_slug_rate']:3.0f}%  |  Speed: {s['avg_tokens_per_second']:5.1f} tok/s")

    # Save summary
    with open(run_dir / "summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nResults saved to: {run_dir}")
    print(f"Review individual responses: {run_dir}/<model>_results.json")


if __name__ == "__main__":
    main()
