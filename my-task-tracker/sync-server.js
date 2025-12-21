import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();
app.use(cors());
app.use(express.json());

let sharedState = {
  todos: [],
  bedtime: null,
  timers: {},
  updatedAt: Date.now(),
};

// получить текущее состояние
app.get("/state", (req, res) => {
  res.json(sharedState);
});

// заменить состояние целиком (просто и надёжно для старта)
app.post("/state", (req, res) => {
  if (typeof req.body !== "object" || req.body === null) {
    return res.status(400).json({ error: "state must be an object" });
  }

  sharedState = {
    ...req.body,
    updatedAt: Date.now(),
  };

  broadcast({ type: "state", payload: sharedState });
  res.json({ ok: true });
});

const server = app.listen(3001, "0.0.0.0", () => {
  console.log("Sync server: http://0.0.0.0:3001");
});

const wss = new WebSocketServer({ server });

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "state", payload: sharedState }));
});
