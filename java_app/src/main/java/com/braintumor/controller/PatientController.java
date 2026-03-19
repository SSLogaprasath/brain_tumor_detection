package com.braintumor.controller;

import com.braintumor.entity.Patient;
import com.braintumor.entity.User;
import com.braintumor.repository.PatientRepository;
import com.braintumor.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/patient")
@RequiredArgsConstructor
public class PatientController {

    private final PatientRepository patientRepository;
    private final UserRepository userRepository;

    @GetMapping("/me")
    @PreAuthorize("hasRole('patient')")
    public ResponseEntity<Patient> getMyProfile(Authentication authentication) {
        User user = userRepository.findByEmail(authentication.getName()).orElseThrow();
        Patient patient = patientRepository.findByUser_UserId(user.getUserId())
            .orElseThrow(() -> new IllegalArgumentException("Patient profile not found"));
        return ResponseEntity.ok(patient);
    }
}
