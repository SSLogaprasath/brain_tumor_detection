package com.braintumor.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Slf4j
@RestController
@RequestMapping("/api/images")
public class ImageController {

    @GetMapping
    public ResponseEntity<Resource> serveImage(@RequestParam("path") String rawPath) {
        Path filePath = Paths.get(rawPath).normalize();

        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            return ResponseEntity.notFound().build();
        }

        // Only serve image files
        String name = filePath.getFileName().toString().toLowerCase();
        if (!name.endsWith(".png") && !name.endsWith(".jpg") && !name.endsWith(".jpeg")) {
            return ResponseEntity.badRequest().build();
        }

        MediaType mediaType = name.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG;
        Resource resource = new FileSystemResource(filePath);
        return ResponseEntity.ok().contentType(mediaType).body(resource);
    }
}
