"use strict";

var fs = require("fs");
var path = require("path");

var PROFILE_KEYS = [
  "DISPLAY_NAME", "PROTOCOL", "SERVER", "REMOTE_PATH", "MOUNT_NAME",
  "READ_ONLY", "AUTO_CONNECT", "APP_IDS", "NFS_VERSION"
];
var CREDENTIAL_KEYS = ["USERNAME", "PASSWORD_OBSCURED", "DOMAIN"];

function fail(message) { throw new Error(message); }
function validId(value) { return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(value); }
function validServer(value) { return typeof value === "string" && value.length > 0 && value.length <= 253 && /^[A-Za-z0-9._:-]+$/.test(value); }
function validPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    /^[A-Za-z0-9._/\\ -]+$/.test(value) && value.indexOf("..") === -1;
}
function validMountName(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(value); }
function validAppId(value) {
  return typeof value === "string" && value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$/.test(value) && value.indexOf("..") === -1;
}
function cleanDisplayName(value) {
  if (typeof value !== "string") fail("Name fehlt.");
  value = value.trim();
  if (!value || value.length > 60 || /[\r\n\t]/.test(value)) fail("Name ist ungültig.");
  return value;
}
function bool(value, name) {
  if (typeof value !== "boolean") fail(name + " muss aktiviert oder deaktiviert sein.");
  return value;
}
function parseConfig(contents, allowed) {
  var result = {};
  String(contents).split(/\r?\n/).forEach(function (line) {
    if (!line || line.charAt(0) === "#") return;
    var split = line.indexOf("=");
    if (split < 1) fail("Ungültige Konfigurationszeile.");
    var key = line.slice(0, split);
    if (allowed.indexOf(key) === -1 || Object.prototype.hasOwnProperty.call(result, key)) {
      fail("Ungültiger Konfigurationsschlüssel: " + key);
    }
    result[key] = line.slice(split + 1);
  });
  return result;
}
function configText(values, keys) {
  return keys.filter(function (key) { return values[key] !== undefined && values[key] !== ""; })
    .map(function (key) { return key + "=" + values[key]; }).join("\n") + "\n";
}
function atomicWrite(file, contents) {
  var temp = file + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(temp, contents, { encoding: "utf8", mode: 384 });
  fs.chmodSync(temp, 384);
  fs.renameSync(temp, file);
}
function readIfExists(file) {
  try { return fs.readFileSync(file, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function Store(stateDir) {
  this.stateDir = stateDir;
  this.profileDir = path.join(stateDir, "profiles");
  this.credentialDir = path.join(stateDir, "credentials");
}

Store.prototype.ensureDirectories = function () {
  [this.stateDir, this.profileDir, this.credentialDir, path.join(this.stateDir, "runtime"), path.join(this.stateDir, "bin")]
    .forEach(function (dir) {
      try { fs.mkdirSync(dir, { mode: 448 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      fs.chmodSync(dir, 448);
    });
};

Store.prototype.validatePayload = function (payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("Profil fehlt.");
  if (!validId(payload.id)) fail("Profil-ID ist ungültig.");
  if (payload.protocol !== "smb" && payload.protocol !== "nfs") fail("Protokoll ist ungültig.");
  if (!validServer(payload.server)) fail("Server ist ungültig.");
  if (!validPath(payload.remotePath)) fail("Freigabe oder Remote-Pfad ist ungültig.");
  if (payload.protocol === "nfs" && payload.remotePath.charAt(0) !== "/") fail("Ein NFS-Pfad muss mit / beginnen.");
  if (!validMountName(payload.mountName)) fail("Mountname ist ungültig.");
  if (!Array.isArray(payload.apps) || payload.apps.some(function (id) { return !validAppId(id); })) fail("App-Auswahl ist ungültig.");
  if (payload.apps.length !== payload.apps.filter(function (id, index, apps) { return apps.indexOf(id) === index; }).length) fail("App-Auswahl enthält Duplikate.");
  var result = {
    id: payload.id,
    displayName: cleanDisplayName(payload.displayName),
    protocol: payload.protocol,
    server: payload.server,
    remotePath: payload.remotePath,
    mountName: payload.mountName,
    readOnly: bool(payload.readOnly, "Nur-Lesen"),
    autoConnect: bool(payload.autoConnect, "Autostart"),
    apps: payload.apps,
    nfsVersion: payload.protocol === "nfs" ? String(payload.nfsVersion || "3") : ""
  };
  if (result.nfsVersion !== "" && result.nfsVersion !== "3" && result.nfsVersion !== "4") fail("NFS-Version ist ungültig.");
  if (payload.protocol === "smb") {
    if (typeof payload.username !== "string" || !/^[A-Za-z0-9._@+-]+$/.test(payload.username)) fail("SMB-Benutzer ist ungültig.");
    if (typeof payload.domain !== "string" || (payload.domain && !/^[A-Za-z0-9._-]+$/.test(payload.domain))) fail("SMB-Domäne ist ungültig.");
    if (typeof payload.password !== "string" || /[\r\n]/.test(payload.password)) fail("Passwort ist ungültig.");
    result.username = payload.username;
    result.domain = payload.domain;
    result.password = payload.password;
  }
  return result;
};

Store.prototype.save = function (payload, obscuredPassword) {
  var data = this.validatePayload(payload);
  this.ensureDirectories();
  var credentialFile = path.join(this.credentialDir, data.id + ".conf");
  var credentialText = null;
  if (data.protocol === "smb") {
    var previous = readIfExists(credentialFile);
    var old = previous === null ? {} : parseConfig(previous, CREDENTIAL_KEYS);
    var password = obscuredPassword || old.PASSWORD_OBSCURED;
    if (!password) fail("SMB-Passwort fehlt.");
    credentialText = configText({
      USERNAME: data.username,
      PASSWORD_OBSCURED: password,
      DOMAIN: data.domain
    }, CREDENTIAL_KEYS);
  }
  var profile = {
    DISPLAY_NAME: data.displayName,
    PROTOCOL: data.protocol,
    SERVER: data.server,
    REMOTE_PATH: data.remotePath,
    MOUNT_NAME: data.mountName,
    READ_ONLY: data.readOnly ? "true" : "false",
    AUTO_CONNECT: data.autoConnect ? "true" : "false",
    APP_IDS: data.apps.join(" "),
    NFS_VERSION: data.nfsVersion
  };
  atomicWrite(path.join(this.profileDir, data.id + ".conf"), configText(profile, PROFILE_KEYS));

  if (data.protocol === "smb") {
    atomicWrite(credentialFile, credentialText);
  } else {
    try { fs.unlinkSync(credentialFile); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return data.id;
};

Store.prototype.list = function () {
  this.ensureDirectories();
  var self = this;
  return fs.readdirSync(this.profileDir).filter(function (name) { return /^[a-z0-9][a-z0-9_-]{0,47}\.conf$/.test(name); })
    .sort().map(function (name) {
      var id = name.slice(0, -5);
      var profile = parseConfig(fs.readFileSync(path.join(self.profileDir, name), "utf8"), PROFILE_KEYS);
      var credentials = {};
      var credentialText = readIfExists(path.join(self.credentialDir, name));
      if (credentialText !== null) credentials = parseConfig(credentialText, CREDENTIAL_KEYS);
      return {
        id: id,
        displayName: profile.DISPLAY_NAME || id,
        protocol: profile.PROTOCOL,
        server: profile.SERVER,
        remotePath: profile.REMOTE_PATH,
        mountName: profile.MOUNT_NAME,
        mountPoint: "/media/developer/network-storage/" + profile.MOUNT_NAME,
        readOnly: profile.READ_ONLY !== "false",
        autoConnect: profile.AUTO_CONNECT === "true",
        apps: profile.APP_IDS ? profile.APP_IDS.split(/ +/) : [],
        nfsVersion: profile.NFS_VERSION || "3",
        username: credentials.USERNAME || "",
        domain: credentials.DOMAIN || "",
        hasCredentials: Boolean(credentials.PASSWORD_OBSCURED)
      };
    });
};

Store.prototype.remove = function (id) {
  if (!validId(id)) fail("Profil-ID ist ungültig.");
  var self = this;
  ["profiles", "credentials"].forEach(function (dir) {
    try { fs.unlinkSync(path.join(self.stateDir, dir, id + ".conf")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  });
};

module.exports = {
  Store: Store,
  validId: validId,
  parseConfig: parseConfig
};
