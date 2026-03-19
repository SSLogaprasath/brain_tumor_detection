"""
train_lightning.py — 3D Attention U-Net Training with PyTorch Lightning
=======================================================================
Lightning-based training for the 3D Attention U-Net on BraTS 2020.

Preserves the full enhancement stack from train_3d.py:
    1. 3D Attention U-Net         — volumetric context
    2. Deep Supervision           — better gradient flow
    3. Boundary-Aware Loss        — sharper tumor edges
    4. Tumor-Centered Sampling    — fixes ET under-segmentation

Lightning features:
    • bf16-mixed precision (optimal for H200/H100)
    • Timer callback — auto-stop at 3 hours
    • ModelCheckpoint — best WT Dice + periodic saves
    • TensorBoard logging
    • Gradient clipping + accumulation
    • Warmup + cosine annealing LR schedule
    • torch.compile support (PyTorch 2.x)

Usage (H200, 3 hours, 100 epochs):
    python train_lightning.py \\
        --data_dir /path/to/BraTS2020_TrainingData \\
        --max_epochs 100 \\
        --max_time 00:03:00:00 \\
        --batch_size 4 \\
        --precision bf16-mixed
"""

import os
import argparse
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

import lightning as L
from lightning.pytorch.callbacks import (
    ModelCheckpoint,
    Timer,
    LearningRateMonitor,
    RichProgressBar,
)
from lightning.pytorch.loggers import TensorBoardLogger

torch.set_float32_matmul_precision("medium")

from dataset_3d import BraTS3DDataset, get_3d_dataloaders, NUM_CLASSES
from model_3d import AttentionUNet3D


# ======================================================================
# Loss Functions (carried over from train_3d.py)
# ======================================================================

class DiceLoss3D(nn.Module):
    """Soft Dice Loss averaged over non-background classes."""

    def __init__(self, smooth: float = 1.0, ignore_bg: bool = True):
        super().__init__()
        self.smooth = smooth
        self.ignore_bg = ignore_bg

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = F.softmax(logits, dim=1)
        targets_oh = F.one_hot(targets, NUM_CLASSES).permute(0, 4, 1, 2, 3).float()
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
    """Boundary-Aware Dice Loss — focuses on tumor edge voxels."""

    def __init__(self, smooth: float = 1.0, dilation_k: int = 3,
                 boundary_weight: float = 2.0):
        super().__init__()
        self.smooth = smooth
        self.dilation_k = dilation_k
        self.boundary_weight = boundary_weight

    def _extract_boundary(self, seg_oh: torch.Tensor) -> torch.Tensor:
        fg = seg_oh[:, 1:].sum(dim=1, keepdim=True).clamp(0, 1)
        k = self.dilation_k
        pad = k // 2
        eroded = 1.0 - F.max_pool3d(1.0 - fg, kernel_size=k, stride=1, padding=pad)
        return (fg - eroded).clamp(0, 1)

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = F.softmax(logits, dim=1)
        targets_oh = F.one_hot(targets, NUM_CLASSES).permute(0, 4, 1, 2, 3).float()
        boundary = self._extract_boundary(targets_oh)
        weight_map = 1.0 + self.boundary_weight * boundary
        dice_sum = 0.0
        n = 0
        for c in range(1, NUM_CLASSES):
            p = probs[:, c:c + 1]
            t = targets_oh[:, c:c + 1]
            pw = p * weight_map
            tw = t * weight_map
            intersection = (pw * tw).sum()
            union = pw.sum() + tw.sum()
            dice_sum += (2.0 * intersection + self.smooth) / (union + self.smooth)
            n += 1
        return 1.0 - dice_sum / n


class CombinedLoss3D(nn.Module):
    """Combined: 0.4*Dice + 0.4*CE + 0.2*BoundaryDice."""

    def __init__(self, alpha: float = 0.4, beta: float = 0.4, gamma: float = 0.2,
                 ce_weights: Optional[List[float]] = None):
        super().__init__()
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.dice = DiceLoss3D(smooth=1.0, ignore_bg=True)
        self.boundary_dice = BoundaryDiceLoss(smooth=1.0)
        weight = torch.tensor(ce_weights, dtype=torch.float32) if ce_weights else None
        self.ce = nn.CrossEntropyLoss(weight=weight)

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        return (self.alpha * self.dice(logits, targets)
                + self.beta * self.ce(logits.float(), targets)
                + self.gamma * self.boundary_dice(logits, targets))


# ======================================================================
# BraTS Dice Metrics
# ======================================================================

@torch.no_grad()
def compute_brats_dice(pred: torch.Tensor, target: torch.Tensor) -> Dict[str, float]:
    """BraTS official Dice: ET (class 3), TC (1+3), WT (1+2+3)."""
    smooth = 1e-5

    def dice(p, t):
        inter = (p & t).float().sum()
        return ((2 * inter + smooth) / (p.float().sum() + t.float().sum() + smooth)).item()

    return {
        "ET": dice(pred == 3, target == 3),
        "TC": dice((pred == 1) | (pred == 3), (target == 1) | (target == 3)),
        "WT": dice(pred >= 1, target >= 1),
    }


# ======================================================================
# Lightning DataModule
# ======================================================================

class BraTSDataModule(L.LightningDataModule):
    """BraTS 2020 3D DataModule — wraps BraTS3DDataset."""

    def __init__(
        self,
        data_dir: str,
        batch_size: int = 4,
        patch_size: Tuple[int, int, int] = (128, 128, 128),
        patches_per_volume: int = 4,
        num_workers: int = 8,
    ):
        super().__init__()
        self.save_hyperparameters()
        self.data_dir = data_dir
        self.batch_size = batch_size
        self.patch_size = patch_size
        self.patches_per_volume = patches_per_volume
        self.num_workers = num_workers

    def setup(self, stage: Optional[str] = None):
        if stage == "fit" or stage is None:
            self.train_ds = BraTS3DDataset(
                self.data_dir, split="train",
                patch_size=self.patch_size,
                patches_per_volume=self.patches_per_volume,
                augment=True,
            )
            self.val_ds = BraTS3DDataset(
                self.data_dir, split="val",
                patch_size=self.patch_size,
                patches_per_volume=2,
                augment=False,
            )

    def train_dataloader(self):
        return torch.utils.data.DataLoader(
            self.train_ds,
            batch_size=self.batch_size,
            shuffle=True,
            num_workers=self.num_workers,
            pin_memory=True,
            drop_last=True,
            persistent_workers=self.num_workers > 0,
        )

    def val_dataloader(self):
        return torch.utils.data.DataLoader(
            self.val_ds,
            batch_size=self.batch_size,
            shuffle=False,
            num_workers=self.num_workers,
            pin_memory=True,
            persistent_workers=self.num_workers > 0,
        )


# ======================================================================
# Lightning Module
# ======================================================================

class BraTSSegModule(L.LightningModule):
    """
    Lightning wrapper for AttentionUNet3D with deep supervision,
    combined loss, warmup+cosine LR, and BraTS Dice tracking.
    """

    def __init__(
        self,
        lr: float = 2e-4,
        weight_decay: float = 1e-5,
        warmup_epochs: int = 5,
        max_epochs: int = 100,
        ds_weights: Optional[List[float]] = None,
        compile_model: bool = False,
    ):
        super().__init__()
        self.save_hyperparameters()

        self.model = AttentionUNet3D(
            in_channels=4,
            out_channels=NUM_CLASSES,
            deep_supervision=True,
        )

        if compile_model and hasattr(torch, "compile"):
            self.model = torch.compile(self.model)

        self.criterion = CombinedLoss3D(
            alpha=0.4, beta=0.4, gamma=0.2,
            ce_weights=[0.1, 1.0, 1.0, 1.5],
        )
        self.ds_weights = ds_weights or [0.4, 0.2, 0.1]

        # For tracking validation dice across batches
        self.val_dice_sums = {"ET": 0.0, "TC": 0.0, "WT": 0.0}
        self.val_n_batches = 0

    def forward(self, x):
        return self.model(x)

    def _compute_loss(self, batch):
        images = batch["image"]
        masks = batch["mask"]
        output = self.model(images)

        if isinstance(output, tuple):
            logits, ds_outputs = output
            loss = self.criterion(logits, masks)
            for w, ds_logits in zip(self.ds_weights, ds_outputs):
                loss = loss + w * self.criterion(ds_logits, masks)
        else:
            logits = output
            loss = self.criterion(logits, masks)

        return loss, logits, masks

    def training_step(self, batch, batch_idx):
        loss, logits, masks = self._compute_loss(batch)

        if not torch.isfinite(loss):
            return None  # Lightning skips None returns

        self.log("train/loss", loss, on_step=True, on_epoch=True,
                 prog_bar=True, sync_dist=True)
        return loss

    def validation_step(self, batch, batch_idx):
        images = batch["image"]
        masks = batch["mask"]

        logits = self.model(images)  # eval mode → single output
        loss = self.criterion(logits, masks)

        preds = logits.argmax(dim=1)
        dice = compute_brats_dice(preds, masks)

        self.log("val/loss", loss, on_epoch=True, prog_bar=True, sync_dist=True)
        self.log("val/dice_ET", dice["ET"], on_epoch=True, sync_dist=True)
        self.log("val/dice_TC", dice["TC"], on_epoch=True, sync_dist=True)
        self.log("val/dice_WT", dice["WT"], on_epoch=True, prog_bar=True, sync_dist=True)

        return {"loss": loss, "dice": dice}

    def configure_optimizers(self):
        optimizer = torch.optim.AdamW(
            self.parameters(),
            lr=self.hparams.lr,
            weight_decay=self.hparams.weight_decay,
        )

        warmup_epochs = self.hparams.warmup_epochs
        max_epochs = self.hparams.max_epochs

        scheduler = torch.optim.lr_scheduler.SequentialLR(
            optimizer,
            schedulers=[
                torch.optim.lr_scheduler.LinearLR(
                    optimizer, start_factor=1e-3, total_iters=warmup_epochs
                ),
                torch.optim.lr_scheduler.CosineAnnealingLR(
                    optimizer, T_max=max_epochs - warmup_epochs, eta_min=1e-6
                ),
            ],
            milestones=[warmup_epochs],
        )

        return {
            "optimizer": optimizer,
            "lr_scheduler": {
                "scheduler": scheduler,
                "interval": "epoch",
            },
        }


# ======================================================================
# Main
# ======================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Train 3D Attention U-Net on BraTS 2020 with PyTorch Lightning"
    )
    # Data
    parser.add_argument("--data_dir", type=str, required=True,
                        help="Path to BraTS NIfTI root")
    parser.add_argument("--save_dir", type=str, default="./output",
                        help="Directory for checkpoints and logs")
    # Training
    parser.add_argument("--max_epochs", type=int, default=100)
    parser.add_argument("--max_time", type=str, default="00:03:00:00",
                        help="Time limit DD:HH:MM:SS (default: 3 hours)")
    parser.add_argument("--batch_size", type=int, default=4,
                        help="Per-GPU batch size (4 for H200 141GB)")
    parser.add_argument("--accumulate_grad_batches", type=int, default=1,
                        help="Gradient accumulation steps")
    parser.add_argument("--lr", type=float, default=2e-4,
                        help="Peak learning rate")
    parser.add_argument("--wd", type=float, default=1e-5,
                        help="Weight decay")
    parser.add_argument("--warmup_epochs", type=int, default=5)
    parser.add_argument("--precision", type=str, default="bf16-mixed",
                        choices=["32", "16-mixed", "bf16-mixed"],
                        help="Training precision (bf16-mixed for H200)")
    # Model
    parser.add_argument("--patch_size", type=int, nargs=3, default=[128, 128, 128])
    parser.add_argument("--patches_per_volume", type=int, default=4)
    parser.add_argument("--compile", action="store_true",
                        help="Use torch.compile (PyTorch 2.x)")
    # Infra
    parser.add_argument("--num_workers", type=int, default=8)
    parser.add_argument("--resume", type=str, default=None,
                        help="Path to Lightning checkpoint to resume from")
    args = parser.parse_args()

    # ---- DataModule ----
    dm = BraTSDataModule(
        data_dir=args.data_dir,
        batch_size=args.batch_size,
        patch_size=tuple(args.patch_size),
        patches_per_volume=args.patches_per_volume,
        num_workers=args.num_workers,
    )

    # ---- LightningModule ----
    model = BraTSSegModule(
        lr=args.lr,
        weight_decay=args.wd,
        warmup_epochs=args.warmup_epochs,
        max_epochs=args.max_epochs,
        compile_model=args.compile,
    )

    n_params = sum(p.numel() for p in model.model.parameters())
    print(f"Model params: {n_params:,}")

    # ---- Callbacks ----
    ckpt_dir = os.path.join(args.save_dir, "checkpoints_3d")

    callbacks = [
        # Save best model by WT Dice
        ModelCheckpoint(
            dirpath=ckpt_dir,
            filename="best-{epoch:03d}-{val_dice_WT:.4f}",
            monitor="val/dice_WT",
            mode="max",
            save_top_k=1,
            verbose=True,
        ),
        # Periodic checkpoint every 25 epochs
        ModelCheckpoint(
            dirpath=ckpt_dir,
            filename="epoch-{epoch:03d}",
            every_n_epochs=25,
            save_top_k=-1,
        ),
        # 3-hour time limit
        Timer(duration=dict(hours=3)),
        # Log LR to TensorBoard
        LearningRateMonitor(logging_interval="epoch"),
        # Rich progress bar
        RichProgressBar(),
    ]

    # ---- Logger ----
    logger = TensorBoardLogger(
        save_dir=args.save_dir,
        name="lightning_logs",
    )

    # ---- Trainer ----
    trainer = L.Trainer(
        max_epochs=args.max_epochs,
        max_time=args.max_time,
        accelerator="gpu",
        devices=1,
        precision=args.precision,
        accumulate_grad_batches=args.accumulate_grad_batches,
        gradient_clip_val=1.0,
        gradient_clip_algorithm="norm",
        callbacks=callbacks,
        logger=logger,
        log_every_n_steps=10,
        enable_checkpointing=True,
        deterministic=False,
        benchmark=True,  # cuDNN autotuner — faster with fixed input sizes
    )

    # ---- Train ----
    trainer.fit(model, datamodule=dm, ckpt_path=args.resume)

    print(f"\nTraining complete!")
    print(f"  Best checkpoint: {callbacks[0].best_model_path}")
    print(f"  Best WT Dice:    {callbacks[0].best_model_score:.4f}")
    print(f"  TensorBoard:     tensorboard --logdir {args.save_dir}/lightning_logs")


if __name__ == "__main__":
    main()
