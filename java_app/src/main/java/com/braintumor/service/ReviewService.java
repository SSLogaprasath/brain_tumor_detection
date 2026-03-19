package com.braintumor.service;

import com.braintumor.entity.*;
import com.braintumor.repository.AiPredictionRepository;
import com.braintumor.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final AiPredictionRepository predictionRepository;

    /** Get all pending predictions waiting for radiologist review */
    public List<AiPrediction> getPendingPredictions() {
        return predictionRepository.findByStatus(AiPrediction.Status.done);
    }

    /** Radiologist submits their review of an AI prediction */
    public RadiologistReview submitReview(
            Integer aiPredictionId,
            Integer radiologistId,
            String diagnosis,
            String notes,
            RadiologistReview.ReviewStatus status,
            String modifiedMaskPath,
            Boolean correctedTumorDetected,
            String correctedRegion,
            Float correctedTumorAreaMm2
    ) {
        AiPrediction prediction = predictionRepository.findById(aiPredictionId)
            .orElseThrow(() -> new IllegalArgumentException("Prediction not found: " + aiPredictionId));

        Radiologist radiologist = new Radiologist();
        radiologist.setRadiologistId(radiologistId);

        RadiologistReview review = new RadiologistReview();
        review.setAiPrediction(prediction);
        review.setRadiologist(radiologist);
        review.setDiagnosis(diagnosis);
        review.setReviewNotes(notes);
        review.setStatus(status);
        review.setModifiedMaskFilePath(modifiedMaskPath);
        review.setReviewedAt(LocalDateTime.now());

        // Apply radiologist corrections to the prediction
        if (correctedTumorDetected != null) {
            prediction.setTumorDetected(correctedTumorDetected);
        }
        if (correctedRegion != null) {
            prediction.setEstimatedRegion(correctedRegion);
        }
        if (correctedTumorAreaMm2 != null) {
            prediction.setTumorAreaMm2(correctedTumorAreaMm2);
        }

        // Mark the prediction as reviewed so it no longer appears in pending list
        prediction.setStatus(AiPrediction.Status.reviewed);
        predictionRepository.save(prediction);

        // Clear any re-review request on existing reviews for this prediction
        reviewRepository.findByAiPrediction_AiPredictionsId(aiPredictionId).ifPresent(existing -> {
            if (existing.getReReviewRequested()) {
                existing.setReReviewRequested(false);
                reviewRepository.save(existing);
            }
        });

        return reviewRepository.save(review);
    }

    public List<RadiologistReview> getReviewsByRadiologist(Integer radiologistId) {
        return reviewRepository.findByRadiologist_RadiologistId(radiologistId);
    }

    /** Doctor requests a re-review on a prediction */
    public RadiologistReview requestReReview(Integer predictionId, Long requestedByUserId, String notes) {
        RadiologistReview review = reviewRepository.findByAiPrediction_AiPredictionsId(predictionId)
            .orElseThrow(() -> new IllegalArgumentException("Review not found for prediction: " + predictionId));

        review.setReReviewRequested(true);
        review.setReReviewRequestedBy(requestedByUserId);
        review.setReReviewNotes(notes);

        // Set the prediction status back to "done" so it reappears in the pending list
        AiPrediction prediction = review.getAiPrediction();
        prediction.setStatus(AiPrediction.Status.done);
        predictionRepository.save(prediction);

        return reviewRepository.save(review);
    }

    /** Get all reviews that have been flagged for re-review */
    public List<RadiologistReview> getReReviewRequests() {
        return reviewRepository.findByReReviewRequestedTrue();
    }
}
