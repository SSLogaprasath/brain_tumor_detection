#!/bin/bash
# ============================================================
# train.sh — Start 3D Attention U-Net training (Lightning)
# ============================================================
# Edit DATA_DIR below to match your BraTS data location,
# then run:   bash train.sh
# ============================================================

# ----- EDIT THIS -----
DATA_DIR="$HOME/BraTS2020/BraTS2020_TrainingData"
# ----------------------

# Verify data exists
if [ ! -d "$DATA_DIR" ]; then
    echo "ERROR: Data directory not found: $DATA_DIR"
    echo "Update DATA_DIR in this script to point to your BraTS NIfTI folder."
    echo "It should contain folders like BraTS20_Training_001/, BraTS20_Training_002/, etc."
    exit 1
fi

N=$(ls -d "$DATA_DIR"/BraTS* 2>/dev/null | wc -l)
echo "Found $N BraTS subjects in $DATA_DIR"

# Detect GPU and set batch size / precision
read -r VRAM BF16 <<< $(python -c "
import torch
if torch.cuda.is_available():
    props = torch.cuda.get_device_properties(0)
    vram = int((props.total_memory if hasattr(props, 'total_memory') else props.total_mem) / 1e9)
    bf16 = 'yes' if torch.cuda.is_bf16_supported() else 'no'
    print(vram, bf16)
else:
    print(0, 'no')
" 2>/dev/null)

# Precision: prefer bf16 on Hopper/Ampere+
if [ "$BF16" = "yes" ]; then
    PRECISION="bf16-mixed"
else
    PRECISION="16-mixed"
fi

if [ "$VRAM" -ge 120 ]; then
    # H200 (141 GB) / H100-SXM (80GB x2 NVLink)
    BS=4; ACCUM=1; LR="2e-4"
    echo "Detected ${VRAM}GB VRAM → batch_size=4, precision=$PRECISION"
elif [ "$VRAM" -ge 70 ]; then
    # A100/H100 (80 GB)
    BS=2; ACCUM=2; LR="1e-4"
    echo "Detected ${VRAM}GB VRAM → batch_size=2, accum=2, precision=$PRECISION"
elif [ "$VRAM" -ge 20 ]; then
    # A5000/RTX 4090 (24 GB)
    BS=1; ACCUM=4; LR="1e-4"
    echo "Detected ${VRAM}GB VRAM → batch_size=1, accum=4 (tight!)"
else
    echo "ERROR: Need at least 24 GB VRAM for 3D training. Found: ${VRAM}GB"
    exit 1
fi

echo ""
echo "Starting Lightning training..."
echo "  Max epochs:  100"
echo "  Time limit:  3 hours"
echo "  Batch size:  $BS (accum: $ACCUM, effective: $((BS * ACCUM)))"
echo "  LR:          $LR"
echo "  Precision:   $PRECISION"
echo "  Patch size:  128x128x128"
echo "  Output:      ./output"
echo ""

python train_lightning.py \
    --data_dir "$DATA_DIR" \
    --max_epochs 100 \
    --max_time "00:03:00:00" \
    --batch_size $BS \
    --accumulate_grad_batches $ACCUM \
    --lr $LR \
    --warmup_epochs 5 \
    --precision $PRECISION \
    --num_workers 8 \
    --compile \
    --save_dir ./output

echo ""
echo "============================================"
echo " Training complete!"
echo " Best model: ./output/checkpoints_3d/"
echo " TensorBoard: tensorboard --logdir ./output/lightning_logs"
echo "============================================"
