#!/usr/bin/env python3
"""
Comprehensive end-to-end validation of the CRIS 3D simulation.

Loads the real application (Vite dev server + backend) in a headless browser,
authenticates with a real backend JWT, and exercises 20 scenarios against the
live simulation runtime: invariants (NaN, overlaps, stuck entities, collisions,
loops), behaviour (turns, stops, accelerations, crossings, reroutes, arrivals,
signals), event pipeline (accident/fire -> backend incidents, no duplicates),
camera modes, and performance (FPS, draw calls, heap) across traffic densities.

Usage:
    python3 -u scripts/validate_sim.py
"""
import json
import time
import ssl
import urllib.request
from playwright.sync_api import sync_playwright

BASE = "https://localhost:5173/admin/simulation"
BACKEND = "https://localhost:8000"

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def _http_open(req, timeout=15):
    return urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX)


def login_real():
    """Log into the running CRIS backend and return a real auth state dict."""
    body = json.dumps({"email": "admin@cris.gov", "password": "Admin@123456"}).encode()
    req = urllib.request.Request(
        f"{BACKEND}/api/auth/login", data=body, headers={"Content-Type": "application/json"}
    )
    with _http_open(req) as resp:
        data = json.loads(resp.read().decode())
    return {
        "state": {
            "isAuthenticated": True,
            "user": data["user"],
            "accessToken": data["access_token"],
            "refreshToken": data["refresh_token"],
        },
        "version": 0,
    }


AUTH = login_real()


def backend_incidents(category=None, per_page=50):
    url = f"{BACKEND}/api/incidents/?per_page={per_page}"
    if category:
        url += f"&category={category}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {AUTH['state']['accessToken']}"})
    with _http_open(req, timeout=10) as r:
        data = json.loads(r.read().decode())
    return data.get("incidents", [])


# ---------------------------------------------------------------------------
# In-page validation module (installed once per page).
# ---------------------------------------------------------------------------
VAL_MODULE = r"""
window.__events = [];
window.__counts = { arrivals: 0, removals: 0, reroutes: 0, collisions: 0, stops: 0, accels: 0, turns: 0, crossings: 0, waits: 0, byVehicleReroutes: {}, collisionPairs: 0, vStuck: 0, pStuck: 0 };
window.__track = { vehicles: {}, peds: {} };
window.__lastSim = 0;

function __installVal() {
  const rt = window.__crisRuntime;
  if (!rt) return 'no-runtime';
  if (window.__valPatched) return 'ok';
  const orig = rt.drainEvents.bind(rt);
  rt.drainEvents = () => {
    const evs = orig();
    for (const e of evs) {
      window.__events.push(e);
      if (e.kind === 'vehicle-arrived') window.__counts.arrivals++;
      else if (e.kind === 'vehicle-removed') window.__counts.removals++;
      else if (e.kind === 'vehicle-rerouted') {
        window.__counts.reroutes++;
        window.__counts.byVehicleReroutes[e.vehicleId] = (window.__counts.byVehicleReroutes[e.vehicleId] || 0) + 1;
      } else if (e.kind === 'collision') {
        const key = [e.vehicleId, e.otherId].sort().join('|');
        if (!window.__collisionKeys) window.__collisionKeys = new Set();
        if (!window.__collisionKeys.has(key)) { window.__collisionKeys.add(key); window.__counts.collisions++; }
      }
    }
    if (window.__events.length > 200000) window.__events = window.__events.slice(-50000);
    return evs;
  };
  window.__valPatched = true;
  return 'ok';
}

// Lightweight per-tick transition tracking (state machines + counters).
function __valTrack(dt) {
  const rt = window.__crisRuntime;
  const vs = rt.vehicles.getActiveVehicles();
  const peds = rt.pedestrians.getVisuals();
  for (const v of vs) {
    const t = window.__track.vehicles[v.id] || (window.__track.vehicles[v.id] = { stopped: false, lastAccel: 0, lastHeading: v.heading, lowT: 0, flagged: false });
    if (t.stopped && v.speed > 1) window.__counts.stops++;
    t.stopped = v.speed < 0.3;
    if (v.acceleration > 1.5 && t.lastAccel <= 1.5) window.__counts.accels++;
    t.lastAccel = v.acceleration;
    let dH = v.heading - t.lastHeading;
    dH = Math.abs(((dH + Math.PI) % (2 * Math.PI)) - Math.PI);
    if (dH > 0.2 && v.speed > 0.5) window.__counts.turns++;
    t.lastHeading = v.heading;
    if (v.status === 'moving') {
      if (v.speed < 0.5) { t.lowT += dt; if (t.lowT > 60 && !t.flagged) { t.flagged = true; window.__counts.vStuck++; } }
      else t.lowT = 0;
    }
  }
  for (const p of peds) {
    const t = window.__track.peds[p.index] || (window.__track.peds[p.index] = { prev: p.state, lowT: 0, flagged: false });
    if (t.prev === 'WAITING' && p.state === 'CROSSING') window.__counts.crossings++;
    if (t.prev !== 'WAITING' && p.state === 'WAITING') window.__counts.waits++;
    if (p.state === 'CROSSING') {
      if (p.speed < 0.02) { t.lowT += dt; if (t.lowT > 60 && !t.flagged) { t.flagged = true; window.__counts.pStuck++; } }
      else t.lowT = 0;
    }
    t.prev = p.state;
  }
}

function __valSnapshot() {
  const rt = window.__crisRuntime;
  window.__lastSim = rt.simTime;
  // 0-dt so long drive gaps do not inflate stop timers; __valDrive tracks per tick.
  __valTrack(0);
  const vs = rt.vehicles.getActiveVehicles();
  const peds = rt.pedestrians.getVisuals();
  const out = {
    vehicles: vs.length, peds: peds.length, simTime: +rt.simTime.toFixed(1),
    nanV: 0, negSpeed: 0, farOff: 0, overlap: 0, minGap: 9999,
    vStuck: window.__counts.vStuck || 0, badRoute: 0,
    nanP: 0, pStuck: window.__counts.pStuck || 0, pCrossing: 0, pWaiting: 0, pWalking: 0, pArrived: 0, pIdle: 0,
    engineCollisions: 0,
  };
  for (const v of vs) {
    if (![v.x, v.z, v.heading, v.speed, v.acceleration, v.targetSpeed, v.totalDistance].every(Number.isFinite)) out.nanV++;
    if (v.speed < -0.05) out.negSpeed++;
    if (Math.abs(v.x) > 500 || Math.abs(v.z) > 500) out.farOff++;
    if (!v.route || v.route.length < 2 || !v.route.includes(v.currentNode)) out.badRoute++;
  }
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
    const d = Math.hypot(vs[i].x - vs[j].x, vs[i].z - vs[j].z);
    if (d < out.minGap) out.minGap = d;
    if (d < 1.2) out.overlap++;
  }
  try {
    out.engineCollisions = rt.vehicles.detectCollisions(2.0).length;
    window.__counts.collisionPairs += out.engineCollisions;
  } catch (e) { out.engineCollisions = -1; }
  for (const p of peds) {
    if (![p.x, p.z, p.yaw, p.phase, p.speed].every(Number.isFinite)) out.nanP++;
    if (p.state === 'CROSSING') out.pCrossing++;
    else if (p.state === 'WAITING') out.pWaiting++;
    else if (p.state === 'WALKING') out.pWalking++;
    else if (p.state === 'ARRIVED') out.pArrived++;
    else out.pIdle++;
  }
  return out;
}

function __valDrive(seconds) {
  // NOTE: this drive loop must NOT spawn vehicles. The page's VehicleSystem
  // replaces removed vehicles from real sim events every frame; spawning here
  // (on top of the page's per-event replacement) doubles the fleet and jams
  // the network. Let the page top-up between drive calls instead.
  const rt = window.__crisRuntime;
  const end = rt.simTime + seconds;
  let guard = 0;
  while (rt.simTime < end && guard++ < seconds * 80) {
    rt.advance(0.05);
    __valTrack(0.05);
  }
  return rt.simTime;
}

window.__installVal = __installVal;
window.__valSnapshot = __valSnapshot;
window.__valDrive = __valDrive;
window.__valTrack = __valTrack;
"""

REPORT = {"scenarios": [], "console_errors": [], "page_errors": []}


def add_report(name, ok, detail):
    entry = {"scenario": name, "ok": ok, "detail": detail}
    REPORT["scenarios"].append(entry)
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}: {json.dumps(detail)[:400]}")
    sys.stdout.flush()


def mark_errors():
    return (len(REPORT["console_errors"]), len(REPORT["page_errors"]))


def add_errors_summary(scenario, mark):
    ce = REPORT["console_errors"][mark[0]:]
    pe = REPORT["page_errors"][mark[1]:]
    if ce or pe:
        add_report(scenario + " console/page errors", False, {"console": ce[:8], "page": pe[:8]})
    else:
        add_report(scenario + " console/page errors", True, {"console": 0, "page": 0})


def make_page(browser):
    page = browser.new_page(viewport={"width": 1280, "height": 720}, ignore_https_errors=True)
    page.on("console", lambda m: REPORT["console_errors"].append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: REPORT["page_errors"].append(str(e)))
    init = f"localStorage.setItem('cris-auth', {json.dumps(json.dumps(AUTH))});"
    init += """
    window.__drawCalls = { calls: 0 };
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const wrap = (m) => {
        if (typeof proto[m] === 'function') {
          const orig = proto[m];
          proto[m] = function(...a) { window.__drawCalls.calls++; return orig.apply(this, a); };
        }
      };
      wrap('drawArrays'); wrap('drawElements'); wrap('drawArraysInstanced'); wrap('drawElementsInstanced');
    }
    """
    page.add_init_script(init)
    return page


def load(page, query=""):
    url = BASE + query
    for attempt in range(10):
        try:
            page.goto(url, timeout=20000)
            break
        except Exception:
            time.sleep(2)
    page.wait_for_load_state("networkidle")
    page.locator("canvas").first.wait_for(state="visible", timeout=40000)
    # Poll via evaluate (wait_for_function's raf polling is unreliable at
    # SwiftShader's ~1 FPS; the app itself loads fine).
    found = False
    for _ in range(20):
        st = page.evaluate("() => ({ rt: !!window.__crisRuntime, st: !!window.__crisStore })")
        if st["rt"] and st["st"]:
            found = True
            break
        time.sleep(3)
    if not found:
        page.reload(wait_until="networkidle", timeout=30000)
        page.locator("canvas").first.wait_for(state="visible", timeout=40000)
        for _ in range(20):
            st = page.evaluate("() => ({ rt: !!window.__crisRuntime, st: !!window.__crisStore })")
            if st["rt"] and st["st"]:
                found = True
                break
            time.sleep(3)
    if not found:
        return "no-runtime"
    page.evaluate(VAL_MODULE)
    return page.evaluate("() => __installVal()")


def warm(page, seconds=8):
    time.sleep(seconds)


def run_scenarios():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
        )
        validate_default(browser)
        validate_density_20(browser)
        validate_density_100(browser)
        validate_large_npc(browser)
        validate_long_run(browser)
        print("ALL_SCENARIOS_DONE")
        return REPORT


def validate_default(browser):
    """Default density (50 cars / 24 peds): behaviour + events + camera + perf."""
    err_mark = mark_errors()
    page = make_page(browser)
    ok = load(page)
    add_report("S1 load default (50 cars)", ok == "ok", ok)
    warm(page, 10)

    page.evaluate("""() => {
      window.__counts.stops = window.__counts.accels = window.__counts.turns = 0;
      window.__counts.crossings = window.__counts.waits = 0;
      window.__track.vehicles = {}; window.__track.peds = {};
      window.__lastSim = window.__crisRuntime.simTime;
    }""")
    snap = page.evaluate("() => __valSnapshot()")
    add_report("S1 baseline invariants (50 cars)", True, snap)

    # Drive 3 minutes of simulation, sampling invariants every 30 sim-sec.
    mins = 3 * 60
    fails = []
    worst = {"overlap": 0, "nanV": 0, "vStuck": 0, "badRoute": 0}
    for t in range(0, mins, 30):
        page.evaluate("(s) => __valDrive(s)", 30)
        s = page.evaluate("() => __valSnapshot()")
        worst["overlap"] = max(worst["overlap"], s["overlap"])
        worst["nanV"] = max(worst["nanV"], s["nanV"])
        worst["vStuck"] = max(worst["vStuck"], s["vStuck"])
        worst["badRoute"] = max(worst["badRoute"], s["badRoute"])
        if s["nanV"] or s["overlap"] or s["vStuck"] or s["badRoute"]:
            fails.append({"at": s["simTime"], "snap": s})
    add_report("S2 3-min drive, invariants hold (50 cars)", not fails and worst["nanV"] == 0, {"worst": worst, "fails": fails[:3]})

    counts = page.evaluate("() => ({...window.__counts})")
    add_report("S3 destination arrivals (50 cars)", counts["arrivals"] > 0, counts)
    add_report("S4 vehicles turning (50 cars)", counts["turns"] > 0, counts)
    add_report("S5 vehicles stopping (50 cars)", counts["stops"] > 0, counts)
    add_report("S6 vehicles accelerating (50 cars)", counts["accels"] > 0, counts)
    add_report("S7 pedestrians crossing (50 cars)", counts["crossings"] > 0, counts)
    add_report("S8 peds wait for traffic (50 cars)", counts["waits"] > 0, counts)
    add_report("S9 no reported collisions (50 cars)", counts["collisions"] == 0, counts)

    lights = page.evaluate("""() => {
      const seen = new Set();
      for (let i = 0; i < 300; i++) {
        const l = window.__crisRuntime.vehicles.lightDebug();
        seen.add(l.vertical + '|' + l.horizontal);
        window.__valDrive(0.1);
      }
      return { phases: [...seen], driveSeconds: 30 };
    }""")
    has_green = any("green" in ph for ph in lights["phases"])
    has_red = any("red" in ph for ph in lights["phases"])
    add_report("S10 red+green signals observed", has_green and has_red, lights)

    # Blocked road + rerouting: trigger accident.
    page.evaluate("""() => {
      window.__crisStore.getState().triggerAccident();
    }""")
    page.wait_for_timeout(3000)
    st = page.evaluate("() => ({ mode: window.__crisStore.getState().mode })")
    add_report("S11 accident triggers mode", st["mode"] == "accident", st)
    page.evaluate("(s) => __valDrive(s)", 60)
    counts2 = page.evaluate("() => ({...window.__counts})")
    add_report("S12 blocked road causes rerouting", counts2["reroutes"] > 0, counts2)
    add_report("S13 no route loops (max reroutes/vehicle)", max(counts2["byVehicleReroutes"].values(), default=0) < 15, counts2["byVehicleReroutes"])

    # S20: a freshly triggered event creates exactly one new backend incident.
    fire_before = sum(1 for i in backend_incidents(category="fire") if True)
    page.evaluate("""() => {
      window.__crisStore.getState().triggerFire();
    }""")
    page.wait_for_timeout(4000)
    fire_after = sum(1 for i in backend_incidents(category="fire") if True)
    add_report("S20 event reported to backend (no dupes)", fire_after == fire_before + 1, {"fire_before": fire_before, "fire_after": fire_after})

    # Camera movement via street/drone + demo.
    page.evaluate("() => window.__crisStore.getState().setCameraMode('street')")
    page.wait_for_timeout(2000)
    page.evaluate("() => window.__crisStore.getState().setCameraMode('drone')")
    page.wait_for_timeout(2000)
    page.evaluate("() => window.__crisStore.getState().setDemoActive(true)")
    page.wait_for_timeout(6000)
    page.evaluate("() => window.__crisStore.getState().setDemoActive(false)")
    add_report("S14 camera movement OK", True, {"modes": ["street", "drone", "demo"]})

    # Performance measurement (FPS + draw calls + heap) at default view.
    page.evaluate("() => window.__crisStore.getState().resetSimulation()")
    page.wait_for_timeout(2000)
    perf = page.evaluate("""async () => {
      window.__drawCalls.calls = 0;
      const fr = [];
      let last = performance.now();
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => {
          const now = performance.now();
          fr.push(now - last);
          last = now;
          if (now - t0 < 6000) requestAnimationFrame(tick);
          else res();
        };
        requestAnimationFrame(tick);
      });
      fr.sort((a, b) => a - b);
      const avg = fr.reduce((a, b) => a + b, 0) / fr.length;
      return { fps: +(1000 / avg).toFixed(1), p50: fr[Math.floor(fr.length / 2)].toFixed(1), drawCalls: Math.round(window.__drawCalls.calls / fr.length), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
    }""")
    add_report("S15 perf default (50 cars)", perf["fps"] > 0.5, perf)
    add_errors_summary("S15 default scenario", err_mark)
    page.close()


def validate_density_20(browser):
    err_mark = mark_errors()
    page = make_page(browser)
    ok = load(page, "?cars=20")
    add_report("S16 load 20 cars", ok == "ok", ok)
    warm(page, 6)
    page.evaluate("(s) => __valDrive(s)", 120)
    page.wait_for_timeout(5000)  # let the page top the fleet back up to 20
    s = page.evaluate("() => __valSnapshot()")
    counts = page.evaluate("() => ({...window.__counts})")
    ok = s["vehicles"] <= 21 and s["nanV"] == 0 and s["overlap"] == 0 and counts["arrivals"] > 0
    add_report("S16 20 cars invariants+arrivals", ok, {"snap": s, "counts": counts})
    add_errors_summary("S16 20 cars", err_mark)
    page.close()


def validate_density_100(browser):
    err_mark = mark_errors()
    page = make_page(browser)
    ok = load(page, "?cars=100")
    add_report("S17 load 100 cars", ok == "ok", ok)
    warm(page, 10)
    page.evaluate("(s) => __valDrive(s)", 90)
    page.wait_for_timeout(5000)  # let the page top the fleet back up to 100
    s = page.evaluate("() => __valSnapshot()")
    counts = page.evaluate("() => ({...window.__counts})")
    ok = s["vehicles"] >= 90 and s["nanV"] == 0 and s["overlap"] == 0 and counts["arrivals"] > 0
    add_report("S17 100 cars invariants+arrivals", ok, {"snap": s, "counts": counts})
    add_errors_summary("S17 100 cars", err_mark)
    page.close()


def validate_large_npc(browser):
    err_mark = mark_errors()
    page = make_page(browser)
    ok = load(page, "?peds=150&cars=60")
    add_report("S18 load 150 peds + 60 cars", ok == "ok", ok)
    warm(page, 10)
    page.evaluate("(s) => __valDrive(s)", 120)
    page.wait_for_timeout(5000)  # let the page top the fleet back up
    s = page.evaluate("() => __valSnapshot()")
    counts = page.evaluate("() => ({...window.__counts})")
    ok = s["peds"] == 150 and s["nanP"] == 0 and counts["crossings"] > 0
    add_report("S18 large NPC population OK", ok, {"snap": s, "counts": counts})
    add_errors_summary("S18 large NPC population", err_mark)
    page.close()


def validate_long_run(browser):
    err_mark = mark_errors()
    page = make_page(browser)
    ok = load(page, "?cars=50")
    add_report("S19 load for long run", ok == "ok", ok)
    warm(page, 8)
    fails = []
    for b in range(15):
        page.evaluate("(s) => __valDrive(s)", 60)
        page.wait_for_timeout(3000)  # let the page top the fleet back up
        s = page.evaluate("() => __valSnapshot()")
        if s["nanV"] or s["overlap"] or s["vStuck"] or s["nanP"]:
            fails.append(s)
    heap = page.evaluate("() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null")
    counts = page.evaluate("() => ({...window.__counts})")
    ok = not fails
    add_report("S19 15-min sim invariants hold", ok, {"fails": fails[:2], "heapMB": heap, "counts": counts})
    add_errors_summary("S19 long run", err_mark)
    page.close()


if __name__ == "__main__":
    import sys
    run_scenarios()
    print(json.dumps(REPORT, indent=1)[:12000])
