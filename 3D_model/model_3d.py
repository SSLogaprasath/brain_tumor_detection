"""
model_3d.py — 3D Attention U-Net for Brain Tumor Segmentation
==============================================================
A 3D Attention U-Net that accepts 4-channel volumetric MRI input
(T1, T1ce, T2, FLAIR) and outputs a multi-class segmentation mask
with 4 classes:
    0 — Background
    1 — Necrotic / Non-Enhancing Tumor Core (NCR/NET)
    2 — Peritumoral Edema (ED)
    3 — GD-Enhancing Tumor (ET)

Architecture highlights:
    • All operations are 3D (Conv3d, BatchNorm3d, MaxPool3d, etc.)
    • Encoder: 4 downsampling blocks with double-conv + InstanceNorm + LeakyReLU
    • Bottleneck: Double-conv at the lowest resolution
    • Decoder: 4 upsampling blocks with Attention Gates on skip connections
    • Deep Supervision: Auxiliary segmentation heads at decoder levels 4, 3, 2
    • Final: 1×1×1 convolution → NUM_CLASSES channels

Channel progression (reduced vs 2D to fit in GPU memory):
    Encoder:     4 → 32 → 64 → 128 → 256
    Bottleneck:  256 → 512
    Decoder:     512 → 256 → 128 → 64 → 32
    Head:        32 → NUM_CLASSES

Expected input shape:  (B, 4, D, H, W) — e.g. (B, 4, 128, 128, 128)
Expected output shape: (B, 4, D, H, W)

Target hardware: Cloud GPU (A100/H100 80 GB)
Estimated params: ~35M

Reference:
    Oktay et al., "Attention U-Net: Learning Where to Look for the Pancreas",
    MIDL 2018. arXiv:1804.03999
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

NUM_CLASSES = 4  # BG, NCR/NET, ED, ET


# ======================================================================
# Building blocks
# ======================================================================

class DoubleConv3D(nn.Module):
    """(Conv3d → InstanceNorm3d → LeakyReLU) × 2

    Uses InstanceNorm instead of BatchNorm for better performance with
    small batch sizes typical in 3D medical imaging.
    """

    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv3d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.InstanceNorm3d(out_ch, affine=True),
            nn.LeakyReLU(negative_slope=0.01, inplace=True),
            nn.Conv3d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.InstanceNorm3d(out_ch, affine=True),
            nn.LeakyReLU(negative_slope=0.01, inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class AttentionGate3D(nn.Module):
    """
    Additive Attention Gate (3D).

    Takes the gating signal *g* (from the decoder) and the skip
    connection *x* (from the encoder), computes an attention coefficient
    map α ∈ [0, 1], and returns x * α.

    Parameters
    ----------
    F_g  : int — channels in the gating signal
    F_l  : int — channels in the skip connection (encoder feature)
    F_int: int — intermediate channel count (typically F_l // 2)
    """

    def __init__(self, F_g: int, F_l: int, F_int: int):
        super().__init__()
        self.W_g = nn.Sequential(
            nn.Conv3d(F_g, F_int, kernel_size=1, bias=True),
            nn.InstanceNorm3d(F_int, affine=True),
        )
        self.W_x = nn.Sequential(
            nn.Conv3d(F_l, F_int, kernel_size=1, bias=True),
            nn.InstanceNorm3d(F_int, affine=True),
        )
        self.psi = nn.Sequential(
            nn.Conv3d(F_int, 1, kernel_size=1, bias=True),
            nn.InstanceNorm3d(1, affine=True),
            nn.Sigmoid(),
        )
        self.relu = nn.LeakyReLU(negative_slope=0.01, inplace=True)

    def forward(self, g: torch.Tensor, x: torch.Tensor) -> torch.Tensor:
        """
        g : gating signal  (B, F_g, D, H, W)  — from decoder (coarser)
        x : skip connection (B, F_l, D, H, W)  — from encoder (finer)
        """
        g1 = self.W_g(g)
        x1 = self.W_x(x)
        # Align spatial dims (g may be slightly smaller after up-conv)
        if g1.shape[2:] != x1.shape[2:]:
            g1 = F.interpolate(g1, size=x1.shape[2:], mode="trilinear",
                               align_corners=True)
        psi = self.relu(g1 + x1)
        psi = self.psi(psi)          # (B, 1, D, H, W) attention coefficients
        return x * psi               # element-wise re-weighting


class DownBlock3D(nn.Module):
    """MaxPool3d → DoubleConv3D"""

    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.pool_conv = nn.Sequential(
            nn.MaxPool3d(2),
            DoubleConv3D(in_ch, out_ch),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.pool_conv(x)


class UpBlock3D(nn.Module):
    """Transpose-Conv upsample → Attention Gate → Concat skip → DoubleConv"""

    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.up = nn.ConvTranspose3d(in_ch, out_ch, kernel_size=2, stride=2)
        self.attn = AttentionGate3D(F_g=out_ch, F_l=out_ch, F_int=out_ch // 2)
        self.conv = DoubleConv3D(out_ch * 2, out_ch)

    def forward(self, x: torch.Tensor, skip: torch.Tensor) -> torch.Tensor:
        x = self.up(x)
        # Pad if sizes don't match exactly (odd input dims)
        diff_d = skip.shape[2] - x.shape[2]
        diff_h = skip.shape[3] - x.shape[3]
        diff_w = skip.shape[4] - x.shape[4]
        x = F.pad(x, [
            diff_w // 2, diff_w - diff_w // 2,
            diff_h // 2, diff_h - diff_h // 2,
            diff_d // 2, diff_d - diff_d // 2,
        ])
        skip = self.attn(g=x, x=skip)      # attention-gated skip
        x = torch.cat([x, skip], dim=1)     # (B, 2*out_ch, D, H, W)
        return self.conv(x)


# ======================================================================
# Full 3D Attention U-Net with Deep Supervision
# ======================================================================

class AttentionUNet3D(nn.Module):
    """
    3D Attention U-Net for volumetric brain tumor segmentation.

    Channel progression (default):
        Encoder:     4 → 32 → 64 → 128 → 256
        Bottleneck:  256 → 512
        Decoder:     512 → 256 → 128 → 64 → 32
        Head:        32 → NUM_CLASSES

    Deep Supervision:
        Auxiliary segmentation heads at decoder levels 4, 3, 2 that are
        upsampled to full resolution during training. Disabled at inference.

    Parameters
    ----------
    in_channels  : int  — Number of input channels (4 for BraTS).
    out_channels : int  — Number of output classes (4: BG, NCR/NET, ED, ET).
    features     : list — Feature map sizes at each encoder level.
    deep_supervision : bool — Enable deep supervision heads (default: True).
    """

    def __init__(
        self,
        in_channels: int = 4,
        out_channels: int = NUM_CLASSES,
        features: list = None,
        deep_supervision: bool = True,
    ):
        super().__init__()
        if features is None:
            features = [32, 64, 128, 256]

        self.deep_supervision = deep_supervision

        # ---- Encoder ----
        self.enc1 = DoubleConv3D(in_channels, features[0])       # 32
        self.enc2 = DownBlock3D(features[0], features[1])         # 64
        self.enc3 = DownBlock3D(features[1], features[2])         # 128
        self.enc4 = DownBlock3D(features[2], features[3])         # 256

        # ---- Bottleneck ----
        self.bottleneck = DownBlock3D(features[3], features[3] * 2)  # 512

        # ---- Decoder (with attention) ----
        self.dec4 = UpBlock3D(features[3] * 2, features[3])      # 256
        self.dec3 = UpBlock3D(features[3], features[2])           # 128
        self.dec2 = UpBlock3D(features[2], features[1])           # 64
        self.dec1 = UpBlock3D(features[1], features[0])           # 32

        # ---- Segmentation head ----
        self.head = nn.Conv3d(features[0], out_channels, kernel_size=1)

        # ---- Deep supervision heads ----
        if self.deep_supervision:
            self.ds_head4 = nn.Conv3d(features[3], out_channels, kernel_size=1)  # 8x down
            self.ds_head3 = nn.Conv3d(features[2], out_channels, kernel_size=1)  # 4x down
            self.ds_head2 = nn.Conv3d(features[1], out_channels, kernel_size=1)  # 2x down

        # Weight init
        self.apply(self._init_weights)

    @staticmethod
    def _init_weights(m: nn.Module):
        if isinstance(m, (nn.Conv3d, nn.ConvTranspose3d)):
            nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="leaky_relu")
            if m.bias is not None:
                nn.init.zeros_(m.bias)
        elif isinstance(m, nn.InstanceNorm3d):
            if m.weight is not None:
                nn.init.ones_(m.weight)
            if m.bias is not None:
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor):
        """
        Parameters
        ----------
        x : (B, 4, D, H, W) — 4-channel volumetric MRI input

        Returns
        -------
        If training with deep_supervision:
            (logits, [ds4, ds3, ds2]) — main output + list of deep supervision outputs
            All shapes: (B, NUM_CLASSES, D, H, W)
        If eval or deep_supervision=False:
            logits : (B, NUM_CLASSES, D, H, W)
        """
        target_shape = x.shape[2:]  # (D, H, W)

        # Encoder
        s1 = self.enc1(x)     # (B, 32,  D,    H,    W)
        s2 = self.enc2(s1)    # (B, 64,  D/2,  H/2,  W/2)
        s3 = self.enc3(s2)    # (B, 128, D/4,  H/4,  W/4)
        s4 = self.enc4(s3)    # (B, 256, D/8,  H/8,  W/8)

        # Bottleneck
        b = self.bottleneck(s4)  # (B, 512, D/16, H/16, W/16)

        # Decoder + attention skip connections
        d4 = self.dec4(b, s4)    # (B, 256, D/8,  H/8,  W/8)
        d3 = self.dec3(d4, s3)   # (B, 128, D/4,  H/4,  W/4)
        d2 = self.dec2(d3, s2)   # (B, 64,  D/2,  H/2,  W/2)
        d1 = self.dec1(d2, s1)   # (B, 32,  D,    H,    W)

        logits = self.head(d1)   # (B, NUM_CLASSES, D, H, W)

        if self.deep_supervision and self.training:
            ds4 = self.ds_head4(d4)
            ds4 = F.interpolate(ds4, size=target_shape, mode="trilinear",
                                align_corners=True)
            ds3 = self.ds_head3(d3)
            ds3 = F.interpolate(ds3, size=target_shape, mode="trilinear",
                                align_corners=True)
            ds2 = self.ds_head2(d2)
            ds2 = F.interpolate(ds2, size=target_shape, mode="trilinear",
                                align_corners=True)
            return logits, [ds4, ds3, ds2]

        return logits


# ======================================================================
# Utility: param count & quick test
# ======================================================================

def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


if __name__ == "__main__":
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = AttentionUNet3D(in_channels=4, out_channels=NUM_CLASSES)
    model = model.to(device)
    print(f"3D Attention U-Net — {count_parameters(model):,} trainable parameters")

    # ------------------------------------------------------------------
    # Quick forward pass test with a small volume (128^3)
    # ------------------------------------------------------------------
    patch_size = 128
    dummy = torch.randn(1, 4, patch_size, patch_size, patch_size, device=device)

    # Training mode (deep supervision ON)
    model.train()
    out_train, ds_outputs = model(dummy)
    print(f"\n[Train mode]")
    print(f"  Input  shape : {dummy.shape}")
    print(f"  Output shape : {out_train.shape}")
    for i, ds in enumerate(ds_outputs):
        print(f"  DS head {i+1}    : {ds.shape}")
    assert out_train.shape == (1, NUM_CLASSES, patch_size, patch_size, patch_size)
    for ds in ds_outputs:
        assert ds.shape == out_train.shape, f"DS shape mismatch: {ds.shape}"

    # Eval mode (deep supervision OFF — single output)
    model.eval()
    with torch.no_grad():
        out_eval = model(dummy)
    print(f"\n[Eval mode]")
    print(f"  Input  shape : {dummy.shape}")
    print(f"  Output shape : {out_eval.shape}")
    assert out_eval.shape == (1, NUM_CLASSES, patch_size, patch_size, patch_size)

    print("\n✓ All forward pass checks OK")
