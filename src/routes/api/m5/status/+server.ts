import { json, type RequestHandler } from "@sveltejs/kit";
import { getM5BridgeStatus } from "$lib/ws/m5-status";

export const GET: RequestHandler = () => {
	return json(getM5BridgeStatus());
};
