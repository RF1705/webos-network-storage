#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM

STATE_DIR=$TMP_DIR/state
PROFILE_DIR=$STATE_DIR/profiles
CREDENTIAL_DIR=$STATE_DIR/credentials
BIN_DIR=$STATE_DIR/bin
TEST_BIN=$TMP_DIR/test-bin
MOUNT_ROOT=$TMP_DIR/mounts
mkdir -p "$PROFILE_DIR" "$CREDENTIAL_DIR" "$BIN_DIR" "$TEST_BIN" "$MOUNT_ROOT"

for command_name in id sed wc tr mkdir chmod ln rm stat; do
  ln -s "$(command -v "$command_name")" "$TEST_BIN/$command_name"
done
cat > "$TEST_BIN/fusermount" <<'EOF'
#!/bin/sh
exit 0
EOF
cat > "$TEST_BIN/mount" <<'EOF'
#!/bin/sh
exit 0
EOF
cat > "$TEST_BIN/umount" <<'EOF'
#!/bin/sh
exit 0
EOF
cat > "$BIN_DIR/rclone-smb" <<EOF
#!/bin/sh
printf '%s\n' "\$*" > "$TMP_DIR/rclone-args"
exit 0
EOF
chmod 0755 "$TEST_BIN/fusermount" "$TEST_BIN/mount" "$TEST_BIN/umount" "$BIN_DIR/rclone-smb"

cat > "$PROFILE_DIR/games.conf" <<'EOF'
DISPLAY_NAME=Games
PROTOCOL=smb
SERVER=192.0.2.10
REMOTE_PATH=Games
MOUNT_NAME=games
READ_ONLY=true
AUTO_CONNECT=false
CACHE_MODE=balanced
APP_IDS=
EOF
cat > "$CREDENTIAL_DIR/games.conf" <<'EOF'
USERNAME=games
PASSWORD_OBSCURED=not-a-real-password
DOMAIN=WORKGROUP
EOF
chmod 0600 "$PROFILE_DIR/games.conf" "$CREDENTIAL_DIR/games.conf"

PATH=$TEST_BIN \
WNS_STATE_DIR=$STATE_DIR \
WNS_MOUNT_ROOT=$MOUNT_ROOT \
WNS_JAIL_ROOT=$TMP_DIR/jails \
WNS_RCLONE_BIN=$BIN_DIR/rclone-smb \
WNS_MOUNT_BIN=$TEST_BIN/mount \
WNS_UMOUNT_BIN=$TEST_BIN/umount \
WNS_TEST_MODE=true \
WNS_ALLOW_UNPRIVILEGED=true \
WNS_SKIP_PERMISSION_CHECK=true \
"$ROOT/bin/webos-network-storage" mount games >/dev/null

grep -q -- '--vfs-cache-mode off' "$TMP_DIR/rclone-args"
grep -q -- '--buffer-size 8M' "$TMP_DIR/rclone-args"
grep -q -- '--vfs-read-chunk-size 8M' "$TMP_DIR/rclone-args"
grep -q -- '--vfs-read-chunk-size-limit 64M' "$TMP_DIR/rclone-args"

if grep -q -- '--cache-dir\|--vfs-read-ahead\|--vfs-cache-max-size' "$TMP_DIR/rclone-args"; then
  echo "Disk cache options must not be used" >&2
  exit 1
fi

echo "All SMB read buffer mode tests passed."
