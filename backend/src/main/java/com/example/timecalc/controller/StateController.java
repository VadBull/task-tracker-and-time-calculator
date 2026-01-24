package com.example.timecalc.controller;

import com.example.timecalc.service.StateService;
import com.example.timecalc.websocket.StateWebSocketHandler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@CrossOrigin
public class StateController {
    private static final Logger log = LoggerFactory.getLogger(StateController.class);
    private final StateService stateService;
    private final StateWebSocketHandler webSocketHandler;

    public StateController(StateService stateService, StateWebSocketHandler webSocketHandler) {
        this.stateService = stateService;
        this.webSocketHandler = webSocketHandler;
    }

    @GetMapping("/state")
    public JsonNode getState() {
        return stateService.loadState();
    }

    @PostMapping("/state")
    public Map<String, Object> saveState(@RequestBody JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "state must be an object");
        }

        log.info("Incoming state payload: {}", body.toString());
        ObjectNode updated = stateService.saveState((ObjectNode) body);
        webSocketHandler.broadcastState(updated);
        return Map.of("ok", true);
    }
}
