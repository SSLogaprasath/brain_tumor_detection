"""
dataset_3d.py — BraTS 2020 3D Volumetric Dataset with Tumor-Centered Patch Sampling
=====================================================================================
Loads BraTS 2020 data and extracts 3D patches for training.

Supports TWO data formats:
    1. NIfTI (.nii.gz) — Standard BraTS directory with subject folders
    2. H5 (.h5) — Kaggle pre-processed 2D slices, reconstructed into 3D volumes

H5 format (auto-detected):
    data_dir/
        volume_0_slice_0.h5     # each has image(240,240,4) + mask(240,240,3)
        volume_0_slice_1.h5
        ...
        meta_data.csv

NIfTI format:
    data_dir/
        BraTS20_Training_001/
            BraTS20_Training_001_t1.nii.gz
            ...

Segmentation labels (output):
    0 — Background
    1 — Necrotic / Non-Enhancing Tumor Core (NCR/NET)
    2 — Peritumoral Edema (ED)
    3 — GD-Enhancing Tumor (ET)

Patch sampling strategy:
    • 70% foreground-centered patches (of which 50% centered on ET voxels)
    • 30% uniform random patches
"""

import os
import glob
import random
from collections import defaultdict
from typing import Dict, List, Tuple

import numpy as np
import h5py
import torch
from torch.utils.data import Dataset, DataLoader

NUM_CLASSES = 4
PATCH_SIZE = (128, 128, 128)


# ---------------------------------------------------------------------------
# H5 volume reconstruction
# ---------------------------------------------------------------------------

def reconstruct_volumes_from_h5(data_dir: str) -> Dict[int, Tuple[np.ndarray, np.ndarray]]:
    """
    Reconstruct 3D volumes from individual H5 slice files.

    Each H5 file contains:
        image : (240, 240, 4) float — 4 MRI modalities
        mask  : (240, 240, 3) uint8 — 3 binary channels (NCR/NET, ED, ET)

    Returns
    -------
    volumes : dict mapping volume_id → (image, seg)
        image : (4, D, 240, 240)  float32 — z-score normalized per modality
        seg   : (D, 240, 240)     uint8   — class labels 0,1,2,3
    """
    # Find all H5 files and group by volume
    h5_files = glob.glob(os.path.join(data_dir, "volume_*_slice_*.h5"))
    if len(h5_files) == 0:
        return {}

    # Parse filenames: volume_X_slice_Y.h5
    vol_slices = defaultdict(list)
    for path in h5_files:
        fname = os.path.basename(path)
        # volume_0_slice_80.h5
        parts = fname.replace(".h5", "").split("_")
        vol_id = int(parts[1])
        slice_id = int(parts[3])
        vol_slices[vol_id].append((slice_id, path))

    # Sort slices within each volume
    for vol_id in vol_slices:
        vol_slices[vol_id].sort(key=lambda x: x[0])

    print(f"Found {len(vol_slices)} volumes from {len(h5_files)} H5 slices")

    volumes = {}
    for vol_id in sorted(vol_slices.keys()):
        slices = vol_slices[vol_id]
        n_slices = len(slices)

        # Pre-allocate
        image_vol = np.zeros((4, n_slices, 240, 240), dtype=np.float32)
        seg_vol = np.zeros((n_slices, 240, 240), dtype=np.uint8)

        for i, (slice_id, path) in enumerate(slices):
            with h5py.File(path, "r") as f:
                img = f["image"][:].astype(np.float32)   # (240, 240, 4)
                msk = f["mask"][:].astype(np.uint8)      # (240, 240, 3)

            # image: (240,240,4) → channels-first per slice
            image_vol[:, i, :, :] = img.transpose(2, 0, 1)  # (4, 240, 240)

            # mask: 3-channel binary → single class map
            seg = np.zeros((240, 240), dtype=np.uint8)
            seg[msk[:, :, 0] == 1] = 1  # NCR/NET
            seg[msk[:, :, 1] == 1] = 2  # Edema
            seg[msk[:, :, 2] == 1] = 3  # ET
            seg_vol[i] = seg

        volumes[vol_id] = (image_vol, seg_vol)

    return volumes


# ---------------------------------------------------------------------------
# NIfTI volume loading
# ---------------------------------------------------------------------------

def load_nifti_volume(subject_dir: str) -> Tuple[np.ndarray, np.ndarray]:
    """
    Load a single BraTS NIfTI subject.

    Returns
    -------
    image : (4, D, H, W) float32 — z-score normalized per modality
    seg   : (D, H, W) uint8     — class labels 0,1,2,3
    """
    import nibabel as nib

    subject_name = os.path.basename(subject_dir)
    modalities = ["t1", "t1ce", "t2", "flair"]

    channels = []
    for mod in modalities:
        path = os.path.join(subject_dir, f"{subject_name}_{mod}.nii.gz")
        if not os.path.exists(path):
            path = os.path.join(subject_dir, f"{subject_name}_{mod}.nii")
        if not os.path.exists(path):
            # Fallback for alternative naming
            for f in os.listdir(subject_dir):
                if f.endswith(f"_{mod}.nii") or f.endswith(f"_{mod}.nii.gz") or f.endswith(f"_{mod.upper()}.nii.gz") or f.endswith(f"_{mod.upper()}.nii"):
                    path = os.path.join(subject_dir, f)
                    break

        vol = nib.load(path).get_fdata().astype(np.float32)
        channels.append(vol)
    image = np.stack(channels, axis=0)  # (4, D, H, W)

    # Z-score normalize each modality (non-zero voxels only)
    for c in range(4):
        mask = image[c] > 0
        if mask.sum() > 0:
            image[c][mask] = (image[c][mask] - image[c][mask].mean()) / (image[c][mask].std() + 1e-8)

    seg_path = os.path.join(subject_dir, f"{subject_name}_seg.nii.gz")
    if not os.path.exists(seg_path):
        seg_path = os.path.join(subject_dir, f"{subject_name}_seg.nii")
    if not os.path.exists(seg_path):
        for f in os.listdir(subject_dir):
            if f.endswith(f"_seg.nii") or f.endswith(f"_seg.nii.gz"):
                seg_path = os.path.join(subject_dir, f)
                break
    
    seg = nib.load(seg_path).get_fdata().astype(np.uint8)
    seg[seg == 4] = 3  # ET: 4 → 3

    return image, seg


# ---------------------------------------------------------------------------
# Auto-detect data format
# ---------------------------------------------------------------------------

def detect_data_format(data_dir: str) -> str:
    """Detect whether data_dir contains H5 slices or NIfTI subject folders."""
    h5_files = glob.glob(os.path.join(data_dir, "volume_*_slice_*.h5"))
    if len(h5_files) > 0:
        return "h5"

    nifti_dirs = [d for d in os.listdir(data_dir)
                  if os.path.isdir(os.path.join(data_dir, d)) and d.startswith("BraTS")]
    if len(nifti_dirs) > 0:
        return "nifti"

    raise FileNotFoundError(
        f"Could not detect data format in {data_dir}. "
        "Expected either volume_*_slice_*.h5 files or BraTS20_Training_* folders."
    )


# ---------------------------------------------------------------------------
# 3D Augmentation
# ---------------------------------------------------------------------------

def augment_3d(image: np.ndarray, seg: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    MRI-appropriate 3D augmentations: flips + intensity jitter.
    image: (4,D,H,W), seg: (D,H,W)
    """
    for axis in [1, 2, 3]:
        if random.random() > 0.5:
            image = np.flip(image, axis=axis).copy()
            seg = np.flip(seg, axis=axis - 1).copy()

    if random.random() > 0.5:
        for c in range(4):
            scale = random.uniform(0.9, 1.1)
            shift = random.uniform(-0.1, 0.1)
            image[c] = image[c] * scale + shift

    return image, seg


# ---------------------------------------------------------------------------
# Patch extraction with tumor-centered sampling
# ---------------------------------------------------------------------------

def extract_patch(
    image: np.ndarray,
    seg: np.ndarray,
    patch_size: Tuple[int, int, int],
    fg_ratio: float = 0.7,
    et_ratio: float = 0.5,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Extract a single 3D patch with tumor-centered sampling.

    Strategy:
        - fg_ratio chance: center on foreground voxel
            - et_ratio of those: center on ET (class 3)
            - rest: center on any tumor voxel
        - 1-fg_ratio chance: random location
    """
    pD, pH, pW = patch_size
    D, H, W = seg.shape

    # Ensure volume is large enough for the patch
    # If volume is smaller than patch in any dim, pad it
    if D < pD or H < pH or W < pW:
        pad_d = max(pD - D, 0)
        pad_h = max(pH - H, 0)
        pad_w = max(pW - W, 0)
        image = np.pad(image, ((0,0), (0,pad_d), (0,pad_h), (0,pad_w)), mode='constant')
        seg = np.pad(seg, ((0,pad_d), (0,pad_h), (0,pad_w)), mode='constant')
        D, H, W = seg.shape

    center = None

    if random.random() < fg_ratio:
        if random.random() < et_ratio:
            et_coords = np.argwhere(seg == 3)
            if len(et_coords) > 0:
                center = et_coords[random.randint(0, len(et_coords) - 1)]

        if center is None:
            fg_coords = np.argwhere(seg > 0)
            if len(fg_coords) > 0:
                center = fg_coords[random.randint(0, len(fg_coords) - 1)]

    if center is None:
        center = np.array([
            random.randint(pD // 2, max(pD // 2, D - pD // 2 - 1)),
            random.randint(pH // 2, max(pH // 2, H - pH // 2 - 1)),
            random.randint(pW // 2, max(pW // 2, W - pW // 2 - 1)),
        ])

    d0 = int(np.clip(center[0] - pD // 2, 0, D - pD))
    h0 = int(np.clip(center[1] - pH // 2, 0, H - pH))
    w0 = int(np.clip(center[2] - pW // 2, 0, W - pW))

    patch_img = image[:, d0:d0+pD, h0:h0+pH, w0:w0+pW]
    patch_seg = seg[d0:d0+pD, h0:h0+pH, w0:w0+pW]

    return patch_img, patch_seg


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class BraTS3DDataset(Dataset):
    """
    3D volumetric BraTS dataset with tumor-centered patch sampling.
    Auto-detects H5 slices or NIfTI folders.

    Parameters
    ----------
    data_dir      : str  — Root directory with H5 files or NIfTI subject folders
    split         : str  — 'train' or 'val'
    patch_size    : tuple — (D, H, W) patch dimensions
    patches_per_volume : int — Patches per volume per epoch
    augment       : bool — Apply 3D augmentations
    val_ratio     : float — Fraction for validation
    fg_ratio      : float — Probability of foreground-centered patch
    et_ratio      : float — Among FG, probability of ET-centered
    seed          : int  — Random seed for split
    """

    def __init__(
        self,
        data_dir: str,
        split: str = "train",
        patch_size: Tuple[int, int, int] = PATCH_SIZE,
        patches_per_volume: int = 4,
        augment: bool = True,
        val_ratio: float = 0.15,
        fg_ratio: float = 0.7,
        et_ratio: float = 0.5,
        seed: int = 42,
    ):
        super().__init__()
        self.split = split
        self.patch_size = patch_size
        self.patches_per_volume = patches_per_volume
        self.augment = augment and (split == "train")
        self.fg_ratio = fg_ratio
        self.et_ratio = et_ratio

        # Detect format and load volumes
        self.data_format = detect_data_format(data_dir)
        print(f"Detected data format: {self.data_format.upper()}")

        if self.data_format == "h5":
            all_volumes = reconstruct_volumes_from_h5(data_dir)
            vol_ids = sorted(all_volumes.keys())
            self._lazy = False
        else:
            # NIfTI — build subject list (lazy-loaded on access)
            # Only include directories that actually contain .nii or .nii.gz files inside them
            subjects = [
                d for d in os.listdir(data_dir)
                if os.path.isdir(os.path.join(data_dir, d)) 
                and any(f.endswith('.nii.gz') or f.endswith('.nii') for f in os.listdir(os.path.join(data_dir, d)))
            ]
            subjects = sorted(subjects)
            vol_ids = list(range(len(subjects)))
            all_volumes = {}
            self._lazy = True
            self._subject_dirs = {i: os.path.join(data_dir, s) for i, s in enumerate(subjects)}

        if len(vol_ids) == 0:
            raise FileNotFoundError(f"No volumes found in {data_dir}")

        # Patient-level split
        rng = random.Random(seed)
        rng.shuffle(vol_ids)
        n_val = max(1, int(len(vol_ids) * val_ratio))

        if split == "val":
            selected = vol_ids[:n_val]
        else:
            selected = vol_ids[n_val:]

        # Store volumes (H5: all in RAM, NIfTI: lazy-loaded + LRU cache)
        if self._lazy:
            self.volumes: Dict[int, Tuple[np.ndarray, np.ndarray]] = {}
            self._selected_dirs = {vid: self._subject_dirs[vid] for vid in selected}
        else:
            self.volumes = {vid: all_volumes[vid] for vid in selected}
        self.vol_ids = sorted(selected)

        # Build sample index
        self.samples = []
        for vid in self.vol_ids:
            for p in range(self.patches_per_volume):
                self.samples.append(vid)

        print(
            f"[{split.upper()}] {len(self.vol_ids)} volumes × "
            f"{patches_per_volume} patches = {len(self.samples)} samples/epoch"
        )

    def _get_volume(self, vid: int) -> Tuple[np.ndarray, np.ndarray]:
        """Get volume, loading from disk on first access (NIfTI lazy mode)."""
        if vid not in self.volumes:
            self.volumes[vid] = load_nifti_volume(self._selected_dirs[vid])
        return self.volumes[vid]

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        vid = self.samples[idx]
        image, seg = self._get_volume(vid)

        patch_img, patch_seg = extract_patch(
            image, seg, self.patch_size,
            fg_ratio=self.fg_ratio if self.split == "train" else 0.5,
            et_ratio=self.et_ratio if self.split == "train" else 0.3,
        )

        if self.augment:
            patch_img, patch_seg = augment_3d(patch_img, patch_seg)

        return {
            "image": torch.from_numpy(patch_img.copy()).float(),
            "mask": torch.from_numpy(patch_seg.copy()).long(),
            "volume_id": vid,
        }


# ---------------------------------------------------------------------------
# DataLoader factory
# ---------------------------------------------------------------------------

def get_3d_dataloaders(
    data_dir: str,
    batch_size: int = 1,
    patch_size: Tuple[int, int, int] = PATCH_SIZE,
    patches_per_volume: int = 4,
    num_workers: int = 4,
    **kwargs,
) -> Tuple[DataLoader, DataLoader]:
    """
    Returns (train_loader, val_loader) for 3D volumetric training.
    Auto-detects H5 or NIfTI format.
    """
    train_ds = BraTS3DDataset(
        data_dir, split="train", patch_size=patch_size,
        patches_per_volume=patches_per_volume, augment=True,
    )
    val_ds = BraTS3DDataset(
        data_dir, split="val", patch_size=patch_size,
        patches_per_volume=2, augment=False,
    )
    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=num_workers, pin_memory=True, drop_last=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        num_workers=num_workers, pin_memory=True,
    )
    return train_loader, val_loader


# ---------------------------------------------------------------------------
# Quick sanity check
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", type=str, required=True,
                        help="Path to BraTS data (H5 slices or NIfTI folders)")
    args = parser.parse_args()

    train_loader, val_loader = get_3d_dataloaders(args.data_dir, batch_size=1)
    batch = next(iter(train_loader))
    print(f"\nImage shape : {batch['image'].shape}")
    print(f"Mask shape  : {batch['mask'].shape}")
    print(f"Mask classes : {torch.unique(batch['mask'])}")
