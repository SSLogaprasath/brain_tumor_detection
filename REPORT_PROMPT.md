# Brain Tumor Detection & Segmentation — Full Project Report Prompt

> Use this document as a comprehensive prompt to generate your academic/project report.
> It covers the entire system: current 2D Attention U-Net baseline, the proposed 3D enhancements, the full-stack application, database design, and end-to-end clinical workflow.

---

## 1. PROJECT OVERVIEW

### 1.1 Problem Statement

Brain tumors are among the most lethal cancers, and accurate delineation of tumor sub-regions in MRI scans is critical for surgical planning, radiotherapy targeting, and treatment monitoring. Manual segmentation by radiologists is time-consuming (30–60 minutes per volume), subjective, and prone to inter-observer variability. This project builds an **AI-assisted brain tumor segmentation system** that automates the initial segmentation, then places a radiologist in the loop for clinical validation.

### 1.2 Objective

Design and implement a full-stack medical imaging platform that:

1. Trains a deep learning model on the **BraTS 2020** benchmark dataset to segment three tumor sub-regions: Necrotic/Non-Enhancing Tumor Core (NCR/NET), Peritumoral Edema (ED), and GD-Enhancing Tumor (ET).
2. Provides a **Spring Boot REST API** backend with role-based access (Admin, Doctor, Radiologist, Lab Staff, Patient).
3. Delivers a **Next.js React frontend** with MRI upload, AI prediction visualization, a canvas-based mask editing tool, and a complete clinical review workflow.

### 1.3 Scope

- **Dataset:** BraTS 2020 (Kaggle pre-processed), 369 patient volumes, 4 MRI modalities (T1, T1ce, T2, FLAIR), 3 tumor sub-region labels.
- **Baseline Model:** 2D Attention U-Net (~8.7M parameters).
- **Proposed Enhancement:** Upgrade to 3D Attention U-Net with Deep Supervision, Boundary-Aware Loss, and Tumor-Centered Patch Sampling.
- **Deployment:** Spring Boot 3.2.3 + MySQL 8 backend, Next.js 16 frontend, Python inference subprocess.

---

## 2. DATASET — BraTS 2020

### 2.1 Source and Format

The **Brain Tumor Segmentation Challenge 2020 (BraTS 2020)** dataset is the standard benchmark for brain tumor segmentation research. The pre-processed version from Kaggle stores each 2D axial slice as an HDF5 (.h5) file containing:

| Key     | Shape         | Dtype   | Description                                      |
| ------- | ------------- | ------- | ------------------------------------------------ |
| `image` | (240, 240, 4) | float64 | Z-score normalized: T1, T1ce, T2, FLAIR channels |
| `mask`  | (240, 240, 3) | uint8   | 3 binary channels: NCR/NET, Edema, ET            |

### 2.2 MRI Modalities

| Modality | Full Name                            | Clinical Purpose                                           |
| -------- | ------------------------------------ | ---------------------------------------------------------- |
| T1       | T1-weighted                          | Anatomical structure, gray/white matter contrast           |
| T1ce     | T1-weighted with Gadolinium contrast | Highlights enhancing tumor (blood-brain barrier breakdown) |
| T2       | T2-weighted                          | Highlights edema (fluid appears bright)                    |
| FLAIR    | Fluid-Attenuated Inversion Recovery  | Edema without CSF confusion                                |

### 2.3 Tumor Sub-Regions and BraTS Evaluation Hierarchy

The 3 binary mask channels are converted to a 4-class label map:

| Class ID | Label                               | Abbreviation |
| -------- | ----------------------------------- | ------------ |
| 0        | Background                          | BG           |
| 1        | Necrotic / Non-Enhancing Tumor Core | NCR/NET      |
| 2        | Peritumoral Edema                   | ED           |
| 3        | GD-Enhancing Tumor                  | ET           |

**BraTS Official Evaluation Metrics** (Dice Similarity Coefficient):

| Metric      | Composition       | Clinical Meaning                          |
| ----------- | ----------------- | ----------------------------------------- |
| **ET Dice** | Class 3 only      | Enhancing Tumor — most aggressive region  |
| **TC Dice** | Classes 1 + 3     | Tumor Core — surgical target              |
| **WT Dice** | Classes 1 + 2 + 3 | Whole Tumor — full extent including edema |

### 2.4 Data Splitting Strategy

- Split by **patient volume** (not by slice) to prevent data leakage.
- 85% training / 15% validation (random seed = 42).
- Only tumor-containing slices are used (`tumor_only=True`) to avoid training on empty backgrounds.

### 2.5 Data Augmentation (Training Only)

| Augmentation      | Probability | Parameters                                  |
| ----------------- | ----------- | ------------------------------------------- |
| Horizontal flip   | 50%         | —                                           |
| Vertical flip     | 50%         | —                                           |
| Random rotation   | 50%         | ±15° (bilinear for image, nearest for mask) |
| Intensity scaling | 50%         | Factor 0.9–1.1 (per-channel)                |

Color jitter and hue shifts are **not applied** because they are physically meaningless for MRI data.

---

## 3. CURRENT BASELINE — 2D ATTENTION U-NET

### 3.1 Architecture Overview

The baseline model follows **Attention U-Net** (Oktay et al., "Attention U-Net: Learning Where to Look for the Pancreas", MIDL 2018, arXiv:1804.03999). It is a 2D encoder-decoder network with attention gates on the skip connections.

**Input:** `(B, 4, 240, 240)` — 4 MRI modalities
**Output:** `(B, 4, 240, 240)` — 4-class logits (BG, NCR/NET, ED, ET)
**Parameters:** ~8.7 million trainable

### 3.2 Building Blocks

#### DoubleConv

```
Conv2d(3×3, padding=1, no bias) → BatchNorm2d → ReLU → Conv2d(3×3, padding=1, no bias) → BatchNorm2d → ReLU
```

This is the fundamental feature extraction unit used at every level.

#### Attention Gate (Core Innovation)

The Attention Gate takes two inputs:

- **g (gating signal):** Feature map from the decoder (coarser resolution, richer semantic context)
- **x (skip connection):** Feature map from the encoder (finer resolution, richer spatial detail)

**Mechanism:**

1. Project g through 1×1 Conv + BN → F_int channels (W_g)
2. Project x through 1×1 Conv + BN → F_int channels (W_x)
3. Element-wise sum: W_g(g) + W_x(x), with bilinear interpolation if spatial dimensions differ
4. ReLU activation
5. 1×1 Conv + BN + **Sigmoid** → attention coefficient α ∈ [0, 1] (single-channel spatial map)
6. Output: **x × α** — element-wise re-weighting of the skip connection

**Purpose:** The attention gate learns to suppress irrelevant regions (background, healthy tissue) and highlight salient features (tumor boundaries, enhancing regions) in the skip connections. Unlike standard U-Net which blindly concatenates encoder features, Attention U-Net selectively filters what spatial information flows to the decoder.

#### DownBlock

```
MaxPool2d(kernel=2, stride=2) → DoubleConv
```

#### UpBlock

```
ConvTranspose2d(kernel=2, stride=2) → AttentionGate(g=upsampled, x=skip) → Concatenate → DoubleConv
```

Includes padding logic for odd spatial dimensions.

### 3.3 Network Architecture Table

| Stage      | Block          | Output Channels | Spatial Resolution |
| ---------- | -------------- | --------------: | -----------------: |
| Input      | —              |               4 |          240 × 240 |
| Encoder 1  | DoubleConv     |              64 |          240 × 240 |
| Encoder 2  | DownBlock      |             128 |          120 × 120 |
| Encoder 3  | DownBlock      |             256 |            60 × 60 |
| Encoder 4  | DownBlock      |             512 |            30 × 30 |
| Bottleneck | DownBlock      |            1024 |            15 × 15 |
| Decoder 4  | UpBlock + Attn |             512 |            30 × 30 |
| Decoder 3  | UpBlock + Attn |             256 |            60 × 60 |
| Decoder 2  | UpBlock + Attn |             128 |          120 × 120 |
| Decoder 1  | UpBlock + Attn |              64 |          240 × 240 |
| Head       | Conv2d 1×1     |     4 (classes) |          240 × 240 |

### 3.4 Weight Initialization

- **Conv2d / ConvTranspose2d:** Kaiming Normal (fan_out, ReLU nonlinearity)
- **BatchNorm2d:** weight = 1, bias = 0

### 3.5 Loss Function — DiceCE Loss

Combined loss for class-imbalanced medical segmentation:

```
L_total = α × L_Dice + (1 − α) × L_CE,   where α = 0.5
```

**Dice Loss:**

- Soft Dice computed **per-class** (excluding background class 0)
- Laplace smoothing ε = 1.0 to avoid division by zero
- Formula per class c: Dice_c = (2 × |P_c ∩ G_c| + ε) / (|P_c| + |G_c| + ε)
- L_Dice = 1 − mean(Dice_c for c ∈ {1, 2, 3})

**Cross-Entropy Loss:**

- Class weights: [0.1, 1.0, 1.0, 1.5] for [BG, NCR/NET, ED, ET]
- Background heavily down-weighted (0.1) because it dominates ~95% of pixels
- Enhancing Tumor up-weighted (1.5) because it is the smallest and most clinically critical

### 3.6 Training Configuration

| Parameter             | Value                                           |
| --------------------- | ----------------------------------------------- |
| Optimizer             | AdamW                                           |
| Learning rate         | 3 × 10⁻⁴                                        |
| Weight decay          | 1 × 10⁻⁴                                        |
| LR scheduler          | Cosine Annealing (η_min = 1 × 10⁻⁶)             |
| Epochs                | 50                                              |
| Actual batch size     | 2 (fits in 6 GB VRAM)                           |
| Gradient accumulation | 4 steps → effective batch size = 8              |
| Gradient clipping     | Max norm = 1.0                                  |
| Mixed precision (AMP) | float16 with GradScaler                         |
| NaN handling          | Skip NaN/Inf batches to prevent collapse        |
| Best model selection  | Highest Whole Tumor (WT) Dice on validation set |
| Checkpoint interval   | Every 10 epochs + best model                    |
| Hardware target       | NVIDIA RTX 4050 (6 GB VRAM)                     |

### 3.7 Limitations of the 2D Baseline

1. **No Volumetric Context:** Each 240×240 slice is processed independently. The model cannot learn from adjacent slices, missing 3D spatial continuity of tumors that span many slices.
2. **Vanishing Gradients in Deep Decoder:** Deep supervision is absent — gradients must backpropagate through the entire decoder before reaching the bottleneck and encoder.
3. **Blurry Boundaries:** The standard Dice+CE loss optimizes region overlap, not boundary precision. Tumor edges are often fuzzy, especially for enhancing tumor which has irregular boundaries.
4. **ET Class Weakness:** Enhancing Tumor (ET) is the smallest sub-region (often <5% of tumor volume). Despite the 1.5× CE weight, the class imbalance remains a challenge. No sampling strategy focuses training on slices rich in ET.

---

## 4. PROPOSED ENHANCEMENTS — 2D → 3D UPGRADE

### Architecture Evolution

```
Base:   2D Attention U-Net         →  3D Attention U-Net         (volumetric context)
Add 1:  + Deep Supervision                                       (better gradient flow)
Add 2:  + Boundary-Aware Loss                                    (sharper tumor edges)
Add 3:  + Tumor-Centered Patch Sampling                          (fixes ET weakness)
```

### 4.1 Enhancement 1: 3D Attention U-Net (Volumetric Context)

**Motivation:** Brain tumors are 3D structures. A 2D model treats each axial slice independently, losing inter-slice continuity. A 3D model processes volumetric patches (e.g., 128 × 128 × 128) and can learn from the 3D shape, extent, and texture of tumors.

**Changes:**

- Replace all `Conv2d` → `Conv3d`, `BatchNorm2d` → `BatchNorm3d`, `MaxPool2d` → `MaxPool3d`, `ConvTranspose2d` → `ConvTranspose3d`
- Input changes from `(B, 4, 240, 240)` 2D slices to `(B, 4, D, H, W)` 3D volumetric patches
- Attention Gates operate in 3D space — attention coefficients α become a 3D spatial map `(B, 1, D, H, W)`
- Typical patch size: 128 × 128 × 128 voxels (or smaller depending on GPU memory)

**Expected Benefit:** The model captures the full 3D morphology of the tumor, especially the vertical (slice-to-slice) extent which is invisible to 2D models. Literature shows 3D U-Net variants consistently outperform 2D by 2-5% Dice on BraTS.

**Trade-off:** Significantly higher memory and compute cost. Requires larger GPU (12+ GB) or aggressive patch-based training.

### 4.2 Enhancement 2: Deep Supervision

**Motivation:** In a standard U-Net, the loss is computed only at the final output. Gradients must travel through the entire decoder chain. For the deepest encoder layers, this can lead to vanishing gradients and slow convergence.

**Mechanism:**

- Add auxiliary segmentation heads at **intermediate decoder levels** (e.g., at decoder stages 4, 3, and 2)
- Each auxiliary head is a 1×1 Conv that produces a class prediction at that resolution
- Auxiliary predictions are upsampled (trilinear/bilinear) to the full resolution for loss computation
- Final loss is a weighted sum:

```
L_total = w_0 × L_main + w_1 × L_aux1 + w_2 × L_aux2 + w_3 × L_aux3
```

Typical weights: w_0 = 1.0, w_1 = 0.4, w_2 = 0.2, w_3 = 0.1 (decreasing for coarser levels).

**At inference time:** Only the main head is used; auxiliary heads are discarded.

**Expected Benefit:** Each decoder level receives direct loss supervision, providing stronger gradients to earlier layers. This provides faster convergence and improved segmentation at fine spatial scales.

### 4.3 Enhancement 3: Boundary-Aware Loss

**Motivation:** Standard region-based losses (Dice, CE) optimize volume overlap but do not specifically penalize boundary inaccuracies. Tumor edges — especially between enhancing tumor and edema, or between tumor core and healthy tissue — are clinically critical for surgical planning.

**Mechanism:** Add a boundary-focused component to the loss function:

**Approach — Boundary Dice + Distance Map Weighting:**

1. **Extract boundary masks:** For each class, compute the boundary by morphological erosion/dilation or Sobel filtering of the ground truth.
2. **Boundary Dice Loss:** Compute Dice only on boundary pixels (thin band around tumor edges). This directly optimizes edge precision.
3. **Distance Map Weighting:** Pre-compute a distance transform from the tumor boundary. Pixels near boundaries receive higher weight in the CE loss.

```
L_total = α × L_Dice + β × L_CE + γ × L_BoundaryDice
```

With typical values: α = 0.4, β = 0.3, γ = 0.3.

**Expected Benefit:** Sharper, more precise tumor boundaries with fewer false positives/negatives at edges. Particularly beneficial for the irregular enhancing tumor boundary.

### 4.4 Enhancement 4: Tumor-Centered Patch Sampling

**Motivation:** In BraTS data, enhancing tumor (ET) is the smallest sub-region, often only a few hundred voxels in a 240×240×155 volume. Random uniform patch sampling frequently produces patches with little or no ET, causing the model to underfit this clinically critical class.

**Mechanism:**

- During training, sample patches with a **bias toward tumor center**:
  - 70% of patches are centered on a randomly selected tumor voxel (with random jitter)
  - 30% of patches are sampled uniformly at random (to maintain background learning)
- For ET specifically, ensure the training sees proportionally more patches containing enhancing tumor:
  - Within the 70% foreground-centered patches, 50% are centered on ET voxels (when present)

**Expected Benefit:** The model sees 2-3× more ET examples during training, directly addressing the class imbalance at the sampling level rather than just the loss level. Combined with the 1.5× CE weight for ET, this provides a two-pronged attack on the ET weakness.

### 4.5 Summary: Proposed vs. Baseline

| Aspect             | 2D Baseline                 | 3D Proposed                                    |
| ------------------ | --------------------------- | ---------------------------------------------- |
| Input              | 2D slice (4, 240, 240)      | 3D patch (4, 128, 128, 128)                    |
| Convolutions       | Conv2d                      | Conv3d                                         |
| Attention Gates    | 2D spatial attention α      | 3D volumetric attention α                      |
| Supervision        | Final output only           | Main + 3 auxiliary decoder heads               |
| Loss               | 0.5×Dice + 0.5×CE           | Dice + CE + Boundary Dice + Distance Weighting |
| Sampling           | Random tumor slices         | Tumor-centered 3D patch (70/30 foreground/bg)  |
| ET handling        | 1.5× CE weight only         | 1.5× CE + preferential ET patch centering      |
| Volumetric context | None (slice-independent)    | Full 3D spatial context                        |
| Gradient flow      | Single final loss path      | Multi-scale deep supervision                   |
| Boundary precision | Optimized by region overlap | Explicit boundary loss + distance weighting    |

---

## 5. FULL-STACK APPLICATION ARCHITECTURE

### 5.1 Technology Stack

| Layer        | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| ML Framework | PyTorch (Python 3.x)                                             |
| Backend      | Spring Boot 3.2.3, Java 17, Spring Data JPA, Spring Security     |
| Database     | MySQL 8                                                          |
| Frontend     | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Konva (Canvas) |
| Auth         | JWT (stateless), BCrypt password hashing                         |
| Build        | Maven (Java), npm (frontend), pip (Python)                       |

### 5.2 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 16)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │  Login/  │ │ Dashboard│ │   MRI Upload  │ │  Segmentation     │  │
│  │ Register │ │ (5 roles)│ │   (Lab Staff) │ │  Editor (Konva)   │  │
│  └──────────┘ └──────────┘ └──────────────┘ └───────────────────┘  │
│                   │ Axios + JWT Cookie                              │
│                   ▼ (Proxied /api/backend → :8080/api)             │
├─────────────────────────────────────────────────────────────────────┤
│                 BACKEND (Spring Boot 3.2.3)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ AuthController│ │ MriController│  │ ReviewController        │   │
│  │ (login/register)│ (upload/query)│  │ (submit/pending/history)│   │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬───────────────┘   │
│         │                │                     │                    │
│  ┌──────▼──────┐  ┌──────▼───────┐  ┌─────────▼───────────────┐   │
│  │ JwtUtils +  │  │  MriService  │  │    ReviewService        │   │
│  │ JwtFilter   │  │              │  │                         │   │
│  └─────────────┘  └──────┬───────┘  └─────────────────────────┘   │
│                          │ @Async                                   │
│                   ┌──────▼────────────┐                             │
│                   │ AiInferenceService │                            │
│                   │ (ProcessBuilder)   │                            │
│                   └──────┬────────────┘                             │
│                          │ stdout KEY=VALUE                         │
├──────────────────────────┼──────────────────────────────────────────┤
│                   ┌──────▼────────────┐                             │
│                   │  Python inference  │   ML LAYER                 │
│                   │  inference.py      │                            │
│                   │  ┌──────────────┐  │                            │
│                   │  │AttentionUNet │  │                            │
│                   │  │ (.pth model) │  │                            │
│                   │  └──────────────┘  │                            │
│                   └───────────────────┘                             │
├─────────────────────────────────────────────────────────────────────┤
│                       DATABASE (MySQL 8)                            │
│  role | user | patient | doctor | hospital | lab | radiologist     │
│  mri_meta_data | ai_predictions | radiologist_review               │
│  phone_numbers | address | phone_number_type | address_type        │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Role-Based Access Control

| Role        | ID  | Capabilities                                                    |
| ----------- | --- | --------------------------------------------------------------- |
| Admin       | 1   | System statistics, manage users/hospitals/labs                  |
| Doctor      | 2   | View patients, view AI predictions, request re-reviews          |
| Radiologist | 3   | Review pending predictions, edit masks, approve/reject, history |
| Lab Staff   | 4   | Upload MRI scans, view upload history                           |
| Patient     | 5   | View own scans, view prediction results, manage profile         |

### 5.4 Java-Python Integration

The Java backend calls the Python ML model via **subprocess execution** (ProcessBuilder), not via REST API:

```
Java AiInferenceService
    │
    ├── ProcessBuilder: python inference.py
    │     --checkpoint best_model.pth
    │     --h5_file <uploaded_file_path>
    │     --output_dir <output_directory>
    │     --output_json
    │
    ├── Parses stdout lines: KEY=VALUE
    │     WT_DICE=0.8923
    │     TC_DICE=0.8456
    │     ET_DICE=0.7812
    │     TUMOR_DETECTED=True
    │     TUMOR_AREA_MM2=1234.0
    │     ESTIMATED_REGION=Frontal
    │     MASK_PATH=output/xxx.png
    │     HEATMAP_PATH=output/xxx.png
    │     RAW_MASK_PATH=output/xxx_raw_mask.png
    │     FLAIR_PATH=output/xxx_flair.png
    │
    └── Updates AiPrediction entity in MySQL
```

This is executed **asynchronously** on a dedicated thread pool (2–4 threads) so that MRI upload returns immediately without blocking.

### 5.5 Database Schema (12 Tables)

```
role (role_id PK, role_name)
user (user_id PK, email, password_hash, role_id FK)
patient (patient_id PK, name, dob, gender, user_id FK)
doctor (doctor_id PK, name, speciality, hospital_id FK, user_id FK)
hospital (hospital_id PK, name, location)
lab (lab_id PK, lab_name, user_id FK)
radiologist (radiologist_id PK, name, user_id FK, lab_id FK)
mri_meta_data (mri_id PK, patient_id FK, lab_id FK, file_path, scan_date, modality, notes)
ai_predictions (prediction_id PK, mri_id FK, mask_path, heatmap_path, wt_dice, tc_dice, et_dice, tumor_detected, tumor_area_mm2, estimated_region, status ENUM(processing, done, failed, reviewed))
radiologist_review (review_id PK, prediction_id FK, radiologist_id FK, diagnosis, notes, status ENUM(approved, rejected), re_review_requested, re_review_notes)
phone_numbers (user_id FK, type_id FK, number)
address (user_id FK, type_id FK, street, area, city, state, pincode)
```

---

## 6. END-TO-END CLINICAL WORKFLOW

### Step-by-Step Data Flow

```
1. LAB STAFF uploads .h5 MRI file via frontend
       │
       ▼
2. Spring Boot saves file to disk, creates MriMetaData record
       │
       ▼
3. AiInferenceService (async) spawns Python subprocess
       │
       ▼
4. Python loads AttentionUNet checkpoint, processes MRI:
   - Forward pass: (4, 240, 240) → (4, 240, 240) logits → argmax → class mask
   - Tumor analysis: pixel counts, area (mm²), centroid, brain region estimation
   - Saves: visualization overlay PNG, raw mask PNG (values 0-3), FLAIR PNG
   - Computes: WT/TC/ET Dice scores (if ground truth available)
       │
       ▼
5. Java parses Python output, updates AiPrediction row (status = done)
       │
       ▼
6. RADIOLOGIST views pending predictions in dashboard
   - Sees FLAIR + AI overlay, Dice scores, tumor stats
   - 3 comparison modes: side-by-side, overlay (opacity slider), slider
       │
       ▼
7. RADIOLOGIST optionally corrects mask in Segmentation Editor
   - Konva-based canvas: brush/eraser per tumor class, zoom/pan, undo/redo
   - Exports corrected mask PNG → uploaded back to server
       │
       ▼
8. RADIOLOGIST submits review: diagnosis text, notes, approve/reject
   - AiPrediction status → reviewed
       │
       ▼
9. DOCTOR views prediction results
   - Can request re-review if disagreement → status reverts to done
       │
       ▼
10. PATIENT views own scan results on dashboard
```

### 6.1 Segmentation Editor (Key Frontend Component)

The Segmentation Editor is a specialized medical annotation tool built with **react-konva**:

- Loads FLAIR grayscale image as background layer
- Loads raw AI mask (pixel values 0–3) as editable overlay
- **3 paintable tumor classes:** NCR/NET (Red), Edema (Green), Enhancing Tumor (Yellow)
- **Tools:** Brush, Eraser, Pan
- **Controls:** Adjustable brush size (1–30px), overlay opacity, per-class visibility toggles
- **Navigation:** Zoom with scroll wheel, pan with spacebar
- **Undo/Redo:** Up to 50 history states (Ctrl+Z / Ctrl+Y)
- **Export:** Encodes modified mask as grayscale PNG (pixel values 0–3) for backend upload

---

## 7. INFERENCE PIPELINE DETAIL

### 7.1 Prediction Process

1. Load trained `AttentionUNet` from `.pth` checkpoint
2. Read H5 file: extract 4-channel image `(240, 240, 4)` → transpose to `(4, 240, 240)`
3. Create batch tensor: `(1, 4, 240, 240)` on GPU
4. Forward pass with AMP autocast (float16):
   - logits: `(1, 4, 240, 240)` → `argmax(dim=1)` → predicted mask `(240, 240)` with values 0–3
5. Compute BraTS Dice scores (ET, TC, WT) against ground truth if available
6. **Tumor Analysis (`analyze_tumor`):**
   - Count total tumor pixels and per-class pixel counts
   - Compute tumor area in mm² (assuming 1mm × 1mm BraTS voxel spacing)
   - Find tumor centroid (center of mass)
   - Estimate brain region heuristically from centroid position:
     - y < 33%: Frontal | y 33-66%, x < 33% or x > 66%: Temporal | y 33-66%: Parietal | y > 66%: Occipital | else: Central

### 7.2 Visualization Output

| File                  | Contents                                                           |
| --------------------- | ------------------------------------------------------------------ |
| `{name}.png`          | Visualization: FLAIR background + colored tumor overlay + contours |
| `{name}_raw_mask.png` | Raw segmentation mask (pixel values 0–3) for editor                |
| `{name}_flair.png`    | FLAIR channel as grayscale for editor background                   |

**Color Scheme:**

- NCR/NET (class 1): Red with 55% opacity
- Edema (class 2): Green with 55% opacity
- Enhancing Tumor (class 3): Yellow with 55% opacity
- Boundary contours drawn with OpenCV `findContours` + `drawContours`

---

## 8. KEY REFERENCES

1. **Attention U-Net:** Oktay et al., "Attention U-Net: Learning Where to Look for the Pancreas", MIDL 2018. arXiv:1804.03999
2. **U-Net:** Ronneberger et al., "U-Net: Convolutional Networks for Biomedical Image Segmentation", MICCAI 2015.
3. **3D U-Net:** Çiçek et al., "3D U-Net: Learning Dense Volumetric Segmentation from Sparse Annotation", MICCAI 2016.
4. **BraTS Challenge:** Menze et al., "The Multimodal Brain Tumor Image Segmentation Benchmark (BRATS)", IEEE TMI 2015.
5. **Deep Supervision:** Lee et al., "Deeply-Supervised Nets", AISTATS 2015.
6. **Boundary Loss:** Kervadec et al., "Boundary Loss for Highly Unbalanced Segmentation", MIDL 2019.
7. **nnU-Net:** Isensee et al., "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation", Nature Methods 2021.

---

## 9. TECHNICAL SPECIFICATIONS SUMMARY

| Component          | Specification                                        |
| ------------------ | ---------------------------------------------------- |
| Model              | 2D Attention U-Net → Proposed 3D Attention U-Net     |
| Parameters         | ~8.7M (2D) → ~35M+ (estimated 3D)                    |
| Dataset            | BraTS 2020, 369 volumes, 4 modalities                |
| Input dim          | (4, 240, 240) 2D → (4, 128, 128, 128) 3D             |
| Output classes     | 4 (BG, NCR/NET, ED, ET)                              |
| Loss               | DiceCE → DiceCE + Boundary Dice + Distance Weighting |
| Optimizer          | AdamW (lr=3e-4, wd=1e-4)                             |
| Scheduler          | Cosine Annealing (η_min=1e-6)                        |
| Training precision | AMP float16                                          |
| GPU                | NVIDIA RTX 4050 6 GB (2D), 12+ GB recommended (3D)   |
| Backend            | Spring Boot 3.2.3, Java 17, MySQL 8                  |
| Frontend           | Next.js 16, React 19, TypeScript, Tailwind, Konva    |
| Authentication     | JWT (stateless) + BCrypt                             |
| Roles              | Admin, Doctor, Radiologist, Lab Staff, Patient       |
