import fs from "node:fs";
import { sveltekit } from "@sveltejs/kit/vite";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { WebSocketServer } from "ws";
import { broadcastMessage, handleConnection } from "./src/lib/ws/server";
import { startM5Bridge } from "./src/lib/ws/server-m5-bridge";

function webSocketPlugin(): Plugin {
	return {
		name: "vite-plugin-websocket",
		configureServer(server) {
			const wss = new WebSocketServer({ noServer: true });
			let closeM5Bridge: (() => void) | null = null;

			if (process.env.M5_BRIDGE !== "0") {
				closeM5Bridge = startM5Bridge(broadcastMessage)?.close ?? null;
			}

			server.httpServer?.on("upgrade", (request, socket, head) => {
				// Let Vite HMR keep its own WebSocket
				if (request.headers["sec-websocket-protocol"]?.includes("vite-hmr"))
					return;

				wss.handleUpgrade(request, socket, head, (ws) => {
					handleConnection(ws);
				});
			});
			server.httpServer?.on("close", () => {
				closeM5Bridge?.();
				wss.close();
			});
		},
	};
}

export default defineConfig({
	plugins: [sveltekit(), webSocketPlugin()],
	server: {
		https: {
			key: fs.readFileSync("localhost-key.pem"),
			cert: fs.readFileSync("localhost.pem"),
		},
		host: true,
	},
	ssr: {
		// @xyflow has directory imports that don't work with ESM resolution
		noExternal: ["@xyflow/svelte", "@xyflow/system"],
	},
});
