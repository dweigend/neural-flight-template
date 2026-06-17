# M5Stick ICAROS Input Bridge Plan

## Goal

Use the M5Stick WebSocket output as a first-class input device for the ICAROS VR simulator.

The M5Stick should connect directly to the simulator server over plain WebSocket. The simulator server should translate M5 orientation frames into the existing ICAROS `ControllerMessage` protocol and broadcast them to the VR scene over the simulator's existing WebSocket channel.

## Target Architecture

```text
M5Stick firmware
  -> ws://<simulator-host>:8787/ws/device
  -> sends M5 register / heartbeat / imu / orientation frames

Simulator server
  -> accepts M5 device WebSocket on a plain ws:// port
  -> validates and tracks device status
  -> maps M5 orientation to ICAROS orientation
  -> broadcasts ControllerMessage through existing simulator WebSocket

Quest browser
  -> https://<simulator-host>:5173/vr
  -> wss://<simulator-host>:5173
  -> receives normal ICAROS orientation messages
```

Important constraint: the M5 firmware currently supports `ws://` only, not `wss://`. WebXR on Quest requires the simulator page to be served over HTTPS. That means the simulator needs both:

- HTTPS / WSS for browser and Quest traffic.
- Plain WS for M5Stick device traffic.

This does not require two apps. It can be one simulator dev server process that also opens a plain M5 input port.

## Existing Protocols

### M5Stick Orientation Frame

Source project: `/Users/juliuswenk/Downloads/M5_WebSocet_Adapter-main`

The M5 sends orientation frames shaped like:

```json
{
	"type": "orientation",
	"deviceId": "m5stick-plus2-001",
	"role": "controller",
	"seq": 4,
	"timeMs": 3040,
	"pitch": 1.2,
	"roll": -2.4,
	"yaw": 0.3,
	"quality": 1
}
```

### Simulator Orientation Frame

File: `src/lib/types/orientation.ts`

The simulator expects:

```json
{
	"type": "orientation",
	"pitch": 1.2,
	"roll": -2.4,
	"timestamp": 1710000000000
}
```

The bridge's core job is to convert the first shape into the second shape.

## Implementation Strategy

Build the bridge in small, testable steps. Keep `/vr`, `FlightPlayer`, and existing experience code unchanged.

Add a new server-side M5 input module under `src/lib/ws/`, similar in spirit to `src/lib/ws/server-joystick-bridge.ts`.

Recommended new files:

- `src/lib/ws/m5-protocol.ts`
- `src/lib/ws/server-m5-bridge.ts`

Recommended changed file:

- `vite.config.ts`

Optional later files:

- `src/lib/config/flight.ts` for M5 mapping constants.
- `src/lib/ws/server-m5-bridge.test.ts` if tests are introduced for protocol mapping.
- A small status panel in the controller UI if runtime device visibility becomes useful.

## Milestone 1: Define The M5 Runtime Protocol

### Work

Create `src/lib/ws/m5-protocol.ts`.

Include explicit TypeScript types and guards for the M5 runtime messages needed by the simulator:

- `register`
- `heartbeat`
- `imu`
- `orientation`

At minimum, the bridge only needs to act on `orientation`, but it should still parse `register` and `heartbeat` enough to support connection logging and later status display.

Do not import code directly from the adapter project. Copy the small protocol shape intentionally into the simulator so the simulator runtime does not depend on a separate local folder.

### Acceptance Checks

- No `any` types.
- `parseM5DeviceMessage(raw: string): M5DeviceMessage` throws on invalid JSON or unsupported shapes.
- `isM5OrientationMessage(data: unknown): data is M5OrientationMessage` verifies:
  - `type === "orientation"`
  - `deviceId` is a non-empty string
  - `role === "controller"`
  - `seq` is a positive integer
  - `timeMs` is finite and non-negative
  - `quality` is between `0` and `1`
  - `pitch`, `roll`, and `yaw` are finite numbers

### Manual Check

Run:

```bash
bunx biome check src/lib/ws/m5-protocol.ts
bunx svelte-check --threshold warning
```

### Coding Agent Prompt

```text
Implement Milestone 1 from docs/M5_BRIDGE_PLAN.md.

Create src/lib/ws/m5-protocol.ts with explicit TypeScript types and validation helpers for the M5Stick runtime WebSocket protocol. Follow the existing style in src/lib/ws/protocol.ts, but do not use any. Only implement protocol parsing and type guards. Do not wire it into the server yet.

After editing, run:
- bunx biome check src/lib/ws/m5-protocol.ts
- bunx svelte-check --threshold warning

Report changed files and any validation issues.
```

## Milestone 2: Add The M5 Server Bridge

### Work

Create `src/lib/ws/server-m5-bridge.ts`.

The bridge should:

- Start a plain WebSocket server for M5 devices.
- Default to port `8787`.
- Accept only the path `/ws/device`.
- Parse incoming frames with `parseM5DeviceMessage`.
- Track the latest connected `deviceId`.
- Log useful lifecycle events:
  - bridge listening
  - device registered
  - device disconnected
  - invalid frame dropped
- On M5 `orientation`, broadcast a simulator `ControllerMessage`:

```ts
broadcast({
	type: "orientation",
	pitch: mappedPitch,
	roll: mappedRoll,
	timestamp: Date.now(),
});
```

Do not send `yaw` to the simulator yet. The existing `FlightPlayer` only consumes pitch and roll.

### Initial Mapping

Start with a direct mapping:

```ts
mappedPitch = message.pitch;
mappedRoll = message.roll;
```

Keep mapping in a small helper function so axis inversion, scaling, deadzone, and clamping can be added safely in Milestone 5.

### Acceptance Checks

- Bridge exposes a function similar to:

```ts
export function startM5Bridge(
	broadcast: (message: ControllerMessage) => void,
	options?: M5BridgeOptions,
): M5Bridge | null;
```

- `M5Bridge` has a `close(): void` method.
- Invalid frames are dropped without crashing the simulator.
- The bridge does not affect the existing browser WebSocket server.

### Manual Check

Run:

```bash
bunx biome check src/lib/ws/server-m5-bridge.ts
bunx svelte-check --threshold warning
```

### Coding Agent Prompt

```text
Implement Milestone 2 from docs/M5_BRIDGE_PLAN.md.

Create src/lib/ws/server-m5-bridge.ts. It should start a plain WebSocket server for M5Stick devices on port 8787, accept /ws/device, parse frames using src/lib/ws/m5-protocol.ts, and translate M5 orientation frames into the existing ControllerMessage orientation shape via the provided broadcast callback.

Keep mapping in a small helper function. Use explicit TypeScript types. Do not use any. Do not edit vite.config.ts yet.

After editing, run:
- bunx biome check src/lib/ws/server-m5-bridge.ts
- bunx svelte-check --threshold warning

Report changed files and any validation issues.
```

## Milestone 3: Wire The Bridge Into The Simulator Dev Server

### Work

Update `vite.config.ts` to start the M5 bridge in the existing `webSocketPlugin()`.

Pattern to follow:

- Existing import and startup for `startServerJoystickBridge`.
- Existing shutdown behavior on `server.httpServer?.on("close", ...)`.

Add an environment flag so it can be disabled:

```bash
M5_BRIDGE=0 bun run dev
```

Default should be enabled.

Suggested behavior:

- If `process.env.M5_BRIDGE !== "0"`, start the bridge.
- Store its close function.
- Close it when Vite closes.

### Acceptance Checks

- `bun run dev` starts the HTTPS simulator and prints that the M5 bridge is listening.
- `M5_BRIDGE=0 bun run dev` starts without opening the M5 bridge.
- Existing joystick bridge still works the same way.

### Manual Check

Run:

```bash
bunx biome check vite.config.ts src/lib/ws
bunx svelte-check --threshold warning
```

### Coding Agent Prompt

```text
Implement Milestone 3 from docs/M5_BRIDGE_PLAN.md.

Wire startM5Bridge into the existing Vite websocket plugin in vite.config.ts. Follow the existing server joystick bridge pattern. The bridge should be enabled by default and disabled with M5_BRIDGE=0. Ensure close() is called when the Vite server closes.

After editing, run:
- bunx biome check vite.config.ts src/lib/ws
- bunx svelte-check --threshold warning

Report changed files and command results.
```

## Milestone 4: End-To-End Simulator Test With Simulated Device

### Work

Before using hardware, test the bridge with a local script or one-liner that sends realistic M5 frames to the simulator's M5 port.

Suggested temporary command:

```bash
bun -e '
const ws = new WebSocket("ws://127.0.0.1:8787/ws/device");
let seq = 1;
ws.onopen = () => {
	setInterval(() => {
		ws.send(JSON.stringify({
			type: "orientation",
			deviceId: "sim-m5",
			role: "controller",
			seq: seq++,
			timeMs: seq * 20,
			pitch: Math.sin(Date.now() / 700) * 15,
			roll: Math.cos(Date.now() / 900) * 20,
			yaw: 0,
			quality: 1
		}));
	}, 20);
};
'
```

Then open the VR page in a desktop browser first:

```text
https://localhost:5173/vr
```

Expected behavior:

- The loaded flight scene responds to changing pitch and roll.
- No console spam from invalid messages.
- Existing controller route still works.

### Acceptance Checks

- Simulated M5 orientation reaches `/vr`.
- Pitch and roll update continuously.
- Disconnecting the simulated device does not crash the server.
- Restarting the simulated sender reconnects cleanly.

### Coding Agent Prompt

```text
Execute Milestone 4 from docs/M5_BRIDGE_PLAN.md.

Start the simulator with bun run dev, then use a local simulated M5 WebSocket sender to connect to ws://127.0.0.1:8787/ws/device and send orientation frames. Verify from logs and the /vr page that orientation is reaching the existing simulator pipeline.

Do not make code changes unless you find a bug. If you find a bug, patch only the relevant bridge/protocol code and rerun checks.
```

## Milestone 5: Hardware Test And Axis Calibration

> Manual real-world step: this milestone requires the physical M5Stick and ICAROS hardware. Stop coding before the motion test, start the simulator, connect the M5Stick, then physically tilt/roll the mounted sensor while watching the VR scene or logs.

### Work

Configure the M5Stick to connect to the simulator host:

```text
ws://<mac-lan-ip>:8787/ws/device
```

Do not use `localhost` in the M5 configuration. From the M5Stick, `localhost` means the M5Stick itself, not the Mac.

Find the Mac's LAN IP:

```bash
ipconfig getifaddr en0
```

If using a different interface, inspect:

```bash
ifconfig
```

Then test physical motion. Do this slowly at first and return to neutral between each movement:

| Manual action | What to observe |
| --- | --- |
| Hold the ICAROS/sensor in its neutral resting position for 3-5 seconds. | Pitch and roll should stay close to `0`. If not, calibrate the M5Stick before changing code. |
| Tilt ICAROS forward and hold for 2-3 seconds. | The simulator should react consistently in the expected forward-lean direction. Record whether pitch needs inversion. |
| Return to neutral for 2-3 seconds. | The simulator should stop changing direction once the sensor is neutral. |
| Tilt ICAROS backward and hold for 2-3 seconds. | The simulator should react opposite to the forward test. |
| Return to neutral for 2-3 seconds. | Pitch and roll should settle close to `0`. |
| Roll ICAROS left and hold for 2-3 seconds. | The simulator should bank/turn left. Record whether roll needs inversion. |
| Return to neutral for 2-3 seconds. | The simulator should stop banking. |
| Roll ICAROS right and hold for 2-3 seconds. | The simulator should bank/turn right. |

Record whether each direction matches the simulator before asking a coding agent to change mapping code. The useful notes are:

- forward works or forward is reversed
- backward works or backward is reversed
- left works or left is reversed
- right works or right is reversed
- neutral is stable or neutral drifts
- approximate resting pitch/roll values from logs, if visible

### Mapping Adjustments

If needed, change the bridge mapping helper:

```ts
mappedPitch = -message.pitch;
mappedRoll = message.roll;
```

or:

```ts
mappedPitch = message.roll;
mappedRoll = message.pitch;
```

depending on the M5Stick mounting orientation.

Add conservative mapping constants only after observing hardware behavior:

- pitch scale
- roll scale
- pitch inversion
- roll inversion
- deadzone degrees
- max pitch/roll clamp

Prefer storing these in `src/lib/config/flight.ts` once the values are stable.

### Acceptance Checks

- Forward lean maps to the expected climb/dive direction.
- Left/right lean maps to the expected bank/turn direction.
- Resting ICAROS position produces values close to zero after calibration.
- Motion feels stable enough for a short flight.

### Coding Agent Prompt

```text
Help with Milestone 5 from docs/M5_BRIDGE_PLAN.md.

We have hardware connected to ws://<mac-lan-ip>:8787/ws/device. Inspect the bridge logs and current M5 orientation values, then adjust only the mapping helper in src/lib/ws/server-m5-bridge.ts so physical ICAROS motion maps correctly to simulator pitch and roll.

Keep the changes minimal. If constants become necessary, add them to src/lib/config/flight.ts and import them. Do not hardcode tuning values inside the bridge.

After editing, run:
- bunx biome check src/lib/ws/server-m5-bridge.ts src/lib/config/flight.ts
- bunx svelte-check --threshold warning
```

## Milestone 6: Runtime Robustness

### Work

Add small robustness features after the first successful hardware test:

- Drop orientation frames with `quality` below a threshold.
- Clamp pitch and roll to the simulator's supported range.
- Apply a small deadzone around zero.
- Optionally rate-limit broadcast to the VR side if the M5 sends faster than needed.
- Track stale device timeout and broadcast neutral orientation if the device disappears.

Suggested defaults:

- `quality >= 0.5`
- deadzone: `1` to `2` degrees
- clamp: `-90` to `90` degrees
- stale timeout: `500` ms to `1000` ms

Move these values to `src/lib/config/flight.ts`.

### Acceptance Checks

- Pulling M5 power does not leave the simulator permanently banking.
- Bad or malformed frames are ignored.
- No noticeable jitter when the ICAROS is resting.
- No meaningful latency added by filtering.

### Coding Agent Prompt

```text
Implement Milestone 6 from docs/M5_BRIDGE_PLAN.md.

Add robustness to the M5 bridge: quality threshold, pitch/roll clamp, small deadzone, and stale-device neutral orientation behavior. Put all tuning constants in src/lib/config/flight.ts and import them into the bridge. Keep runtime behavior simple and observable through concise logs.

After editing, run:
- bunx biome check src/lib/ws/server-m5-bridge.ts src/lib/config/flight.ts
- bunx svelte-check --threshold warning
```

## Milestone 7: Documentation And Operating Procedure

### Work

Update project docs after implementation:

- Add M5 bridge startup behavior to `docs/SETUP.md`.
- Add a short protocol note to `src/lib/ws/README.md`.
- Add hardware setup notes:
  - Use Mac LAN IP, not `localhost`.
  - M5 firmware currently requires `ws://`, not `wss://`.
  - Quest uses HTTPS simulator URL.

### Acceptance Checks

- A new operator can start the simulator and connect the M5Stick from docs alone.
- The docs explain which port is for Quest and which port is for M5.
- The docs include the disable flag `M5_BRIDGE=0`.

### Coding Agent Prompt

```text
Implement Milestone 7 from docs/M5_BRIDGE_PLAN.md.

Update docs/SETUP.md and src/lib/ws/README.md with the M5 bridge operating procedure. Include ports, URLs, the M5_BRIDGE=0 disable flag, and the warning that M5 should use the Mac LAN IP rather than localhost.

After editing, run:
- bunx biome check docs/SETUP.md src/lib/ws/README.md
```

## Final Verification Checklist

Run before considering the bridge complete:

```bash
bunx biome check --write .
bunx svelte-check --threshold warning
```

Manual checks:

- `bun run dev` starts simulator HTTPS server.
- M5 bridge listens on `ws://0.0.0.0:8787/ws/device` or equivalent configured host.
- `M5_BRIDGE=0 bun run dev` disables the bridge.
- Simulated M5 frames control `/vr`.
- Hardware M5 frames control `/vr`. Manual real-world step: physically move the mounted M5Stick/ICAROS through neutral, forward, backward, left, and right positions and confirm the scene responds correctly.
- Existing `/controller` route still controls `/vr`.
- Existing `/gyro` route still controls `/vr`.
- Quest can enter WebXR over HTTPS.
- M5Stick can connect over plain WS.

## Design Rules For Agents

When instructing a coding agent on this work:

- Give it exactly one milestone at a time.
- Tell it which files it may edit.
- Tell it which files it must not edit.
- Require explicit TypeScript types and no `any`.
- Require `bunx biome check ...` and `bunx svelte-check --threshold warning` after meaningful code changes.
- Ask it to report changed files and command results.
- Ask it to preserve `/vr`, `FlightPlayer`, and existing controller behavior unless the milestone explicitly says otherwise.
- Ask it to make axis mapping changes only after observing real hardware behavior.

Good agent instruction pattern:

```text
Work only on Milestone N from docs/M5_BRIDGE_PLAN.md.

Allowed files:
- ...

Do not edit:
- ...

Acceptance criteria:
- ...

After changes, run:
- ...

Report:
- files changed
- checks run
- any remaining risks
```

Avoid asking an agent to "wire up the M5 bridge" as one large task. Split it by protocol, bridge, Vite wiring, simulated test, hardware mapping, and robustness.
