package com.braintumor.repository;

import com.braintumor.entity.Lab;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface LabRepository extends JpaRepository<Lab, Integer> {
    Optional<Lab> findByUser_UserId(Integer userId);
}
