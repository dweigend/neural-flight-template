import { json, type RequestHandler } from "@sveltejs/kit";
import {
	applyM5BridgeSettings,
	getM5BridgeRuntimeConfig,
} from "$lib/config/flight";

export const GET: RequestHandler = () => {
	return json(getM5BridgeRuntimeConfig());
};

export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: "Invalid JSON" }, { status: 400 });
	}

	if (!isSettingsRecord(data)) {
		return json({ error: "Invalid M5 settings payload" }, { status: 400 });
	}

	applyM5BridgeSettings(data);
	return json(getM5BridgeRuntimeConfig());
};

function isSettingsRecord(
	data: unknown,
): data is Record<string, number | boolean> {
	if (typeof data !== "object" || data === null) return false;
	return Object.values(data).every(
		(value) => typeof value === "number" || typeof value === "boolean",
	);
}
