CREATE TABLE IF NOT EXISTS shared_state (
    id INT PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shared_state (id, state)
VALUES (
    1,
    '{"todos": [], "bedtime": null, "timers": {}, "updatedAt": 0}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
