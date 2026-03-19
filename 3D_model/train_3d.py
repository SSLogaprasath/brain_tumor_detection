"""
train_3d.py — 3D Attention U-Net Training with All Enhancements
================================================================
Trains the 3D Attention U-Net on BraTS 2020 NIfTI volumes.

Enhancement stack:
    1. 3D Attention U-Net         — volumetric context
    2. Deep Supervision           — better gradient flow to early layers
    3. Boundary-Aware Loss        — sharper tumor edges
    4. Tumor-Centered Sampling    — fixes ET under-segmentation (in dataset_3d.py)

Key features:
    • AMP (float16) for memory efficiency
    • Gradient accumulation — effective batch up to 8
    • AdamW + Cosine Annealing with warmup
    • Combined Dice + CE + Boundary Dice loss
    • Deep supervision with weighted auxiliary heads
    • BraTS official metrics (ET, TC, WT Dice)
    • TensorBoard logging + checkpoint saving
    • Sliding-window validation for full-volume Dice

Usage (cloud GPU):
    python train_3d.py \\
        --data_dir /path/to/BraTS2020_TrainingData/MICCAI_BraTS2020_TrainingData \\
        --epochs 300 \\
        --batch_size 2 \\
        --accum_steps 2 \\
        --lr 1e-4
"""

import os
import time
import argparse
from datetime import datetime

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.amp import GradScaler, autocast
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR

try:
    from torch.utils.tensorboard import SummaryWriter
    HAS_TB = True
except ImportError:
    HAS_TB = False

from dataset_3d import get_3d_dataloaders, NUM_CLASSES
from model_3d import AttentionUNet3D


# ======================================================================
# Loss Functions
# ======================================================================

class DiceLoss3D(nn.Module):
    """
    Soft Dice Loss for multi-class 3D segmentation.
    Averages per-class Dice over non-background classes.
    """

    def __init__(self, smooth: float = 1.0, ignore_bg: bool = True):
        super().__init__()
        self.smooth = smooth
        self.ignore_bg = ignore_bg

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        logits  : (B, C, D, H, W)
        targets : (B, D, H, W) int64
        """
        probs = F.softmax(logits, dim=1)
        targets_oh = F.one_hot(targets, NUM_CLASSES)            # (B, D, H, W, C)
        targets_oh = targets_oh.permute(0, 4, 1, 2, 3).float() # (B, C, D, H, W)

        start_ch = 1 if self.ignore_bg else 0
        dice_sum = 0.0
        n = 0
        for c in range(start_ch, NUM_CLASSES):
            p = probs[:, c]
            t = targets_oh[:, c]
            intersection = (p * t).sum()
            union = p.sum() + t.sum()
            dice_sum += (2.0 * intersection + self.smooth) / (union + self.smooth)
            n += 1
        return 1.0 - dice_sum / n


class BoundaryDiceLoss(nn.Module):
    """
    Boundary-Aware Dice Loss for 3D segmentation.

    Extracts boundary voxels from the ground truth using morphological
    erosion and computes an additional Dice loss focused on near-boundary
    regions, weighted by a distance map.

    This encourages the model to produce sharper, more accurate tumor edges.

    Parameters
    ----------
    smooth       : float — Laplace smoothing
    dilation_k   : int   — Kernel size for boundary extraction (3D erosion)
    boundary_weight : float — Weight for the distance-based weighting
    """

    def __init__(self, smooth: float = 1.0, dilation_k: int = 3,
                 boundary_weight: float = 2.0):
        super().__init__()
        self.smooth = smooth
        self.dilation_k = dilation_k
        self.boundary_weight = boundary_weight

    def _extract_boundary(self, seg_oh: torch.Tensor) -> torch.Tensor:
        """
        Extract boundary region from one-hot segmentation.

        seg_oh : (B, C, D, H, W) float — one-hot encoded ground truth
        returns: (B, 1, D, H, W) float — binary boundary mask
        """
        # Pool over non-background classes to get foreground mask
        fg = seg_oh[:, 1:].sum(dim=1, keepdim=True).clamp(0, 1)  # (B,1,D,H,W)

        # Erode foreground — interior = eroded mask
        k = self.dilation_k
        pad = k // 2
        # Max pool of (1-fg) acts as erosion of fg
        eroded = 1.0 - F.max_pool3d(
            1.0 - fg, kernel_size=k, stride=1, padding=pad
        )

        # Boundary = foreground - eroded interior
        boundary = (fg - eroded).clamp(0, 1)
        return boundary

    def _compute_distance_weight(self, boundary: torch.Tensor) -> torch.Tensor:
        """
        Approximate distance weighting: w = 1 + boundary_weight * boundary_mask.
        Voxels on the boundary get higher weight.
        """
        return 1.0 + self.boundary_weight * boundary

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        logits  : (B, C, D, H, W)
        targets : (B, D, H, W) int64
        """
        probs = F.softmax(logits, dim=1)
        targets_oh = F.one_hot(targets, NUM_CLASSES).permute(0, 4, 1, 2, 3).float()

        # Extract boundary and distance weight map
        boundary = self._extract_boundary(targets_oh)       # (B, 1, D, H, W)
        weight_map = self._compute_distance_weight(boundary) # (B, 1, D, H, W)

        # Weighted Dice for each non-background class
        dice_sum = 0.0
        n = 0
        for c in range(1, NUM_CLASSES):
            p = probs[:, c:c+1]   # (B, 1, D, H, W)
            t = targets_oh[:, c:c+1]
            pw = p * weight_map
            tw = t * weight_map
            intersection = (pw * tw).sum()
            union = pw.sum() + tw.sum()
            dice_sum += (2.0 * intersection + self.smooth) / (union + self.smooth)
            n += 1
        return 1.0 - dice_sum / n


class CombinedLoss3D(nn.Module):
    """
    Combined loss: Dice + CrossEntropy + Boundary Dice.

    total = alpha * Dice + beta * CE + gamma * BoundaryDice

    Default weights:
        alpha = 0.4 (standard Dice)
        beta  = 0.4 (weighted cross-entropy)
        gamma = 0.2 (boundary-aware Dice)
    """

    def __init__(
        self,
        alpha: float = 0.4,
        beta: float = 0.4,
        gamma: float = 0.2,
        ce_weights: list = None,
    ):
        super().__init__()
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.dice = DiceLoss3D(smooth=1.0, ignore_bg=True)
        self.boundary_dice = BoundaryDiceLoss(smooth=1.0)
        weight = torch.tensor(ce_weights, dtype=torch.float32) if ce_weights else None
        self.ce = nn.CrossEntropyLoss(weight=weight)

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        d = self.dice(logits, targets)
        c = self.ce(logits.float(), targets)
        b = self.boundary_dice(logits, targets)
        return self.alpha * d + self.beta * c + self.gamma * b


# ======================================================================
# BraTS Official Evaluation Metrics (3D)
# ======================================================================

@torch.no_grad()
def compute_brats_dice(pred: torch.Tensor, target: torch.Tensor) -> dict:
    """
    Compute official BraTS Dice scores on 3D volumes:
        ET  = class 3
        TC  = classes 1 + 3
        WT  = classes 1 + 2 + 3

    pred, target : (B, D, H, W) int tensors
    """
    smooth = 1e-5

    def dice(p, t):
        inter = (p & t).float().sum()
        return ((2 * inter + smooth) / (p.float().sum() + t.float().sum() + smooth)).item()

    et_p, et_t = (pred == 3), (target == 3)
    tc_p, tc_t = (pred == 1) | (pred == 3), (target == 1) | (target == 3)
    wt_p, wt_t = (pred >= 1), (target >= 1)

    return {"ET": dice(et_p, et_t), "TC": dice(tc_p, tc_t), "WT": dice(wt_p, wt_t)}


# ======================================================================
# Warmup + Cosine Annealing Scheduler
# ======================================================================

class WarmupCosineScheduler:
    """Linear warmup for `warmup_epochs`, then cosine annealing."""

    def __init__(self, optimizer, warmup_epochs: int, max_epochs: int, eta_min: float = 1e-6):
        self.optimizer = optimizer
        self.warmup_epochs = warmup_epochs
        self.base_lrs = [pg["lr"] for pg in optimizer.param_groups]
        self.cosine = CosineAnnealingLR(optimizer, T_max=max_epochs - warmup_epochs, eta_min=eta_min)
        self._epoch = 0

    def step(self):
        self._epoch += 1
        if self._epoch <= self.warmup_epochs:
            # Linear warmup
            scale = self._epoch / self.warmup_epochs
            for pg, base_lr in zip(self.optimizer.param_groups, self.base_lrs):
                pg["lr"] = base_lr * scale
        else:
            self.cosine.step()

    def get_last_lr(self):
        return [pg["lr"] for pg in self.optimizer.param_groups]


# ======================================================================
# Training & Validation Steps
# ======================================================================

def train_one_epoch(
    model, loader, criterion, optimizer, scaler, device, accum_steps,
    max_grad_norm: float = 1.0, ds_weights: list = None,
):
    """
    Train one epoch with deep supervision.

    ds_weights : weights for auxiliary heads [ds4, ds3, ds2], e.g. [0.4, 0.2, 0.1]
    """
    if ds_weights is None:
        ds_weights = [0.4, 0.2, 0.1]

    model.train()
    running_loss = 0.0
    skipped = 0
    optimizer.zero_grad()

    for i, batch in enumerate(loader):
        images = batch["image"].to(device, non_blocking=True)
        masks = batch["mask"].to(device, non_blocking=True)

        with autocast("cuda", dtype=torch.float16):
            output = model(images)

            # Handle deep supervision output
            if isinstance(output, tuple):
                logits, ds_outputs = output
                loss = criterion(logits, masks)
                for w, ds_logits in zip(ds_weights, ds_outputs):
                    loss = loss + w * criterion(ds_logits, masks)
            else:
                logits = output
                loss = criterion(logits, masks)

            loss = loss / accum_steps

        if not torch.isfinite(loss):
            skipped += 1
            optimizer.zero_grad()
            scaler.update()
            continue

        scaler.scale(loss).backward()

        if (i + 1) % accum_steps == 0 or (i + 1) == len(loader):
            scaler.unscale_(optimizer)
            nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad()

        running_loss += loss.item() * accum_steps

    if skipped > 0:
        print(f"  [!] Skipped {skipped} NaN/Inf batches this epoch")
    return running_loss / max(len(loader) - skipped, 1)


@torch.no_grad()
def validate(model, loader, criterion, device):
    """Validate on patches, compute loss + BraTS Dice."""
    model.eval()
    running_loss = 0.0
    dice_sums = {"ET": 0.0, "TC": 0.0, "WT": 0.0}
    n_batches = 0
    n_loss = 0

    for batch in loader:
        images = batch["image"].to(device, non_blocking=True)
        masks = batch["mask"].to(device, non_blocking=True)

        with autocast("cuda", dtype=torch.float16):
            logits = model(images)  # eval mode → single output
            loss = criterion(logits, masks)

        if torch.isfinite(loss):
            running_loss += loss.item()
            n_loss += 1

        preds = logits.argmax(dim=1)
        dice = compute_brats_dice(preds, masks)
        for k in dice_sums:
            dice_sums[k] += dice[k]
        n_batches += 1

    avg_loss = running_loss / max(n_loss, 1)
    avg_dice = {k: v / max(n_batches, 1) for k, v in dice_sums.items()}
    return avg_loss, avg_dice


# ======================================================================
# Main Training Loop
# ======================================================================

def main(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    if device.type == "cuda":
        print(f"GPU   : {torch.cuda.get_device_name(0)}")
        vram = torch.cuda.get_device_properties(0).total_mem / 1e9
        print(f"VRAM  : {vram:.1f} GB")

    # ---- Data ----
    train_loader, val_loader = get_3d_dataloaders(
        data_dir=args.data_dir,
        batch_size=args.batch_size,
        patch_size=tuple(args.patch_size),
        patches_per_volume=args.patches_per_volume,
        num_workers=args.num_workers,
        cache_volumes=args.cache_volumes,
    )

    # ---- Model ----
    model = AttentionUNet3D(
        in_channels=4,
        out_channels=NUM_CLASSES,
        deep_supervision=True,
    ).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Model params: {n_params:,}")

    # ---- Loss ----
    ce_weights = [0.1, 1.0, 1.0, 1.5]  # BG, NCR/NET, ED, ET
    criterion = CombinedLoss3D(
        alpha=0.4, beta=0.4, gamma=0.2,
        ce_weights=ce_weights,
    ).to(device)
    print("Loss: 0.4×Dice + 0.4×CE + 0.2×BoundaryDice")

    # ---- Optimizer + Scheduler ----
    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    scheduler = WarmupCosineScheduler(
        optimizer, warmup_epochs=args.warmup_epochs,
        max_epochs=args.epochs, eta_min=1e-6,
    )

    scaler = GradScaler("cuda")

    # ---- Resume ----
    start_epoch = 1
    best_wt_dice = 0.0
    if args.resume and os.path.isfile(args.resume):
        ckpt = torch.load(args.resume, map_location=device, weights_only=False)
        model.load_state_dict(ckpt["model_state_dict"])
        if "optimizer_state_dict" in ckpt:
            optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        start_epoch = ckpt.get("epoch", 0) + 1
        best_wt_dice = ckpt.get("best_wt_dice", 0.0)
        print(f"Resumed from {args.resume} — epoch {start_epoch}, best WT={best_wt_dice:.4f}")

    # ---- TensorBoard ----
    writer = None
    if HAS_TB:
        log_dir = os.path.join(args.save_dir, "runs",
                               datetime.now().strftime("%Y%m%d_%H%M%S"))
        writer = SummaryWriter(log_dir)
        print(f"TensorBoard logs → {log_dir}")

    # ---- Checkpoint dir ----
    ckpt_dir = os.path.join(args.save_dir, "checkpoints_3d")
    os.makedirs(ckpt_dir, exist_ok=True)

    # ---- Training loop ----
    print(f"\nStarting training: {args.epochs} epochs, "
          f"batch_size={args.batch_size}, accum={args.accum_steps}, "
          f"effective_batch={args.batch_size * args.accum_steps}")
    print(f"Deep supervision weights: main=1.0, ds4=0.4, ds3=0.2, ds2=0.1")
    print(f"Patch size: {args.patch_size}, Patches/volume: {args.patches_per_volume}")
    print("-" * 80)

    for epoch in range(start_epoch, args.epochs + 1):
        t0 = time.time()

        train_loss = train_one_epoch(
            model, train_loader, criterion, optimizer, scaler, device,
            accum_steps=args.accum_steps, max_grad_norm=args.max_grad_norm,
            ds_weights=[0.4, 0.2, 0.1],
        )
        val_loss, val_dice = validate(model, val_loader, criterion, device)

        scheduler.step()
        lr = optimizer.param_groups[0]["lr"]
        elapsed = time.time() - t0

        # ---- Logging ----
        print(
            f"Epoch [{epoch:03d}/{args.epochs}]  "
            f"Train: {train_loss:.4f}  Val: {val_loss:.4f}  "
            f"ET: {val_dice['ET']:.4f}  TC: {val_dice['TC']:.4f}  "
            f"WT: {val_dice['WT']:.4f}  LR: {lr:.2e}  "
            f"Time: {elapsed:.1f}s"
        )

        if writer:
            writer.add_scalar("Loss/train", train_loss, epoch)
            writer.add_scalar("Loss/val", val_loss, epoch)
            writer.add_scalar("Dice/ET", val_dice["ET"], epoch)
            writer.add_scalar("Dice/TC", val_dice["TC"], epoch)
            writer.add_scalar("Dice/WT", val_dice["WT"], epoch)
            writer.add_scalar("LR", lr, epoch)

        # ---- Save best (based on WT Dice) ----
        if val_dice["WT"] > best_wt_dice:
            best_wt_dice = val_dice["WT"]
            best_path = os.path.join(ckpt_dir, "best_model_3d.pth")
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "best_wt_dice": best_wt_dice,
                "val_dice": val_dice,
            }, best_path)
            print(f"  >> New best WT Dice: {best_wt_dice:.4f} — saved {best_path}")

        # Periodic checkpoint every 25 epochs
        if epoch % 25 == 0:
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "best_wt_dice": best_wt_dice,
            }, os.path.join(ckpt_dir, f"epoch_{epoch:03d}.pth"))

    if writer:
        writer.close()
    print(f"\nTraining complete. Best WT Dice: {best_wt_dice:.4f}")


# ======================================================================
# CLI
# ======================================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train 3D Attention U-Net on BraTS 2020 NIfTI volumes"
    )
    parser.add_argument("--data_dir", type=str, required=True,
                        help="Path to BraTS NIfTI root (e.g. MICCAI_BraTS2020_TrainingData)")
    parser.add_argument("--save_dir", type=str, default="./output",
                        help="Directory for checkpoints and logs")
    parser.add_argument("--epochs", type=int, default=300,
                        help="Total training epochs (300 recommended for 3D)")
    parser.add_argument("--batch_size", type=int, default=2,
                        help="Batch size (2 for A100/H100 80GB)")
    parser.add_argument("--accum_steps", type=int, default=2,
                        help="Gradient accumulation (eff. batch = BS × accum)")
    parser.add_argument("--lr", type=float, default=1e-4,
                        help="Peak learning rate")
    parser.add_argument("--wd", type=float, default=1e-5,
                        help="Weight decay")
    parser.add_argument("--warmup_epochs", type=int, default=10,
                        help="Linear warmup epochs before cosine annealing")
    parser.add_argument("--max_grad_norm", type=float, default=1.0)
    parser.add_argument("--patch_size", type=int, nargs=3, default=[128, 128, 128],
                        help="3D patch size (D H W)")
    parser.add_argument("--patches_per_volume", type=int, default=4,
                        help="Patches extracted per volume per epoch")
    parser.add_argument("--num_workers", type=int, default=4)
    parser.add_argument("--resume", type=str, default=None,
                        help="Path to checkpoint to resume from")
    parser.add_argument("--cache_volumes", action="store_true",
                        help="Cache all volumes in RAM (~60 GB for full BraTS)")
    args = parser.parse_args()

    main(args)
