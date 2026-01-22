package com.example.timecalc.service;

import com.example.timecalc.repository.StateRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import org.springframework.stereotype.Service;

@Service
public class StateService {
    private final StateRepository stateRepository;
    private final ObjectMapper objectMapper;

    public StateService(StateRepository stateRepository, ObjectMapper objectMapper) {
        this.stateRepository = stateRepository;
        this.objectMapper = objectMapper;
    }

    public JsonNode loadState() {
        return stateRepository.fetchStateJson()
            .map(this::readJson)
            .orElseGet(this::defaultState);
    }

    public ObjectNode saveState(ObjectNode state) {
        state.put("updatedAt", Instant.now().toEpochMilli());
        writeJson(state);
        return state;
    }

    private JsonNode readJson(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            return defaultState();
        }
    }

    private void writeJson(ObjectNode state) {
        try {
            String json = objectMapper.writeValueAsString(state);
            stateRepository.updateStateJson(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize state", e);
        }
    }

    private ObjectNode defaultState() {
        ObjectNode root = objectMapper.createObjectNode();
        root.putArray("todos");
        root.putNull("bedtime");
        root.set("timers", objectMapper.createObjectNode());
        root.put("updatedAt", 0);
        return root;
    }
}
