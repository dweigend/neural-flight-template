import type { WebSocket } from "ws";
import type { ControllerMessage } from "../types/orientation";
import { parseMessage, serializeMessage } from "./protocol";

const clients = new Set<WebSocket>();

export function handleConnection(ws: WebSocket): void {
	clients.add(ws);

	ws.on("message", (raw: string) => {
		try {
			const msg = parseMessage(String(raw));
			broadcast(serializeMessage(msg), ws);
		} catch {
			// Invalid message — silently drop (noisy sensors)
		}
	});

	ws.on("close", () => {
		clients.delete(ws);
	});
}

function broadcast(data: string, exclude?: WebSocket): void {
	for (const client of clients) {
		if (client !== exclude && client.readyState === 1) {
			client.send(data);
		}
	}
}

export function broadcastMessage(msg: ControllerMessage): void {
	broadcast(serializeMessage(msg));
}
