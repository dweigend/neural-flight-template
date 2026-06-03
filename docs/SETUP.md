# 🔧 Setup Guide

> 🆕 **Complete beginner?** Looking for a full guide including editor, terminal, and AI tools? → [tutorials/](../tutorials/README.md)

Complete setup instructions for Mac, Windows, and Linux.

---

## Prerequisites

### 1. Bun (Runtime)

**Mac/Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows:**
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Verify: `bun --version` (should be 1.0+)

### 2. Android Debug Bridge (ADB)

Required to connect Quest via USB.

**Mac:**
```bash
brew install android-platform-tools
```

**Windows:**
1. Download [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools)
2. Extract to `C:\adb\`
3. Add `C:\adb\` to your PATH

**Linux (Debian/Ubuntu):**
```bash
sudo apt install adb
```

Verify: `adb version`

### 3. mkcert (HTTPS Certificates)

WebXR requires HTTPS. mkcert creates locally-trusted certificates.

**Mac:**
```bash
brew install mkcert
mkcert -install
```

**Windows:**
```powershell
choco install mkcert
mkcert -install
```

**Linux:**
```bash
sudo apt install libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
mkcert -install
```

---

## HTTPS Certificate Setup

Generate certificates for local development:

```bash
cd /path/to/project
mkcert localhost
```

This creates `localhost.pem` and `localhost-key.pem` in the project root. The dev server automatically uses these certificates when present.

---

## Quest Developer Mode

1. **Create Developer Account** at [developer.oculus.com](https://developer.oculus.com)
2. **Enable Developer Mode** in Oculus mobile app:
   - Devices → Select Quest → Settings → Developer Mode → Enable
3. **Allow USB Debugging** when prompted on Quest

---

## Connect Quest to Dev Server

### USB Connection (Recommended)

```bash
# 1. Connect Quest via USB-C
adb devices
# Should show: XXXXXXXX device

# 2. Create reverse tunnel
adb reverse tcp:5173 tcp:5173

# 3. Start dev server
bun run dev

# 4. Open on Quest Browser
# https://localhost:5173/vr
```

### Wi-Fi Connection (Alternative)

```bash
# 1. Get Quest IP from Settings → Wi-Fi → Connected network
# 2. Start dev server on 0.0.0.0
bun run dev --host

# 3. Open on Quest Browser
# https://YOUR_PC_IP:5173/vr
```

> ⚠️ Wi-Fi has higher latency. USB is recommended for development.

---

## M5Stick Wireless Controller

The simulator can receive M5Stick orientation data directly. No external M5 WebSocket Adapter server
is needed during normal VR runtime.

### Start Simulator With M5 Bridge

```bash
bun run dev
```

Expected terminal output:

```text
[m5-bridge] Listening on ws://0.0.0.0:8787/ws/device
Local:   https://localhost:5173/
Network: https://YOUR_MAC_IP:5173/
```

Disable the M5 bridge when needed:

```bash
M5_BRIDGE=0 bun run dev
```

### Configure The M5Stick

The M5Stick must connect to the Mac's LAN IP, not `localhost`:

```text
ws://YOUR_MAC_IP:8787/ws/device
```

Example:

```text
ws://192.168.0.131:8787/ws/device
```

Do not use `localhost` for the M5Stick. From the M5Stick, `localhost` means the M5Stick itself.

The M5 firmware currently requires plain WebSocket:

```text
ws://
```

It does not support:

```text
wss://
```

### Open VR

Open the VR scene over HTTPS:

```text
https://YOUR_MAC_IP:5173/vr
```

Port summary:

| Purpose | URL |
| --- | --- |
| Quest / browser app | `https://YOUR_MAC_IP:5173/vr` |
| Browser WebSocket | `wss://YOUR_MAC_IP:5173` |
| M5Stick input | `ws://YOUR_MAC_IP:8787/ws/device` |

If the M5Stick stays at `LINK`, check firewall or antivirus rules. Local security software such as
ESET or macOS Firewall may block inbound LAN traffic to Node/Vite. Allow incoming connections for
Node.js and TCP port `8787`.

For the detailed operating checklist, see [M5_WIRELESS_SETUP.md](M5_WIRELESS_SETUP.md).

---

## Troubleshooting

### "Device unauthorized"

```bash
adb kill-server
adb start-server
adb devices
```

Then check Quest for USB debugging permission popup.

### "Connection refused" on Quest

```bash
# Re-establish tunnel
adb reverse tcp:5173 tcp:5173

# Verify tunnel
adb reverse --list
```

### Certificate errors in Quest Browser

1. Ensure `localhost.pem` and `localhost-key.pem` exist in project root
2. Restart dev server after generating certs
3. If still failing, use `adb reverse` method (avoids cert issues)

### WebXR not available

- Ensure using HTTPS (not HTTP)
- Quest Browser requires HTTPS for WebXR
- Localhost with valid cert should work

### Device Orientation not working (Controller)

- Mobile browsers require HTTPS for Device Orientation API
- Some browsers require user gesture to enable sensors
- iOS Safari: Settings → Safari → Motion & Orientation Access → Enable

### High latency in VR

- Use USB connection instead of Wi-Fi
- Close other tabs on Quest
- Check `adb reverse --list` shows active tunnel

### M5Stick stuck at LINK

- Confirm `bun run dev` is running in this repo
- Confirm the terminal shows `[m5-bridge] Listening on ws://0.0.0.0:8787/ws/device`
- Confirm the M5Stick URL is `ws://YOUR_MAC_IP:8787/ws/device`
- Confirm Mac and M5Stick are on the same network
- Confirm no other process owns port `8787`:

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

- Allow inbound LAN traffic to Node/Vite in firewall or antivirus software

---

## Verified Setups

| OS | Browser | Status |
|----|---------|--------|
| Mac (Apple Silicon) | Quest Browser | ✅ |
| Mac (Intel) | Quest Browser | ✅ |
| Windows 11 | Quest Browser | ✅ |
| Ubuntu 22.04 | Quest Browser | ✅ |

---

## Next Steps

Once connected:
1. Open `/vr` on Quest → Click "Enter VR"
2. Open `/controller` on laptop/phone
3. Use D-Pad or tilt device to control flight
4. Adjust settings via sidebar (☰ menu)

See [CUSTOMIZATION.md](CUSTOMIZATION.md) for modifying the VR world.
