# M5Stick Wireless VR Setup

This guide reproduces the working state where the M5Stick controls the VR simulator wirelessly.

## What Runs

Runtime path:

```text
M5Stick
  -> ws://<mac-lan-ip>:8787/ws/device
  -> simulator M5 bridge
  -> simulator WebSocket broadcast
  -> Quest / browser VR scene
```

You do not need to run the separate M5 WebSocket Adapter server during normal flight runtime. The adapter project is still useful for firmware setup, USB diagnostics, and reconfiguring the M5Stick.

## Prerequisites

- M5Stick firmware is flashed.
- M5Stick has saved Wi-Fi credentials.
- M5Stick has saved WebSocket URL:

```text
ws://<mac-lan-ip>:8787/ws/device
```

Example:

```text
ws://192.168.0.131:8787/ws/device
```

Do not use `localhost` for the M5Stick. From the M5Stick, `localhost` means the M5Stick itself, not the Mac.

## Start The Simulator

From the simulator repo:

```bash
cd /Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template
bun run dev
```

Expected terminal output:

```text
[m5-bridge] Listening on ws://0.0.0.0:8787/ws/device

VITE v7.3.1 ready
Local:   https://localhost:5173/
Network: https://192.168.0.131:5173/
```

Use the network URL shown by Vite for the Quest or another device:

```text
https://<mac-lan-ip>:5173/vr
```

Example:

```text
https://192.168.0.131:5173/vr
```

## Expected M5Stick State

On the M5Stick display:

- `WIFI` means it is still trying to connect to Wi-Fi.
- `LINK` means Wi-Fi is connected, but WebSocket is not connected.
- `LIVE` means WebSocket is connected and telemetry is streaming.
- `PAUSED` means WebSocket is connected, but streaming was paused.

For wireless VR control, the target state is:

```text
LIVE
```

## Quick Bridge Tests

Test from the Mac using localhost:

```bash
node -e 'const WebSocket=require("ws"); const ws=new WebSocket("ws://127.0.0.1:8787/ws/device"); ws.on("open",()=>{console.log("M5 bridge reachable locally"); ws.close();}); ws.on("error",e=>console.error(e.message));'
```

Expected:

```text
M5 bridge reachable locally
```

Test the same LAN address the M5Stick uses:

```bash
node -e 'const WebSocket=require("ws"); const ws=new WebSocket("ws://192.168.0.131:8787/ws/device"); ws.on("open",()=>{console.log("M5 bridge reachable on LAN IP"); ws.close();}); ws.on("error",e=>console.error(e.message));'
```

Expected:

```text
M5 bridge reachable on LAN IP
```

If localhost works but the LAN IP fails, the simulator bridge is running, but something on the Mac or network is blocking LAN access.

## Antivirus And Firewall Notes

Antivirus or firewall software can block the M5Stick from reaching the simulator, even when the bridge is running.

Observed issue:

- M5Stick stayed at `LINK`.
- Localhost bridge test worked.
- LAN-IP bridge test failed.
- Disabling ESET Cyber Security allowed the M5Stick to reach `LIVE`.

Recommended firewall/antivirus checks:

- Allow inbound TCP connections to port `8787`.
- Allow inbound TCP connections to port `5173` if opening VR from another device.
- Allow Node.js/Vite to accept incoming connections.
- On this machine, Node may be:

```text
/Users/juliuswenk/.nvm/versions/node/v22.22.2/bin/node
```

- If using ESET Cyber Security, add an allow rule for local-network inbound traffic to Node or temporarily disable filtering while testing.
- If using macOS Firewall, allow incoming connections for Node.js when prompted.

After changing firewall or antivirus settings, restart:

```bash
bun run dev
```

Then reboot or reconnect the M5Stick so it retries the WebSocket connection.

## Hardware Motion Check

Once the M5Stick shows `LIVE`, test movement slowly:

1. Hold neutral for 3-5 seconds.
2. Tilt forward and hold for 2-3 seconds.
3. Return to neutral.
4. Tilt backward and hold for 2-3 seconds.
5. Return to neutral.
6. Roll left and hold for 2-3 seconds.
7. Return to neutral.
8. Roll right and hold for 2-3 seconds.

Watch the VR scene and note whether any axis is reversed.

Useful notes to record:

- Forward works or forward is reversed.
- Backward works or backward is reversed.
- Left works or left is reversed.
- Right works or right is reversed.
- Neutral is stable or drifting.

Only change mapping code after observing the real hardware behavior.

## Troubleshooting

### M5Stick Stuck At LINK

This means Wi-Fi is connected, but WebSocket is not connected.

Check:

- Simulator is running with `bun run dev`.
- Terminal shows `[m5-bridge] Listening on ws://0.0.0.0:8787/ws/device`.
- M5Stick URL is `ws://<mac-lan-ip>:8787/ws/device`.
- Mac and M5Stick are on the same network.
- No other process is occupying port `8787`.
- Antivirus/firewall allows inbound LAN access to port `8787`.

Check port usage:

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

### Port 8787 Already In Use

Stop the other server using port `8787`, usually the external M5 adapter hub or another simulator instance.

Check:

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

Then stop the old process and restart:

```bash
bun run dev
```

### External M5 WebSocket Adapter

The external adapter uses:

```bash
HOST=0.0.0.0 bun run server
```

That is required for the adapter hub because it binds to `127.0.0.1` by default.

The simulator bridge already binds to:

```text
0.0.0.0
```

So the simulator runtime does not need a separate `HOST=0.0.0.0 bun run server` process.

