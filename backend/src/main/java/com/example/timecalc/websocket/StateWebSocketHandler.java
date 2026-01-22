package com.example.timecalc.websocket;

import com.example.timecalc.service.StateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class StateWebSocketHandler extends TextWebSocketHandler {
    private final StateService stateService;
    private final ObjectMapper objectMapper;
    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();

    public StateWebSocketHandler(StateService stateService, ObjectMapper objectMapper) {
        this.stateService = stateService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        sessions.add(session);
        JsonNode state = stateService.loadState();
        session.sendMessage(new TextMessage(buildMessage(state)));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
    }

    public void broadcastState(JsonNode state) {
        String message = buildMessage(state);
        sessions.removeIf(session -> !session.isOpen());
        for (WebSocketSession session : sessions) {
            try {
                session.sendMessage(new TextMessage(message));
            } catch (IOException ignored) {
                // ignore send failures for disconnected clients
            }
        }
    }

    private String buildMessage(JsonNode state) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("type", "state");
        payload.set("payload", state);
        return payload.toString();
    }
}
