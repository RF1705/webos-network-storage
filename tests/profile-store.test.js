"use strict";

var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var Store = require("../service/profile-store").Store;

var temp = fs.mkdtempSync(path.join(os.tmpdir(), "wns-store-"));
var store = new Store(temp);
var smb = {
  id: "games",
  displayName: "Meine Spiele",
  protocol: "smb",
  server: "192.0.2.10",
  remotePath: "Games",
  mountName: "games",
  readOnly: true,
  autoConnect: true,
  apps: ["org.scummvm.scummvm"],
  username: "games",
  password: "secret",
  domain: "WORKGROUP"
};

store.save(smb, "obscured-value");
var profiles = store.list();
assert.strictEqual(profiles.length, 1);
assert.strictEqual(profiles[0].displayName, "Meine Spiele");
assert.strictEqual(profiles[0].hasCredentials, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(profiles[0], "password"), false);
assert.strictEqual(fs.statSync(path.join(temp, "profiles/games.conf")).mode & 511, 384);
assert.strictEqual(fs.statSync(path.join(temp, "credentials/games.conf")).mode & 511, 384);

smb.password = "";
smb.displayName = "Spiele aktualisiert";
store.save(smb);
assert.strictEqual(store.list()[0].displayName, "Spiele aktualisiert");
assert.ok(fs.readFileSync(path.join(temp, "credentials/games.conf"), "utf8").indexOf("obscured-value") !== -1);

assert.throws(function () {
  store.validatePayload(Object.assign({}, smb, { remotePath: "../etc" }));
}, /ungültig/);
assert.throws(function () {
  store.validatePayload(Object.assign({}, smb, { server: "nas;reboot" }));
}, /ungültig/);
assert.throws(function () {
  store.validatePayload(Object.assign({}, smb, { apps: ["org.scummvm.scummvm;reboot"] }));
}, /ungültig/);

store.remove("games");
assert.strictEqual(store.list().length, 0);
var incomplete = Object.assign({}, smb, { id: "incomplete", password: "" });
assert.throws(function () { store.save(incomplete); }, /Passwort fehlt/);
assert.strictEqual(fs.existsSync(path.join(temp, "profiles/incomplete.conf")), false);
fs.rmSync(temp, { recursive: true, force: true });
console.log("All profile store tests passed.");
