const PC_IP = "192.168.0.102"; // твой IPv4
const API_BASE = `http://${PC_IP}:3001`;
const WS_URL = `ws://${PC_IP}:3001`;

export async function loadSharedState() {
  const res = await fetch(`${API_BASE}/state`);
  if (!res.ok) throw new Error("Failed to load state");
  return res.json();
}

export async function saveSharedState(nextState) {
  const res = await fetch(`${API_BASE}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextState),
  });
  if (!res.ok) throw new Error("Failed to save state");
  return res.json();
}

export function connectSharedState(onState) {
  const ws = new WebSocket(WS_URL);

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "state") onState(msg.payload);
  };

  return () => ws.close();
}
