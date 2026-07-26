# SMB credentials

For an SMB profile named `games`, create `games.conf` in this directory:

```ini
USERNAME=network-storage
PASSWORD_OBSCURED=<output of rclone-smb obscure>
DOMAIN=WORKGROUP
```

Install the file as root with mode `0600`. Do not commit real credential files.
`PASSWORD_OBSCURED` is reversible obfuscation, not encryption against root.

