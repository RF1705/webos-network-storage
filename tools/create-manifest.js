"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var appInfoFile = process.argv[2];
var ipkFile = process.argv[3];
var outputFile = process.argv[4];

if (!appInfoFile || !ipkFile || !outputFile) {
  console.error(
    "Usage: node tools/create-manifest.js <appinfo.json> <package.ipk> <manifest.json>"
  );
  process.exit(2);
}

var app = JSON.parse(fs.readFileSync(appInfoFile, "utf8"));
var manifest = {
  id: app.id,
  version: app.version,
  type: app.type,
  title: app.title,
  appDescription: app.appDescription,
  iconUri: "https://raw.githubusercontent.com/RF1705/webos-network-storage/main/app/icon.png",
  sourceUrl: "https://github.com/RF1705/webos-network-storage",
  rootRequired: true,
  ipkUrl: path.basename(ipkFile),
  ipkHash: {
    sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(ipkFile))
      .digest("hex")
  }
};

fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2) + "\n");
