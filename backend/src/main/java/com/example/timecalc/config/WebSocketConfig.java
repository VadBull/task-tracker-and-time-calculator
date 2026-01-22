package com.example.timecalc.config;

import com.example.timecalc.websocket.StateWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final StateWebSocketHandler stateWebSocketHandler;

    public WebSocketConfig(StateWebSocketHandler stateWebSocketHandler) {
        this.stateWebSocketHandler = stateWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(stateWebSocketHandler, "/")
                .setAllowedOrigins("*");
    }
}