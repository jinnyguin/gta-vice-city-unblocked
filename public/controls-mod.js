/*
 * Controls mod (autoloads on every launch)
 *
 * The engine does not reliably save rebinds made in its own Controls menu, so
 * this mod keeps your keyboard and mouse bindings itself. Edit them on the
 * setup page under "Controls mod"; they are stored in this browser and written
 * into the engine's settings file each time the game starts.
 */
(() => {
  const STORE_KEY = "vcsky.mod.controls";

  // Built-in keyboard/mouse bindings, in the order the engine lists them.
  const DEFAULTS = [
    ["PED_FIREWEAPON", "mouse:LEFT,2ndKbd:PAD5"],
    ["PED_CYCLE_WEAPON_RIGHT", "2ndKbd:PADENTER,mouse:WHLDOWN,kbd:E"],
    ["PED_CYCLE_WEAPON_LEFT", "kbd:PADDEL,mouse:WHLUP,2ndKbd:Q"],
    ["GO_FORWARD", "kbd:UP,2ndKbd:W"],
    ["GO_BACK", "kbd:DOWN,2ndKbd:S"],
    ["GO_LEFT", "2ndKbd:A,kbd:LEFT"],
    ["GO_RIGHT", "kbd:RIGHT,2ndKbd:D"],
    ["PED_SNIPER_ZOOM_IN", "kbd:PGUP,2ndKbd:Z,mouse:WHLUP"],
    ["PED_SNIPER_ZOOM_OUT", "kbd:PGDN,2ndKbd:X,mouse:WHLDOWN"],
    ["VEHICLE_ENTER_EXIT", "kbd:ENTER,2ndKbd:F"],
    ["CAMERA_CHANGE_VIEW_ALL_SITUATIONS", "kbd:HOME,2ndKbd:V"],
    ["PED_JUMPING", "kbd:RCTRL,2ndKbd:SPC"],
    ["PED_SPRINT", "2ndKbd:LSHIFT,kbd:RSHIFT"],
    ["PED_LOOKBEHIND", "2ndKbd:CAPSLK,mouse:MIDDLE,kbd:PADINS"],
    ["PED_DUCK", "kbd:C"],
    ["PED_ANSWER_PHONE", "kbd:TAB"],
    ["VEHICLE_FIREWEAPON", "kbd:PADINS,2ndKbd:LCTRL,mouse:LEFT"],
    ["VEHICLE_ACCELERATE", "2ndKbd:W"],
    ["VEHICLE_BRAKE", "2ndKbd:S"],
    ["VEHICLE_CHANGE_RADIO_STATION", "kbd:INS,2ndKbd:R"],
    ["VEHICLE_HORN", "2ndKbd:LSHIFT,kbd:RSHIFT"],
    ["TOGGLE_SUBMISSIONS", "kbd:PLUS,2ndKbd:CAPSLK"],
    ["VEHICLE_HANDBRAKE", "kbd:RCTRL,2ndKbd:SPC,mouse:RIGHT"],
    ["PED_1RST_PERSON_LOOK_LEFT", "kbd:PADLEFT"],
    ["PED_1RST_PERSON_LOOK_RIGHT", "kbd:PADHOME"],
    ["VEHICLE_LOOKLEFT", "kbd:PADEND,2ndKbd:Q"],
    ["VEHICLE_LOOKRIGHT", "kbd:PADDOWN,2ndKbd:E"],
    ["VEHICLE_LOOKBEHIND", "mouse:MIDDLE"],
    ["VEHICLE_TURRETLEFT", "kbd:PADLEFT"],
    ["VEHICLE_TURRETRIGHT", "kbd:PAD5"],
    ["VEHICLE_TURRETUP", "kbd:PADPGUP,2ndKbd:UP"],
    ["VEHICLE_TURRETDOWN", "kbd:PADRIGHT,2ndKbd:DOWN"],
    ["PED_CYCLE_TARGET_LEFT", "kbd:[,2ndKbd:PADEND"],
    ["PED_CYCLE_TARGET_RIGHT", "2ndKbd:],kbd:PADDOWN"],
    ["PED_CENTER_CAMERA_BEHIND_PLAYER", "kbd:#"],
    ["PED_LOCK_TARGET", "kbd:DEL,mouse:RIGHT,2ndKbd:PADRIGHT"],
    ["NETWORK_TALK", "kbd:T"],
    ["PED_1RST_PERSON_LOOK_UP", "kbd:PADPGUP"],
    ["PED_1RST_PERSON_LOOK_DOWN", "kbd:PADUP"]
  ];
  const DEFAULT_MAP = new Map(DEFAULTS);

  // Control scheme: "" keeps whatever the game already has, "0" is Standard
  // and "1" is Classic (the engine's [Controller] Method setting).
  const SCHEME_KEY = "vcsky.mod.controlScheme";
  const SCHEMES = [
    ["", "Keep game setting"],
    ["0", "Standard"],
    ["1", "Classic"],
  ];

  function loadScheme() {
    try {
      const value = localStorage.getItem(SCHEME_KEY) || "";
      return SCHEMES.some(([id]) => id === value) ? value : "";
    } catch {
      return "";
    }
  }

  function saveScheme(value) {
    try {
      localStorage.setItem(SCHEME_KEY, value);
    } catch {
      // storage unavailable
    }
  }

  // Sets `key=value` inside `[section]` of the ini lines, adding the key or the
  // whole section if needed.
  function setIniValue(lines, section, key, value) {
    const header = `[${section}]`;
    let start = lines.findIndex((line) => line.trim() === header);
    if (start < 0) {
      lines.push("", header);
      start = lines.length - 1;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith("[")) {
        end = i;
        break;
      }
    }
    for (let i = start + 1; i < end; i++) {
      if (lines[i].split("=")[0].trim() === key) {
        lines[i] = `${key}=${value}`;
        return;
      }
    }
    lines.splice(end, 0, `${key}=${value}`);
  }

  function loadOverrides() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveOverrides(overrides) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(overrides));
    } catch {
      // storage unavailable
    }
  }

  // Each comma-separated token looks like kbd:W, 2ndKbd:LSHIFT or mouse:LEFT.
  // An empty value is allowed and leaves the action unbound.
  function isValid(value) {
    if (value === "") return true;
    return value
      .split(",")
      .every((token) => /^(kbd|2ndKbd|mouse|joy):\S+$/i.test(token.trim()));
  }

  // Returns `iniText` with the saved overrides written into its [Bindings]
  // section. Called right before the engine receives its settings file.
  function apply(iniText) {
    const overrides = loadOverrides();
    const names = Object.keys(overrides).filter(
      (name) => DEFAULT_MAP.has(name) && isValid(overrides[name]),
    );
    const scheme = loadScheme();
    if (!names.length && !scheme) return iniText;

    const lines = iniText.split("\n");
    if (scheme) {
      setIniValue(lines, "Controller", "Method", scheme);
      if (typeof dbg === "function") {
        dbg(`controls mod: control scheme ${scheme === "1" ? "Classic" : "Standard"}`);
      }
    }
    if (!names.length) return lines.join("\n");

    let start = lines.findIndex((line) => line.trim() === "[Bindings]");
    if (start < 0) {
      lines.push("", "[Bindings]");
      start = lines.length - 1;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith("[")) {
        end = i;
        break;
      }
    }

    let applied = 0;
    for (const name of names) {
      const line = `${name}=${overrides[name].replace(/\s+/g, "")}`;
      let found = false;
      for (let i = start + 1; i < end; i++) {
        if (lines[i].split("=")[0].trim() === name) {
          lines[i] = line;
          found = true;
          break;
        }
      }
      if (!found) {
        lines.splice(end, 0, line);
        end++;
      }
      applied++;
    }
    if (typeof dbg === "function") dbg(`controls mod: applied ${applied} binding(s)`);
    return lines.join("\n");
  }

  window.vcControlsMod = { apply, loadOverrides, DEFAULTS };

  // ─── Setup page panel ──────────────────────────────────────────
  function prettify(name) {
    const words = name.toLowerCase().replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function injectStyle() {
    if (document.getElementById("controls-mod-style")) return;
    const style = document.createElement("style");
    style.id = "controls-mod-style";
    style.textContent = `
      #controls-mod-list { display: grid; gap: 4px; margin: 0 0 12px; padding: 0; list-style: none; }
      .cm-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); align-items: center; gap: 10px; padding: 6px 10px; border-radius: var(--radius-inner); background: var(--surface-3); font-size: 0.86rem; }
      .cm-name { color: var(--text-1); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cm-input { width: 100%; box-sizing: border-box; min-height: 32px; padding: 0 8px; border: 1px solid var(--border-cyan); border-radius: var(--radius-btn); background: transparent; color: var(--text-1); font: 16px ui-monospace, Menlo, monospace; }
      .cm-row.is-changed .cm-input { border-color: #ff4193; }
      .cm-row.is-invalid .cm-input { border-color: #ff5a5a; background: rgba(255, 90, 90, 0.08); }
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    const list = document.getElementById("controls-mod-list");
    if (!list || list.dataset.ready) return;
    list.dataset.ready = "1";
    injectStyle();

    const status = document.getElementById("controls-mod-status");
    const setStatus = (text) => {
      if (!status) return;
      status.textContent = text;
      status.hidden = !text;
    };

    const overrides = loadOverrides();
    const rows = new Map();

    // Control scheme selector (Standard / Classic)
    const schemeRow = document.createElement("div");
    schemeRow.className = "cm-row";
    schemeRow.style.marginBottom = "8px";
    const schemeLabel = document.createElement("span");
    schemeLabel.className = "cm-name";
    schemeLabel.textContent = "Control scheme";
    const schemeSelect = document.createElement("select");
    schemeSelect.className = "cm-input";
    schemeSelect.setAttribute("aria-label", "Control scheme");
    for (const [id, text] of SCHEMES) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = text;
      schemeSelect.appendChild(option);
    }
    schemeSelect.value = loadScheme();
    schemeSelect.addEventListener("change", () => {
      saveScheme(schemeSelect.value);
      setStatus("Saved. Applied the next time the game starts.");
    });
    schemeRow.append(schemeLabel, schemeSelect);
    list.parentNode.insertBefore(schemeRow, list);

    const refresh = (name) => {
      const row = rows.get(name);
      const value = row.input.value.replace(/\s+/g, "");
      row.el.classList.toggle("is-invalid", !isValid(value));
      row.el.classList.toggle("is-changed", isValid(value) && value !== DEFAULT_MAP.get(name));
    };

    for (const [name, defaultValue] of DEFAULTS) {
      const li = document.createElement("li");
      li.className = "cm-row";
      const label = document.createElement("span");
      label.className = "cm-name";
      label.textContent = prettify(name);
      label.title = name;
      const input = document.createElement("input");
      input.className = "cm-input";
      input.type = "text";
      input.spellcheck = false;
      input.autocapitalize = "off";
      input.autocomplete = "off";
      input.setAttribute("autocorrect", "off");
      input.value = name in overrides ? overrides[name] : defaultValue;
      input.placeholder = "unbound";
      input.setAttribute("aria-label", prettify(name));
      li.append(label, input);
      list.appendChild(li);
      rows.set(name, { el: li, input });
      refresh(name);

      input.addEventListener("input", () => {
        const value = input.value.replace(/\s+/g, "");
        refresh(name);
        if (!isValid(value)) {
          setStatus("Use tokens like kbd:W, 2ndKbd:LSHIFT or mouse:LEFT, separated by commas.");
          return;
        }
        // Always store the value, even when it equals the default, so a value
        // the engine saved earlier is replaced too.
        overrides[name] = value;
        saveOverrides(overrides);
        setStatus("Saved. Applied the next time the game starts.");
      });
    }

    document.getElementById("controls-mod-reset")?.addEventListener("click", () => {
      for (const [name, defaultValue] of DEFAULTS) {
        overrides[name] = defaultValue;
        rows.get(name).input.value = defaultValue;
        refresh(name);
      }
      saveOverrides(overrides);
      setStatus("All controls reset to default.");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPanel);
  } else {
    buildPanel();
  }
})();
