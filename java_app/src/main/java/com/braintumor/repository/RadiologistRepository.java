package com.braintumor.repository;

import com.braintumor.entity.Radiologist;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RadiologistRepository extends JpaRepository<Radiologist, Integer> {
    Optional<Radiologist> findByUser_UserId(Integer userId);
}
