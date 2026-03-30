# Climbing Shoe LLM Benchmark

Compares 4 local models on real foot scan data against Opus-quality ground truth.

## Models tested

| Model | Params (active) | Download | Architecture |
|-------|-----------------|----------|--------------|
| Nemotron 3 Nano 30B | 31.6B (3.5B) | ~24GB | MoE + Mamba-2 hybrid |
| Qwen 3 32B | 32B (32B) | ~20GB | Dense transformer |
| Qwen 2.5 32B | 32B (32B) | ~20GB | Dense transformer |
| Gemma 3 27B | 27B (27B) | ~17GB | Dense transformer |

## Quick start

```bash
# 1. Run setup (installs Ollama, pulls models)
bash setup.sh

# 2. Run the benchmark
python3 run_benchmark.py

# 3. Quick test (1 model, 1 scan)
python3 run_benchmark.py --models qwen2.5 --scans 1

# 4. Dry run (shows prompt without calling any model)
python3 run_benchmark.py --dry-run
```

## What it measures

- **Valid JSON** - Can the model output parseable JSON?
- **Interpretation structure** - 3 sections with correct titles and paragraph arrays?
- **Recommendation count** - Exactly 6 shoes?
- **Valid slugs** - Do recommended slugs exist in our 393-shoe database?
- **Ground truth overlap** - Do recommendations match what Opus picked?
- **Sizing accuracy** - For matching shoes, how close is the recommended EU size?
- **Brand diversity** - Are recommendations spread across brands?
- **Em dash violations** - We ban em dashes; does the model comply?
- **Speed** - Tokens per second, total time per scan

## Scoring (0-100)

| Component | Points |
|-----------|--------|
| Valid JSON | 10 |
| Interpretation structure | 20 |
| Recommendation count (exactly 6) | 10 |
| Recommendation structure | 10 |
| Valid slugs in DB | 20 |
| Slug overlap with ground truth | 15 |
| Sizing provided | 10 |
| Brand diversity | 5 |
| Em dash penalty | -5 each |

## Files

- `setup.sh` - One-command setup (Ollama + models + dependencies)
- `run_benchmark.py` - The benchmark runner
- `prompt_template.txt` - Prompt sent to each model
- `shoes_database.json` - All 393 shoes (compact JSON for prompt context)
- `test_cases.json` - 5 test scans with Opus ground truth
- `results/` - Output directory (created on first run)

## Adjusting model tags

If Ollama tags change, edit the `MODELS` dict at the top of `run_benchmark.py`. Verify available tags with `ollama search <model-name>`.
