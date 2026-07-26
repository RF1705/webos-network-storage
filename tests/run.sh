#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM

STATE_DIR=$TMP_DIR/state
PROFILE_DIR=$STATE_DIR/profiles
CREDENTIAL_DIR=$STATE_DIR/credentials
mkdir -p "$PROFILE_DIR" "$CREDENTIAL_DIR" "$TMP_DIR/mounts" "$TMP_DIR/jails"

HELPER=$ROOT/bin/webos-network-storage

run_helper() {
	WNS_STATE_DIR=$STATE_DIR \
	WNS_MOUNT_ROOT=$TMP_DIR/mounts \
	WNS_JAIL_ROOT=$TMP_DIR/jails \
	WNS_TEST_MODE=true \
	WNS_ALLOW_UNPRIVILEGED=true \
	WNS_SKIP_PERMISSION_CHECK=true \
	"$HELPER" "$@"
}

expect_failure() {
	if "$@" >"$TMP_DIR/output" 2>&1; then
		echo "Expected command to fail: $*" >&2
		exit 1
	fi
}

cat > "$PROFILE_DIR/games.conf" <<'EOF'
PROTOCOL=nfs
SERVER=192.0.2.10
REMOTE_PATH=/exports/Games
MOUNT_NAME=games
READ_ONLY=true
AUTO_CONNECT=false
APP_IDS=org.scummvm.scummvm com.retroarch
NFS_VERSION=3
EOF
chmod 0600 "$PROFILE_DIR/games.conf"

run_helper validate games | grep -q "is valid"
run_helper status games | grep -q '"mounted":false'

mkdir -p "$TMP_DIR/jails/org.scummvm.scummvm" "$TMP_DIR/jails/com.retroarch"
run_helper list-apps | grep -q '^org.scummvm.scummvm$'
run_helper list-apps | grep -q '^com.retroarch$'

cp "$PROFILE_DIR/games.conf" "$PROFILE_DIR/invalid.conf"
printf 'EVIL_COMMAND=touch /tmp/nope\n' >> "$PROFILE_DIR/invalid.conf"
chmod 0600 "$PROFILE_DIR/invalid.conf"
expect_failure run_helper validate invalid
grep -q "unknown key" "$TMP_DIR/output"

cp "$PROFILE_DIR/games.conf" "$PROFILE_DIR/traversal.conf"
sed 's#REMOTE_PATH=/exports/Games#REMOTE_PATH=/exports/../etc#' \
	"$PROFILE_DIR/games.conf" > "$PROFILE_DIR/traversal.conf"
chmod 0600 "$PROFILE_DIR/traversal.conf"
expect_failure run_helper validate traversal
grep -q "invalid REMOTE_PATH" "$TMP_DIR/output"

sed 's#REMOTE_PATH=/exports/Games#REMOTE_PATH=$(printf injected)#' \
	"$PROFILE_DIR/games.conf" > "$PROFILE_DIR/injection.conf"
chmod 0600 "$PROFILE_DIR/injection.conf"
expect_failure run_helper validate injection

cat > "$PROFILE_DIR/fritz.conf" <<'EOF'
PROTOCOL=smb
SERVER=192.0.2.10
REMOTE_PATH=Games
MOUNT_NAME=fritz-games
READ_ONLY=true
AUTO_CONNECT=true
APP_IDS=org.scummvm.scummvm
EOF
cat > "$CREDENTIAL_DIR/fritz.conf" <<'EOF'
USERNAME=games
PASSWORD_OBSCURED=not-a-real-password
DOMAIN=WORKGROUP
EOF
chmod 0600 "$PROFILE_DIR/fritz.conf" "$CREDENTIAL_DIR/fritz.conf"
run_helper validate fritz | grep -q "is valid"

echo "All helper tests passed."
