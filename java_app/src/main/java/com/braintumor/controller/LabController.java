package com.braintumor.controller;

import com.braintumor.entity.Lab;
import com.braintumor.entity.User;
import com.braintumor.repository.LabRepository;
import com.braintumor.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/lab")
@RequiredArgsConstructor
public class LabController {

    private final LabRepository labRepository;
    private final UserRepository userRepository;

    @GetMapping("/me")
    @PreAuthorize("hasRole('lab_staff')")
    public ResponseEntity<Lab> getMyLab(Authentication authentication) {
        User user = userRepository.findByEmail(authentication.getName()).orElseThrow();
        Lab lab = labRepository.findByUser_UserId(user.getUserId())
            .orElseThrow(() -> new IllegalArgumentException("Lab profile not found"));
        return ResponseEntity.ok(lab);
    }
}
