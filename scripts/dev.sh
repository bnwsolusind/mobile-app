#!/bin/bash

set -u

# ============================================================
# SIMSIT MOBILE DEVELOPMENT SCRIPT
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

NODE_VERSION="22.23.2"
NODE_BIN="$HOME/.nvm/versions/node/v$NODE_VERSION/bin"

METRO_PORT="8081"
PACKAGE="id.sch.dareliman.simsit"
ACTIVITY="id.sch.dareliman.simsit/.MainActivity"
ENV_FILE="$PROJECT_DIR/.env.local"

ANDROID_SDK="$HOME/Library/Android/sdk"
ADB="$ANDROID_SDK/platform-tools/adb"

# ============================================================
# 1. FORCE NODE 22
# ============================================================

echo ""
echo "=========================================="
echo " SIMSIT MOBILE DEVELOPMENT"
echo "=========================================="
echo ""

echo "[1/9] Configuring Node.js..."

if [ ! -x "$NODE_BIN/node" ]; then
    if command -v node >/dev/null 2>&1 && node -v | grep -q "^v22"; then
        NODE_PATH="$(command -v node)"
        NODE_BIN="$(dirname "$NODE_PATH")"
    else
        echo ""
        echo "ERROR: Node.js $NODE_VERSION tidak ditemukan."
        echo ""
        echo "Expected:"
        echo "$NODE_BIN/node"
        echo ""
        exit 1
    fi
fi

# Paksa Node 22 menjadi prioritas.
export PATH="$NODE_BIN:$ANDROID_SDK/platform-tools:$ANDROID_SDK/emulator:$PATH"

# Bersihkan command cache shell.
hash -r 2>/dev/null || true

NODE_PATH="$NODE_BIN/node"
NPM_PATH="$NODE_BIN/npm"
NPX_PATH="$NODE_BIN/npx"

NODE_CURRENT="$("$NODE_PATH" -v)"

if [ "$NODE_CURRENT" != "v$NODE_VERSION" ]; then
    echo "ERROR: Node version tidak sesuai."
    echo "Expected : v$NODE_VERSION"
    echo "Current  : $NODE_CURRENT"
    exit 1
fi

echo "Node : $NODE_CURRENT"
echo "NPM  : $("${NPM_PATH}" -v)"
echo "NPX  : $("${NPX_PATH}" -v)"
echo "Path : $NODE_BIN"
echo ""

# ============================================================
# 2. ANDROID SDK
# ============================================================

echo "[2/9] Checking Android SDK..."

if [ ! -d "$ANDROID_SDK" ]; then
    if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME" ]; then
        ANDROID_SDK="$ANDROID_HOME"
        ADB="$ANDROID_SDK/platform-tools/adb"
    else
        echo ""
        echo "ERROR: Android SDK tidak ditemukan."
        echo "Expected:"
        echo "$ANDROID_SDK"
        echo ""
        exit 1
    fi
fi

export ANDROID_HOME="$ANDROID_SDK"
export ANDROID_SDK_ROOT="$ANDROID_SDK"

echo "Android SDK : $ANDROID_SDK"
echo ""

# ============================================================
# 3. ADB SERVER
# ============================================================

echo "[3/9] Checking ADB..."

if [ ! -x "$ADB" ]; then
    echo ""
    echo "ERROR: adb tidak ditemukan."
    echo "Expected:"
    echo "$ADB"
    echo ""
    exit 1
fi

echo "ADB : $ADB"

"$ADB" start-server >/dev/null 2>&1 || true
sleep 1
echo ""

# ============================================================
# 4. FIND ANDROID DEVICE
# ============================================================

echo "[4/9] Finding Android device..."
echo ""

# Ambil daftar semua baris device yang aktif dari adb devices
# Format adb devices: <device-serial-or-id>[tab/spaces]device
RAW_DEVICE_LINES="$("$ADB" devices 2>/dev/null | grep -v '^List of devices' | grep -E '\bdevice$' || true)"

DEVICE=""

# Helper function untuk membersihkan status "device" dari akhir baris
clean_device_id() {
    printf '%s' "$1" | sed -E 's/[[:space:]]+device$//'
}

# 1. Prioritaskan device IP:PORT standar (e.g. 192.168.1.5:5555)
while IFS= read -r line; do
    [ -z "$line" ] && continue
    CANDIDATE="$(clean_device_id "$line")"
    if [[ "$CANDIDATE" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+$ ]]; then
        DEVICE="$CANDIDATE"
        break
    fi
done <<< "$RAW_DEVICE_LINES"

# 2. Jika tidak ada IP:PORT, cari device fisik USB (bukan emulator dan bukan mDNS wireless)
if [ -z "$DEVICE" ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        CANDIDATE="$(clean_device_id "$line")"
        if [[ ! "$CANDIDATE" =~ ^emulator- ]] && [[ ! "$CANDIDATE" =~ _adb-tls-connect ]]; then
            DEVICE="$CANDIDATE"
            break
        fi
    done <<< "$RAW_DEVICE_LINES"
fi

# 3. Jika tidak ada USB, cari device Wireless mDNS (_adb-tls-connect)
# Prioritaskan identifier yang bersih (tanpa tanda kurung duplicate seperti " (2)")
if [ -z "$DEVICE" ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        CANDIDATE="$(clean_device_id "$line")"
        if [[ "$CANDIDATE" =~ _adb-tls-connect ]] && [[ ! "$CANDIDATE" =~ \( ]]; then
            DEVICE="$CANDIDATE"
            break
        fi
    done <<< "$RAW_DEVICE_LINES"
fi

# 4. Fallback ke device mDNS apa saja jika semua memiliki tanda kurung duplicate
if [ -z "$DEVICE" ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        CANDIDATE="$(clean_device_id "$line")"
        if [[ "$CANDIDATE" =~ _adb-tls-connect ]]; then
            DEVICE="$CANDIDATE"
            break
        fi
    done <<< "$RAW_DEVICE_LINES"
fi

# 5. Fallback ke emulator atau device apa pun yang tersisa
if [ -z "$DEVICE" ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        DEVICE="$(clean_device_id "$line")"
        break
    done <<< "$RAW_DEVICE_LINES"
fi

if [ -z "$DEVICE" ]; then
    echo ""
    echo "ERROR: Android device tidak ditemukan."
    echo ""
    echo "Pastikan HP terhubung melalui ADB (USB Debugging aktif atau Wireless Debugging terhubung)."
    echo "Status ADB:"
    "$ADB" devices
    echo ""
    exit 1
fi

echo "Device selected:"
echo "  $DEVICE"

# ============================================================
# 5. DEVICE INFORMATION & IP RESOLUTION
# ============================================================

echo ""
echo "[5/9] Reading device information..."

# 1. Deteksi IP Mac komputer lokal (WiFi en0 / Ethernet en1 / en2)
MAC_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ipconfig getifaddr en2 2>/dev/null || true)"

# 2. Deteksi tipe koneksi device dan IP HP fisik
DEVICE_IP=""
CONNECTION_TYPE="USB Cable"

if [[ "$DEVICE" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+$ ]]; then
    CONNECTION_TYPE="WiFi (TCP/IP $DEVICE)"
    DEVICE_IP="${DEVICE%%:*}"
elif [[ "$DEVICE" =~ _adb-tls-connect ]]; then
    CONNECTION_TYPE="WiFi (Wireless mDNS)"
    WLAN_IP="$("$ADB" -s "$DEVICE" shell ip -4 addr show wlan0 2>/dev/null | grep -oE 'inet [0-9.]+' | awk '{print $2}' | head -n 1 || true)"
    if [ -z "$WLAN_IP" ]; then
        WLAN_IP="$("$ADB" -s "$DEVICE" shell ip route 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}' | head -n 1 || true)"
    fi
    DEVICE_IP="${WLAN_IP:-${MAC_IP:-127.0.0.1}}"
else
    CONNECTION_TYPE="USB Cable ($DEVICE)"
    WLAN_IP="$("$ADB" -s "$DEVICE" shell ip -4 addr show wlan0 2>/dev/null | grep -oE 'inet [0-9.]+' | awk '{print $2}' | head -n 1 || true)"
    if [ -z "$WLAN_IP" ]; then
        WLAN_IP="$("$ADB" -s "$DEVICE" shell ip route 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}' | head -n 1 || true)"
    fi
    DEVICE_IP="${WLAN_IP:-${MAC_IP:-127.0.0.1}}"
fi

# 3. Tentukan Target API URL otomatis berdasarkan IP Mac yang aktif
if [ -n "$MAC_IP" ]; then
    TARGET_API_URL="http://${MAC_IP}:8000/api"
else
    TARGET_API_URL="http://127.0.0.1:8000/api"
fi

MODEL="$(
    "$ADB" -s "$DEVICE" shell getprop ro.product.model 2>/dev/null |
    tr -d '\r' ||
    true
)"

ANDROID_VERSION="$(
    "$ADB" -s "$DEVICE" shell getprop ro.build.version.release 2>/dev/null |
    tr -d '\r' ||
    true
)"

echo "Koneksi : $CONNECTION_TYPE"
echo "IP HP   : ${DEVICE_IP:-Unknown}"
echo "IP Mac  : ${MAC_IP:-127.0.0.1}"
echo "Model   : ${MODEL:-Unknown}"
echo "Android : ${ANDROID_VERSION:-Unknown}"
echo ""

# ============================================================
# 6. ENVIRONMENT (.env.local AUTO-SYNC)
# ============================================================

echo "[6/9] Configuring environment (.env.local)..."

cd "$PROJECT_DIR" || exit 1

touch "$ENV_FILE"

# 1. Update EXPO_PUBLIC_DEVICE_IP otomatis jika terdeteksi
if [ -n "$DEVICE_IP" ]; then
    if grep -q '^EXPO_PUBLIC_DEVICE_IP=' "$ENV_FILE"; then
        sed -i '' \
            "s/^EXPO_PUBLIC_DEVICE_IP=.*/EXPO_PUBLIC_DEVICE_IP=$DEVICE_IP/" \
            "$ENV_FILE"
    else
        printf '\nEXPO_PUBLIC_DEVICE_IP=%s\n' "$DEVICE_IP" >> "$ENV_FILE"
    fi
fi

# 2. Update EXPO_PUBLIC_API_URL otomatis jika IP Mac berubah
CURRENT_API_URL="$(
    grep -E '^[[:space:]]*EXPO_PUBLIC_API_URL=' "$ENV_FILE" |
    head -n 1 |
    cut -d '=' -f2- |
    tr -d '[:space:]' ||
    true
)"

if [ "$CURRENT_API_URL" != "$TARGET_API_URL" ]; then
    echo "  [AUTO-SYNC] IP Host berubah! Memperbarui .env.local..."
    echo "  Sebelumnya : ${CURRENT_API_URL:-Kosong}"
    echo "  Terkini    : $TARGET_API_URL"
    if grep -q -E '^[[:space:]]*EXPO_PUBLIC_API_URL=' "$ENV_FILE"; then
        sed -i '' \
            "s|^[[:space:]]*EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=$TARGET_API_URL|" \
            "$ENV_FILE"
    else
        printf 'EXPO_PUBLIC_API_URL=%s\n' "$TARGET_API_URL" >> "$ENV_FILE"
    fi
else
    echo "  [OK] EXPO_PUBLIC_API_URL sudah sinkron ($TARGET_API_URL)"
fi

echo "API URL Aktif : $TARGET_API_URL"
echo ""

# ============================================================
# 7. ADB REVERSE
# ============================================================

echo "[7/9] Configuring ADB reverse..."

# Port reverse untuk Metro bundler
"$ADB" -s "$DEVICE" reverse tcp:$METRO_PORT tcp:$METRO_PORT >/dev/null 2>&1 || true

# Port reverse untuk Backend API Laravel jika HP terhubung via USB
"$ADB" -s "$DEVICE" reverse tcp:8000 tcp:8000 >/dev/null 2>&1 || true

echo "Reverse Metro   : tcp:$METRO_PORT -> tcp:$METRO_PORT"
echo "Reverse Backend : tcp:8000 -> tcp:8000"
echo ""
echo "ADB reverse status:"
"$ADB" -s "$DEVICE" reverse --list 2>/dev/null || true
echo ""

# ============================================================
# 8. METRO PORT CLEANUP
# ============================================================

echo "[8/9] Preparing Metro port..."

METRO_PIDS="$(
    lsof -tiTCP:"$METRO_PORT" -sTCP:LISTEN 2>/dev/null ||
    true
)"

if [ -n "$METRO_PIDS" ]; then
    echo "Metro port $METRO_PORT sedang digunakan. Menghentikan proses lama..."
    for PID in $METRO_PIDS; do
        kill "$PID" >/dev/null 2>&1 || true
    done
    sleep 2

    # Force kill jika masih aktif
    METRO_PIDS="$(
        lsof -tiTCP:"$METRO_PORT" -sTCP:LISTEN 2>/dev/null ||
        true
    )"
    if [ -n "$METRO_PIDS" ]; then
        for PID in $METRO_PIDS; do
            kill -9 "$PID" >/dev/null 2>&1 || true
        done
    fi
fi

echo "Metro port $METRO_PORT siap."
echo ""

# ============================================================
# 9. AUTO-LAUNCH APP ON PHONE & START EXPO
# ============================================================

echo "[9/9] Starting Expo Metro Bundler & Launching App..."
echo ""

echo "=========================================="
echo " SIMSIT READY"
echo "=========================================="
echo ""
echo "Project : $PROJECT_DIR"
echo "Node    : $NODE_CURRENT"
echo "Device  : $DEVICE"
echo "Model   : ${MODEL:-Unknown}"
echo "Android : ${ANDROID_VERSION:-Unknown}"
echo "IP      : $DEVICE_IP"
echo "Metro   : http://localhost:$METRO_PORT"
echo "API     : ${API_URL:-Tidak ditemukan}"
echo ""

# Background worker: Menunggu Metro hidup, lalu membuka aplikasi di HP fisik
(
    METRO_READY=0
    for i in {1..30}; do
        sleep 1
        if curl -s -m 1 "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"; then
            METRO_READY=1
            break
        fi
    done

    # Bangunkan layar HP dan buka kunci jika layar mati
    "$ADB" -s "$DEVICE" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
    "$ADB" -s "$DEVICE" shell wm dismiss-keyguard >/dev/null 2>&1 || true

    # Buka Activity aplikasi SIMSIT
    "$ADB" -s "$DEVICE" shell am start -n "$ACTIVITY" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER >/dev/null 2>&1 || true

    # Beri sinyal reload React Native dev server
    sleep 2
    "$ADB" -s "$DEVICE" shell am broadcast -a "com.facebook.react.devsupport.ACTION_RELOAD" >/dev/null 2>&1 || true
) &

echo "Memulai Metro bundler (aplikasi di HP akan otomatis terbuka)..."
echo "=========================================="
echo ""

# Jalankan Expo dengan Node 22
exec "$NODE_PATH" "$NPX_PATH" expo start \
    --dev-client \
    --clear \
    --scheme simsit \
    --host localhost \
    --port "$METRO_PORT"

