"use strict";

var Service = require("webos-service");
var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");
var Store = require("./profile-store").Store;
var validId = require("./profile-store").validId;

var SERVICE_ID = "com.rf1705.networkstorage.service";
var STATE_DIR = "/var/lib/webosbrew/network-storage";
var BIN_DIR = path.join(STATE_DIR, "bin");
var HELPER = path.join(BIN_DIR, "webos-network-storage");
var RCLONE = path.join(BIN_DIR, "rclone-smb");
var INIT_HOOK = "/var/lib/webosbrew/init.d/webos-network-storage";
var store = new Store(STATE_DIR);
var service = new Service(SERVICE_ID);

function isRoot() { return typeof process.getuid === "function" && process.getuid() === 0; }
function exists(file) { try { fs.statSync(file); return true; } catch (error) { return false; } }
function respond(message, payload) {
  payload = payload || {};
  payload.returnValue = true;
  message.respond(payload);
}
function reject(message, error) {
  console.error(error && error.stack ? error.stack : error);
  message.respond({ returnValue: false, errorText: error && error.message ? error.message : String(error) });
}
function register(name, handler) {
  service.register(name, function (message) {
    try { handler(message); } catch (error) { reject(message, error); }
  });
}
function requireRoot() {
  if (!isRoot()) throw new Error("Der Systemdienst besitzt noch keinen Root-Zugriff.");
}
function requireSetup() {
  requireRoot();
  if (!exists(HELPER) || !exists(RCLONE)) throw new Error("Der Systemdienst muss zuerst eingerichtet werden.");
}
function installFile(source, target) {
  var temp = target + ".tmp-" + process.pid;
  fs.copyFileSync(source, temp);
  fs.chmodSync(temp, 493);
  fs.renameSync(temp, target);
}
function helper(action, id, callback) {
  requireSetup();
  var args = [action];
  if (id !== undefined) {
    if (!validId(id)) throw new Error("Profil-ID ist ungültig.");
    args.push(id);
  }
  childProcess.execFile(HELPER, args, { timeout: action === "test" ? 30000 : 20000, maxBuffer: 256 * 1024 }, callback);
}
function helperSync(action, id) {
  requireSetup();
  var args = [action];
  if (id !== undefined) {
    if (!validId(id)) throw new Error("Profil-ID ist ungültig.");
    args.push(id);
  }
  return childProcess.execFileSync(HELPER, args, { encoding: "utf8", timeout: 6000, maxBuffer: 256 * 1024 });
}
function obscure(password, callback) {
  var processHandle = childProcess.spawn(RCLONE, ["obscure", "-"], { stdio: ["pipe", "pipe", "pipe"] });
  var stdout = "", stderr = "", finished = false;
  function done(error, value) {
    if (finished) return;
    finished = true;
    callback(error, value);
  }
  processHandle.stdout.on("data", function (data) { stdout += data.toString(); });
  processHandle.stderr.on("data", function (data) { stderr += data.toString(); });
  processHandle.on("error", done);
  processHandle.on("close", function (code) {
    if (code !== 0) done(new Error(stderr.trim() || "Passwort konnte nicht verarbeitet werden."));
    else done(null, stdout.trim());
  });
  processHandle.stdin.end(password + "\n");
}
function startSupervisor() {
  var runtime = path.join(STATE_DIR, "runtime");
  var pidFile = path.join(runtime, "supervisor.pid");
  try {
    var oldPid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
    if (oldPid > 1) {
      process.kill(oldPid, 0);
      return;
    }
  } catch (error) {}
  var logFd = fs.openSync(path.join(runtime, "supervisor.log"), "a", 384);
  var proc = childProcess.spawn(HELPER, ["supervise"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin" }
  });
  proc.unref();
  fs.writeFileSync(pidFile, String(proc.pid) + "\n", { mode: 384 });
  fs.closeSync(logFd);
}
function profileMounted(id) {
  try { return JSON.parse(helperSync("status", id)).mounted === true; }
  catch (error) { return false; }
}
function inhibit(id) {
  var marker = path.join(STATE_DIR, "runtime", "inhibit-" + id);
  fs.writeFileSync(marker, String(process.pid) + "\n", { mode: 384 });
  return marker;
}
function releaseInhibit(marker) {
  try { fs.unlinkSync(marker); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

register("getState", function (message) {
  var root = isRoot();
  var setup = root && exists(HELPER) && exists(RCLONE);
  if (!setup) {
    respond(message, { root: root, setup: false, profiles: [], apps: [] });
    return;
  }
  var profiles = store.list();
  profiles.forEach(function (profile) {
    try { profile.mounted = JSON.parse(helperSync("status", profile.id)).mounted === true; }
    catch (error) { profile.mounted = false; profile.error = error.message; }
  });
  var apps = [];
  try { apps = helperSync("list-apps").trim().split(/\r?\n/).filter(Boolean); } catch (error) {}
  respond(message, { root: true, setup: true, profiles: profiles, apps: apps });
});

register("setup", function (message) {
  requireRoot();
  store.ensureDirectories();
  installFile(path.join(__dirname, "bin", "webos-network-storage"), HELPER);
  installFile(path.join(__dirname, "bin", "rclone-smb"), RCLONE);
  try { fs.mkdirSync(path.dirname(INIT_HOOK), { mode: 493 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  var hook = [
    "#!/bin/sh",
    "helper=/var/lib/webosbrew/network-storage/bin/webos-network-storage",
    "pidfile=/var/lib/webosbrew/network-storage/runtime/supervisor.pid",
    "if [ -r \"$pidfile\" ] && kill -0 \"$(cat \"$pidfile\")\" 2>/dev/null; then exit 0; fi",
    "\"$helper\" supervise >>/var/lib/webosbrew/network-storage/runtime/supervisor.log 2>&1 &",
    "echo $! >\"$pidfile\"",
    ""
  ].join("\n");
  fs.writeFileSync(INIT_HOOK, hook, { encoding: "utf8", mode: 493 });
  fs.chmodSync(INIT_HOOK, 493);
  startSupervisor();
  respond(message, { setup: true });
});

register("saveProfile", function (message) {
  requireSetup();
  var payload = store.validatePayload(message.payload);
  var marker = inhibit(payload.id);
  if (profileMounted(payload.id)) {
    releaseInhibit(marker);
    throw new Error("Bitte die Freigabe vor dem Bearbeiten trennen.");
  }
  if (payload.protocol === "smb" && payload.password) {
    obscure(payload.password, function (error, obscured) {
      if (error) { releaseInhibit(marker); reject(message, error); return; }
      try {
        store.save(payload, obscured);
        releaseInhibit(marker);
        respond(message, { id: payload.id });
      } catch (saveError) {
        releaseInhibit(marker);
        reject(message, saveError);
      }
    });
  } else {
    try {
      store.save(payload);
      releaseInhibit(marker);
      respond(message, { id: payload.id });
    } catch (saveError) {
      releaseInhibit(marker);
      throw saveError;
    }
  }
});

["test", "mount", "unmount", "expose"].forEach(function (action) {
  register(action, function (message) {
    helper(action, message.payload.id, function (error, stdout, stderr) {
      if (error) { reject(message, new Error((stderr || error.message).trim())); return; }
      respond(message, { output: String(stdout || "").trim() });
    });
  });
});

register("deleteProfile", function (message) {
  requireSetup();
  var id = message.payload.id;
  if (!validId(id)) throw new Error("Profil-ID ist ungültig.");
  var marker = inhibit(id);
  helper("unmount", id, function (error, stdout, stderr) {
    if (error) {
      releaseInhibit(marker);
      reject(message, new Error((stderr || error.message).trim()));
      return;
    }
    try {
      store.remove(id);
      releaseInhibit(marker);
      respond(message);
    } catch (removeError) {
      releaseInhibit(marker);
      reject(message, removeError);
    }
  });
});
