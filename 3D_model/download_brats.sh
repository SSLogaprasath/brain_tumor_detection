#!/bin/bash
# ============================================================
# download_brats.sh — Download BraTS 2020 NIfTI dataset
# ============================================================
# Downloads from Kaggle: awsaf49/brats20-dataset-training-validation
#
# BEFORE running, set up Kaggle credentials (one of):
#   Option A: export KAGGLE_USERNAME=xxx && export KAGGLE_KEY=xxx
#   Option B: Place kaggle.json in ~/.kaggle/kaggle.json
#
# Get your API key from: https://www.kaggle.com/settings
#   → "Create New Token" → downloads kaggle.json
# ============================================================

set -e

# Change DATA_ROOT to a directory you have write access to in Lightning AI
DATA_ROOT="$HOME/data/BraTS2020"

echo "============================================"
echo " BraTS 2020 NIfTI Dataset Downloader"
echo "============================================"

# 1. Install kaggle CLI
echo "[1/4] Installing Kaggle CLI..."
pip install -q kaggle

# 2. Check credentials
if [ ! -f ~/.kaggle/kaggle.json ] && [ -z "$KAGGLE_USERNAME" ]; then
    echo ""
    echo "ERROR: Kaggle credentials not found!"
    echo ""
    echo "Setup instructions:"
    echo "  1. Go to https://www.kaggle.com/settings"
    echo "  2. Scroll to 'API' section → click 'Create New Token'"
    echo "  3. This downloads kaggle.json"
    echo ""
    echo "  Then EITHER:"
    echo "    mkdir -p ~/.kaggle && cp kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json"
    echo ""
    echo "  OR export inline:"
    echo "    export KAGGLE_USERNAME=your_username"
    echo "    export KAGGLE_KEY=your_api_key"
    echo "    bash download_brats.sh"
    exit 1
fi

# 3. Download
echo "[2/4] Downloading BraTS 2020 from Kaggle (~4 GB)..."
echo "  This may take 5-15 minutes depending on connection speed."
mkdir -p "$DATA_ROOT"
kaggle datasets download -d awsaf49/brats20-dataset-training-validation -p "$DATA_ROOT" --force

# 4. Extract
echo "[3/4] Extracting..."
cd "$DATA_ROOT"
unzip -q -o brats20-dataset-training-validation.zip
rm -f brats20-dataset-training-validation.zip

# 5. Verify NIfTI structure
echo "[4/4] Verifying dataset..."

# Find the training data directory (may be nested)
TRAIN_DIR=$(find "$DATA_ROOT" -type d -name "MICCAI_BraTS2020_TrainingData" 2>/dev/null | head -1)

if [ -z "$TRAIN_DIR" ]; then
    # Try alternate name
    TRAIN_DIR=$(find "$DATA_ROOT" -type d -name "BraTS2020_TrainingData" 2>/dev/null | head -1)
fi

if [ -z "$TRAIN_DIR" ]; then
    echo "WARNING: Could not locate training directory automatically."
    echo "Contents of $DATA_ROOT:"
    ls -la "$DATA_ROOT"
    echo ""
    echo "Find the folder containing BraTS20_Training_001/ etc. and update DATA_DIR in train.sh"
    exit 0
fi

N_SUBJECTS=$(ls -d "$TRAIN_DIR"/BraTS20_Training_* 2>/dev/null | wc -l)

# Check one subject for NIfTI files
SAMPLE=$(ls -d "$TRAIN_DIR"/BraTS20_Training_* 2>/dev/null | head -1)
if [ -n "$SAMPLE" ]; then
    N_NII=$(ls "$SAMPLE"/*.nii.gz 2>/dev/null | wc -l)
    echo ""
    echo "  Location:   $TRAIN_DIR"
    echo "  Subjects:   $N_SUBJECTS"
    echo "  Sample:     $(basename $SAMPLE)"
    echo "  NIfTI files per subject: $N_NII"
    echo ""
    echo "  Files in sample subject:"
    ls -1 "$SAMPLE"/*.nii.gz 2>/dev/null | while read f; do echo "    $(basename $f)"; done
fi

echo ""
echo "============================================"
echo " Download complete!"
echo ""
echo " Now update DATA_DIR in train.sh:"
echo "   DATA_DIR=\"$TRAIN_DIR\""
echo ""
echo " Then run:"
echo "   bash train.sh"
echo "============================================"
