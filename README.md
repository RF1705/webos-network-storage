# webOS Network Storage

`webos-network-storage` provides shared, read-only-by-default network mounts for
native homebrew applications on rooted LG webOS TVs.

The project is intentionally independent of any emulator. A single SMB or NFS
profile can be exposed to ScummVM, RetroArch, or other selected application
jails.

The downloadable IPK combines a Magic Remote-friendly TV interface, a narrow
Luna service, the privileged mount helper, and the ARMv7 SMB/FUSE binary.

## Current scope

- multiple SMB and NFS profiles managed on the TV;
- connection test, connect, disconnect, status, and profile removal;
- ScummVM selection by default plus RetroArch and detected application jails;
- one-time service elevation through an installed, rooted Homebrew Channel;
- automatic reconnect supervision and a boot startup hook;
- strict profile validation without evaluating profile contents as shell code;
- `validate`, `test`, `mount`, `unmount`, `status`, `expose`, and `autostart`
  commands, plus app-jail discovery with `list-apps`;
- read-only mounts by default;
- separate root-only SMB credentials;
- bind mounts into explicitly selected application jails;
- small ARMv7 `rclone-smb` build for webOS/FUSE;
- shell tests and an ARMv7 build workflow.

## Layout

```text
app/                            TV web application
service/                        narrow Luna service and profile store
bin/webos-network-storage       privileged mount helper
config/                         profile and credential examples
docs/architecture.md            component and security design
tools/rclone-smb                reduced rclone SMB/FUSE build
```

The default TV paths are:

```text
/var/lib/webosbrew/network-storage/profiles
/var/lib/webosbrew/network-storage/credentials
/var/lib/webosbrew/network-storage/runtime
/media/developer/network-storage/<mount-name>
```

## Profile example

Copy `config/profiles/games-smb.conf.example` to
`/var/lib/webosbrew/network-storage/profiles/games.conf` and adjust it:

```ini
PROTOCOL=smb
SERVER=192.0.2.10
REMOTE_PATH=Games
MOUNT_NAME=games
READ_ONLY=true
AUTO_CONNECT=true
APP_IDS=org.scummvm.scummvm com.retroarch
```

SMB credentials are kept separately in
`/var/lib/webosbrew/network-storage/credentials/games.conf`:

```ini
USERNAME=network-storage
PASSWORD_OBSCURED=<output of rclone-smb obscure>
DOMAIN=WORKGROUP
```

Both files must be owned by root and mode `0600`. `PASSWORD_OBSCURED` prevents
accidental disclosure; it is not encryption against a user with root access.
No password is accepted as a command-line argument.

## Helper usage

```sh
webos-network-storage validate games
webos-network-storage test games
webos-network-storage mount games
webos-network-storage status games
webos-network-storage expose games
webos-network-storage list-apps
webos-network-storage unmount games
webos-network-storage autostart
```

`mount`, `unmount`, `test`, `expose`, and `autostart` require root. `autostart`
only mounts profiles with `AUTO_CONNECT=true`.

For local validation and tests, paths and external commands can be replaced
with `WNS_*` environment variables while `WNS_TEST_MODE=true`. These overrides
are intended only for the automated test suite.

## Target device

The initial target is webOS 6.5 on ARMv7. Its kernel has NFS support but no
CIFS filesystem or `mount.cifs`. SMB therefore uses the TV's existing FUSE
support and a reduced rclone binary.

## Install the IPK

Download the `webos-network-storage` artifact from the latest successful
GitHub Actions run and extract it. Install the included
`com.rf1705.networkstorage_*_arm.ipk` with webOS Dev Manager, `ares-install`, or
the Homebrew Channel.

On the first launch, select **Jetzt einrichten**. The app asks the already
rooted Homebrew Channel to elevate only
`com.rf1705.networkstorage.service`. The service then installs its two helper
binaries and the reconnect hook below `/var/lib/webosbrew`. No SMB password is
placed in a shell command or process argument.

The mount path is derived from the configured mount name:

```text
/media/developer/network-storage/<mount-name>
```

Select **ScummVM** in the profile. Inside ScummVM, add that same path as the
game directory. The service bind-mounts it into ScummVM's app jail when the
profile connects.

## Builds and releases

Every push to `main` and every manual run of the `Build` workflow creates a
downloadable artifact containing the installable IPK, a standalone helper
archive, and SHA-256 checksums. To publish a GitHub release, start the workflow
manually and enter a version such as `v0.1.0`. If the version field is left
empty, only the artifact is generated.
