package com.braintumor.controller;

import com.braintumor.entity.AiPrediction;
import com.braintumor.entity.RadiologistReview;
import com.braintumor.repository.AiPredictionRepository;
import com.braintumor.service.ReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/review")
@RequiredArgsConstructor
public class ReviewController {

    private final ReviewService reviewService;
    private final AiPredictionRepository predictionRepository;

    @Value("${app.predictions.dir}")
    private String predictionsDir;

    /**
     * GET /api/review/pending
     * List all AI predictions waiting for radiologist review.
     */
    @GetMapping("/pending")
    @PreAuthorize("hasAnyRole('radiologist','admin')")
    public ResponseEntity<List<AiPrediction>> getPending() {
        return ResponseEntity.ok(reviewService.getPendingPredictions());
    }

    /**
     * GET /api/review/prediction/{id}
     * Get a single AI prediction by ID.
     */
    @GetMapping("/prediction/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<AiPrediction> getPrediction(@PathVariable Integer id) {
        return ResponseEntity.ok(
            predictionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Prediction not found: " + id))
        );
    }

    /**
     * POST /api/review/submit
     * Radiologist submits their review of an AI prediction.
     *
     * Body (JSON):
     * {
     *   "aiPredictionId": 1,
     *   "radiologistId": 2,
     *   "diagnosis": "High-grade glioma in right frontal lobe",
     *   "notes": "AI mask slightly underestimates edema region",
     *   "status": "approved"
     * }
     */
    @PostMapping("/submit")
    @PreAuthorize("hasAnyRole('radiologist','admin')")
    public ResponseEntity<RadiologistReview> submit(@RequestBody Map<String, Object> body) {
        Boolean correctedTumorDetected = body.containsKey("correctedTumorDetected")
            ? (Boolean) body.get("correctedTumorDetected") : null;
        String correctedRegion = (String) body.get("correctedRegion");
        Float correctedTumorAreaMm2 = body.containsKey("correctedTumorAreaMm2") && body.get("correctedTumorAreaMm2") != null
            ? ((Number) body.get("correctedTumorAreaMm2")).floatValue() : null;

        RadiologistReview review = reviewService.submitReview(
            (Integer) body.get("aiPredictionId"),
            (Integer) body.get("radiologistId"),
            (String)  body.get("diagnosis"),
            (String)  body.get("notes"),
            RadiologistReview.ReviewStatus.valueOf((String) body.get("status")),
            (String)  body.get("modifiedMaskPath"),
            correctedTumorDetected,
            correctedRegion,
            correctedTumorAreaMm2
        );
        return ResponseEntity.ok(review);
    }

    /**
     * GET /api/review/radiologist/{id}
     * Get all reviews by a specific radiologist.
     */
    @GetMapping("/radiologist/{id}")
    @PreAuthorize("hasAnyRole('radiologist','admin')")
    public ResponseEntity<List<RadiologistReview>> getByRadiologist(@PathVariable Integer id) {
        return ResponseEntity.ok(reviewService.getReviewsByRadiologist(id));
    }

    /**
     * POST /api/review/upload-mask
     * Upload a modified segmentation mask PNG from the annotation editor.
     */
    @PostMapping("/upload-mask")
    @PreAuthorize("hasAnyRole('radiologist','admin')")
    public ResponseEntity<Map<String, String>> uploadModifiedMask(
            @RequestParam("file") MultipartFile file,
            @RequestParam("predictionId") Integer predictionId
    ) throws IOException {
        AiPrediction prediction = predictionRepository.findById(predictionId)
            .orElseThrow(() -> new IllegalArgumentException("Prediction not found: " + predictionId));

        Path dir = Paths.get(predictionsDir, "mri_" + prediction.getMri().getMriId());
        Files.createDirectories(dir);

        String filename = "modified_mask_" + predictionId + "_" + System.currentTimeMillis() + ".png";
        Path dest = dir.resolve(filename);
        file.transferTo(dest.toFile());

        return ResponseEntity.ok(Map.of("filePath", dest.toAbsolutePath().toString()));
    }

    /**
     * POST /api/review/{predictionId}/request-re-review
     * Doctor requests a re-review of a prediction.
     * Body: { "notes": "reason for re-review" }
     */
    @PostMapping("/{predictionId}/request-re-review")
    @PreAuthorize("hasAnyRole('doctor','admin')")
    public ResponseEntity<RadiologistReview> requestReReview(
            @PathVariable Integer predictionId,
            @RequestBody Map<String, Object> body,
            @org.springframework.security.core.annotation.AuthenticationPrincipal
                org.springframework.security.core.userdetails.UserDetails userDetails
    ) {
        Long userId = Long.parseLong(userDetails.getUsername());
        String notes = (String) body.get("notes");
        RadiologistReview review = reviewService.requestReReview(predictionId, userId, notes);
        return ResponseEntity.ok(review);
    }

    /**
     * GET /api/review/re-review-requests
     * List all predictions that have been flagged for re-review.
     */
    @GetMapping("/re-review-requests")
    @PreAuthorize("hasAnyRole('radiologist','admin')")
    public ResponseEntity<List<RadiologistReview>> getReReviewRequests() {
        return ResponseEntity.ok(reviewService.getReReviewRequests());
    }
}
