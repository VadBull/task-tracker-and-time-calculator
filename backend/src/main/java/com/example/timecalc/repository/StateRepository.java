package com.example.timecalc.repository;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StateRepository {
    private final JdbcTemplate jdbcTemplate;

    public StateRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<String> fetchStateJson() {
        return jdbcTemplate.query("SELECT state::text AS state FROM shared_state WHERE id = 1",
            rs -> rs.next() ? Optional.ofNullable(rs.getString("state")) : Optional.empty());
    }

    public void updateStateJson(String stateJson) {
        jdbcTemplate.update("UPDATE shared_state SET state = ?::jsonb, updated_at = NOW() WHERE id = 1", stateJson);
    }
}
