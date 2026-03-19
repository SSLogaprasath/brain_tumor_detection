#!/bin/bash
# ============================================================
# setup_lightning.sh — One-click setup for Lightning AI Studio
# ============================================================
# Run this ONCE after opening your Lightning Studio:
#   bash setup_lightning.sh
# ============================================================

set -e

echo "============================================"
echo " 3D Attention U-Net — Lightning AI Setup"
echo "============================================"

# 1. Install Python dependencies
echo "[1/4] Installing dependencies..."
pip install -q lightning nibabel tensorboard h5py rich

# 2. Verify GPU
echo "[2/4] Checking GPU..."
python -c "
import torch
print(f'PyTorch:   {torch.__version__}')
print(f'CUDA:      {torch.cuda.is_available()}')
if torch.cuda.is_available():
    name = torch.cuda.get_device_name(0)
    props = torch.cuda.get_device_properties(0)
    vram = (props.total_memory if hasattr(props, 'total_memory') else props.total_mem) / 1e9
    print(f'GPU:       {name}')
    print(f'VRAM:      {vram:.1f} GB')
    print(f'BF16:      {torch.cuda.is_bf16_supported()}')
    if vram >= 120:
        print(f'  -> H200-class detected. Recommended: batch_size=4, bf16-mixed')
    elif vram >= 70:
        print(f'  -> A100/H100-class. Recommended: batch_size=2, bf16-mixed')
    elif vram >= 20:
        print(f'  -> 24GB GPU. Recommended: batch_size=1, accum=4')
    else:
        print(f'  !! WARNING: {vram:.0f}GB may not be enough for 128^3 patches')
else:
    print('  !! No GPU detected — training will not work')
import lightning as L
print(f'Lightning: {L.__version__}')
"

# 3. Check for BraTS data
echo "[3/4] Checking data..."
DATA_DIR=""
# Common Lightning AI paths
for d in /data/BraTS2020 /teamspace/datasets/BraTS2020 ~/data/BraTS2020 ./data/BraTS2020; do
    if [ -d "$d" ]; then
        DATA_DIR="$d"
        break
    fi
done

if [ -z "$DATA_DIR" ]; then
    echo "  BraTS data not found. You need to upload it."
    echo ""
    echo "  Option A — Upload via Lightning Studio UI:"
    echo "    1. Click the folder icon in the left sidebar"
    echo "    2. Upload to /teamspace/datasets/BraTS2020/"
    echo ""
    echo "  Option B — Download via Kaggle CLI:"
    echo "    pip install kaggle"
    echo "    kaggle datasets download -d awsaf49/brats20-dataset-training-validation"
    echo "    unzip -q brats20-dataset-training-validation.zip -d /data/BraTS2020"
    echo ""
    echo "  Option C — If data is on Google Drive:"
    echo "    pip install gdown"
    echo "    gdown <your-gdrive-link> -O brats.zip"
    echo "    unzip -q brats.zip -d /data/BraTS2020"
    echo ""
    echo "  After uploading, set DATA_DIR path in train.sh and run it."
else
    # Count subjects
    N=$(ls -d "$DATA_DIR"/BraTS* 2>/dev/null | wc -l)
    echo "  Found BraTS data at: $DATA_DIR ($N subjects)"
fi

# 4. Quick model test (CPU, tiny input)
echo "[4/4] Testing model..."
python -c "
import torch
from model_3d import AttentionUNet3D, count_parameters
model = AttentionUNet3D()
print(f'Params: {count_parameters(model):,}')
x = torch.randn(1, 4, 32, 32, 32)
model.train()
out, ds = model(x)
print(f'Forward pass OK — output: {out.shape}')
print()
print('Setup complete! Ready to train.')
"

echo ""
echo "============================================"
echo " Setup complete! To start training run:"
echo "   bash train.sh"
echo "============================================"
