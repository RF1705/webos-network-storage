(function () {
  "use strict";

  var SERVICE_URI = "luna://com.rf1705.networkstorage.service/";
  var HB_URI = "luna://org.webosbrew.hbchannel.service/";
  var MOUNT_ROOT = "/media/developer/network-storage/";
  var state = { root: false, setup: false, profiles: [], apps: [], selectedId: null, protocol: "smb" };
  var toastTimer;

  var $ = function (id) { return document.getElementById(id); };
  var elements = {
    badge: $("serviceBadge"), setupPanel: $("setupPanel"), form: $("profileForm"),
    list: $("profileList"), count: $("profileCount"), title: $("formTitle"), eyebrow: $("formEyebrow"),
    mountStatus: $("mountStatus"), displayName: $("displayName"), server: $("server"),
    remotePath: $("remotePath"), mountName: $("mountName"), mountPath: $("mountPathPreview"),
    username: $("username"), password: $("password"), domain: $("domain"), cacheMode: $("cacheMode"),
    readOnly: $("readOnly"), autoConnect: $("autoConnect"), nfsVersion: $("nfsVersion"),
    nfsVersionField: $("nfsVersionField"), smbFields: $("smbFields"), remotePathLabel: $("remotePathLabel"),
    appChoices: $("appChoices"), deleteButton: $("deleteProfile"), clearCacheButton: $("clearCache"),
    mountButton: $("toggleMount"), busy: $("busy"), toast: $("toast")
  };

  function call(uri, params) {
    return new Promise(function (resolve, reject) {
      if (typeof PalmServiceBridge === "undefined") {
        reject(new Error("Diese Funktion ist nur auf dem webOS-TV verfügbar."));
        return;
      }
      var bridge = new PalmServiceBridge();
      bridge.onservicecallback = function (raw) {
        var response;
        try { response = JSON.parse(raw); } catch (e) { reject(new Error("Ungültige Antwort des Systemdienstes.")); return; }
        if (response.returnValue === false) reject(new Error(response.errorText || "Aktion fehlgeschlagen."));
        else resolve(response);
      };
      bridge.call(uri, JSON.stringify(params || {}));
    });
  }

  function service(method, params) { return call(SERVICE_URI + method, params); }
  function busy(active) { elements.busy.classList.toggle("hidden", !active); }
  function showToast(message, error) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = "toast show" + (error ? " error" : "");
    toastTimer = setTimeout(function () { elements.toast.className = "toast"; }, 3800);
  }
  function errorText(error) { return error && error.message ? error.message : String(error); }
  function slug(value) {
    return value.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
      .replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  }
  function selectedProfile() {
    for (var i = 0; i < state.profiles.length; i += 1) {
      if (state.profiles[i].id === state.selectedId) return state.profiles[i];
    }
    return null;
  }

  function setProtocol(protocol) {
    state.protocol = protocol;
    Array.prototype.forEach.call(document.querySelectorAll("[data-protocol]"), function (button) {
      button.classList.toggle("active", button.getAttribute("data-protocol") === protocol);
    });
    elements.smbFields.classList.toggle("hidden", protocol !== "smb");
    elements.nfsVersionField.classList.toggle("hidden", protocol !== "nfs");
    elements.remotePathLabel.textContent = protocol === "nfs" ? "Export-Pfad" : "Freigabe / Remote-Pfad";
    elements.remotePath.placeholder = protocol === "nfs" ? "/volume1/Games" : "FRITZ.NAS/Games";
    if (protocol !== "smb") elements.cacheMode.value = "off";
  }

  function renderApps(selected) {
    var known = [
      { id: "org.scummvm.scummvm", name: "ScummVM", hint: "Adventure-Spiele" },
      { id: "com.retroarch", name: "RetroArch", hint: "Libretro-Systeme" }
    ];
    (state.apps || []).forEach(function (appId) {
      if (!known.some(function (app) { return app.id === appId; })) known.push({ id: appId, name: appId, hint: "Erkannte Homebrew-App" });
    });
    elements.appChoices.innerHTML = "";
    known.forEach(function (app) {
      var label = document.createElement("label");
      label.className = "app-choice focusable";
      label.tabIndex = 0;
      label.innerHTML = '<input type="checkbox" value="' + app.id.replace(/"/g, "") + '"><span class="app-check"></span><span><strong></strong><small></small></span>';
      label.querySelector("strong").textContent = app.name;
      label.querySelector("small").textContent = app.hint;
      label.querySelector("input").checked = selected.indexOf(app.id) !== -1;
      label.addEventListener("keydown", function (event) {
        if (event.keyCode === 13 || event.keyCode === 32) {
          event.preventDefault();
          var input = label.querySelector("input"); input.checked = !input.checked;
        }
      });
      elements.appChoices.appendChild(label);
    });
  }

  function renderProfileList() {
    elements.list.innerHTML = "";
    elements.count.textContent = state.profiles.length + (state.profiles.length === 1 ? " Profil" : " Profile");
    state.profiles.forEach(function (profile) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "profile-card focusable" + (profile.id === state.selectedId ? " active" : "") + (profile.mounted ? " mounted" : "");
      card.setAttribute("data-id", profile.id);
      card.innerHTML = '<span class="protocol-icon"></span><span class="profile-info"><strong></strong><small></small></span><i class="profile-dot"></i>';
      card.querySelector(".protocol-icon").textContent = profile.protocol.toUpperCase();
      card.querySelector("strong").textContent = profile.displayName || profile.id;
      card.querySelector("small").textContent = profile.server + " · " + profile.remotePath;
      card.addEventListener("click", function () { selectProfile(profile.id); });
      elements.list.appendChild(card);
    });
  }

  function updateStatus(profile) {
    var mounted = profile && profile.mounted;
    elements.mountStatus.className = "mount-state " + (mounted ? "online" : "offline");
    elements.mountStatus.querySelector("span").textContent = mounted ? "Verbunden" : "Nicht verbunden";
    elements.mountButton.textContent = mounted ? "Trennen" : "Verbinden";
    elements.mountButton.disabled = !profile || !state.root || !state.setup;
    elements.clearCacheButton.disabled = !profile || mounted || profile.protocol !== "smb" || (profile.cacheMode || "off") === "off";
  }

  function selectProfile(id) {
    state.selectedId = id;
    var profile = selectedProfile();
    renderProfileList();
    if (!profile) { newProfile(); return; }
    elements.eyebrow.textContent = "PROFIL BEARBEITEN";
    elements.title.textContent = profile.displayName || profile.id;
    elements.displayName.value = profile.displayName || "";
    elements.server.value = profile.server;
    elements.remotePath.value = profile.remotePath;
    elements.mountName.value = profile.mountName;
    elements.mountPath.textContent = profile.mountPoint || MOUNT_ROOT + profile.mountName;
    elements.username.value = profile.username || "";
    elements.password.value = "";
    elements.password.placeholder = profile.hasCredentials ? "Unverändert" : "Passwort eingeben";
    elements.domain.value = profile.domain || "";
    elements.cacheMode.value = profile.cacheMode || "off";
    elements.readOnly.checked = profile.readOnly;
    elements.autoConnect.checked = profile.autoConnect;
    elements.nfsVersion.value = profile.nfsVersion || "3";
    setProtocol(profile.protocol);
    renderApps(profile.apps || []);
    elements.deleteButton.classList.remove("hidden");
    elements.clearCacheButton.classList.toggle("hidden", profile.protocol !== "smb");
    updateStatus(profile);
  }

  function newProfile() {
    state.selectedId = null;
    renderProfileList();
    elements.form.reset();
    elements.eyebrow.textContent = "NEUES PROFIL";
    elements.title.textContent = "Freigabe konfigurieren";
    elements.readOnly.checked = true;
    elements.autoConnect.checked = true;
    elements.cacheMode.value = "balanced";
    elements.mountName.value = "";
    delete elements.mountName.dataset.touched;
    elements.mountPath.textContent = MOUNT_ROOT + "games";
    elements.password.placeholder = "Passwort eingeben";
    elements.deleteButton.classList.add("hidden");
    elements.clearCacheButton.classList.add("hidden");
    setProtocol("smb");
    renderApps(["org.scummvm.scummvm"]);
    updateStatus(null);
    setTimeout(function () { elements.displayName.focus(); }, 0);
  }

  function updateServiceBadge() {
    if (state.root && state.setup) {
      elements.badge.className = "status-badge ready";
      elements.badge.querySelector("span").textContent = "Systemdienst bereit";
      elements.setupPanel.classList.add("hidden");
    } else {
      elements.badge.className = "status-badge error";
      elements.badge.querySelector("span").textContent = state.root ? "Einrichtung erforderlich" : "Root-Dienst fehlt";
      elements.setupPanel.classList.remove("hidden");
    }
  }

  function reload(selectId) {
    return service("getState").then(function (response) {
      state.root = response.root;
      state.setup = response.setup;
      state.profiles = response.profiles || [];
      state.apps = response.apps || [];
      updateServiceBadge();
      if (selectId && state.profiles.some(function (p) { return p.id === selectId; })) selectProfile(selectId);
      else if (state.selectedId && state.profiles.some(function (p) { return p.id === state.selectedId; })) selectProfile(state.selectedId);
      else if (state.profiles.length) selectProfile(state.profiles[0].id);
      else newProfile();
    });
  }

  function formPayload() {
    var apps = Array.prototype.filter.call(elements.appChoices.querySelectorAll("input"), function (input) { return input.checked; })
      .map(function (input) { return input.value; });
    var existing = selectedProfile();
    return {
      id: existing ? existing.id : slug(elements.displayName.value) || slug(elements.mountName.value),
      displayName: elements.displayName.value.trim(), protocol: state.protocol,
      server: elements.server.value.trim(), remotePath: elements.remotePath.value.trim(),
      mountName: elements.mountName.value.trim(), readOnly: elements.readOnly.checked,
      autoConnect: elements.autoConnect.checked, cacheMode: state.protocol === "smb" ? elements.cacheMode.value : "off",
      nfsVersion: elements.nfsVersion.value, apps: apps,
      username: elements.username.value.trim(), password: elements.password.value, domain: elements.domain.value.trim()
    };
  }

  function perform(method, params, success, selectId) {
    busy(true);
    return service(method, params).then(function () { showToast(success); return reload(selectId); })
      .catch(function (error) { showToast(errorText(error), true); throw error; })
      .finally(function () { busy(false); });
  }
  function setupWithRetry(attempt) {
    return service("setup").catch(function (error) {
      if (attempt >= 5) throw error;
      return new Promise(function (resolve) { setTimeout(resolve, 1600); }).then(function () { return setupWithRetry(attempt + 1); });
    });
  }

  elements.form.addEventListener("submit", function (event) {
    event.preventDefault(); var payload = formPayload();
    perform("saveProfile", payload, "Profil wurde gespeichert.", payload.id).catch(function () {});
  });
  $("newProfile").addEventListener("click", newProfile);
  Array.prototype.forEach.call(document.querySelectorAll("[data-protocol]"), function (button) {
    button.addEventListener("click", function () { setProtocol(button.getAttribute("data-protocol")); });
  });
  elements.displayName.addEventListener("input", function () {
    if (!state.selectedId && !elements.mountName.dataset.touched) {
      elements.mountName.value = slug(elements.displayName.value);
      elements.mountPath.textContent = MOUNT_ROOT + (elements.mountName.value || "games");
    }
  });
  elements.mountName.addEventListener("input", function () {
    elements.mountName.dataset.touched = "true";
    elements.mountPath.textContent = MOUNT_ROOT + (elements.mountName.value || "games");
  });
  $("togglePassword").addEventListener("click", function () {
    var reveal = elements.password.type === "password";
    elements.password.type = reveal ? "text" : "password";
    $("togglePassword").textContent = reveal ? "Verbergen" : "Anzeigen";
  });
  elements.mountButton.addEventListener("click", function () {
    var profile = selectedProfile(); if (!profile) return;
    var method = profile.mounted ? "unmount" : "mount";
    perform(method, { id: profile.id }, profile.mounted ? "Freigabe wurde getrennt." : "Freigabe wurde verbunden.", profile.id).catch(function () {});
  });
  elements.clearCacheButton.addEventListener("click", function () {
    var profile = selectedProfile();
    if (!profile || profile.mounted) return;
    if (!window.confirm("Zwischengespeicherte Daten für „" + (profile.displayName || profile.id) + "“ löschen?")) return;
    perform("clearCache", { id: profile.id }, "Spiele-Cache wurde geleert.", profile.id).catch(function () {});
  });
  $("testProfile").addEventListener("click", function () {
    var payload = formPayload(); busy(true);
    service("saveProfile", payload).then(function () { return service("test", { id: payload.id }); })
      .then(function () { showToast("Verbindung erfolgreich getestet."); return reload(payload.id); })
      .catch(function (error) { showToast(errorText(error), true); }).finally(function () { busy(false); });
  });
  elements.deleteButton.addEventListener("click", function () {
    var profile = selectedProfile();
    if (!profile || !window.confirm("Profil „" + (profile.displayName || profile.id) + "“ wirklich löschen?")) return;
    perform("deleteProfile", { id: profile.id }, "Profil wurde gelöscht.").then(newProfile).catch(function () {});
  });
  $("setupService").addEventListener("click", function () {
    busy(true);
    call(HB_URI + "elevateService", { id: "com.rf1705.networkstorage.service" })
      .then(function () { return setupWithRetry(0); })
      .then(function () { showToast("Systemdienst wurde eingerichtet."); return reload(); })
      .catch(function (error) { showToast("Einrichtung fehlgeschlagen: " + errorText(error), true); })
      .finally(function () { busy(false); });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".switch-row"), function (label) {
    label.addEventListener("keydown", function (event) {
      if (event.keyCode === 13 || event.keyCode === 32) { event.preventDefault(); var input = label.querySelector("input"); input.checked = !input.checked; }
    });
  });

  document.addEventListener("keydown", function (event) {
    var code = event.keyCode;
    if (code === 461) { event.preventDefault(); return; }
    if ([37, 38, 39, 40].indexOf(code) === -1) return;
    var current = document.activeElement;
    var candidates = Array.prototype.filter.call(document.querySelectorAll(".focusable"), function (item) {
      return !item.disabled && item.offsetParent !== null && item !== current;
    });
    if (!current || !current.classList.contains("focusable") || !candidates.length) return;
    var source = current.getBoundingClientRect();
    var sx = source.left + source.width / 2, sy = source.top + source.height / 2;
    var best = null, bestScore = Infinity;
    candidates.forEach(function (item) {
      var rect = item.getBoundingClientRect();
      var dx = rect.left + rect.width / 2 - sx, dy = rect.top + rect.height / 2 - sy;
      if ((code === 37 && dx >= -4) || (code === 39 && dx <= 4) || (code === 38 && dy >= -4) || (code === 40 && dy <= 4)) return;
      var primary = (code === 37 || code === 39) ? Math.abs(dx) : Math.abs(dy);
      var secondary = (code === 37 || code === 39) ? Math.abs(dy) : Math.abs(dx);
      var score = primary + secondary * 2.5;
      if (score < bestScore) { best = item; bestScore = score; }
    });
    if (best) { event.preventDefault(); best.focus(); best.scrollIntoView({ block: "nearest" }); }
  });

  reload().catch(function (error) {
    elements.badge.className = "status-badge error";
    elements.badge.querySelector("span").textContent = "Dienst nicht erreichbar";
    elements.setupPanel.classList.remove("hidden");
    showToast(errorText(error), true);
    newProfile();
  });
}());
