import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ─── Smart City Digital Twin Metadata ─────────────────────────────────────

const CCTV_FEEDS = {
  1: { name: "CAM-01 · Avenue Traffic Overview", pos: new THREE.Vector3(0, 26, 36), target: new THREE.Vector3(0, 0, 0) },
  2: { name: "CAM-02 · Road Collapse & Pothole Zone", pos: new THREE.Vector3(-12, 8, 6), target: new THREE.Vector3(1.8, 0, 0) },
  3: { name: "CAM-03 · Substation Power Grid", pos: new THREE.Vector3(-12, 6, 6), target: new THREE.Vector3(-10, 2, 0) },
  4: { name: "CAM-04 · Underground Water Main", pos: new THREE.Vector3(10, 6, 6), target: new THREE.Vector3(1.8, 0, 0) },
  5: { name: "CAM-05 · Emergency Response Dispatch", pos: new THREE.Vector3(16, 12, 18), target: new THREE.Vector3(0, 0, 4) },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeLabel(text, color = 0xffffff) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 70;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(10, 14, 23, 0.85)";
  ctx.fillRect(0, 0, 320, 70);
  ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 316, 66);
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.font = "bold 26px DM Sans, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 160, 45);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.8, 1.05, 1);
  return sprite;
}

// ─── 11 Vehicle Factory ────────────────────────────────────────────────────

function createVehicle(type = "sedan", color = 0x2563eb) {
  const group = new THREE.Group();
  let width = 2.0, height = 0.7, length = 4.2;

  if (type === "suv") { width = 2.2; height = 0.95; length = 4.6; }
  else if (type === "sports") { width = 2.1; height = 0.55; length = 4.3; }
  else if (type === "bus") { width = 2.5; height = 1.7; length = 8.5; }
  else if (type === "truck") { width = 2.6; height = 1.8; length = 9.0; }
  else if (type === "van") { width = 2.2; height = 1.2; length = 5.0; }
  else if (type === "taxi") { width = 2.0; height = 0.75; length = 4.2; color = 0xeab308; }
  else if (type === "ambulance") { width = 2.3; height = 1.4; length = 5.5; color = 0xf8fafc; }
  else if (type === "police") { width = 2.1; height = 0.8; length = 4.4; color = 0x0f172a; }
  else if (type === "bike") { width = 0.6; height = 0.8; length = 2.0; }
  else if (type === "construction") { width = 2.6; height = 1.9; length = 6.0; color = 0xd97706; }

  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 });

  if (type === "bike") {
    // Motorcycle Frame & Gas Tank
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 1.4), bodyMat);
    frame.position.y = 0.45;
    group.add(frame);

    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), bodyMat);
    tank.scale.set(0.8, 0.7, 1.3);
    tank.position.set(0, 0.7, 0.2);
    group.add(tank);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    [0.75, -0.75].forEach((z) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(0, 0.32, z);
      group.add(w);
    });

    // Rider
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.55, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    torso.position.set(0, 0.95, -0.1);
    torso.rotation.x = 0.25;
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xef4444 })
    );
    helmet.position.set(0, 1.3, 0.05);
    group.add(torso, helmet);

    // Headlight SpotLight
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 2.5 });
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), lightMat);
    hl.rotation.x = Math.PI / 2;
    hl.position.set(0, 0.65, 0.8);
    group.add(hl);

    const spot = new THREE.SpotLight(0xffffdd, 4.0, 30, Math.PI / 5, 0.4);
    spot.position.set(0, 0.65, 0.8);
    const target = new THREE.Object3D();
    target.position.set(0, 0.2, 12);
    group.add(target);
    spot.target = target;
    group.add(spot);
  } else {
    // 4-wheeled vehicles
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), bodyMat);
    body.position.y = height / 2 + 0.25;
    body.castShadow = true;
    group.add(body);

    // Cabin
    let cabinH = height * 0.75;
    let cabinL = length * 0.55;
    if (type === "bus" || type === "truck") { cabinH = height * 0.85; cabinL = length * 0.85; }
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.88, cabinH, cabinL),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 })
    );
    cabin.position.set(0, height + cabinH / 2 + 0.15, type === "bus" || type === "truck" ? 0 : -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // Taxi Top Sign
    if (type === "taxi") {
      const taxiSign = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.2, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffaa00, emissiveIntensity: 1.5 })
      );
      taxiSign.position.set(0, height + cabinH + 0.25, 0);
      group.add(taxiSign);
    }

    // Emergency Flashing Light Bars (Ambulance & Police)
    if (type === "ambulance" || type === "police") {
      const lightBar = new THREE.Group();
      const redStrobe = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.15, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 3.0 })
      );
      redStrobe.position.x = -0.3;
      const blueStrobe = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.15, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 3.0 })
      );
      blueStrobe.position.x = 0.3;
      lightBar.add(redStrobe, blueStrobe);
      lightBar.position.set(0, height + cabinH + 0.2, 0);
      group.add(lightBar);
      group.userData.lightBar = lightBar;
    }

    // Wheels
    const wRadius = type === "bus" || type === "truck" || type === "construction" ? 0.48 : 0.36;
    const wheelGeo = new THREE.CylinderGeometry(wRadius, wRadius, 0.25, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const xOff = width / 2 + 0.04;
    const zOffsets = type === "bus" || type === "truck" ? [3.0, 0, -3.0] : [length * 0.3, -length * 0.3];
    zOffsets.forEach((z) => {
      [-xOff, xOff].forEach((x) => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, wRadius, z);
        w.castShadow = true;
        group.add(w);
      });
    });

    // Front Headlights
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 2.5 });
    [-width * 0.35, width * 0.35].forEach((x) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.1), lightMat);
      hl.position.set(x, height * 0.6, length / 2 + 0.02);
      group.add(hl);
    });

    // Rear Red Brake Lights
    const brakeLights = [];
    [-width * 0.35, width * 0.35].forEach((x) => {
      const bl = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.18, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991111, emissiveIntensity: 0.8 })
      );
      bl.position.set(x, height * 0.6, -length / 2 - 0.02);
      group.add(bl);
      brakeLights.push(bl);
    });
    group.userData.brakeLights = brakeLights;

    // SpotLight Forward Beam
    const spot = new THREE.SpotLight(0xffffdd, 4.0, 35, Math.PI / 4, 0.3);
    spot.position.set(0, height * 0.7, length / 2);
    const target = new THREE.Object3D();
    target.position.set(0, 0.2, length / 2 + 16);
    group.add(target);
    spot.target = target;
    group.add(spot);
  }

  group.userData = {
    type,
    width,
    height,
    length,
    speed: 0,
    baseSpeed: 0.12 + Math.random() * 0.03,
    maxSpeed: 0.32,
    laneIndex: 0,
    targetLaneX: 0,
    direction: 1,
    state: "normal", // normal, overspeed, outofcontrol, crash, fallen, brake
    isBraking: false,
    role: type === "ambulance" || type === "police" ? "emergency" : "traffic",
    spotlight: group.children.find((c) => c.isSpotLight),
  };
  return group;
}

// ─── Particle Emitters ──────────────────────────────────────────────────────

function createParticleSystem(count, color, size = 0.1) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    velocities.push({
      x: (Math.random() - 0.5) * 0.05,
      y: Math.random() * 0.08 + 0.02,
      z: (Math.random() - 0.5) * 0.05,
      life: Math.random(),
    });
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.userData.velocities = velocities;
  points.visible = false;
  return points;
}

function updateParticles(system, origin, dt, spread = 0.4) {
  if (!system || !system.visible) return;
  const pos = system.geometry.attributes.position;
  const vels = system.userData.velocities;
  for (let i = 0; i < vels.length; i++) {
    vels[i].life -= dt * 0.9;
    if (vels[i].life <= 0) {
      vels[i].life = 1;
      pos.array[i * 3] = origin.x + (Math.random() - 0.5) * spread;
      pos.array[i * 3 + 1] = origin.y;
      pos.array[i * 3 + 2] = origin.z + (Math.random() - 0.5) * spread;
      vels[i].x = (Math.random() - 0.5) * 0.08;
      vels[i].y = Math.random() * 0.09 + 0.03;
      vels[i].z = (Math.random() - 0.5) * 0.08;
    }
    pos.array[i * 3] += vels[i].x;
    pos.array[i * 3 + 1] += vels[i].y;
    pos.array[i * 3 + 2] += vels[i].z;
    vels[i].y -= dt * 0.012;
  }
  pos.needsUpdate = true;
}

// ─── Environment & Road System ──────────────────────────────────────────────

function buildSmartCityRoad(length = 140, lanes = 4) {
  const group = new THREE.Group();
  const roadWidth = lanes * 3.6;
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, length),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
  );
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  group.add(road);

  // Dashed Center & Lane Lines
  const lineYellow = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const lineWhite = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

  [-0.1, 0.1].forEach((x) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, length), lineYellow);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.01, 0);
    group.add(line);
  });

  [-3.6, 3.6].forEach((x) => {
    for (let z = -length / 2 + 2; z < length / 2; z += 6) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.5), lineWhite);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.01, z);
      group.add(dash);
    }
  });

  // Sidewalks
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
  [-roadWidth / 2 - 2.5, roadWidth / 2 + 2.5].forEach((x) => {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(5, length), sidewalkMat);
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(x, 0.005, 0);
    sw.receiveShadow = true;
    group.add(sw);
  });

  return group;
}

// ─── Urban Digital Twin Master Simulation ───────────────────────────────────

class SmartCitySimulation {
  constructor() {
    this.scene = null;
    this.trafficState = "NORMAL"; // NORMAL, WARNING, ACCIDENT, ROAD_BLOCKED, EMERGENCY
    this.roadDamageLevel = 0; // 0 to 5
    this.waterLeakActive = false;
    this.gridBlackout = false;
    this.emergencyDispatched = false;
    this.blockedLanes = new Set(); // Stores lane indices (0, 1, 2, 3) that are currently blocked!

    this.vehicles = [];
    this.emergencyVehicles = [];
    this.streetLights = [];
    this.sparks = null;
    this.waterSpray = null;
    this.fireParticles = null;
    this.smokeParticles = null;
    this.strobeTimer = 0;

    this.lanesX = [-5.4, -1.8, 1.8, 5.4];
    this.lanesDir = [1, 1, -1, -1];
    this.laneActive = [true, true, true, true]; // Which lanes receive road damage
    this.accidentPair = null; // { a, b } for head-on collision scenario
    this.pendingVerify = null; // frames to wait before CCTV verification of a collision
  }

  init(scene) {
    this.scene = scene;

    // Lighting
    const amb = new THREE.AmbientLight(0x384259, 0.6);
    amb.name = "ambientLight";
    scene.add(amb);

    const sun = new THREE.DirectionalLight(0xfff5e6, 1.2);
    sun.name = "sunLight";
    sun.position.set(25, 45, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);

    // Avenue Road
    const road = buildSmartCityRoad(140, 4);
    scene.add(road);

    // Spawn 11 Diverse Autonomous Vehicles
    const vehicleTypes = [
      "sedan", "suv", "sports", "bus", "truck",
      "van", "taxi", "bike", "construction", "police", "ambulance"
    ];
    const colors = [
      0x2563eb, 0xdc2626, 0x16a34a, 0xd97706, 0x7c3aed,
      0x0284c7, 0xe11d48, 0xeab308, 0x475569, 0x0f172a, 0xf8fafc
    ];

    vehicleTypes.forEach((type, i) => {
      const v = createVehicle(type, colors[i % colors.length]);
      const laneIndex = i % this.lanesX.length;
      const laneX = this.lanesX[laneIndex];
      const dir = this.lanesDir[laneIndex];
      const startZ = -55 + i * 11;

      v.position.set(laneX, 0, startZ);
      v.rotation.y = dir === 1 ? 0 : Math.PI;
      v.userData.laneIndex = laneIndex;
      v.userData.targetLaneX = laneX;
      v.userData.direction = dir;
      v.userData.speed = v.userData.baseSpeed;

      const label = makeLabel(type.toUpperCase(), colors[i % colors.length]);
      label.position.set(laneX, 3.2, startZ);
      v.userData.label = label;
      scene.add(label);

      scene.add(v);

      if (v.userData.role === "emergency") {
        // Emergency fleet parks on the ROADSIDE (right shoulder), well clear of
        // the 4 traffic lanes (x = -7.2..7.2) so they never collide with traffic.
        const roadsideX = 10.5;
        v.position.set(roadsideX, 0, -50 + i * 5); // Parked on the shoulder
        v.rotation.y = 0;                          // Face down the avenue (z+)
        v.userData.laneIndex = -1;                 // Not part of any traffic lane
        v.userData.targetLaneX = roadsideX;
        v.userData.direction = 1;
        v.userData.roadsideX = roadsideX;
        v.visible = false;
        if (v.userData.label) {
          v.userData.label.visible = false;
          v.userData.label.position.set(roadsideX, 3.6, v.position.z);
        }
        this.emergencyVehicles.push(v);
      } else {
        this.vehicles.push(v);
      }
    });

    // ─── Substation Power Grid Model ────────────────────────────────────────
    this.transformerGroup = new THREE.Group();
    const transBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 2.4, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 })
    );
    transBody.position.y = 1.2;
    this.transformerGroup.add(transBody);

    // Radiator Cooling Fins
    [-1.15, 1.15].forEach((x) => {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 2.0, 1.3),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })
      );
      fin.position.set(x, 1.2, 0);
      this.transformerGroup.add(fin);
    });

    // Top Ceramic Insulator Bushings
    [-0.6, 0, 0.6].forEach((x) => {
      const ins = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.15, 0.8, 12),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.1 })
      );
      ins.position.set(x, 2.8, 0);
      this.transformerGroup.add(ins);
    });

    // Warning Badge
    const badge = makeLabel("HIGH VOLTAGE", 0xef4444);
    badge.position.set(0, 1.8, 0.85);
    badge.scale.set(2, 0.5, 1);
    this.transformerGroup.add(badge);

    this.transformerGroup.position.set(-10, 0, 0);
    scene.add(this.transformerGroup);

    // Street Lights along Avenue
    for (let z = -50; z <= 50; z += 20) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.1, 4.5),
        new THREE.MeshStandardMaterial({ color: 0x1e293b })
      );
      post.position.set(-9, 2.25, z);

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xfff9c4, emissive: 0xfff59d, emissiveIntensity: 2.5 })
      );
      bulb.position.set(-9, 4.5, z);

      const spot = new THREE.SpotLight(0xfff59d, 3.0, 15, Math.PI / 3);
      spot.position.set(-9, 4.5, z);
      const target = new THREE.Object3D();
      target.position.set(-4, 0, z);
      scene.add(target);
      spot.target = target;

      scene.add(post, bulb, spot);
      this.streetLights.push({ bulb, spot });
    }

    // ─── Underground Pipeline Network (y = -0.8) ────────────────────────────
    this.pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 })
    );
    this.pipe.rotation.z = Math.PI / 2;
    this.pipe.position.set(1.8, -0.8, 0); // UNDERGROUND PIPE AT y = -0.8!
    scene.add(this.pipe);

    // Wet Reflective Puddle Slick on Asphalt (y = 0.02)
    this.wetPuddle = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 22),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, transparent: true, opacity: 0, roughness: 0.05, metalness: 0.1 })
    );
    this.wetPuddle.rotation.x = -Math.PI / 2;
    this.wetPuddle.position.set(1.8, 0.02, 0);
    scene.add(this.wetPuddle);

// ─── Progressive 5-Stage Road Damage Geometry (per-lane) ─────────────────
    this.roadDamageGroup = new THREE.Group();

    // Store per-lane damage groups: cracks, pothole, debris for each of 4 lanes
    this.laneCracks = [];
    this.lanePotholes = [];
    this.laneDebris = [];

    const crackMat = new THREE.LineBasicMaterial({ color: 0x090d16, linewidth: 2 });

    this.lanesX.forEach((laneX, li) => {
      // Stage 1-2: Hairline & Branching Cracks (centered on this lane)
      const crackGroup = new THREE.Group();
      const jitter = (li - 1) * 1.2; // vary crack pattern per lane
      const crackPaths = [
        [[laneX - 2, 0.02, -8], [laneX - 0.5, 0.02, -2], [laneX, 0.02, 0], [laneX + 1.2, 0.02, 4]],
        [[laneX, 0.02, 0], [laneX - 1.5, 0.02, 3 + jitter], [laneX + 1.8, 0.02, 8]],
        [[laneX - 2, 0.02, 2 + jitter], [laneX, 0.02, 0], [laneX + 2.7, 0.02, -3]],
      ];
      crackPaths.forEach((pts) => {
        const geo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
        const line = new THREE.Line(geo, crackMat);
        line.scale.set(0.01, 1, 0.01);
        crackGroup.add(line);
      });
      this.laneCracks.push(crackGroup);
      this.roadDamageGroup.add(crackGroup);

      // Stage 3-5: Recessed Pothole & Deep Collapse Cavity in THIS lane
      const potholeCavity = new THREE.Group();
      const outerRim = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 2.6, 16),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 1 })
      );
      outerRim.rotation.x = -Math.PI / 2;
      outerRim.position.set(laneX, 0.015, 0);

      const innerCavity = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 1.6, 0.6, 16),
        new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 1 })
      );
      innerCavity.position.set(laneX, -0.3, 0);
      potholeCavity.add(outerRim, innerCavity);
      potholeCavity.scale.set(0.01, 1, 0.01);
      this.lanePotholes.push(potholeCavity);
      this.roadDamageGroup.add(potholeCavity);

      // Stage 4-5: Debris Rocks scattered around this lane's pothole
      const debrisGroup = new THREE.Group();
      for (let i = 0; i < 16; i++) {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.22),
          new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 })
        );
        rock.position.set(laneX + (Math.random() - 0.5) * 3.5, 0.15, (Math.random() - 0.5) * 3.5);
        rock.scale.set(0.01, 0.01, 0.01);
        debrisGroup.add(rock);
      }
      this.laneDebris.push(debrisGroup);
      this.roadDamageGroup.add(debrisGroup);
    });

    scene.add(this.roadDamageGroup);

    // ─── Particle Emitters ──────────────────────────────────────────────────
    this.sparks = createParticleSystem(160, 0xfacc15, 0.14);
    this.sparks.position.set(-10, 2.8, 0);

    // Water particles travel UPWARDS from underground pipe (y = -0.8) to surface (y = 0.05)!
    this.waterSpray = createParticleSystem(220, 0x38bdf8, 0.15);
    this.waterSpray.position.set(1.8, 0.05, 0);

    this.fireParticles = createParticleSystem(120, 0xff4400, 0.18);
    this.smokeParticles = createParticleSystem(90, 0x64748b, 0.24);

    scene.add(this.sparks, this.waterSpray, this.fireParticles, this.smokeParticles);
  }

  // Helper for Bounding Box Collision Detection
  getVehicleBox(v) {
    const box = new THREE.Box3();
    box.setFromObject(v);
    return box;
  }

  update(dt) {
    this.strobeTimer += dt;
    const amb = this.scene.children.find((c) => c.name === "ambientLight");
    const sun = this.scene.children.find((c) => c.name === "sunLight");

    // ─── Autonomous Traffic & Lane Queue Intelligence ────────────────────────
    this.vehicles.forEach((v, i) => {
      const d = v.userData;
      const dir = d.direction;
      const lane = d.laneIndex;

      // Lock & Clamp X position strictly on road asphalt
      v.position.x = THREE.MathUtils.lerp(v.position.x, d.targetLaneX, dt * 5.0);
      v.position.x = THREE.MathUtils.clamp(v.position.x, -6.8, 6.8); // NEVER GO ONTO GRASS!

      // Check if vehicle falls into Stage 4-5 Road Collapse (only in active damage lanes)
      if (this.roadDamageLevel >= 4 && this.laneActive[lane] && d.state !== "fallen" && d.state !== "crash") {
        if (Math.abs(v.position.z - 0) < 2.5) {
          // Vehicle dips, pitches forward, bounces, and lands in collapse hole!
          d.state = "fallen";
          d.speed = 0;
          v.rotation.x = THREE.MathUtils.degToRad(35 * dir);
          v.rotation.z = THREE.MathUtils.degToRad(15);
          v.position.y = -0.45;
          this.blockedLanes.add(lane);
          this.trafficState = "ACCIDENT";
          this.dispatchEmergencyResponse();
        }
      }

      // ─── Bounding Box Collision Check against other vehicles ──────────────
      if (d.state !== "crash" && d.state !== "fallen") {
        const boxV = this.getVehicleBox(v);
        this.vehicles.forEach((other, j) => {
          if (i === j) return;
          const oState = other.userData.state;
          if (oState === "crash" || oState === "fallen") {
            const boxOther = this.getVehicleBox(other);
            if (boxV.intersectsBox(boxOther)) {
              d.state = "crash";
              d.speed = 0;
              this.blockedLanes.add(lane);
              this.trafficState = "ACCIDENT";
              this.dispatchEmergencyResponse();
            }
          }
        });
      }

      // ─── Lane Queue & Distance Keeping Braking ───────────────────────────
      const isLaneBlocked = this.blockedLanes.has(lane);

      if (d.state === "crash" || d.state === "fallen") {
        d.isBraking = true;
        d.speed = 0;
      } else if (isLaneBlocked) {
        // Vehicle in blocked lane: check if it should stop behind the blockage
        d.isBraking = true;
        d.speed = THREE.MathUtils.lerp(d.speed, 0, dt * 2.8);
      } else if (d.state === "outofcontrol") {
        d.speed = Math.min(d.maxSpeed * 1.6, d.speed + dt * 0.15);
        v.position.z += dir * d.speed;
        d.targetLaneX = d.laneX + Math.sin(Date.now() * 0.008 + i) * 1.5; // Swerve slightly
      } else if (d.state === "overspeed") {
        // Reduced tire friction on wet flooded road -> skid!
        const isWet = this.waterLeakActive && Math.abs(v.position.z) < 12.0;
        const accel = isWet ? 0.25 : 0.15;
        d.speed = Math.min(d.maxSpeed * 1.9, d.speed + dt * accel);
        v.position.z += dir * d.speed;
      } else {
        // Normal Cruising & Tailgating / Queue Check behind vehicle ahead
        let targetSpeed = d.baseSpeed;

        const vehicleAhead = this.vehicles.find((other, j) => {
          if (i === j) return false;
          if (other.userData.laneIndex !== lane) return false;
          const distZ = (other.position.z - v.position.z) * dir;
          return distZ > 0 && distZ < 9.0;
        });

        if (vehicleAhead) {
          const distZ = (vehicleAhead.position.z - v.position.z) * dir;
          if (distZ < 4.5) {
            targetSpeed = 0; // Stop behind vehicle ahead!
          } else {
            targetSpeed = Math.min(d.baseSpeed, vehicleAhead.userData.speed * 0.85);
          }
          d.isBraking = true;
        } else {
          d.isBraking = false;
        }

        d.speed = THREE.MathUtils.lerp(d.speed, targetSpeed, dt * 2.2);
        v.position.z += dir * d.speed;
      }

      // Loop boundary
      const limit = 70;
      if (dir === 1 && v.position.z > limit) {
        v.position.z = -limit;
        d.targetLaneX = this.lanesX[lane];
        if (d.state !== "crash" && d.state !== "fallen") d.state = "normal";
      } else if (dir === -1 && v.position.z < -limit) {
        v.position.z = limit;
        d.targetLaneX = this.lanesX[lane];
        if (d.state !== "crash" && d.state !== "fallen") d.state = "normal";
      }

      // Update Label
      if (d.label) d.label.position.set(v.position.x, 3.2, v.position.z);

      // Rear Red Brake Lights
      if (d.brakeLights) {
        const intensity = d.isBraking || d.state === "crash" || d.state === "fallen" ? 3.5 : 0.8;
        d.brakeLights.forEach((bl) => { bl.material.emissiveIntensity = intensity; });
      }
    });

    // ─── Head-On Accident Collision Detection ──────────────────────────────
    if (this.accidentPair) {
      const { a, b } = this.accidentPair;
      const da = a.userData;
      const db = b.userData;
      const gap = Math.abs(a.position.z - b.position.z);

      if (da.state === "crash" || db.state === "crash") {
        this.accidentPair = null;
      } else if (gap < 3.2) {
        const midZ = (a.position.z + b.position.z) / 2;
        a.position.z = midZ - 1.1;
        b.position.z = midZ + 1.1;
        a.rotation.z = THREE.MathUtils.degToRad(14);
        b.rotation.z = THREE.MathUtils.degToRad(-14);
        a.rotation.x = THREE.MathUtils.degToRad(6);
        b.rotation.x = THREE.MathUtils.degToRad(-6);

        da.state = "crash";
        da.speed = 0;
        db.state = "crash";
        db.speed = 0;

        this.blockedLanes.add(da.laneIndex);
        this.trafficState = "ACCIDENT";
        this.dispatchEmergencyResponse();
        this.accidentPair = null;

        // Wait a few frames so the crash is rendered, then CCTV-verify & report
        this.pendingVerify = { frames: 0 };
      }
    }

    // ─── CCTV Verification of Collision ─────────────────────────────────────
    if (this.pendingVerify) {
      this.pendingVerify.frames += 1;
      if (this.pendingVerify.frames >= 4) {
        this.pendingVerify = null;
        this.verifyCollisionWithCCTV();
      }
    }

// ─── Emergency Vehicle Response Handling ────────────────────────────────
    if (this.emergencyDispatched) {
      this.emergencyVehicles.forEach((ev, idx) => {
        ev.visible = true;
        if (ev.userData.label) ev.userData.label.visible = true;

        // Keep emergency vehicles pinned to the ROADSIDE shoulder (x = roadsideX),
        // which is well outside the traffic lanes (x = -7.2..7.2). This prevents
        // all collisions with normal traffic.
        const roadsideX = ev.userData.roadsideX || 10.5;
        ev.position.x = THREE.MathUtils.lerp(ev.position.x, roadsideX, dt * 6.0);

        // Drive down the shoulder toward the incident/accident zone (z ~ 0..6)
        const targetZ = 6.0 + idx * 7.0;
        if (ev.position.z < targetZ) {
          ev.position.z += dt * 9.0;
        }
        // Keep facing down the avenue (they only ever travel along the shoulder)
        ev.rotation.y = 0;

        // Keep the label pinned above the emergency vehicle so it follows along
        // the roadside instead of floating over the traffic lanes.
        if (ev.userData.label) {
          ev.userData.label.position.set(ev.position.x, 3.6, ev.position.z);
        }

        if (ev.userData.lightBar) {
          const strobe = Math.sin(this.strobeTimer * 22) > 0;
          ev.userData.lightBar.children[0].material.emissiveIntensity = strobe ? 4.5 : 0.2;
          ev.userData.lightBar.children[1].material.emissiveIntensity = !strobe ? 4.5 : 0.2;
        }
      });
    }

    // ─── Subsystem Incident Updates ─────────────────────────────────────────

    // Blackout
    if (this.gridBlackout) {
      if (amb) amb.intensity = 0.04;
      if (sun) sun.intensity = 0.0;
      this.scene.background = new THREE.Color(0x020408);
      this.scene.fog = new THREE.Fog(0x020408, 15, 60);

      this.streetLights.forEach(({ bulb, spot }) => {
        bulb.material.emissiveIntensity = 0.01;
        spot.intensity = 0;
      });

      this.sparks.visible = true;
      updateParticles(this.sparks, this.sparks.position, dt, 0.9);
    } else {
      if (amb) amb.intensity = 0.6;
      if (sun) sun.intensity = 1.2;
      this.scene.background = null;
      this.scene.fog = new THREE.Fog(0x0a0e17, 40, 100);

      this.streetLights.forEach(({ bulb, spot }) => {
        bulb.material.emissiveIntensity = 2.5;
        spot.intensity = 3.0;
      });

      this.sparks.visible = false;
    }

    // Water Network & Slick
    if (this.waterLeakActive) {
      this.waterSpray.visible = true;
      updateParticles(this.waterSpray, this.waterSpray.position, dt, 1.6);
      this.wetPuddle.material.opacity = THREE.MathUtils.lerp(this.wetPuddle.material.opacity, 0.8, dt * 0.8);
    } else {
      this.waterSpray.visible = false;
      this.wetPuddle.material.opacity = 0;
    }

// Progressive Road Damage (1 to 5) — applied per-lane, only on checked lanes
    const t = this.roadDamageLevel / 5;
    this.laneCracks.forEach((group, li) => {
      const active = this.laneActive[li];
      group.children.forEach((line, i) => {
        const s = active ? THREE.MathUtils.lerp(0.01, 1, Math.max(0, t - i * 0.18)) : 0.01;
        line.scale.set(s, 1, s);
      });
    });

    this.lanePotholes.forEach((cavity, li) => {
      const active = this.laneActive[li];
      const potS = active ? THREE.MathUtils.lerp(0.01, 1, Math.max(0, (this.roadDamageLevel - 2) / 3)) : 0.01;
      cavity.scale.set(potS, 1, potS);
    });

    this.laneDebris.forEach((group, li) => {
      const active = this.laneActive[li];
      group.children.forEach((rock) => {
        const s = active ? THREE.MathUtils.lerp(0.01, 1, Math.max(0, (this.roadDamageLevel - 3) / 2)) : 0.01;
        rock.scale.set(s, s, s);
      });
    });

    // Crash / Fallen Particles
    const crashed = this.vehicles.find((v) => v.userData.state === "crash" || v.userData.state === "fallen");
    if (crashed) {
      this.fireParticles.position.copy(crashed.position);
      this.fireParticles.position.y = 0.8;
      this.fireParticles.visible = true;

      this.smokeParticles.position.copy(crashed.position);
      this.smokeParticles.position.y = 1.6;
      this.smokeParticles.visible = true;

      updateParticles(this.fireParticles, this.fireParticles.position, dt, 1.2);
      updateParticles(this.smokeParticles, this.smokeParticles.position, dt, 1.6);
    } else {
      this.fireParticles.visible = false;
      this.smokeParticles.visible = false;
    }
  }

  // ─── Natural Dynamic Incident Triggers ────────────────────────────────────

  triggerNaturalOverspeed() {
    this.trafficState = "WARNING";
    const targetV = this.vehicles.find(v => v.userData.state === "normal") || this.vehicles[0];
    targetV.userData.state = "overspeed";

    setTimeout(() => {
      if (targetV.userData.state === "overspeed") {
        targetV.userData.state = "outofcontrol";
      }
    }, 1800);
  }

  triggerAccident() {
    const candidates = this.vehicles.filter(v => v.userData.state === "normal");
    if (candidates.length < 2) {
      this.reset();
      return this.triggerAccident();
    }
    const a = candidates[0];
    const b = candidates[1];
    const lane = 1; // use lane index 1 (x = -1.8)
    const laneX = this.lanesX[lane];

    // Clear other traffic out of the collision lane so the two vehicles
    // have a clean head-on approach.
    this.vehicles.forEach((v) => {
      if (v === a || v === b) return;
      if (v.userData.laneIndex === lane && v.userData.state !== "emergency") {
        const altLane = lane === 0 ? 2 : 0;
        const altX = this.lanesX[altLane];
        v.userData.laneIndex = altLane;
        v.userData.targetLaneX = altX;
        v.userData.direction = this.lanesDir[altLane];
        v.position.x = altX;
        v.rotation.y = v.userData.direction === 1 ? 0 : Math.PI;
      }
    });

    // Place A facing forward (+z), B facing backward (-z) in the same lane
    a.position.set(laneX, 0, -12);
    a.rotation.set(0, 0, 0);
    a.userData.laneIndex = lane;
    a.userData.targetLaneX = laneX;
    a.userData.direction = 1;
    a.userData.speed = 0.12;
    a.userData.state = "overspeed";

    b.position.set(laneX, 0, 12);
    b.rotation.set(0, Math.PI, 0);
    b.userData.laneIndex = lane;
    b.userData.targetLaneX = laneX;
    b.userData.direction = -1;
    b.userData.speed = 0.12;
    b.userData.state = "overspeed";

    this.accidentPair = { a, b };
    this.trafficState = "WARNING";
  }

  setProgressiveRoadDamage(level) {
    this.roadDamageLevel = THREE.MathUtils.clamp(level, 0, 5);
    if (this.roadDamageLevel >= 3) this.trafficState = "WARNING";
  }

  setWaterLeak(active) {
    this.waterLeakActive = active;
  }

  setBlackout(active) {
    this.gridBlackout = active;
  }

  dispatchEmergencyResponse() {
    this.emergencyDispatched = true;
  }

  triggerCascadingDisaster() {
    // Stage 1: Road Damage & Pipe Burst
    this.setProgressiveRoadDamage(5);
    this.setWaterLeak(true);

    // Stage 2: Overspeed & Night Blackout
    setTimeout(() => {
      this.setBlackout(true);
      this.triggerNaturalOverspeed();
    }, 1500);

    // Stage 3: Emergency Response Dispatch
    setTimeout(() => {
      this.dispatchEmergencyResponse();
    }, 4000);
  }

reset() {
    this.trafficState = "NORMAL";
    this.roadDamageLevel = 0;
    this.waterLeakActive = false;
    this.gridBlackout = false;
    this.emergencyDispatched = false;
    this.blockedLanes.clear();
    this.laneActive = [true, true, true, true];
    this.accidentPair = null;

    this.vehicles.forEach((v, i) => {
      const laneIndex = i % 4;
      const laneX = this.lanesX[laneIndex];
      const dir = this.lanesDir[laneIndex];

      v.position.set(laneX, 0, -55 + i * 11);
      v.rotation.set(0, dir === 1 ? 0 : Math.PI, 0);
      v.userData.state = "normal";
      v.userData.speed = v.userData.baseSpeed;
      v.userData.isBraking = false;
      v.userData.laneIndex = laneIndex;
      v.userData.targetLaneX = laneX;
    });

this.emergencyVehicles.forEach((ev, i) => {
      const roadsideX = ev.userData.roadsideX || 10.5;
      ev.visible = false;
      ev.position.set(roadsideX, 0, -50 + i * 5);
      ev.rotation.y = 0;
      if (ev.userData.label) {
        ev.userData.label.visible = false;
        ev.userData.label.position.set(roadsideX, 3.6, ev.position.z);
      }
    });

    this.fireParticles.visible = false;
    this.smokeParticles.visible = false;
  }

  // ─── Incident Reporting to UCRIP Backend ────────────────────────────────

  reportIncident(category, title, description) {
    const payload = {
      category: category,
      title: title,
      description: description,
      latitude: 17.3850,
      longitude: 78.4867,
      location_address: "Simulation City — Digital Twin",
      reporter_name: "UCRIP Simulation",
    };
    fetch("/api/incidents/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("[UCRIP] Incident reported:", data);
        this.showReportToast(category, title, data.incident_id);
      })
      .catch((err) => {
        console.error("[UCRIP] Failed to report incident:", err);
        this.showReportToast(category, title, null, false);
      });
  }

  // Capture the current camera view, save it as a CCTV snapshot, and report
  // the incident to the admin dashboard (with the image attached).
  captureAndReport(category, title, description, camId = 1, opts = {}) {
    try {
      // Position the CCTV camera for the associated feed
      const feed = CCTV_FEEDS[camId] || CCTV_FEEDS[1];
      if (app.camera) {
        app.camera.position.copy(feed.pos);
        app.camera.lookAt(feed.target);
        if (app.controls) {
          app.controls.target.copy(feed.target);
          app.controls.update();
        }
      }
      document.querySelectorAll(".cctv-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.cam) === camId);
      });

      // Render one frame so the capture reflects the current event
      if (app.renderer && this.scene && app.camera) {
        app.renderer.render(this.scene, app.camera);
      }

      const canvas = app.renderer ? app.renderer.domElement : null;
      if (!canvas) {
        this.reportIncident(category, title, description);
        return;
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      const base64 = dataUrl.split(",")[1];

      this.showReportToast(category, title, null, true, "capture");

      const payload = {
        image: base64,
        camera_id: camId,
        camera_name: feed.name,
        latitude: 17.3850,
        longitude: 78.4867,
        confidence: opts.confidence ?? 0.9,
        description: description,
        category: category,
        title: title,
        detection_type: category,
        object_count: opts.object_count ?? 0,
      };

      fetch("/api/stream/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("[UCRIP] CCTV verify result:", data);
          if (data && data.verified) {
            this.showReportToast(category, title, data.incident_id);
          } else {
            this.showReportToast(category, title, null, true);
          }
        })
        .catch((err) => {
          console.error("[UCRIP] CCTV verify failed:", err);
          this.showReportToast(category, title, null, false);
        });
    } catch (e) {
      console.error("[UCRIP] captureAndReport error:", e);
      this.reportIncident(category, title, description);
    }
  }

  showReportToast(category, title, incidentId, success = true, phase = "") {
    const existing = document.getElementById("report-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "report-toast";
    const isVerifying = phase === "capture";
    toast.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 99999;
      background: ${isVerifying ? "rgba(59, 130, 246, 0.95)" : success ? "rgba(16, 185, 129, 0.95)" : "rgba(239, 68, 68, 0.95)"};
      color: #fff; padding: 12px 16px; border-radius: 10px;
      font-family: inherit; font-size: 0.85rem; max-width: 320px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2);
    `;
    toast.innerHTML = `
      <strong>${isVerifying ? "📷" : success ? "✅" : "⚠️"} ${isVerifying ? "CCTV Capturing Snapshot..." : success ? "Incident Reported to Admin" : "Report Failed"}</strong><br/>
      <span style="opacity:0.9">${title}</span>
      ${incidentId ? `<br/><span style="font-family:monospace;font-size:0.75rem;opacity:0.8">ID: ${incidentId}</span>` : ""}
    `;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 6000);
  }

  // ─── CCTV Collision Verification ─────────────────────────────────────────

  verifyCollisionWithCCTV() {
    try {
      const camId = 1;
      const feed = CCTV_FEEDS[camId];
      if (app.camera) {
        app.camera.position.copy(feed.pos);
        app.camera.lookAt(feed.target);
        if (app.controls) {
          app.controls.target.copy(feed.target);
          app.controls.update();
        }
      }
      document.querySelectorAll(".cctv-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.cam) === camId);
      });

      if (app.renderer && this.scene && app.camera) {
        app.renderer.render(this.scene, app.camera);
      }

      const canvas = app.renderer ? app.renderer.domElement : null;
      if (!canvas) {
        this.reportIncident("accident", "Head-On Vehicle Collision", "Two vehicles collided head-on in simulation city.");
        return;
      }

      this.showReportToast("accident", null, null, true, "capture");

      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      const base64 = dataUrl.split(",")[1];

      const payload = {
        image: base64,
        camera_id: camId,
        camera_name: "CAM-01 · Avenue Traffic Overview",
        latitude: 17.3850,
        longitude: 78.4867,
        confidence: 0.93,
        description: "Head-on collision between two vehicles detected and verified via CCTV in simulation city.",
        category: "accident",
        title: "Head-On Vehicle Collision",
        detection_type: "accident",
        object_count: 2,
      };

      fetch("/api/stream/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("[UCRIP] CCTV verification result:", data);
          if (data && data.verified) {
            this.showReportToast("accident", "Collision Verified by CCTV — Reported to Admin", data.incident_id);
          } else {
            this.showReportToast("accident", "Collision reported (verification queued)", null, true);
          }
        })
        .catch((err) => {
          console.error("[UCRIP] CCTV verification failed:", err);
          this.showReportToast("accident", "CCTV Verification Failed", null, false);
        });
    } catch (e) {
      console.error("[UCRIP] verifyCollisionWithCCTV error:", e);
      this.reportIncident("accident", "Head-On Vehicle Collision", "Two vehicles collided head-on in simulation city.");
    }
  }

  renderControls(panel) {
    panel.innerHTML = `
      <div class="panel-section">
        <h3>Cascading Risk Controls</h3>
        <button class="btn btn-danger" id="btn-chain" style="width:100%; padding:14px; font-weight:700; font-size:0.92rem; margin-bottom:14px;">
          💥 TRIGGER CASCADING DISASTER
        </button>

        <div class="control-group" style="margin-top:14px">
          <label>Vehicle Accident</label>
          <button class="btn btn-primary" id="btn-accident" style="width:100%; padding:14px; font-weight:700; font-size:0.92rem; margin-bottom:14px;">
            💥 ACCIDENT — TWO VEHICLES COLLIDE
          </button>
        </div>

        <div class="control-group">
          <label>Natural Overspeed Incident</label>
          <button class="btn btn-warning" id="btn-overspeed" style="width:100%">🚗 Trigger Overspeed & Tailgate</button>
        </div>

<div class="control-group" style="margin-top:12px">
          <label>Road Damage Progression (5 Stages)</label>
          <input type="range" id="road-slider" min="0" max="5" step="1" value="0" />
          <div class="range-value" id="road-label">Stage 0 — Intact Surface</div>
        </div>

        <div class="control-group" style="margin-top:12px">
          <label>Affected Lanes (apply road damage)</label>
          <div class="lane-check-grid">
            <label class="lane-check"><input type="checkbox" data-lane="0" checked /> Lane 1</label>
            <label class="lane-check"><input type="checkbox" data-lane="1" checked /> Lane 2</label>
            <label class="lane-check"><input type="checkbox" data-lane="2" checked /> Lane 3</label>
            <label class="lane-check"><input type="checkbox" data-lane="3" checked /> Lane 4</label>
          </div>
        </div>

        <div class="control-group" style="margin-top:12px">
          <label>Subsystem Failures</label>
          <div class="control-row">
            <button class="btn btn-warning" id="btn-leak">💧 Underground Pipe Leak</button>
            <button class="btn btn-danger" id="btn-blackout">⚡ Night Blackout</button>
          </div>
        </div>

        <div class="control-group" style="margin-top:12px">
          <button class="btn btn-primary" id="btn-dispatch" style="width:100%">🚨 Dispatch Emergency Response</button>
        </div>
      </div>
    `;

    panel.querySelector("#btn-chain").addEventListener("click", () => {
      this.triggerCascadingDisaster();
      this.captureAndReport(
        "building_collapse",
        "Cascading Disaster Triggered",
        "Chain reaction in simulation city: road collapse, underground pipe burst, and power blackout detected simultaneously.",
        2,
        { confidence: 0.96 }
      );
      app.updateSubsystemGauges();
      app.autoFocusCamera(2);
    });

    panel.querySelector("#btn-accident").addEventListener("click", () => {
      this.triggerAccident();
      app.updateSubsystemGauges();
      app.autoFocusCamera(1);
    });

    panel.querySelector("#btn-overspeed").addEventListener("click", () => {
      // ⚠️ Minor traffic event (realistic): overspeed alone is NOT reported as an
      // incident to the admin. It only escalates to an incident if it truly leads
      // to a collision (handled by CCTV verification). Prevents dashboard spam.
      this.triggerNaturalOverspeed();
      app.updateSubsystemGauges();
      app.autoFocusCamera(1);
    });

    const roadLabels = [
      "Stage 0 — Intact Surface",
      "Stage 1 — Hairline Cracks",
      "Stage 2 — Branching Crack Network",
      "Stage 3 — Small Pothole",
      "Stage 4 — Major Collapse & Debris",
      "Stage 5 — Deep Structural Collapse",
    ];
const slider = panel.querySelector("#road-slider");
    const label = panel.querySelector("#road-label");
    slider.addEventListener("input", () => {
      const val = Number(slider.value);
      this.setProgressiveRoadDamage(val);
      label.textContent = roadLabels[val];
      // ⚠️ Realistic reporting: road damage is only reported to the admin as an
      // incident at Stage 5 (deep structural collapse). Stages 1-4 are minor road
      // wear shown visually only — no admin incident is created.
      if (val === 5) {
        this.captureAndReport(
          "road_damage",
          "Major Road Collapse",
          "Stage 5 road damage — deep structural road collapse detected on simulation city highway.",
          2,
          { confidence: 0.9 }
        );
      }
      app.updateSubsystemGauges();
      app.autoFocusCamera(2);
    });

    panel.querySelectorAll(".lane-check input[type='checkbox']").forEach((chk) => {
      chk.addEventListener("change", () => {
        const laneIndex = Number(chk.dataset.lane);
        this.laneActive[laneIndex] = chk.checked;
        // When a lane is deactivated, restore any fallen/crashed vehicles in it
        // so the lane clears back to normal traffic flow.
        if (!chk.checked) {
          this.vehicles.forEach((v) => {
            const vd = v.userData;
            if (vd.laneIndex === laneIndex && (vd.state === "fallen" || vd.state === "crash")) {
              vd.state = "normal";
              vd.speed = vd.baseSpeed;
              vd.isBraking = false;
              v.position.y = 0;
              v.rotation.set(0, vd.direction === 1 ? 0 : Math.PI, 0);
            }
          });
          this.blockedLanes.delete(laneIndex);
        }
        app.updateSubsystemGauges();
      });
    });

    panel.querySelector("#btn-leak").addEventListener("click", () => {
      this.setWaterLeak(!this.waterLeakActive);
      if (this.waterLeakActive) {
        this.captureAndReport(
          "water_leak",
          "Underground Pipe Leak",
          "Water main leak detected in simulation city — potential flooding risk.",
          4,
          { confidence: 0.85 }
        );
      }
      app.updateSubsystemGauges();
      app.autoFocusCamera(4);
    });

    panel.querySelector("#btn-blackout").addEventListener("click", () => {
      this.setBlackout(!this.gridBlackout);
      if (this.gridBlackout) {
        this.captureAndReport(
          "power_outage",
          "City-Wide Power Blackout",
          "Power grid failure detected in simulation city — blackout in progress.",
          3,
          { confidence: 0.92 }
        );
      }
      app.updateSubsystemGauges();
      app.autoFocusCamera(3);
    });

    panel.querySelector("#btn-dispatch").addEventListener("click", () => {
      this.dispatchEmergencyResponse();
      app.autoFocusCamera(5);
    });
  }
}

// ─── App Controller ─────────────────────────────────────────────────────────

class App {
  constructor() {
    this.canvas = document.getElementById("canvas");
    const params = new URLSearchParams(window.location.search);
    const camParam = Number(params.get("cam")) || 1;
    const autoTrackParam = params.get("autotrack") === "0" ? false : true;
    this.currentCamId = CCTV_FEEDS[camParam] ? camParam : 1;
    this.autoTrack = autoTrackParam;
    this.sim = null;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x0a0e17);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;

    this.sim = new SmartCitySimulation();
    this.sim.init(this.scene);
    this.sim.renderControls(document.getElementById("control-panel"));

this.bindUI();
    this.switchCamera(this.currentCamId);
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    this.animate();
  }

  bindUI() {
    document.querySelectorAll(".cctv-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cctv-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.switchCamera(Number(btn.dataset.cam));
      });
    });

    const resetBtns = [document.getElementById("btn-reset"), document.getElementById("btn-reset-sidebar")];
    resetBtns.forEach((btn) => {
      if (btn) {
        btn.addEventListener("click", () => {
          this.sim.reset();
          this.updateSubsystemGauges();
          this.switchCamera(1);
        });
      }
    });

    const chkAuto = document.getElementById("chk-auto-track");
    if (chkAuto) {
      chkAuto.checked = this.autoTrack;
      chkAuto.addEventListener("change", (e) => {
        this.autoTrack = e.target.checked;
      });
    }
  }

  switchCamera(camId) {
    this.currentCamId = camId;
    const feed = CCTV_FEEDS[camId];
    this.camera.position.copy(feed.pos);
    this.controls.target.copy(feed.target);
    this.controls.update();

    document.getElementById("camera-badge").innerHTML = `<span class="cam-rec"></span> ${feed.name}`;
  }

  autoFocusCamera(camId) {
    if (this.autoTrack) {
      document.querySelectorAll(".cctv-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.cam) === camId);
      });
      this.switchCamera(camId);
    }
  }

  updateSubsystemGauges() {
    const statusTraffic = document.getElementById("status-traffic");
    const statusGrid = document.getElementById("status-grid");
    const statusWater = document.getElementById("status-water");
    const statusRoad = document.getElementById("status-road");
    const sceneTag = document.getElementById("scene-tag");

    if (this.sim.trafficState === "NORMAL") {
      statusTraffic.textContent = "NORMAL";
      statusTraffic.className = "gauge-badge status-normal";
    } else {
      statusTraffic.textContent = this.sim.trafficState;
      statusTraffic.className = "gauge-badge status-danger";
    }

    if (!this.sim.gridBlackout) {
      statusGrid.textContent = "100% ONLINE";
      statusGrid.className = "gauge-badge status-normal";
    } else {
      statusGrid.textContent = "BLACKOUT";
      statusGrid.className = "gauge-badge status-danger";
    }

    if (!this.sim.waterLeakActive) {
      statusWater.textContent = "STABLE";
      statusWater.className = "gauge-badge status-normal";
    } else {
      statusWater.textContent = "PIPE LEAK";
      statusWater.className = "gauge-badge status-warning";
    }

    if (this.sim.roadDamageLevel === 0) {
      statusRoad.textContent = "INTACT";
      statusRoad.className = "gauge-badge status-normal";
    } else if (this.sim.roadDamageLevel < 4) {
      statusRoad.textContent = `STAGE ${this.sim.roadDamageLevel} DAMAGE`;
      statusRoad.className = "gauge-badge status-warning";
    } else {
      statusRoad.textContent = `STAGE ${this.sim.roadDamageLevel} COLLAPSE`;
      statusRoad.className = "gauge-badge status-danger";
    }

    const isDanger = this.sim.trafficState === "ACCIDENT" || this.sim.gridBlackout || this.sim.roadDamageLevel >= 4;
    sceneTag.textContent = isDanger ? "CRITICAL RISK EVENT" : "SYSTEM OPERATIONAL";
    sceneTag.className = "scene-tag" + (isDanger ? " danger" : "");
  }

  onResize() {
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = this.clock.getDelta();

    if (this.sim) {
      this.sim.update(dt);
      this.updateSubsystemGauges();
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

const app = new App();
