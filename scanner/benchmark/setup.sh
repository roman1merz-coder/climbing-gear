#!/bin/bash
# ============================================================
# Climbing Shoe LLM Benchmark - Setup Script
# ============================================================
# Run this on the Mac Mini M4 Pro to install everything needed
# for the model comparison benchmark.
#
# Usage: bash setup.sh
# ============================================================

set -e

echo "============================================"
echo "  Climbing Shoe LLM Benchmark Setup"
echo "============================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Check/Install Ollama
# ---------------------------------------------------------------------------
echo "--- Step 1: Checking Ollama ---"

if command -v ollama &> /dev/null; then
    echo "  Ollama is installed: $(ollama --version)"
else
    echo "  Ollama not found. Installing..."
    echo ""
    echo "  Option A (recommended): Download from https://ollama.com/download/mac"
    echo "  Option B: brew install ollama"
    echo ""
    read -p "  Install via brew? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install ollama
    else
        echo "  Please install Ollama manually and re-run this script."
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Step 2: Start Ollama if not running
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 2: Starting Ollama ---"

if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "  Ollama is already running."
else
    echo "  Starting Ollama..."
    ollama serve &
    sleep 3
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "  Ollama started successfully."
    else
        echo "  WARNING: Ollama may not be running. Check manually with: ollama serve"
    fi
fi

# ---------------------------------------------------------------------------
# Step 3: Pull models
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 3: Pulling models ---"
echo ""
echo "  This will download ~80GB total. Estimated time: 30-60 min on fast connection."
echo "  Each model is ~15-25GB."
echo ""
echo "  Models to download:"
echo "    1. Nemotron 3 Nano 30B (Q4_K_M)  - NVIDIA MoE/Mamba hybrid   (~24GB)"
echo "    2. Qwen 3 32B (Q4_K_M)            - Alibaba dense             (~20GB)"
echo "    3. Qwen 2.5 32B Instruct (Q4_K_M) - Alibaba dense             (~20GB)"
echo "    4. Gemma 3 27B IT (Q4_K_M)        - Google dense               (~17GB)"
echo ""

# Try pulling each model. Some tags might differ slightly between Ollama versions.
# We try the most likely tag first, then alternatives.

pull_model() {
    local name=$1
    shift
    local tags=("$@")

    echo "  Pulling $name..."
    for tag in "${tags[@]}"; do
        echo "    Trying: ollama pull $tag"
        if ollama pull "$tag" 2>/dev/null; then
            echo "    SUCCESS: $tag"
            return 0
        else
            echo "    Tag '$tag' not found, trying next..."
        fi
    done
    echo "    WARNING: Could not pull $name with any known tag."
    echo "    Search manually: ollama search $name"
    return 1
}

echo ""
echo "Pulling models (this takes a while)..."
echo ""

# Nemotron - try multiple tag patterns
pull_model "Nemotron 3 Nano" \
    "nemotron-3-nano:30b-a3b-q4_K_M" \
    "nemotron-3-nano:30b-a3b" \
    "nemotron-3-nano:30b" \
    "nemotron-3-nano:latest" || true

echo ""

# Qwen 3.5 / Qwen 3
pull_model "Qwen 3 32B" \
    "qwen3:32b-q4_K_M" \
    "qwen3:32b" \
    "qwen3:32b-instruct" \
    "qwen3:latest" || true

echo ""

# Qwen 2.5 32B
pull_model "Qwen 2.5 32B" \
    "qwen2.5:32b-instruct-q4_K_M" \
    "qwen2.5:32b" \
    "qwen2.5:32b-instruct" || true

echo ""

# Gemma 3 27B
pull_model "Gemma 3 27B" \
    "gemma3:27b-it-q4_K_M" \
    "gemma3:27b" \
    "gemma3:27b-it" || true

# ---------------------------------------------------------------------------
# Step 4: Verify
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 4: Verification ---"
echo ""
echo "  Installed models:"
ollama list
echo ""

# ---------------------------------------------------------------------------
# Step 5: Check Python
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 5: Checking Python ---"

if command -v python3 &> /dev/null; then
    echo "  Python3: $(python3 --version)"
else
    echo "  ERROR: Python3 not found. Install with: brew install python3"
    exit 1
fi

# Check requests module
python3 -c "import requests" 2>/dev/null || {
    echo "  Installing 'requests' module..."
    pip3 install requests --break-system-packages
}
echo "  Python 'requests' module: OK"

# ---------------------------------------------------------------------------
# Step 6: Dry run
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 6: Dry run test ---"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "$SCRIPT_DIR/run_benchmark.py" --dry-run

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "  To run the full benchmark:"
echo "    python3 $SCRIPT_DIR/run_benchmark.py"
echo ""
echo "  To run a quick test (1 scan, 1 model):"
echo "    python3 $SCRIPT_DIR/run_benchmark.py --models qwen2.5 --scans 1"
echo ""
echo "  To run specific models:"
echo "    python3 $SCRIPT_DIR/run_benchmark.py --models nemotron-nano qwen3.5"
echo ""
echo "  Results will be saved to: $SCRIPT_DIR/results/"
echo ""
