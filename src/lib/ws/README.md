# 🔌 WebSocket

Real-time communication between controller (phone/laptop) and VR scene (Quest).

## Modules

| File | Purpose |
|------|---------|
| `client.svelte.ts` | Svelte 5 reactive client (`$state` runes, auto-reconnect) |
| `m5-protocol.ts` | M5Stick runtime message validation |
| `server-m5-bridge.ts` | Plain WebSocket input bridge for M5Stick devices |
| `server.ts` | Server-side connection handler (broadcast-to-others pattern) |
| `protocol.ts` | Message serialization, parsing, and type guard validation |

## Protocol

### Message Types

- **`OrientationData`** — pitch/roll from controller (60Hz)
- **`SpeedCommand`** — accelerate/brake button press/release
- **`SettingsUpdate`** — runtime config changes from settings sidebar

### Data Flow

```
Controller UI → WebSocket → SvelteKit Server → broadcast → VR Scene
```

The server broadcasts to all clients except the sender (prevents echo).

### M5Stick Input Flow

The M5Stick uses a separate plain WebSocket endpoint because the firmware currently supports
`ws://`, not `wss://`.

```text
M5Stick
  -> ws://YOUR_MAC_IP:8787/ws/device
  -> server-m5-bridge.ts
  -> ControllerMessage orientation
  -> server.ts broadcast
  -> VR Scene
```

The Quest/browser app still uses HTTPS and WSS:

```text
https://YOUR_MAC_IP:5173/vr
wss://YOUR_MAC_IP:5173
```

The M5Stick must use the Mac's LAN IP. Do not configure it with `localhost`, because from the
M5Stick `localhost` means the M5Stick itself.

Disable the M5 bridge when needed:

```bash
M5_BRIDGE=0 bun run dev
```

If the M5Stick is stuck at `LINK`, verify port `8787` is reachable from the local network and allow
inbound Node/Vite traffic in firewall or antivirus software.

## Client Features

- **SSR-safe**: returns no-op client on server
- **Auto-reconnect**: exponential backoff (1s → 2s → 4s, max 5 attempts)
- **Reactive**: `status` and `lastMessage` are Svelte 5 `$state` runes
