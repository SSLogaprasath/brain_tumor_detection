package com.braintumor.controller;

import com.braintumor.config.JwtUtils;
import com.braintumor.entity.*;
import com.braintumor.repository.LabRepository;
import com.braintumor.repository.RadiologistRepository;
import com.braintumor.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authManager;
    private final UserRepository userRepository;
    private final LabRepository labRepository;
    private final RadiologistRepository radiologistRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;

    // ----------------------------------------------------------------
    // POST /api/auth/login
    // Body: { "email": "...", "password": "..." }
    // Returns: { "token": "eyJ...", "role": "doctor" }
    // ----------------------------------------------------------------
    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req) {
        Authentication auth = authManager.authenticate(
            new UsernamePasswordAuthenticationToken(req.getEmail(), req.getPassword())
        );

        User user = userRepository.findByEmail(req.getEmail()).orElseThrow();
        String role = user.getRole().getRoleName().name();
        String token = jwtUtils.generateToken(req.getEmail(), role);

        return ResponseEntity.ok(Map.of(
            "token", token,
            "role",  role,
            "email", req.getEmail(),
            "userId", user.getUserId()
        ));
    }

    // ----------------------------------------------------------------
    // POST /api/auth/register
    // Body: { "userName": "...", "email": "...", "password": "...", "roleId": 5 }
    // Returns: 201 Created
    // ----------------------------------------------------------------
    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest req) {
        if (userRepository.existsByEmail(req.getEmail())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "Email already registered"));
        }

        Role role = new Role();
        role.setRoleId(req.getRoleId());

        User user = new User();
        user.setUserName(req.getUserName());
        user.setEmail(req.getEmail());
        user.setPasswordHash(passwordEncoder.encode(req.getPassword()));
        user.setRole(role);

        userRepository.save(user);

        // Create role-specific profile records
        if (req.getRoleId() == 4) { // lab_staff
            Lab lab = new Lab();
            lab.setLabName(req.getLabName() != null ? req.getLabName() : req.getUserName() + "'s Lab");
            lab.setUser(user);
            labRepository.save(lab);
        } else if (req.getRoleId() == 3) { // radiologist
            if (req.getLabId() == null) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Lab selection is required for radiologist registration"));
            }
            Lab lab = labRepository.findById(req.getLabId())
                .orElseThrow(() -> new IllegalArgumentException("Selected lab not found"));
            Radiologist radiologist = new Radiologist();
            radiologist.setRadiologistName(req.getUserName());
            radiologist.setUser(user);
            radiologist.setLab(lab);
            radiologistRepository.save(radiologist);
        }

        return ResponseEntity.status(HttpStatus.CREATED)
            .body(Map.of("message", "User registered successfully"));
    }

    // ----------------------------------------------------------------
    // GET /api/auth/labs
    // Returns list of labs for radiologist registration dropdown
    // ----------------------------------------------------------------
    @GetMapping("/labs")
    public ResponseEntity<List<Lab>> getLabsForRegistration() {
        return ResponseEntity.ok(labRepository.findAll());
    }

    // ----------------------------------------------------------------
    // Request DTOs
    // ----------------------------------------------------------------
    @Data
    public static class LoginRequest {
        @Email @NotBlank
        private String email;
        @NotBlank
        private String password;
    }

    @Data
    public static class RegisterRequest {
        @NotBlank @Size(max = 100)
        private String userName;
        @Email @NotBlank
        private String email;
        @NotBlank @Size(min = 8, max = 100)
        private String password;
        private Integer roleId;
        private String labName; // for lab_staff registration
        private Integer labId;  // for radiologist registration (which lab they belong to)
    }
}
