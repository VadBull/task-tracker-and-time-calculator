const DEFAULT_HOST =
  typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "localhost";
const API_BASE = import.meta.env.VITE_API_BASE || `http://${DEFAULT_HOST}:3001`;
const WS_BASE = import.meta.env.VITE_WS_BASE || API_BASE.replace(/^http/, "ws");

export const STORAGE_KEY = "sleep_tasks_v1";

export const ApiErrorCodes = {
  NETWORK: "network_error",
  BAD_RESPONSE: "bad_response",
  INVALID_JSON: "invalid_json",
  UNKNOWN: "unknown_error",
};

export class ApiError extends Error {
  constructor({ message, code = ApiErrorCodes.UNKNOWN, status = null, cause = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function safeReadJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadSharedState() {
  let res;

  try {
    res = await fetch(`${API_BASE}/state`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new ApiError({
      message: "loadSharedState failed: network error",
      code: ApiErrorCodes.NETWORK,
      cause: error,
    });
  }

  if (!res.ok) {
    const txt = await safeReadText(res);
    throw new ApiError({
      message: `loadSharedState failed: ${res.status} ${txt}`,
      code: ApiErrorCodes.BAD_RESPONSE,
      status: res.status,
    });
  }

  const json = await safeReadJson(res);
  if (!json || typeof json !== "object") {
    throw new ApiError({
      message: "loadSharedState failed: invalid JSON",
      code: ApiErrorCodes.INVALID_JSON,
    });
  }

  return json;
}

export async function saveSharedState(state) {
  let res;

  try {
    res = await fetch(`${API_BASE}/state`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });
  } catch (error) {
    throw new ApiError({
      message: "saveSharedState failed: network error",
      code: ApiErrorCodes.NETWORK,
      cause: error,
    });
  }

  if (!res.ok) {
    const txt = await safeReadText(res);
    throw new ApiError({
      message: `saveSharedState failed: ${res.status} ${txt}`,
      code: ApiErrorCodes.BAD_RESPONSE,
      status: res.status,
    });
  }
  return true;
}

export function connectSharedState(onState) {
  const ws = new WebSocket(WS_BASE);

  const handler = (ev) => {
    try {
      const parsed = JSON.parse(ev.data);
      if (parsed?.type === "state") {
        onState(parsed.payload);
      }
    } catch {
      // ignore broken event
    }
  };

  ws.addEventListener("message", handler);

  return () => {
    try {
      ws.removeEventListener("message", handler);
      ws.close();
    } catch {
      // ignore
    }
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState({ bedtime, tasks, updatedAt }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ bedtime, tasks, updatedAt }));
}
