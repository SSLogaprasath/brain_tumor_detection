package com.braintumor.controller;

import com.braintumor.entity.*;
import com.braintumor.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final UserRepository userRepository;
    private final HospitalRepository hospitalRepository;
    private final LabRepository labRepository;
    private final MriRepository mriRepository;
    private final AiPredictionRepository predictionRepository;
    private final ReviewRepository reviewRepository;

    @GetMapping("/users")
    @PreAuthorize("hasRole('admin')")
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }

    @GetMapping("/hospitals")
    @PreAuthorize("hasRole('admin')")
    public ResponseEntity<List<Hospital>> getAllHospitals() {
        return ResponseEntity.ok(hospitalRepository.findAll());
    }

    @GetMapping("/labs")
    @PreAuthorize("hasRole('admin')")
    public ResponseEntity<List<Lab>> getAllLabs() {
        return ResponseEntity.ok(labRepository.findAll());
    }

    @GetMapping("/stats")
    @PreAuthorize("hasRole('admin')")
    public ResponseEntity<Map<String, Long>> getStats() {
        return ResponseEntity.ok(Map.of(
            "totalUsers", userRepository.count(),
            "totalMris", mriRepository.count(),
            "totalPredictions", predictionRepository.count(),
            "pendingPredictions", (long) predictionRepository.findByStatus(AiPrediction.Status.done).size(),
            "totalReviews", reviewRepository.count()
        ));
    }
}
