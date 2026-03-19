package com.braintumor.controller;

import com.braintumor.entity.Radiologist;
import com.braintumor.entity.User;
import com.braintumor.repository.RadiologistRepository;
import com.braintumor.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/radiologist")
@RequiredArgsConstructor
public class RadiologistController {

    private final RadiologistRepository radiologistRepository;
    private final UserRepository userRepository;

    @GetMapping("/me")
    @PreAuthorize("hasRole('radiologist')")
    public ResponseEntity<Radiologist> getMyProfile(Authentication authentication) {
        User user = userRepository.findByEmail(authentication.getName()).orElseThrow();
        Radiologist radiologist = radiologistRepository.findByUser_UserId(user.getUserId())
            .orElseThrow(() -> new IllegalArgumentException("Radiologist profile not found"));
        return ResponseEntity.ok(radiologist);
    }
}
