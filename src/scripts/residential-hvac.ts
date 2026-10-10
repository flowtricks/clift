import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Point = [number, number, number];

export function createResidentialHvac(host: HTMLElement) {
  const theme = getComputedStyle(host);
  const read = (name: string) => new THREE.Color(theme.getPropertyValue(name).trim());
  const ink = read("--dark-900");
  const orange = read("--accent-500");
  const paper = read("--light-300");
  const blue = read("--blue-500");
  const pale = read("--light-200");
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(ink, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const camera = new THREE.OrthographicCamera(-7, 7, 5, -5, 0.1, 70);
  const cameraHome = new THREE.Vector3(10, 8.2, 14);
  const target = new THREE.Vector3(0.15, 1.65, 0);
  const cameraClose = new THREE.Vector3(3.9, 14.5, 14.3);
  const equipmentTarget = new THREE.Vector3(-1.9, 1.7, 0.3);
  const cameraTarget = new THREE.Vector3();
  const cameraPan = new THREE.Vector3();
  const orbitHome = new THREE.Spherical().setFromVector3(cameraHome.clone().sub(target));
  const orbitClose = new THREE.Spherical().setFromVector3(cameraClose.clone().sub(equipmentTarget));
  const orbitOverhead = new THREE.Spherical().setFromVector3(new THREE.Vector3(1.2, 20, 1.6));
  const overheadTarget = new THREE.Vector3(0.15, 0.4, 0);
  const orbitIntro = new THREE.Spherical().setFromVector3(new THREE.Vector3(19, 8, -5));
  const cameraOrbit = new THREE.Spherical();
  const framingCenter = new THREE.Vector2();
  const framingSize = new THREE.Vector2(7, 5);
  let introStarted: number | undefined;
  let cameraProgress = 0;
  let cameraGoal = 0;
  let mobileCamera = false;
  let coverProgress = 0;
  let coverGoal = 0;
  camera.position.copy(cameraHome);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const track = <T extends THREE.BufferGeometry>(geometry: T) => { geometries.add(geometry); return geometry; };
  const steps = new THREE.DataTexture(new Uint8Array([65, 150, 255]), 3, 1, THREE.RedFormat);
  steps.minFilter = steps.magFilter = THREE.NearestFilter;
  steps.needsUpdate = true;
  const makeMaterial = (color: THREE.Color) => {
    const material = new THREE.MeshToonMaterial({ color, gradientMap: steps });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.illustrationInk = { value: ink };
      shader.fragmentShader = "uniform vec3 illustrationInk;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
        float lightLevel = dot(reflectedLight.directDiffuse, vec3(0.3333)) / max(dot(diffuseColor.rgb, vec3(0.3333)), 0.0001);
        float tone = lightLevel < 0.05 ? 0.035 : (lightLevel < 0.3 ? 0.24 : (lightLevel < 0.6 ? 0.65 : 1.0));
        outgoingLight = mix(illustrationInk, diffuseColor.rgb, tone);
        #include <opaque_fragment>
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <colorspace_fragment>", `
        #include <colorspace_fragment>
        float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor.rgb += (grain - 0.5) * 0.035;
      `);
    };
    materials.add(material);
    return material;
  };
  const mat = {
    ink: makeMaterial(ink), paper: makeMaterial(paper), orange: makeMaterial(orange),
    blue: makeMaterial(blue), pale: makeMaterial(pale),
    muted: makeMaterial(pale.clone().lerp(ink, 0.33)),
  };
  const lineMat = new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.8 });
  materials.add(lineMat);
  const cube = track(new THREE.BoxGeometry(1, 1, 1));
  const cubeEdges = track(new THREE.EdgesGeometry(cube));
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = world, outlined = true) => {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = item.receiveShadow = true;
    if (outlined) item.add(new THREE.LineSegments(geometry === cube ? cubeEdges : track(new THREE.EdgesGeometry(geometry, 35)), lineMat));
    parent.add(item);
    return item;
  };
  const box = (size: Point, position: Point, material = mat.paper, parent: THREE.Object3D = world, outlined = true) => {
    const item = mesh(cube, material, parent, outlined);
    item.scale.set(...size);
    item.position.set(...position);
    return item;
  };
  const cylinder = (radius: number, height: number, position: Point, material = mat.paper, parent: THREE.Object3D = world, segments = 24) => {
    const item = mesh(track(new THREE.CylinderGeometry(radius, radius, height, segments)), material, parent);
    item.position.set(...position);
    return item;
  };
  const path = (points: Point[], radius: number, material: THREE.Material, parent: THREE.Object3D = world) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    const item = mesh(track(new THREE.TubeGeometry(curve, points.length * 8, radius, 6, false)), material, parent, false);
    return { item, curve };
  };
  const line = (points: Point[], parent: THREE.Object3D = world) => {
    const item = new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)))), lineMat);
    parent.add(item);
    return item;
  };
  const fan = (radius: number, position: Point, horizontal: boolean, parent: THREE.Object3D = world) => {
    const assembly = new THREE.Group();
    assembly.position.set(...position);
    if (!horizontal) assembly.rotation.x = Math.PI / 2;
    parent.add(assembly);
    cylinder(radius, 0.035, [0, 0, 0], mat.ink, assembly);
    const rotor = new THREE.Group();
    rotor.userData.dynamic = true;
    rotor.position.y = 0.032;
    assembly.add(rotor);
    for (let i = 0; i < 5; i++) {
      const bladeRoot = new THREE.Group();
      bladeRoot.rotation.y = i * Math.PI * 2 / 5;
      rotor.add(bladeRoot);
      const blade = box([radius * 0.72, 0.018, radius * 0.28], [radius * 0.48, 0, 0.07], mat.pale, bladeRoot);
      blade.rotation.y = -0.42;
      blade.castShadow = false;
    }
    cylinder(radius * 0.19, 0.05, [0, 0.06, 0], mat.orange, assembly);
    for (let i = 1; i <= 3; i++) {
      const ring = mesh(track(new THREE.TorusGeometry(radius * (0.23 + i * 0.23), 0.009, 4, 40)), mat.muted, assembly, false);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.092;
      ring.castShadow = false;
    }
    return rotor;
  };

  type RepairPart = {
    id: string; label: string; group: THREE.Group; home: THREE.Vector3;
    damage: THREE.Group; damageMaterial: THREE.MeshBasicMaterial;
    paints: { material: THREE.MeshToonMaterial; clean: THREE.Color; dirty: THREE.Color }[];
    state: "broken" | "repairing" | "repaired"; progress: number; hover: number;
    button: HTMLButtonElement;
  };
  const parts: RepairPart[] = [];
  const capture = () => new Set(world.children);
  const finishPart = (before: Set<THREE.Object3D>, id: string, label: string, center: Point) => {
    const objects = world.children.filter(object => !before.has(object));
    const group = new THREE.Group();
    group.position.set(...center);
    group.userData.dynamic = true;
    group.userData.repairId = id;
    world.add(group);
    world.updateMatrixWorld(true);
    objects.forEach(object => group.attach(object));
    const paints: RepairPart["paints"] = [];
    const copies = new Map<THREE.Material, THREE.MeshToonMaterial>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshToonMaterial)) return;
      const original = object.material;
      let copy = copies.get(original);
      if (!copy) {
        copy = original.clone();
        copy.onBeforeCompile = original.onBeforeCompile;
        materials.add(copy);
        copies.set(original, copy);
        paints.push({ material: copy, clean: original.color.clone(), dirty: original.color.clone().lerp(ink, 0.2) });
      }
      object.material = copy;
    });
    const damage = new THREE.Group();
    damage.userData.dynamic = true;
    group.add(damage);
    const damageMaterial = new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 1, depthWrite: false });
    materials.add(damageMaterial);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "residential-hvac_repair";
    button.textContent = `Repair ${label}`;
    button.dataset.part = id;
    button.dataset.state = "broken";
    button.disabled = true;
    host.append(button);
    const part: RepairPart = { id, label, group, home: group.position.clone(), damage, damageMaterial, paints, state: "broken", progress: 0, hover: 0, button };
    parts.push(part);
    return part;
  };
  const crack = (part: RepairPart, points: Point[]) => {
    for (let i = 1; i < points.length; i++) {
      const start = new THREE.Vector3(...points[i - 1]).sub(part.home);
      const end = new THREE.Vector3(...points[i]).sub(part.home);
      const stroke = mesh(track(new THREE.CylinderGeometry(0.012, 0.012, start.distanceTo(end), 4)), part.damageMaterial, part.damage, false);
      stroke.position.copy(start).lerp(end, 0.5);
      stroke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
      stroke.castShadow = stroke.receiveShadow = false;
    }
  };

  // Cutaway home and window light.
  box([10.8, 0.16, 6.6], [0, -0.12, 0], mat.paper);
  box([5.65, 0.08, 5.45], [2.15, 0, -0.25], mat.pale);
  box([3.08, 0.025, 5.9], [-3.84, -0.018, 0], mat.muted);
  box([0.16, 0.2, 6.1], [-2.23, 0.08, 0], mat.paper);
  box([0.16, 2.9, 0.75], [-2.23, 1.45, -2.53], mat.paper);
  for (let x = -0.55; x <= 5; x += 0.46) line([[x, 0.047, -2.94], [x, 0.047, 2.47]]);
  box([3.75, 4.05, 0.12], [1.125, 2.065, -2.88], mat.paper);
  box([0.48, 4.05, 0.12], [4.96, 2.065, -2.88], mat.paper);
  box([1.72, 1, 0.12], [3.86, 0.54, -2.88], mat.paper);
  box([1.72, 0.64, 0.12], [3.86, 3.77, -2.88], mat.paper);
  box([5.95, 0.09, 0.23], [2.23, 4.12, -2.88], mat.pale);
  box([5.9, 0.14, 0.055], [2.23, 0.12, -2.78], mat.ink);
  box([0.1, 4.05, 1.25], [5.16, 2.065, -2.25], mat.blue);
  for (const x of [3.02, 3.86, 4.7]) box([0.055, 2.45, 0.12], [x, 2.265, -2.85], mat.ink);
  for (const y of [1.04, 2.27, 3.49]) box([1.75, 0.055, 0.13], [3.86, y, -2.84], mat.ink);
  box([1.91, 0.09, 0.32], [3.86, 1.01, -2.75], mat.paper);
  const glass = new THREE.MeshBasicMaterial({ color: pale, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  materials.add(glass);
  const pane = mesh(track(new THREE.PlaneGeometry(1.64, 2.4)), glass, world, false);
  pane.position.set(3.86, 2.27, -2.89);
  pane.castShadow = false;

  // Living room.
  box([3.5, 0.018, 2.65], [2.63, 0.06, 0.15], mat.paper);
  for (const x of [1.35, 3.91]) for (const z of [-1.03, -0.1]) box([0.065, 0.32, 0.065], [x, 0.23, z], mat.ink);
  box([2.92, 0.24, 1.16], [2.63, 0.46, -0.59], mat.orange);
  box([2.92, 0.76, 0.2], [2.63, 0.98, -1.13], mat.orange);
  for (const x of [1.26, 4.0]) box([0.2, 0.51, 1.21], [x, 0.76, -0.58], mat.orange);
  for (const x of [1.98, 3.28]) {
    box([1.23, 0.17, 0.91], [x, 0.67, -0.5], mat.orange);
    const cushion = box([1.2, 0.55, 0.15], [x, 1.03, -0.98], mat.orange);
    cushion.rotation.x = -0.12;
  }
  const pillow = new THREE.Group();
  pillow.position.set(1.85, 1.02, -0.62);
  pillow.rotation.z = -0.2;
  pillow.userData.dynamic = true;
  world.add(pillow);
  box([0.58, 0.55, 0.22], [0, 0, 0], mat.paper, pillow);
  box([0.11, 0.49, 0.014], [0, 0, 0.117], mat.blue, pillow, false);
  box([1.75, 0.065, 0.84], [2.6, 0.64, 1.2], mat.paper);
  for (const x of [1.86, 3.34]) for (const z of [0.91, 1.49]) box([0.048, 0.54, 0.048], [x, 0.33, z], mat.ink);
  box([0.55, 0.035, 0.36], [2.45, 0.7, 1.23], mat.blue);
  const book = new THREE.Group();
  book.position.set(2.4, 0.73, 1.23);
  book.rotation.y = -0.16;
  book.userData.dynamic = true;
  world.add(book);
  box([0.65, 0.018, 0.46], [0, 0, 0], mat.blue, book);
  box([0.61, 0.055, 0.42], [0, 0.035, 0], mat.paper, book);
  for (let i = 0; i < 4; i++) box([0.34, 0.003, 0.012], [0.04, 0.065, -0.12 + i * 0.065], mat.muted, book, false);
  const bookCover = new THREE.Group();
  bookCover.position.set(-0.325, 0.075, 0);
  book.add(bookCover);
  box([0.65, 0.018, 0.46], [0.325, 0, 0], mat.blue, bookCover);
  box([0.32, 0.006, 0.06], [0.34, 0.012, -0.08], mat.orange, bookCover, false);
  cylinder(0.075, 0.13, [3.01, 0.74, 1.17], mat.orange);
  cylinder(0.26, 0.48, [4.68, 0.3, 0.05], mat.ink);
  cylinder(0.245, 0.028, [4.68, 0.55, 0.05], mat.orange);
  const leaves: { pivot: THREE.Group; direction: THREE.Vector3; center: THREE.Vector3; bend: THREE.Vector2; velocity: THREE.Vector2 }[] = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4;
    const height = 0.85 + (i % 3) * 0.33;
    const end: Point = [4.68 + Math.sin(angle) * 0.37, height + 0.45, 0.05 + Math.cos(angle) * 0.32];
    path([[4.68, 0.54, 0.05], [4.68, height * 0.8, 0.05], end], 0.014, mat.ink);
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(-0.34, 0.28, -0.22, 0.62, 0, 0.8);
    leafShape.bezierCurveTo(0.3, 0.54, 0.24, 0.19, 0, 0);
    const leafMat = i % 2 ? mat.blue : mat.pale;
    leafMat.side = THREE.DoubleSide;
    const pivot = new THREE.Group();
    pivot.position.set(...end);
    pivot.userData.dynamic = true;
    world.add(pivot);
    const leaf = mesh(track(new THREE.ShapeGeometry(leafShape, 5)), leafMat, pivot, false);
    leaf.rotation.set(0.15, angle, Math.sin(angle) * 0.65);
    line([[0, 0, 0.008], [0, 0.69, 0.008]], leaf);
    const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(leaf.quaternion);
    leaves.push({ pivot, direction, center: direction.clone().multiplyScalar(0.42).add(pivot.position), bend: new THREE.Vector2(), velocity: new THREE.Vector2() });
  }
  box([1.0, 2.8, 0.14], [4.65, 1.44, 2.03], mat.paper);
  box([1.08, 0.07, 0.2], [4.65, 2.87, 2.03], mat.pale);
  box([1.0, 0.12, 0.04], [4.65, 0.14, 2.12], mat.ink);
  box([0.28, 0.4, 0.055], [4.65, 1.88, 2.13], mat.paper);
  box([0.18, 0.16, 0.02], [4.65, 1.93, 2.17], mat.ink);
  box([0.08, 0.022, 0.021], [4.65, 1.93, 2.19], mat.orange, world, false);


  type RoomProp = {
    id: string; group: THREE.Group; button: HTMLButtonElement;
  };
  const roomProps: RoomProp[] = [
    { id: "pillow", group: pillow, label: "Fluff couch pillow" },
    { id: "book", group: book, label: "View coffee-table book" },
  ].map(({ id, group, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "residential-hvac_repair";
    button.textContent = label;
    button.dataset.part = id;
    if (id === "book") button.setAttribute("aria-expanded", "false");
    host.append(button);
    return { id, group, button };
  });
  const pillowHome = pillow.position.clone();
  let pillowProgress = 1;
  let pillowFluffed = false;
  let pillowActive = false;
  let bookOpen = false;

  // Condenser and refrigerant lines.
  box([2.28, 0.12, 1.98], [-3.71, 0.08, 1.34], mat.paper);
  const condenserStart = capture();
  box([1.9, 1.57, 1.62], [-3.71, 0.91, 1.34], mat.pale);
  box([1.68, 1.24, 0.025], [-3.71, 0.9, 2.163], mat.ink);
  for (let i = 0; i < 20; i++) box([0.022, 1.18, 0.042], [-4.5 + i * 0.083, 0.9, 2.2], mat.paper, world, false);
  box([0.025, 1.24, 1.42], [-2.745, 0.9, 1.34], mat.ink);
  for (let i = 0; i < 17; i++) box([0.04, 1.18, 0.022], [-2.72, 0.9, 0.66 + i * 0.083], mat.paper, world, false);
  const condenserLidStart = capture();
  box([1.98, 0.085, 1.7], [-3.71, 1.735, 1.34], mat.paper);
  const condenserRotor = fan(0.67, [-3.71, 1.79, 1.34], true);
  const condenserLidPieces = world.children.filter(object => !condenserLidStart.has(object));
  const condenserLid = new THREE.Group();
  condenserLid.position.set(-3.71, 1.735, 1.34);
  condenserLid.userData.dynamic = true;
  world.add(condenserLid);
  world.updateMatrixWorld(true);
  condenserLidPieces.forEach(object => condenserLid.attach(object));
  box([0.3, 0.15, 0.02], [-4.26, 1.38, 2.207], mat.orange);
  const condenserPart = finishPart(condenserStart, "condenser", "outdoor condenser", [-3.71, 0.91, 1.34]);
  const condenserLidHome = condenserLid.position.clone();
  let condenserSpeed = 0;
  const restartRings = Array.from({ length: 2 }, () => {
    const material = new THREE.MeshBasicMaterial({ color: pale, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    materials.add(material);
    const ring = mesh(track(new THREE.RingGeometry(0.71, 0.735, 48)), material, world, false);
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = ring.receiveShadow = false;
    ring.visible = false;
    return ring;
  });
  crack(condenserPart, [[-4.28, 1.55, 2.23], [-4.13, 1.28, 2.23], [-4.25, 1.1, 2.23], [-4.05, 0.9, 2.23], [-4.12, 0.65, 2.23]]);
  crack(condenserPart, [[-4.25, 1.1, 2.23], [-4.46, 1.0, 2.23]]);
  path([[-2.73, 0.44, 1], [-2.46, 0.26, 0.94], [-2.4, 0.18, -0.15], [-1.95, 0.18, -0.56], [-1.77, 1.04, -0.6]], 0.045, mat.ink);
  path([[-2.73, 0.36, 1.2], [-2.26, 0.2, 1.15], [-2.17, 0.16, -0.15], [-1.82, 0.18, -0.35], [-1.72, 1.16, -0.35]], 0.028, mat.orange);

  box([0.11, 1.7, 0.13], [-2.65, 0.86, -0.45], mat.muted);
  box([0.5, 0.65, 0.23], [-2.65, 1.6, -0.4], mat.paper);
  box([0.45, 0.59, 0.035], [-2.65, 1.6, -0.26], mat.pale);
  box([0.06, 0.18, 0.045], [-2.49, 1.57, -0.225], mat.ink);
  box([0.17, 0.06, 0.025], [-2.72, 1.75, -0.23], mat.orange);
  path([[-2.65, 1.28, -0.4], [-2.65, 0.8, -0.4], [-2.86, 0.54, -0.05], [-3.04, 0.55, 0.53]], 0.035, mat.muted);

  // Open air-handler cabinet: blower, A-coil and filter.
  box([1.8, 0.16, 1.55], [-1.05, 0.14, -0.92], mat.paper);
  box([1.65, 2.85, 0.1], [-1.05, 1.65, -1.62], mat.ink);
  box([0.08, 2.85, 1.35], [-1.87, 1.65, -0.96], mat.paper);
  box([0.08, 2.85, 1.35], [-0.23, 1.65, -0.96], mat.blue);
  box([1.72, 0.09, 1.45], [-1.05, 3.08, -0.96], mat.paper);
  for (const y of [0.26, 1.47, 3.05]) box([1.72, 0.055, 0.09], [-1.05, y, -0.24], mat.paper);
  for (const x of [-1.87, -0.23]) box([0.055, 2.85, 0.09], [x, 1.65, -0.24], mat.paper);
  const blowerRotor = new THREE.Group();
  blowerRotor.userData.dynamic = true;
  blowerRotor.position.set(-1.05, 2.25, -0.69);
  world.add(blowerRotor);
  for (const z of [-0.29, 0.29]) {
    const rim = mesh(track(new THREE.TorusGeometry(0.43, 0.028, 5, 32)), mat.pale, blowerRotor, false);
    rim.position.z = z;
  }
  for (let i = 0; i < 28; i++) {
    const angle = i * Math.PI * 2 / 28;
    const blade = box([0.025, 0.11, 0.57], [Math.cos(angle) * 0.41, Math.sin(angle) * 0.41, 0], mat.pale, blowerRotor, false);
    blade.rotation.z = angle + 0.38;
    blade.castShadow = false;
  }
  const motor = cylinder(0.14, 0.38, [0, 0, 0], mat.orange, blowerRotor);
  motor.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    const spoke = box([0.37, 0.022, 0.022], [Math.cos(angle) * 0.2, Math.sin(angle) * 0.2, 0.29], mat.muted, blowerRotor, false);
    spoke.rotation.z = angle;
  }
  box([1.24, 1.19, 0.06], [-1.05, 2.25, -1.05], mat.muted);
  const scroll = mesh(track(new THREE.TorusGeometry(0.56, 0.07, 6, 32, Math.PI * 1.75)), mat.paper);
  scroll.position.set(-1.05, 2.25, -0.34);
  scroll.rotation.z = Math.PI * 0.45;
  box([0.44, 0.5, 0.72], [-0.74, 2.88, -0.7], mat.pale);
  box([1.55, 0.055, 0.2], [-1.05, 1.68, -1.4], mat.pale);
  for (const side of [-1, 1]) {
    const coil = new THREE.Group();
    coil.position.set(-1.05 + side * 0.22, 1.1, -0.73);
    coil.rotation.z = side * 0.48;
    world.add(coil);
    box([0.13, 0.86, 0.86], [0, 0, 0], mat.orange, coil);
    for (let i = 0; i < 12; i++) box([0.16, 0.022, 0.89], [0, -0.38 + i * 0.069, 0], mat.pale, coil, false);
    for (let i = 0; i < 4; i++) cylinder(0.035, 0.84, [0.09, 0, -0.33 + i * 0.22], mat.orange, coil, 8);
  }
  for (const x of [-1.66, -0.44]) box([0.22, 0.075, 1.18], [x, 0.65, -0.92], mat.muted);
  box([1.44, 0.075, 0.13], [-1.05, 0.65, -0.3], mat.muted);
  path([[-1.65, 0.65, -0.3], [-1.83, 0.65, -0.13], [-1.88, 0.28, 0.05], [-2.04, 0.28, 0.1], [-2.12, 0.48, 0.14], [-2.39, 0.46, 0.17], [-2.46, 0.3, 2.8], [-2.46, 0.24, 3.25]], 0.032, mat.paper);
  box([0.46, 0.045, 0.48], [-2.46, 0.015, 3.05], mat.muted);
  for (let i = 0; i < 5; i++) box([0.34, 0.012, 0.025], [-2.46, 0.044, 2.9 + i * 0.075], mat.ink, world, false);
  const filter = new THREE.Group();
  filter.position.set(-1.05, 0.51, -0.91);
  filter.rotation.x = -Math.PI / 2;
  world.add(filter);
  box([1.46, 1.24, 0.045], [0, 0, 0], mat.paper, filter);
  for (let i = 0; i < 18; i++) {
    const pleat = box([0.035, 1.12, 0.07], [-0.65 + i * 0.077, 0, 0.035], i % 2 ? mat.pale : mat.muted, filter, false);
    pleat.rotation.y = 0.28;
  }
  for (const x of [-0.73, 0.73]) box([0.055, 1.29, 0.1], [x, 0, 0.025], mat.orange, filter);
  for (const y of [-0.62, 0.62]) box([1.51, 0.055, 0.1], [0, y, 0.025], mat.orange, filter);
  box([0.25, 0.055, 0.08], [-1.05, 0.51, -0.22], mat.orange);

  // Low return grille and duct feed the filter below the coil.
  box([1.53, 0.22, 1.28], [-1.05, 0.35, -0.94], mat.pale);
  const filterStart = capture();
  box([1.42, 0.63, 1.25], [0.37, 0.43, -0.94], mat.pale);
  box([1.42, 0.76, 0.13], [0.37, 0.47, -0.27], mat.paper);
  for (let i = 0; i < 8; i++) box([1.22, 0.034, 0.055], [0.37, 0.2 + i * 0.077, -0.18], mat.ink, world, false);

  const filterPart = finishPart(filterStart, "filter", "filter and return grille", [-0.45, 0.48, -0.65]);
  crack(filterPart, [[-0.18, 0.76, -0.135], [0.04, 0.56, -0.135], [-0.02, 0.43, -0.135], [0.19, 0.26, -0.135]]);
  for (let i = 0; i < 9; i++) {
    const dirt = mesh(track(new THREE.SphereGeometry(0.07 + (i % 3) * 0.012, 6, 4)), filterPart.damageMaterial, filterPart.damage, false);
    dirt.position.set(0.12 + (i % 3) * 0.26 - filterPart.home.x, 0.27 + Math.floor(i / 3) * 0.17 - filterPart.home.y, -0.14 - filterPart.home.z);
    dirt.scale.set(1, 0.6, 0.18);
    dirt.castShadow = false;
  }

  // Interior ceiling chase and its room-facing supply register.
  box([0.75, 0.73, 0.72], [-1.05, 3.49, -0.99], mat.pale);
  box([0.75, 0.52, 1.55], [-1.05, 3.6, -1.6], mat.pale);
  box([3.1, 0.9, 0.92], [0.05, 3.59, -2.34], mat.paper);
  box([3.18, 0.07, 1.0], [0.05, 4.075, -2.34], mat.pale);
  box([3.1, 0.045, 0.92], [0.05, 3.12, -2.34], mat.pale);
  const ventStart = capture();
  box([1.45, 0.59, 0.13], [0.62, 3.55, -1.81], mat.paper);
  for (let i = 0; i < 6; i++) box([1.26, 0.025, 0.045], [0.62, 3.35 + i * 0.074, -1.72], mat.ink, world, false);

  const ventPart = finishPart(ventStart, "vent", "supply vent", [0.62, 3.55, -1.81]);
  crack(ventPart, [[0.1, 3.82, -1.675], [0.28, 3.69, -1.675], [0.23, 3.58, -1.675], [0.4, 3.48, -1.675]]);

  const flows: { curve: THREE.CatmullRomCurve3; arrow: THREE.Mesh; material: THREE.LineDashedMaterial; offset: number; part: RepairPart; elapsed: number }[] = [];
  const airflow = (points: Point[], color: THREE.Color, offset: number, part: RepairPart) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const flowMaterial = new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.2, dashSize: 0.1, gapSize: 0.09 });
    const arrowMaterial = new THREE.MeshBasicMaterial({ color });
    materials.add(flowMaterial); materials.add(arrowMaterial);
    const streamline = new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48))), flowMaterial);
    streamline.computeLineDistances();
    world.add(streamline);
    const arrow = mesh(track(new THREE.ConeGeometry(0.065, 0.2, 3)), arrowMaterial, world, false);
    arrow.userData.dynamic = true;
    arrow.castShadow = false;
    arrow.visible = false;
    flows.push({ curve, arrow, material: flowMaterial, offset, part, elapsed: 0 });
  };
  for (let i = 0; i < 2; i++) {
    airflow([[0.3 + i * 0.5, 3.52, -1.65], [0.65 + i * 0.5, 3.08, -1.05], [1.4 + i * 0.5, 2.6, -0.3], [2.4 + i * 0.5, 2.0, 0.5]], blue, i / 2, ventPart);
    airflow([[2.9 + i * 0.5, 1.4, 1.85], [1.5 + i * 0.3, 1.0, 1.45], [0.2 + i * 0.45, 0.65, 0.75], [0.15 + i * 0.45, 0.48, -0.1]], pale, i / 2, filterPart);
    airflow([[-4.05 + i * 0.65, 1.98, 1.34], [-4.05 + i * 0.65, 2.45, 1.34], [-4.2 + i * 0.85, 3.05, 1.34]], orange, i / 2, condenserPart);
  }

  const ambient = new THREE.HemisphereLight(pale, ink, 1.75);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 2.25);
  sun.position.set(-3, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  // Batch static pieces so the illustrated detail stays inexpensive to draw.
  const batch = (root: THREE.Group) => {
    world.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const buckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[]; shadow: boolean }>();
    const outlines: THREE.BufferGeometry[] = [];
    const originals: THREE.Object3D[] = [];
    const collect = (object: THREE.Object3D) => {
      if (object.userData.dynamic) return;
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshToonMaterial && !object.material.transparent) {
        const key = `${object.material.uuid}:${object.castShadow}`;
        if (!buckets.has(key)) buckets.set(key, { material: object.material, geometries: [], shadow: object.castShadow });
        buckets.get(key)!.geometries.push(object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld)));
        originals.push(object);
      } else if (object instanceof THREE.LineSegments && object.material === lineMat) {
        outlines.push(object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld)));
        originals.push(object);
      }
      [...object.children].forEach(collect);
    };
    [...root.children].forEach(collect);
    originals.forEach((object) => object.removeFromParent());
    for (const bucket of buckets.values()) {
      const merged = mergeGeometries(bucket.geometries);
      bucket.geometries.forEach((geometry) => geometry.dispose());
      if (merged) {
        const combined = mesh(track(merged), bucket.material, root, false);
        combined.castShadow = bucket.shadow;
      }
    }
    const mergedEdges = mergeGeometries(outlines);
    outlines.forEach((geometry) => geometry.dispose());
    if (mergedEdges) root.add(new THREE.LineSegments(track(mergedEdges), lineMat));

  };
  parts.forEach(part => batch(part.group));
  batch(world);

  let alive = true;
  let visible = false;
  let frame = 0;
  let last = 0;
  let elapsed = 0;
  const pointer = new THREE.Vector2();
  const smoothed = new THREE.Vector2();
  let plantPointerActive = false;
  const leafScreen = new THREE.Vector3();
  const screenRight = new THREE.Vector3();
  const screenUp = new THREE.Vector3();
  const bentDirection = new THREE.Vector3();
  const leafForce = new THREE.Vector2();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const updateLeaves = (dt: number) => {
    camera.updateMatrixWorld();
    screenRight.setFromMatrixColumn(camera.matrixWorld, 0);
    screenUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const width = host.clientWidth;
    const height = host.clientHeight;
    const radius = Math.max(30, height / (camera.top - camera.bottom) * camera.zoom * 0.95);
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const step = dt / steps;
    for (const leaf of leaves) {
      leafForce.set(0, 0);
      if (plantPointerActive && !motion.matches) {
        leafScreen.copy(leaf.center).project(camera);
        leafForce.set((leafScreen.x - pointer.x) * width / 2, (leafScreen.y - pointer.y) * height / 2);
        const distance = leafForce.length();
        if (distance < radius) {
          if (distance < 0.01) leafForce.set(1, 0);
          leafForce.normalize().multiplyScalar(Math.pow(1 - distance / radius, 2) * 1.25);
        } else leafForce.set(0, 0);
      }
      const previousX = leaf.bend.x;
      const previousY = leaf.bend.y;
      if (motion.matches) { leaf.bend.set(0, 0); leaf.velocity.set(0, 0); }
      else for (let i = 0; i < steps; i++) {
        leaf.velocity.x += ((leafForce.x - leaf.bend.x) * 160 - leaf.velocity.x * 13) * step;
        leaf.velocity.y += ((leafForce.y - leaf.bend.y) * 160 - leaf.velocity.y * 13) * step;
        leaf.bend.addScaledVector(leaf.velocity, step);
      }
      bentDirection.copy(leaf.direction).addScaledVector(screenRight, leaf.bend.x).addScaledVector(screenUp, leaf.bend.y).normalize();
      leaf.pivot.quaternion.setFromUnitVectors(leaf.direction, bentDirection);
      if (Math.abs(previousX - leaf.bend.x) + Math.abs(previousY - leaf.bend.y) > 0.0005) renderer.shadowMap.needsUpdate = true;
    }
  };
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
  materials.add(sparkMaterial);
  const sparks = new THREE.InstancedMesh(cube, sparkMaterial, 144);
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false;
  sparks.count = 0;
  world.add(sparks);
  const sparkPool = Array.from({ length: 144 }, () => ({
    position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    color: new THREE.Color(), age: 0, life: 0, width: 0,
  }));
  const sparkTransform = new THREE.Object3D();
  const sparkAxis = new THREE.Vector3(0, 1, 0);
  const sparkDirection = new THREE.Vector3();
  const emitSparks = (part: RepairPart, count: number, strength: number) => {
    if (motion.matches) return;
    const origin: Point = part.id === "condenser" ? [-3.71, 1.6, 2.24] : part.id === "filter" ? [0.37, 0.5, -0.1] : [0.62, 3.55, -1.63];
    for (const spark of sparkPool) {
      if (count === 0) break;
      if (spark.age < spark.life) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.2 + Math.random() * 2.4) * strength;
      spark.position.set(...origin);
      spark.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed + 1.2, 0.7 + Math.random() * strength);
      spark.color.copy(Math.random() < 0.25 ? paper : orange);
      spark.age = 0;
      spark.life = 0.35 + Math.random() * 0.35;
      spark.width = 0.018 + Math.random() * 0.018;
      count--;
    }
  };
  const updateSparks = (dt: number) => {
    let count = 0;
    for (const spark of sparkPool) {
      if (motion.matches) spark.age = spark.life;
      if (spark.age >= spark.life) continue;
      spark.age += dt;
      if (spark.age >= spark.life) continue;
      spark.velocity.y -= dt * 5;
      spark.position.addScaledVector(spark.velocity, dt);
      const fade = Math.pow(1 - spark.age / spark.life, 0.65);
      sparkTransform.position.copy(spark.position);
      sparkDirection.copy(spark.velocity).normalize();
      sparkTransform.quaternion.setFromUnitVectors(sparkAxis, sparkDirection);
      sparkTransform.scale.set(spark.width * fade, (0.08 + spark.velocity.length() * 0.035) * fade, spark.width * fade);
      sparkTransform.updateMatrix();
      sparks.setMatrixAt(count, sparkTransform.matrix);
      sparks.setColorAt(count, spark.color);
      count++;
    }
    sparks.count = count;
    if (count) {
      sparks.instanceMatrix.needsUpdate = true;
      if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    }
  };
  const controller = new AbortController();
  const options = { signal: controller.signal };
  host.addEventListener("hero-scroll-progress", event => {
    const detail = (event as CustomEvent<{ progress: number; covered: number; mobile: boolean }>).detail;
    const progress = THREE.MathUtils.clamp(detail.progress, 0, 1);
    mobileCamera = detail.mobile;
    cameraGoal = Math.sin(progress * Math.PI / 2);
    coverGoal = THREE.MathUtils.clamp(detail.covered, 0, 1);
    wake();
  }, options);
  const rotationAxis = new THREE.Vector3(0, 1, 0);
  const raycaster = new THREE.Raycaster();
  const hitPointer = new THREE.Vector2();
  const pickTargets: THREE.Mesh[] = [];
  type InteractivePart = RepairPart | RoomProp;
  const interactives: InteractivePart[] = [...parts, ...roomProps];
  interactives.forEach(part => {
    part.group.userData.interactionId = part.id;
    part.group.traverse(object => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshToonMaterial) pickTargets.push(object);
    });
  });
  const announcement = document.createElement("p");
  announcement.className = "sr-only";
  announcement.setAttribute("role", "status");
  host.append(announcement);
  let hovered: InteractivePart | undefined;
  let focused: InteractivePart | undefined;
  const setHovered = (part?: InteractivePart) => {
    hovered = part && (!("state" in part) || part.state === "broken") ? part : undefined;
    host.dataset.hoveredPart = hovered?.id ?? "";
    host.style.cursor = hovered && "state" in hovered ? "pointer" : "";
    wake();
  };
  const pick = (event: PointerEvent | MouseEvent) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    hitPointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
    world.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(hitPointer, camera);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.interactionId) object = object.parent;
    const exact = interactives.find(part => part.id === object?.userData.interactionId);
    if (exact || !(event instanceof PointerEvent) || event.pointerType !== "touch") return exact;
    let nearest: InteractivePart | undefined;
    let distance = 22;
    interactives.forEach(part => {
      if ("state" in part && part.state !== "broken") return;
      const projected = part.group.getWorldPosition(new THREE.Vector3()).project(camera);
      const x = bounds.left + (projected.x + 1) * bounds.width / 2;
      const y = bounds.top + (1 - projected.y) * bounds.height / 2;
      const delta = Math.hypot(event.clientX - x, event.clientY - y);
      if (delta < distance) { nearest = part; distance = delta; }
    });
    return nearest;
  };
  const repair = (part: RepairPart) => {
    if (!alive || part.state !== "broken") return;
    part.state = "repairing";
    part.progress = motion.matches ? 1 : 0;
    part.button.dataset.state = "repairing";
    part.button.setAttribute("aria-disabled", "true");
    part.button.textContent = `Repairing ${part.label}`;
    announcement.textContent = `Repairing ${part.label}.`;
    emitSparks(part, 12, 0.4);
    if (hovered === part) setHovered();
    if (focused === part) focused = undefined;
    renderer.shadowMap.needsUpdate = true;
    wake();
  };
  const updateParts = (dt: number) => {
    parts.forEach((part, index) => {
      if (part.state === "repairing") {
        const previous = part.progress;
        part.progress = motion.matches ? 1 : Math.min(1, part.progress + dt / 1.4);
        if (previous < 0.3 && part.progress >= 0.3) emitSparks(part, 16, 0.55);
        if (previous < 0.54 && part.progress >= 0.54) emitSparks(part, 38, 0.85);
        renderer.shadowMap.needsUpdate = true;
        if (part.progress === 1) {
          part.state = "repaired";
          part.button.dataset.state = "repaired";
          part.button.textContent = `${part.label} repaired`;
          announcement.textContent = parts.every(item => item.state === "repaired") ? "All parts repaired. The system is running smoothly." : `${part.label} repaired.`;
          renderer.shadowMap.needsUpdate = true;
        }
      }
      const snap = THREE.MathUtils.clamp((part.progress - 0.3) / 0.24, 0, 1);
      const eased = 1 - Math.pow(1 - snap, 3);
      const damage = 1 - eased;
      const stationary = part.id === "filter";
      const settle = THREE.MathUtils.clamp((part.progress - 0.54) / 0.46, 0, 1);
      const anticipation = -0.045 * Math.sin(Math.min(part.progress / 0.18, 1) * Math.PI) * Math.max(0, 1 - part.progress / 0.3);
      const pulse = motion.matches || stationary || part.state !== "repairing" ? 0 : part.progress < 0.54
        ? anticipation : -0.055 * Math.cos(settle * Math.PI * 4) * Math.pow(1 - settle, 3);
      const step = Math.floor(elapsed * 12 + index * 1.7);
      const jitter = motion.matches || stationary ? 0 : Math.sin(step * 12.9898 + index * 7.3) * damage;
      part.group.position.copy(part.home);
      part.group.position.x += jitter * 0.016;
      part.group.position.y += Math.abs(jitter) * 0.008 + pulse;
      part.group.rotation.z = stationary ? 0 : damage * (index % 2 ? -0.025 : 0.025) + jitter * 0.012;
      part.group.rotation.x = jitter * 0.009;
      part.group.scale.set(1 - pulse * 0.35, 1 + pulse * 0.65, 1 - pulse * 0.35);
      part.damage.visible = damage > 0.005;
      part.damageMaterial.opacity = damage;
      const highlight = ((hovered === part || focused === part) && part.state === "broken") ? 1 : 0;
      part.hover = motion.matches ? highlight : THREE.MathUtils.damp(part.hover, highlight, 16, dt);
      const flash = motion.matches ? 0 : Math.pow(1 - settle, 3) * (part.progress >= 0.54 ? 0.7 : 0);
      part.paints.forEach(paint => {
        const dark = paint.clean.r + paint.clean.g + paint.clean.b < 0.12;
        paint.material.color.copy(paint.dirty).lerp(paint.clean, eased)
          .lerp(orange, part.hover * (dark ? 0.3 : 0.88)).lerp(pale, flash * (dark ? 0.3 : 1));
      });
    });
    const progress = condenserPart.progress;
    const lift = motion.matches ? 0 : THREE.MathUtils.smoothstep(progress, 0.1, 0.3)
      * (1 - THREE.MathUtils.smoothstep(progress, 0.42, 0.54));
    condenserLid.position.copy(condenserLidHome);
    condenserLid.position.y += lift * 0.32;
    condenserLid.rotation.z = lift * -0.035;
    restartRings.forEach((ring, index) => {
      const phase = (progress - 0.54 - index * 0.1) / 0.36;
      ring.visible = !motion.matches && phase > 0 && phase < 1;
      if (!ring.visible) return;
      ring.position.set(-3.71, 1.95 + phase * 0.65, 1.34);
      ring.scale.setScalar(1 + phase * 0.9);
      ring.material.opacity = Math.sin(phase * Math.PI) * 0.55;
    });
  };
  let tappedBookOpen = false;
  const bouncePillow = () => {
    if (pillowProgress !== 1) return;
    pillowProgress = motion.matches ? 1 : 0;
    pillowFluffed = !pillowFluffed;
    announcement.textContent = "Couch pillow fluffed.";
    renderer.shadowMap.needsUpdate = true;
  };
  const activate = (part: InteractivePart) => {
    if (!alive) return;
    if ("state" in part) repair(part);
    else if (part.id === "book") tappedBookOpen = !tappedBookOpen;
    else if (part.id === "pillow") bouncePillow();
    wake();
  };
  const updateRoomProps = (dt: number) => {
    const shouldBouncePillow = hovered?.id === "pillow" || focused?.id === "pillow";
    if (shouldBouncePillow && !pillowActive && pillowProgress === 1) {
      bouncePillow();
    }
    pillowActive = shouldBouncePillow;
    const shouldOpenBook = tappedBookOpen || hovered?.id === "book" || focused?.id === "book";
    if (bookOpen !== shouldOpenBook) {
      bookOpen = shouldOpenBook;
      roomProps.find(prop => prop.id === "book")!.button.setAttribute("aria-expanded", String(bookOpen));
    }
    const previousProgress = pillowProgress;
    pillowProgress = motion.matches ? 1 : Math.min(1, pillowProgress + dt / 1.1);
    const bounce = Math.abs(Math.sin(pillowProgress * Math.PI * 2)) * Math.pow(1 - pillowProgress, 1.5);
    pillow.position.copy(pillowHome);
    pillow.position.y += bounce * 0.7;
    pillow.rotation.z = (pillowFluffed ? 0.16 : -0.2) + Math.sin(pillowProgress * Math.PI * 4) * (1 - pillowProgress) * 0.25;
    pillow.scale.set(1 + bounce * 0.12, 1 - bounce * 0.12, 1 + bounce * 0.08);
    const previousAngle = bookCover.rotation.z;
    const angle = bookOpen ? 2.85 : 0;
    bookCover.rotation.z = motion.matches ? angle : THREE.MathUtils.damp(previousAngle, angle, 9, dt);
    if (previousProgress !== pillowProgress || Math.abs(previousAngle - bookCover.rotation.z) > 0.0001) renderer.shadowMap.needsUpdate = true;
  };
  interactives.forEach(part => {
    part.button.disabled = false;
    part.button.addEventListener("click", () => activate(part), options);
    part.button.addEventListener("focus", () => { focused = part; wake(); }, options);
    part.button.addEventListener("blur", () => { focused = undefined; wake(); }, options);
  });
  let pressed: { id: number; x: number; y: number; time: number; part?: InteractivePart } | undefined;
  const clearTouch = () => {
    pressed = undefined;
    pointer.set(0, 0);
    plantPointerActive = false;
    setHovered();
  };
  const movePlantPointer = (event: PointerEvent) => {
    if (motion.matches) return;
    plantPointerActive = true;
    const bounds = host.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
    wake();
  };
  renderer.domElement.addEventListener("pointerdown", event => {
    if (!event.isPrimary) { clearTouch(); return; }
    if (event.button !== 0) return;
    pressed = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, part: pick(event) };
    if (event.pointerType === "touch") {
      setHovered(pressed.part && "state" in pressed.part ? pressed.part : undefined);
      movePlantPointer(event);
    }
  }, options);
  renderer.domElement.addEventListener("pointermove", event => {
    if (pressed?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) >= 9) {
      clearTouch();
      return;
    }
    if (event.pointerType === "touch") movePlantPointer(event);
  }, options);
  renderer.domElement.addEventListener("pointerup", event => {
    if (pressed?.id !== event.pointerId) return;
    const part = pick(event);
    if (pressed.part === part && part && event.timeStamp - pressed.time < 650 && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < 9) activate(part);
    pressed = undefined;
    if (event.pointerType === "touch") clearTouch();
  }, options);
  renderer.domElement.addEventListener("pointercancel", clearTouch, options);
  renderer.domElement.addEventListener("lostpointercapture", clearTouch, options);

  const updateFlows = (dt: number) => {
    for (const flow of flows) {
      const running = flow.part.progress >= 0.54;
      if (running && !motion.matches) flow.elapsed += dt;
      flow.arrow.visible = running;
      flow.material.opacity = running ? 0.85 : 0.2;
      const t = (flow.elapsed * 0.12 + flow.offset) % 1;
      flow.arrow.position.copy(flow.curve.getPointAt(t));
      flow.arrow.quaternion.setFromUnitVectors(rotationAxis, flow.curve.getTangentAt(t).normalize());
    }
  };
  const render = () => {
    renderer.render(scene, camera);
    if (host.dataset.rendered !== "true") {
      introStarted = performance.now();
      host.dataset.rendered = "true";
    }
  };
  const updateCamera = (dt = 0) => {
    cameraProgress = motion.matches ? 0 : THREE.MathUtils.damp(cameraProgress, cameraGoal, 8, dt);
    coverProgress = motion.matches ? 0 : THREE.MathUtils.damp(coverProgress, coverGoal, 8, dt);
    if (!motion.matches && Math.abs(cameraProgress - cameraGoal) < 0.0001) cameraProgress = cameraGoal;
    if (!motion.matches && Math.abs(coverProgress - coverGoal) < 0.0001) coverProgress = coverGoal;
    const progress = cameraProgress;
    const introProgress = introStarted === undefined ? 0 : THREE.MathUtils.clamp((performance.now() - introStarted) / 1500, 0, 1);
    const intro = motion.matches ? 0 : Math.pow(1 - introProgress, 3);
    const parallax = motion.matches ? 0 : (1 - progress) * (1 - intro);
    const destination = mobileCamera ? orbitOverhead : orbitClose;
    cameraTarget.copy(target).lerp(mobileCamera ? overheadTarget : equipmentTarget, progress);
    cameraOrbit.set(
      THREE.MathUtils.lerp(orbitHome.radius, destination.radius, progress),
      THREE.MathUtils.lerp(orbitHome.phi, destination.phi, progress),
      THREE.MathUtils.lerp(orbitHome.theta, destination.theta, progress),
    );
    cameraTarget.lerp(overheadTarget, intro);
    cameraOrbit.radius = THREE.MathUtils.lerp(cameraOrbit.radius, orbitIntro.radius, intro);
    cameraOrbit.phi = THREE.MathUtils.lerp(cameraOrbit.phi, orbitIntro.phi, intro);
    cameraOrbit.theta = THREE.MathUtils.lerp(cameraOrbit.theta, orbitIntro.theta, intro);
    camera.position.setFromSpherical(cameraOrbit).add(cameraTarget);
    camera.position.x += smoothed.x * 0.6 * parallax;
    camera.position.y += smoothed.y * 0.25 * parallax;
    camera.position.z -= smoothed.x * 0.25 * parallax;
    camera.lookAt(cameraTarget);
    const x = framingCenter.x * (1 - progress);
    const y = framingCenter.y * (1 - progress);
    const zoom = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1, mobileCamera ? 1.45 : 2, progress), 1.45, intro);
    camera.left = x - framingSize.x;
    camera.right = x + framingSize.x;
    camera.top = y + framingSize.y;
    camera.bottom = y - framingSize.y;
    camera.zoom = zoom;
    cameraPan.set(
      framingSize.x * 2 / camera.zoom * coverProgress * 0.1,
      -framingSize.y * 2 / camera.zoom * coverProgress * 0.24,
      0,
    ).applyQuaternion(camera.quaternion);
    camera.position.add(cameraPan);
    cameraTarget.add(cameraPan);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  const tick = (now: number) => {
    frame = 0;
    if (!alive || !visible || document.hidden) return;
    if (motion.matches) { updateCamera(); updateRoomProps(0); updateParts(0); updateFlows(0); updateSparks(0); updateLeaves(0); render(); return; }
    const movingCamera = introStarted === undefined || now - introStarted < 1500 || Math.abs(cameraProgress - cameraGoal) >= 0.0001 || Math.abs(coverProgress - coverGoal) >= 0.0001;
    const repairing = parts.some(part => part.state === "repairing");
    if (now - last < 1000 / (movingCamera || repairing ? 60 : 30) - 0.5) { frame = requestAnimationFrame(tick); return; }
    const dt = Math.min((now - (last || now)) / 1000, 0.075);
    last = now;
    elapsed += dt;
    updateParts(dt);
    updateRoomProps(dt);
    const stumble = Math.floor(elapsed * 9) % 4 === 0 ? -0.3 : 0.12;
    const startup = THREE.MathUtils.smoothstep(condenserPart.progress, 0.5, 0.88);
    condenserSpeed = THREE.MathUtils.damp(condenserSpeed, THREE.MathUtils.lerp(stumble, 4.2, startup), 7, dt);
    condenserRotor.rotation.y += dt * condenserSpeed;
    blowerRotor.rotation.z -= dt * 0.65;
    smoothed.lerp(pointer, 1 - Math.exp(-2.2 * dt));
    updateCamera(dt);
    updateLeaves(dt);
    updateFlows(dt);
    updateSparks(dt);
    render();
    frame = requestAnimationFrame(tick);
  };
  const wake = () => { if (!frame && alive && visible && !document.hidden) frame = requestAnimationFrame(tick); };
  const resize = () => {
    const width = host.clientWidth; const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.position.copy(cameraHome);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const bounds = new THREE.Box3(new THREE.Vector3(-5.5, -0.25, -3.1), new THREE.Vector3(5.4, 4.25, 3.4));
    const projected = new THREE.Box3();
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    const center = projected.getCenter(new THREE.Vector3());
    const size = projected.getSize(new THREE.Vector3());
    const sceneStyle = getComputedStyle(host);
    const introWidth = Number(sceneStyle.getPropertyValue("--hvac-intro-width")) || 1;
    const introCenter = Number(sceneStyle.getPropertyValue("--hvac-intro-center")) || 0.5;
    const halfHeight = Math.max(size.y / 2, size.x / 2 / (width / height) / introWidth) * 1.025;
    const halfWidth = halfHeight * width / height;
    framingCenter.set(center.x - (introCenter - 0.5) * halfWidth * 2, center.y);
    framingSize.set(halfWidth, halfHeight);
    updateCamera();
    updateFlows(0);
    if (visible) render();
    wake();
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { last = 0; resize(); wake(); }
    else { cancelAnimationFrame(frame); frame = 0; }
  }, { threshold: 0.02 });
  observer.observe(host);
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(host);
  host.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    setHovered(pick(event));
    movePlantPointer(event);
  }, options);
  host.addEventListener("pointerleave", () => { pointer.set(0, 0); plantPointerActive = false; setHovered(); pressed = undefined; }, options);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else { last = 0; wake(); }
  }, options);
  motion.addEventListener("change", () => { last = 0; wake(); }, options);
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    alive = false;
    cancelAnimationFrame(frame);
    host.dataset.rendered = "false";
    host.dataset.unavailable = "true";
    interactives.forEach(part => { part.button.disabled = true; });
    host.style.cursor = "";
  }, options);
  updateParts(0);
  resize();
  return {
    dispose() {
      alive = false;
      cancelAnimationFrame(frame);
      controller.abort(); observer.disconnect(); sizeObserver.disconnect();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      sparks.dispose();
      steps.dispose(); sun.shadow.map?.dispose(); renderer.dispose();
      renderer.domElement.remove();
      interactives.forEach(part => part.button.remove());
      announcement.remove();
      host.style.cursor = "";
      delete host.dataset.hoveredPart;
    },
  };
}
