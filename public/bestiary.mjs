const KINDS = ['sombra', 'sayona', 'llorona', 'silbon', 'duende', 'manguanguas'];

export const BESTIARY_KINDS = Object.freeze(new Set(KINDS));

const ENTITY_FACTORIES = {
  sombra(x, z, pull) {
    return {
      state: 'hunt',
      phase: x * 0.7 + z * 0.3,
      breathe: { spd: 1.5, amp: 0.02 },
      speed: { hunt: 1.35 * pull, lunge: 2.25 * pull },
      catchRadius: 1.15,
      grace: 3,
      catchMessage: 'UNA SOMBRA TE POSEYÓ',
    };
  },
  sayona(x, z, pull, random) {
    return {
      state: 'idle',
      phase: x * 0.4 + z * 0.6,
      speed: { hunt: 2.55 * pull },
      catchRadius: 1.2,
      grace: 3,
      delay: 10 + random() * 14,
      calm: true,
      catchMessage: 'LA SAYONA TE ARRASTRÓ',
    };
  },
  llorona(x, z, pull) {
    return {
      state: 'patrol',
      phase: x * 0.5 + z * 0.8,
      speed: { patrol: 0.95, hunt: 2.7 * pull },
      senseRange: 5.5,
      catchRadius: 1.1,
      grace: 3,
      sobT: 1.5,
      catchMessage: 'LA LLORONA TE ACUNÓ',
    };
  },
  silbon(x, z, pull) {
    return {
      state: 'hunt',
      phase: x * 0.6 + z * 0.4,
      lurch: { spd: 1.1, amp: 0.028 },
      speed: { hunt: 1.5 * pull },
      catchRadius: 1.1,
      grace: 4,
      whistleT: 0.8,
      catchMessage: 'EL SILBÓN TE ECHÓ AL SACO',
    };
  },
  duende(x, z, pull) {
    return {
      state: 'patrol',
      phase: x * 0.9 + z * 0.5,
      breathe: { spd: 9, amp: 0.03 },
      speed: { patrol: 1.7, hunt: 3.1 * pull },
      senseRange: 8,
      catchRadius: 0.85,
      grace: 2,
      fleeT: 0,
      catchMessage: 'LA TORRE TE ARRASTRÓ',
    };
  },
  manguanguas(x, z, pull) {
    return {
      state: 'patrol',
      phase: x * 0.35 + z * 0.65,
      breathe: { spd: 1.1, amp: 0.025 },
      speed: { patrol: 0.9, hunt: 2.2 * pull },
      senseRange: 7.5,
      catchRadius: 1.05,
      grace: 3,
      catchMessage: 'EL MANGUANGUAS TE RETUVO EN LA CONVERSA',
    };
  },
};

const DEFAULT_VECTOR = (x = 0, y = 0, z = 0) => ({
  x,
  y,
  z,
  set(nextX, nextY, nextZ) {
    this.x = nextX;
    this.y = nextY;
    this.z = nextZ;
    return this;
  },
});

function visualParts(group, parts = {}) {
  return {
    group,
    eyes: parts.eyes ?? null,
    eyelids: parts.eyelids ?? null,
    fangs: parts.fangs ?? null,
    faceCalm: parts.faceCalm ?? null,
    faceTrue: parts.faceTrue ?? null,
    armReach: parts.armReach ?? null,
    jaw: parts.jaw ?? null,
    irises: parts.irises ?? null,
  };
}

// Vertical cloth folds: displace each lathe ring radially by angle. Geometries
// from a test double have no attributes, so they pass through unchanged.
function foldGeometry(geo, amount = 0.03, freq = 9) {
  const p = geo?.attributes?.position;
  if (!p || typeof geo.computeVertexNormals !== 'function') return geo;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const k = 1 + Math.sin(Math.atan2(z, x) * freq) * amount;
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function createBestiaryMeshFactory({
  THREE,
  getFloorGroup,
  getCaches,
  keepGeometry,
  spectralMaterial,
  material,
  lathe,
  faceTexture,
}) {
  if (!THREE) throw new TypeError('THREE is required');
  const helpers = { getFloorGroup, getCaches, keepGeometry, spectralMaterial, material, lathe, faceTexture };
  for (const [name, helper] of Object.entries(helpers)) {
    if (typeof helper !== 'function') throw new TypeError(`${name} must be a function`);
  }

  function addToFloor(group, x, z) {
    group.position.set(x, 0, z);
    getFloorGroup().add(group);
    return group;
  }

  function markSilhouette(mesh, anatomy) {
    mesh.userData.shadowCaster = true;
    mesh.userData.anatomy = anatomy;
    return mesh;
  }

  function addEyeLids(g, T, [C], skinMat, eyes, { radiusX, radiusY, radiusZ, frontZ }) {
    if (!C.eyeLid) C.eyeLid = keepGeometry(new T.SphereGeometry(1, 8, 6));
    const lids = [];
    for (const eye of eyes) {
      const lid = new T.Mesh(C.eyeLid, skinMat);
      const openY = eye.position.y + radiusY * 0.58;
      const openScaleY = radiusY * 0.24;
      lid.name = 'eyelid';
      lid.position.set(eye.position.x, openY, frontZ);
      lid.rotation.x = eye.rotation.x;
      lid.rotation.y = eye.rotation.y;
      lid.rotation.z = eye.rotation.z;
      lid.scale.set(radiusX * 1.22, openScaleY, radiusZ * 1.2);
      lid.userData = {
        eyeLid: true,
        openY,
        closedY: eye.position.y,
        openScaleY,
        closedScaleY: radiusY * 1.12,
      };
      g.add(lid);
      lids.push(lid);
    }
    return lids;
  }

  // Neck, jaw and two slightly bent arms with hands. Geometries are cached per
  // kind and shared; every mesh uses the entity's own spectral material so the
  // sway/rim shader stays consistent. Max four entities per floor, so the extra
  // draw calls stay bounded.
  function addHumanoid(g, T, [C], mat, shape, skinMat = mat) {
    const geo = (name, make) => {
      const key = 'anat:' + shape.id + ':' + name;
      if (!C[key]) C[key] = keepGeometry(make());
      return C[key];
    };
    const add = (name, gg, x, y, z, rz = 0, sx = 1, sy = 1, sz = 1, material = mat) => {
      const m = new T.Mesh(gg, material);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      m.scale.set(sx, sy, sz);
      m.userData.part = name;
      g.add(m);
    };
    add('neck', geo('neck', () => new T.CylinderGeometry(.055, .072, shape.neckTop - shape.neckBottom, 8)),
      0, (shape.neckTop + shape.neckBottom) / 2, 0);
    add('jaw', geo('jaw', () => new T.SphereGeometry(.16, 10, 8)), 0, shape.jawY, .02, 0, .95, .5, .8, skinMat);
    for (const side of [-1, 1]) {
      const a1 = side * shape.bend;
      const px = side * shape.shoulderX;
      add('shoulder', geo('shoulder', () => new T.SphereGeometry(.085, 8, 6)), px, shape.shoulderY, 0);
      add('upper', geo('upper', () => new T.CylinderGeometry(.048, .04, shape.upper, 7)),
        px + Math.sin(a1) * (shape.upper / 2), shape.shoulderY - Math.cos(a1) * (shape.upper / 2), 0, a1);
      const ex = px + Math.sin(a1) * shape.upper;
      const ey = shape.shoulderY - Math.cos(a1) * shape.upper;
      add('elbow', geo('elbow', () => new T.SphereGeometry(.045, 7, 5)), ex, ey, 0);
      const a2 = a1 - side * shape.bend * 0.55;
      add('fore', geo('fore', () => new T.CylinderGeometry(.04, .032, shape.fore, 7)),
        ex + Math.sin(a2) * (shape.fore / 2), ey - Math.cos(a2) * (shape.fore / 2), 0, a2);
      const hx = ex + Math.sin(a2) * shape.fore;
      const hy = ey - Math.cos(a2) * shape.fore;
      add('hand', geo('hand', () => new T.BoxGeometry(.07, .12, .035)), hx, hy, 0, a2, 1, 1, 1, skinMat);
      add('thumb', geo('thumb', () => new T.BoxGeometry(.028, .06, .028)), hx + side * .045, hy - .02, .02, a2, 1, 1, 1, skinMat);
    }
  }

  const factories = {
    sombra(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.sombra) M.sombra = spectralMaterial({color:0x121826,emissive:0x2c3a56,emissiveIntensity:1.1,transparent:true,opacity:.95,swayAmp:.075,swaySpeed:1.7,swayAnchorY:1.35,swayRange:1.6,rimColor:0x5a80b4,rimStrength:.55,rimPower:2.0,hem:{bottom:.02,top:1.05}});
      if (!M.sombraSkin) M.sombraSkin = spectralMaterial({color:0x11161f,emissive:0x0a0d14,emissiveIntensity:.3,rimColor:0x3d5478,rimStrength:.45,rimPower:2.4});
      if (!C.sombra) C.sombra = keepGeometry(foldGeometry(lathe([[.02,-.18],[.28,-.02],[.48,.25],[.37,.58],[.24,.96],[.31,1.25],[.2,1.66],[.14,2.06],[.11,2.18]],16),.07,7));
      if (!C.sombraHead) C.sombraHead = keepGeometry(new T.SphereGeometry(.22,10,8));
      if (!C.sombraWisp) C.sombraWisp = keepGeometry(new T.ConeGeometry(.1,.72,6));
      if (!M.eyeRed) { M.eyeRed = material({color:0xE63946,emissive:0xE63946,emissiveIntensity:2.2}); M.eyeRed.userData.keep = true; }
      if (!C.eye) C.eye = keepGeometry(new T.SphereGeometry(.045,8,8));
      const body = markSilhouette(new T.Mesh(C.sombra,M.sombra),'sombra-abstract-wraith');
      g.add(body);
      const head = new T.Mesh(C.sombraHead,M.sombraSkin); head.position.y = 2.1; head.scale.set(.9,1.12,.82); g.add(head);
      const wispL = new T.Mesh(C.sombraWisp,M.sombra); wispL.position.set(-.34,1.15,.02); wispL.rotation.z = .68; wispL.scale.set(.8,1.25,.8); g.add(wispL);
      const wispR = new T.Mesh(C.sombraWisp,M.sombra); wispR.position.set(.32,1.35,-.02); wispR.rotation.z = -.82; wispR.scale.set(.75,1.05,.75); g.add(wispR);
      const eL = new T.Mesh(C.eye,M.eyeRed); eL.position.set(-.08,2.12,.205);
      const eR = eL.clone(); eR.position.x = .08; g.add(eL); g.add(eR);
      const eyes = [eL,eR];
      for (const eye of eyes) eye.userData.eye = true;
      const eyelids = addEyeLids(g,T,[C],M.sombraSkin,eyes,{radiusX:.045,radiusY:.045,radiusZ:.03,frontZ:.257});
      addToFloor(g,x,z);
      return visualParts(g,{eyes,eyelids});
    },
    sayona(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.sayonaGown) M.sayonaGown = spectralMaterial({color:0xe4ded0,emissive:0x45433a,emissiveIntensity:.4,transparent:true,opacity:.94,swayAmp:.08,swaySpeed:1.4,swayAnchorY:1.6,swayRange:2.0,rimColor:0xd0d6d8,rimStrength:.5,rimPower:2.2,hem:{bottom:.02,top:1.0}});
      if (!C.sayonaGown) C.sayonaGown = keepGeometry(foldGeometry(lathe([[.012,-.12],[.34,.05],[.33,.5],[.27,1.05],[.21,1.5],[.19,1.8],[.2,2.0],[.12,2.18],[.05,2.3]],18),.03,10));
      if (!M.sayonaHair) M.sayonaHair = spectralMaterial({color:0x08090e,emissive:0x0c0c14,emissiveIntensity:.2,swayAmp:.05,swaySpeed:1.6,swayAnchorY:2.55,swayRange:1.5,rimColor:0x2a2438,rimStrength:.3,rimPower:2.6});
      if (!M.sayonaSkin) M.sayonaSkin = spectralMaterial({color:0xb8a693,emissive:0x2b2622,emissiveIntensity:.25,rimColor:0xd8c8b4,rimStrength:.3,rimPower:3.0});
      if (!C.sayonaHair) C.sayonaHair = keepGeometry(lathe([[.14,2.6],[.3,2.1],[.29,1.4],[.16,.95]],14));
      if (!C.head20) C.head20 = keepGeometry(new T.SphereGeometry(.2,14,14));
      if (!C.eyeBall) C.eyeBall = keepGeometry(new T.SphereGeometry(.034,10,10));
      if (!C.eyeIris) C.eyeIris = keepGeometry(new T.SphereGeometry(.017,8,8));
      if (!C.eyePupil) C.eyePupil = keepGeometry(new T.SphereGeometry(.008,6,6));
      if (!M.sayonaSclera) { M.sayonaSclera = material({color:0xd6cbb8,emissive:0x2a2620,emissiveIntensity:.3}); M.sayonaSclera.userData.keep = true; }
      if (!M.sayonaIrisCalm) { M.sayonaIrisCalm = material({color:0x1a1420}); M.sayonaIrisCalm.userData.keep = true; }
      if (!M.sayonaIrisTrue) { M.sayonaIrisTrue = material({color:0xE63946,emissive:0xE63946,emissiveIntensity:2.0}); M.sayonaIrisTrue.userData.keep = true; }
      if (!M.sayonaPupil) { M.sayonaPupil = material({color:0x050308}); M.sayonaPupil.userData.keep = true; }
      if (!M.sayonaFang) M.sayonaFang = spectralMaterial({color:0xf0e8da,emissive:0x403329,emissiveIntensity:.2,rimColor:0xd8c8b4,rimStrength:.2,rimPower:3});
      if (!C.sayonaFang) C.sayonaFang = keepGeometry(new T.ConeGeometry(.018,.14,6));
      addHumanoid(g,T,[C],M.sayonaGown,{id:'sayona',shoulderY:2.04,shoulderX:.18,upper:.36,fore:.33,bend:.12,neckBottom:2.12,neckTop:2.3,jawY:2.36},M.sayonaSkin);
      if (!C.faceP) C.faceP = keepGeometry(new T.PlaneGeometry(.3,.36));
      const body = markSilhouette(new T.Mesh(C.sayonaGown,M.sayonaGown),'sayona-white-saya');
      g.add(body);
      const head = new T.Mesh(C.head20,M.sayonaSkin); head.position.y = 2.45; g.add(head);
      g.add(new T.Mesh(C.sayonaHair,M.sayonaHair));
      const faceCalm = new T.Mesh(C.faceP,new T.MeshBasicMaterial({map:faceTexture('sayonaCalm'),transparent:true})); faceCalm.position.set(0,2.46,.19); g.add(faceCalm);
      const faceTrue = new T.Mesh(C.faceP,new T.MeshBasicMaterial({map:faceTexture('sayonaTrue'),transparent:true,opacity:0})); faceTrue.position.set(0,2.46,.195); g.add(faceTrue);
      const irises = [];
      const eyes = [];
      for (const side of [-1, 1]) {
        const ex = side * .072, ey = 2.49, ez = .172;
        const sclera = new T.Mesh(C.eyeBall, M.sayonaSclera);
        sclera.position.set(ex, ey, ez); sclera.scale.set(1, 1.15, .72); g.add(sclera);
        sclera.userData.eye = true; eyes.push(sclera);
        const iris = new T.Mesh(C.eyeIris, M.sayonaIrisCalm);
        iris.position.set(ex, ey, ez + .024);
        iris.userData.calmMat = M.sayonaIrisCalm; iris.userData.trueMat = M.sayonaIrisTrue;
        g.add(iris); irises.push(iris);
        const pupil = new T.Mesh(C.eyePupil, M.sayonaPupil);
        pupil.position.set(ex, ey, ez + .036); g.add(pupil);
      }
      const eyelids = addEyeLids(g,T,[C],M.sayonaSkin,eyes,{radiusX:.034,radiusY:.039,radiusZ:.024,frontZ:.222});
      const fangs = [];
      for (const side of [-1, 1]) {
        const fang = new T.Mesh(C.sayonaFang,M.sayonaFang);
        fang.position.set(side * .028,2.39,.25); fang.rotation.z = Math.PI; fang.visible = false;
        g.add(fang); fangs.push(fang);
      }
      addToFloor(g,x,z); g.visible = false;
      return visualParts(g,{faceCalm,faceTrue,eyes,eyelids,irises,fangs});
    },
    llorona(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.llorona) M.llorona = spectralMaterial({color:0xb8c0bb,emissive:0x333a34,emissiveIntensity:.5,transparent:true,opacity:.9,swayAmp:.07,swaySpeed:1.5,swayAnchorY:1.5,swayRange:1.9,rimColor:0x82b2b8,rimStrength:.55,rimPower:2.1,hem:{bottom:.02,top:1.1}});
      if (!M.lloronaSkin) M.lloronaSkin = spectralMaterial({color:0x8f9a95,emissive:0x232a26,emissiveIntensity:.3,rimColor:0x9fc4c8,rimStrength:.35,rimPower:2.8});
      if (!C.llorona) C.llorona = keepGeometry(foldGeometry(lathe([[.02,-.1],[.15,.2],[.23,.55],[.19,1.1],[.14,1.55],[.1,1.95],[.08,2.2]],16),.04,11));
      if (!M.lloronaRibs) M.lloronaRibs = spectralMaterial({color:0xbab7a9,emissive:0x302d28,emissiveIntensity:.35,transparent:true,opacity:.82,rimColor:0xb8c6bd,rimStrength:.35,rimPower:2.8});
      if (!C.lloronaRibs) C.lloronaRibs = keepGeometry(new T.TorusGeometry(.16,.018,4,10));
      if (!C.lloronaEye) C.lloronaEye = keepGeometry(new T.SphereGeometry(.027,8,6));
      if (!M.lloronaEye) { M.lloronaEye = material({color:0x100e12,emissive:0x0d0b10,emissiveIntensity:.2}); M.lloronaEye.userData.keep = true; }
      addHumanoid(g,T,[C],M.llorona,{id:'llorona',shoulderY:1.98,shoulderX:.12,upper:.36,fore:.34,bend:.18,neckBottom:1.88,neckTop:2.05,jawY:2.06},M.lloronaSkin);
      if (!M.lloronaVeil) M.lloronaVeil = spectralMaterial({color:0xd6dad2,emissive:0x3a3e38,emissiveIntensity:.45,transparent:true,opacity:.7,swayAmp:.05,swaySpeed:1.9,swayAnchorY:2.3,swayRange:1.5,rimColor:0xa0d0d4,rimStrength:.5,hem:{bottom:.7,top:2.3},side:T.DoubleSide});
      if (!C.lloronaVeil) C.lloronaVeil = keepGeometry(lathe([[.1,2.35],[.32,1.95],[.44,1.35]],14));
      if (!C.head20b) C.head20b = keepGeometry(new T.SphereGeometry(.2,12,12));
      if (!C.arms) C.arms = keepGeometry(new T.SphereGeometry(.24,10,10));
      const body = markSilhouette(new T.Mesh(C.llorona,M.llorona),'llorona-skeletal-veil');
      g.add(body);
      const head = new T.Mesh(C.head20b,M.lloronaSkin); head.position.set(0,2.15,.06); head.rotation.x = .5; g.add(head);
      const eyes = [];
      for (const side of [-1, 1]) {
        const eye = new T.Mesh(C.lloronaEye,M.lloronaEye);
        eye.position.set(side * .055,2.15,.235); eye.rotation.x = .5; eye.userData.eye = true;
        g.add(eye); eyes.push(eye);
      }
      const eyelids = addEyeLids(g,T,[C],M.lloronaSkin,eyes,{radiusX:.03,radiusY:.027,radiusZ:.018,frontZ:.267});
      g.add(new T.Mesh(C.lloronaVeil,M.lloronaVeil));
      const ribs = new T.Mesh(C.lloronaRibs,M.lloronaRibs); ribs.position.set(0,1.58,.19); ribs.scale.set(1.25,.55,.7); g.add(ribs);
      const arms = new T.Mesh(C.arms,M.llorona); arms.position.set(0,1.75,.22); arms.scale.set(1.3,.5,.8); arms.userData = {z0:.22,rx0:0}; g.add(arms);
      addToFloor(g,x,z);
      return visualParts(g,{armReach:arms,eyes,eyelids});
    },
    silbon(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.silbon) M.silbon = spectralMaterial({color:0x0d0f14,emissive:0x161a22,emissiveIntensity:.5,transparent:true,opacity:.96,swayAmp:.06,swaySpeed:1.3,swayAnchorY:2.0,swayRange:2.3,rimColor:0x3c4a56,rimStrength:.5,rimPower:2.0,hem:{bottom:.05,top:1.25}});
      if (!M.silbonSkin) M.silbonSkin = spectralMaterial({color:0x2a2a30,emissive:0x101014,emissiveIntensity:.2,rimColor:0x4a5560,rimStrength:.35,rimPower:2.6});
      if (!C.silbon) C.silbon = keepGeometry(foldGeometry(lathe([[.025,-.1],[.12,.4],[.15,1.2],[.11,2.2],[.075,2.9],[.055,3.15]],14),.025,8));
      addHumanoid(g,T,[C],M.silbon,{id:'silbon',shoulderY:2.9,shoulderX:.105,upper:.38,fore:.36,bend:.07,neckBottom:2.98,neckTop:3.1,jawY:3.1},M.silbonSkin);
      if (!C.silbonHead) C.silbonHead = keepGeometry(new T.SphereGeometry(.17,12,12));
      if (!C.faceP) C.faceP = keepGeometry(new T.PlaneGeometry(.3,.36));
      if (!M.silbonHat) M.silbonHat = spectralMaterial({color:0x8a7a55,emissive:0x2a2418,emissiveIntensity:.3,rimColor:0xaa9866,rimStrength:.25,rimPower:2.5});
      if (!C.silbonCrown) C.silbonCrown = keepGeometry(new T.CylinderGeometry(.15,.16,.22,12));
      if (!C.silbonBrim) C.silbonBrim = keepGeometry(new T.CylinderGeometry(.44,.44,.03,18));
      if (!M.sack) M.sack = spectralMaterial({color:0x6b5a3f,emissive:0x1a140c,emissiveIntensity:.35,rimColor:0x8a7550,rimStrength:.3,rimPower:2.4});
      if (!C.sack) C.sack = keepGeometry(new T.SphereGeometry(.3,12,12));
      if (!C.eyeBall) C.eyeBall = keepGeometry(new T.SphereGeometry(.034,10,10));
      if (!C.eyeIris) C.eyeIris = keepGeometry(new T.SphereGeometry(.017,8,8));
      if (!M.silbonSclera) { M.silbonSclera = material({color:0x14141a,emissive:0x05050a,emissiveIntensity:.3}); M.silbonSclera.userData.keep = true; }
      if (!M.silbonIris) { M.silbonIris = material({color:0xc9a94d,emissive:0xc9a94d,emissiveIntensity:1.8}); M.silbonIris.userData.keep = true; }
      const body = markSilhouette(new T.Mesh(C.silbon,M.silbon),'silbon-extreme-height');
      g.add(body);
      const head = new T.Mesh(C.silbonHead,M.silbonSkin); head.position.y = 3.15; g.add(head);
      const face = new T.Mesh(C.faceP,new T.MeshBasicMaterial({map:faceTexture('silbon'),transparent:true})); face.scale.set(.8,.8,.8); face.position.set(0,3.16,.15); g.add(face);
      const eyes = [];
      for (const side of [-1, 1]) {
        const ex = side * .048, ey = 3.15, ez = .138;
        const sclera = new T.Mesh(C.eyeBall, M.silbonSclera);
        sclera.position.set(ex, ey, ez); sclera.scale.set(.85, .95, .6); sclera.userData.eye = true; g.add(sclera); eyes.push(sclera);
        const iris = new T.Mesh(C.eyeIris, M.silbonIris);
        iris.position.set(ex, ey, ez + .016); iris.scale.set(.9, .9, 1); g.add(iris);
      }
      const eyelids = addEyeLids(g,T,[C],M.silbonSkin,eyes,{radiusX:.029,radiusY:.032,radiusZ:.02,frontZ:.181});
      const crown = new T.Mesh(C.silbonCrown,M.silbonHat); crown.position.y = 3.42; g.add(crown);
      const brim = new T.Mesh(C.silbonBrim,M.silbonHat); brim.position.y = 3.32; g.add(brim);
      const sack = new T.Mesh(C.sack,M.sack); sack.position.set(.19,1.78,.03); sack.scale.set(.8,1.05,.8); sack.userData.part = 'sack'; g.add(sack);
      addToFloor(g,x,z);
      return visualParts(g,{eyes,eyelids});
    },
    duende(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.duende) M.duende = spectralMaterial({color:0x4a3a28,emissive:0x281d12,emissiveIntensity:.55,swayAmp:.012,swaySpeed:6,swayAnchorY:.85,swayRange:.9,rimColor:0x8a6a2a,rimStrength:.3,rimPower:2.6});
      if (!C.duendeBody) C.duendeBody = keepGeometry(lathe([[.22,0],[.28,.12],[.26,.3],[.19,.47],[.16,.6]],10));
      if (!C.duendeHead) C.duendeHead = keepGeometry(new T.SphereGeometry(.18,10,8));
      if (!M.duendeHat) M.duendeHat = spectralMaterial({color:0xE63946,emissive:0x7a1118,emissiveIntensity:.6,rimColor:0xE63946,rimStrength:.4,rimPower:2.3});
      if (!C.duendeHat) C.duendeHat = keepGeometry(new T.ConeGeometry(.22,.4,10));
      if (!M.eyeGold) { M.eyeGold = material({color:0xffd166,emissive:0xffd166,emissiveIntensity:2}); M.eyeGold.userData.keep = true; }
      if (!C.eye) C.eye = keepGeometry(new T.SphereGeometry(.045,8,8));
      const body = markSilhouette(new T.Mesh(C.duendeBody,M.duende),'duende-small-red-hat');
      g.add(body);
      const head = new T.Mesh(C.duendeHead,M.duende); head.position.set(0,.65,.02); g.add(head);
      const hat = new T.Mesh(C.duendeHat,M.duendeHat); hat.position.y = .91; hat.rotation.z = .14; g.add(hat);
      const eL = new T.Mesh(C.eye,M.eyeGold); eL.scale.setScalar(.72); eL.position.set(-.055,.65,.15); eL.userData.eye = true;
      const eR = eL.clone(); eR.position.x = .055; g.add(eL); g.add(eR);
      const eyes = [eL,eR];
      const eyelids = addEyeLids(g,T,[C],M.duende,eyes,{radiusX:.032,radiusY:.032,radiusZ:.032,frontZ:.18});
      addToFloor(g,x,z);
      return visualParts(g,{eyes,eyelids});
    },
    manguanguas(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.manguanguas) M.manguanguas = spectralMaterial({color:0x65727b,emissive:0x1a2530,emissiveIntensity:.45,transparent:true,opacity:.88,swayAmp:.055,swaySpeed:1.25,swayAnchorY:1.2,swayRange:1.8,rimColor:0xaac6d0,rimStrength:.45,rimPower:2.2,hem:{bottom:.03,top:1.25}});
      if (!M.manguanguasSkin) M.manguanguasSkin = spectralMaterial({color:0x8b8f92,emissive:0x232a2e,emissiveIntensity:.3,rimColor:0xb8ccd4,rimStrength:.35,rimPower:2.8});
      if (!C.manguanguasBody) C.manguanguasBody = keepGeometry(foldGeometry(lathe([[.04,-.1],[.32,.08],[.45,.38],[.42,.72],[.34,1.15],[.27,1.55],[.19,1.9]],14),.03,9));
      if (!C.manguanguasEye) C.manguanguasEye = keepGeometry(new T.SphereGeometry(.026,8,6));
      if (!C.manguanguasIris) C.manguanguasIris = keepGeometry(new T.SphereGeometry(.012,8,6));
      if (!M.manguanguasEye) { M.manguanguasEye = material({color:0xb8b8b3,emissive:0x171719,emissiveIntensity:.18}); M.manguanguasEye.userData.keep = true; }
      if (!M.manguanguasIris) { M.manguanguasIris = material({color:0x242228,emissive:0x060507}); M.manguanguasIris.userData.keep = true; }
      addHumanoid(g,T,[C],M.manguanguas,{id:'manguanguas',shoulderY:1.84,shoulderX:.24,upper:.28,fore:.3,bend:.45,neckBottom:1.84,neckTop:2.02,jawY:2.02},M.manguanguasSkin);
      if (!C.manguanguasHead) C.manguanguasHead = keepGeometry(new T.SphereGeometry(.21,12,10));
      if (!C.manguanguasArm) C.manguanguasArm = keepGeometry(new T.SphereGeometry(.14,8,8));
      if (!M.manguanguasCup) M.manguanguasCup = material({color:0x725039,emissive:0x241208,emissiveIntensity:.3});
      if (!M.manguanguasCoffee) M.manguanguasCoffee = material({color:0x24150d,emissive:0x100803,emissiveIntensity:.12});
      if (!C.manguanguasCup) C.manguanguasCup = keepGeometry(new T.CylinderGeometry(.09,.12,.22,10));
      if (!C.manguanguasCoffee) C.manguanguasCoffee = keepGeometry(new T.CylinderGeometry(.075,.075,.012,10));
      if (!C.manguanguasHandle) C.manguanguasHandle = keepGeometry(new T.TorusGeometry(.1,.022,6,12));

      const body = markSilhouette(new T.Mesh(C.manguanguasBody,M.manguanguas),'manguanguas-coffee-visitor');
      body.rotation.x = .06;
      g.add(body);
      const head = new T.Mesh(C.manguanguasHead,M.manguanguasSkin);
      head.position.set(0,2.08,.02);
      g.add(head);
      const eyes = [];
      for (const side of [-1, 1]) {
        const eye = new T.Mesh(C.manguanguasEye,M.manguanguasEye);
        eye.position.set(side * .066,2.09,.214); eye.scale.set(1,1.1,.72); eye.userData.eye = true;
        const iris = new T.Mesh(C.manguanguasIris,M.manguanguasIris);
        iris.position.set(side * .066,2.09,.233); iris.scale.set(.9,.9,.8);
        g.add(eye); g.add(iris); eyes.push(eye);
      }
      const eyelids = addEyeLids(g,T,[C],M.manguanguasSkin,eyes,{radiusX:.026,radiusY:.029,radiusZ:.019,frontZ:.246});

      const coffeeCup = new T.Group();
      coffeeCup.name = 'coffee-cup';
      coffeeCup.position.set(.44,1.41,.06);
      coffeeCup.add(new T.Mesh(C.manguanguasCup,M.manguanguasCup));
      const coffee = new T.Mesh(C.manguanguasCoffee,M.manguanguasCoffee);
      coffee.position.y = .11;
      coffeeCup.add(coffee);
      const handle = new T.Mesh(C.manguanguasHandle,M.manguanguasCup);
      handle.position.set(.1,0,0);
      coffeeCup.add(handle);
      g.add(coffeeCup);

      addToFloor(g,x,z);
      return visualParts(g,{eyes,eyelids});
    },
  };

  return function meshFactory(kind, x, z) {
    if (!BESTIARY_KINDS.has(kind)) throw new RangeError(`unknown bestiary kind: ${kind}`);
    return factories[kind](x,z);
  };
}

export function createBestiary({
  behaviors = {},
  context = null,
  meshFactory = () => ({}),
  createVector3 = DEFAULT_VECTOR,
  getSpawnPull = () => 1,
  random = Math.random,
} = {}) {
  const spawned = [];
  let activeFrame = null;

  function getContext() {
    return typeof context === 'function' ? context() : context;
  }

  function route(entity, now, dt) {
    const behavior = behaviors[entity.kind];
    if (typeof behavior === 'function') return behavior(entity, now, dt);
    return tickEntity(entity, now, dt, activeFrame);
  }

  function spawn(kind, x, z) {
    if (!BESTIARY_KINDS.has(kind)) {
      throw new RangeError(`unknown bestiary kind: ${kind}`);
    }
    const world = getContext();
    const pull = getSpawnPull(world);
    const visuals = meshFactory(kind, x, z, pull) || {};
    const settings = ENTITY_FACTORIES[kind](x, z, pull, random);
    const blinkValue = x * 0.7548776662466927 + z * 0.5698402909980532 + KINDS.indexOf(kind) * 0.1732050807568877;
    const blinkSeed = blinkValue - Math.floor(blinkValue);
    const blinkPeriod = 3.8 + blinkSeed * 1.4;
    const pos = createVector3(x, 0, z);
    const group = visuals.group ?? null;
    if (group?.position?.set) group.position.set(x, 0, z);
    if (kind === 'sayona' && group) group.visible = false;

    const entity = {
      kind,
      type: kind,
      group,
      eyes: visuals.eyes ?? null,
      eyelids: visuals.eyelids ?? null,
      fangs: visuals.fangs ?? null,
      blinkOffset: blinkSeed * blinkPeriod,
      blinkPeriod,
      faceCalm: visuals.faceCalm ?? null,
      faceTrue: visuals.faceTrue ?? null,
      armReach: visuals.armReach ?? null,
      jaw: visuals.jaw ?? null,
      irises: visuals.irises ?? null,
      pos,
      state: settings.state,
      phase: settings.phase,
      breathe: settings.breathe ?? null,
      lurch: settings.lurch ?? null,
      speed: {
        patrol: settings.speed.patrol,
        hunt: settings.speed.hunt,
        lunge: settings.speed.lunge,
      },
      senseRange: settings.senseRange,
      catchRadius: settings.catchRadius,
      grace: settings.grace,
      delay: settings.delay,
      calm: settings.calm ?? false,
      revealT: 0,
      announced: false,
      lastSeen: createVector3(x, 0, z),
      waypoint: null,
      searchT: 0,
      sobT: settings.sobT,
      wailed: false,
      whistleT: settings.whistleT,
      fleeT: settings.fleeT,
      gigT: undefined,
      sawHide: false,
      reachT: 0,
      catchMessage: settings.catchMessage,
      tick(now, dt) {
        return route(entity, now, dt);
      },
    };
    Object.defineProperties(entity, {
      x: {
        enumerable: true,
        get() { return entity.pos.x; },
        set(value) { entity.pos.x = value; },
      },
      z: {
        enumerable: true,
        get() { return entity.pos.z; },
        set(value) { entity.pos.z = value; },
      },
    });
    spawned.push(entity);
    return entity;
  }

  function tick(now, dt) {
    const world = getContext();
    if (world) world._nearest = 1e9;
    const frame = { world, stopped: false };
    const previousFrame = activeFrame;
    activeFrame = frame;
    try {
      for (const entity of spawned) {
        entity.tick(now, dt);
        if (frame.stopped) break;
      }
    } finally {
      activeFrame = previousFrame;
    }
  }

  function animate(now, dt) {
    for (const entity of spawned) animateEntity(entity, now, dt);
  }

  function remove(entity) {
    const index = spawned.indexOf(entity);
    if (index < 0) return false;
    spawned.splice(index, 1);
    return true;
  }

  function clear() {
    spawned.length = 0;
  }

  function tickEntity(entity, now, dt, frame) {
    const world = frame ? frame.world : getContext();
    const cam = world?.camera;
    if (!world || !cam || !entity.group?.position?.set) return false;
    const fdir = world._fwd || createVector3(0, 0, -1);
    if (typeof fdir.set === 'function') fdir.set(0, 0, -1);
    if (typeof fdir.applyEuler === 'function') fdir.applyEuler(cam.rotation);
    const torch = world.torchOn && world.torchBattery > 0;
    const dx = cam.position.x - entity.pos.x, dz = cam.position.z - entity.pos.z;
    const dist = Math.hypot(dx, dz);
    entity.grace = Math.max(0, entity.grace - dt);
    if (entity.delay !== undefined && entity.delay > 0) {
      entity.delay -= dt;
      return false;
    }
    if (!entity.group.visible) entity.group.visible = true;
    if (entity.kind === 'sayona' && !entity.announced) {
      entity.announced = true;
      world.play?.('scream');
      world._banner?.('LA SAYONA TE HA VISTO');
      world._dread = Math.min(100, world._dread + 8);
    }
    const nearest = Number.isFinite(world._nearest) ? world._nearest : 1e9;
    world._nearest = Math.min(nearest, dist);
    const toEx = (entity.pos.x - cam.position.x) / (dist || 1);
    const toEz = (entity.pos.z - cam.position.z) / (dist || 1);
    const lit = torch && dist < 15 && (fdir.x * toEx + fdir.z * toEz) > 0.86;
    const canSee = !world.hidden || entity.sawHide;
    let tx = entity.pos.x, tz = entity.pos.z, speed = 0;
    const randomWaypoint = () => createVector3(
      (random() - 0.5) * world.roomHalf * 1.4,
      0,
      (random() - 0.5) * world.roomHalf * 1.4,
    );
    const seekLost = (baseSpeed) => {
      entity.state = 'search'; tx = entity.lastSeen.x; tz = entity.lastSeen.z; speed = baseSpeed;
      if (Math.hypot(entity.pos.x - tx, entity.pos.z - tz) < 0.9) {
        if (!entity.waypoint || Math.hypot(entity.pos.x - entity.waypoint.x, entity.pos.z - entity.waypoint.z) < 0.7) {
          entity.waypoint = randomWaypoint();
        }
        tx = entity.waypoint.x; tz = entity.waypoint.z;
      }
    };

    if (entity.kind === 'sombra') {
      if (canSee) {
        entity.state = dist < 2.6 ? 'lunge' : 'hunt';
        tx = cam.position.x; tz = cam.position.z;
        speed = entity.state === 'lunge' ? entity.speed.lunge : entity.speed.hunt;
        entity.lastSeen.set(cam.position.x, 0, cam.position.z);
      } else seekLost(entity.speed.hunt * 0.75);
      if (lit) speed = 0;
    } else if (entity.kind === 'sayona') {
      if (entity.calm && dist < 7 && canSee) {
        entity.calm = false;
        world.play?.('scream');
        world._banner?.('LA SAYONA MUESTRA SU VERDADERO ROSTRO');
        world._dread = Math.min(100, world._dread + 10);
      }
      if (canSee) {
        entity.state = 'hunt'; tx = cam.position.x; tz = cam.position.z;
        speed = entity.calm ? entity.speed.hunt * 0.55 : entity.speed.hunt;
        entity.lastSeen.set(cam.position.x, 0, cam.position.z);
      } else seekLost(entity.speed.hunt * 0.6);
    } else if (entity.kind === 'llorona') {
      entity.sobT -= dt;
      if (entity.sobT <= 0) {
        entity.sobT = 5 + random() * 3;
        world.play?.('sob', { dist });
      }
      if (canSee && dist < entity.senseRange && entity.grace <= 0) {
        if (!entity.wailed) {
          entity.wailed = true;
          world.play?.('scream');
          world._banner?.('LA LLORONA TE HA VISTO');
        }
        entity.state = 'hunt'; tx = cam.position.x; tz = cam.position.z;
        speed = entity.speed.hunt;
        entity.lastSeen.set(cam.position.x, 0, cam.position.z);
      } else if (entity.state === 'hunt' && canSee && dist < entity.senseRange * 1.8) {
        tx = cam.position.x; tz = cam.position.z; speed = entity.speed.hunt;
      } else {
        entity.state = 'patrol'; entity.wailed = false;
        if (!entity.waypoint || Math.hypot(entity.pos.x - entity.waypoint.x, entity.pos.z - entity.waypoint.z) < 0.7) {
          entity.waypoint = randomWaypoint();
        }
        tx = entity.waypoint.x; tz = entity.waypoint.z; speed = entity.speed.patrol;
      }
    } else if (entity.kind === 'silbon') {
      if (canSee) {
        entity.state = 'hunt'; tx = cam.position.x; tz = cam.position.z;
        speed = entity.speed.hunt;
        entity.lastSeen.set(cam.position.x, 0, cam.position.z);
      } else seekLost(entity.speed.hunt * 0.7);
      entity.whistleT -= dt;
      if (entity.whistleT <= 0) {
        entity.whistleT = 4.6;
        if (dist < 5) world.play?.('bones');
        else world.play?.('whistle', { dist });
      }
    } else if (entity.state === 'flee') {
      entity.fleeT -= dt;
      tx = entity.pos.x - (cam.position.x - entity.pos.x);
      tz = entity.pos.z - (cam.position.z - entity.pos.z);
      speed = entity.speed.hunt;
      if (entity.fleeT <= 0) { entity.state = 'patrol'; entity.waypoint = null; }
    } else if (dist < entity.senseRange && entity.grace <= 0 && canSee) {
      entity.state = 'hunt'; tx = cam.position.x; tz = cam.position.z; speed = entity.speed.hunt;
      if (!entity.gigT || now > entity.gigT) {
        entity.gigT = now + 2600;
        world.play?.('giggle', { dist });
      }
    } else {
      if (!entity.waypoint || Math.hypot(entity.pos.x - entity.waypoint.x, entity.pos.z - entity.waypoint.z) < 0.7) {
        entity.waypoint = randomWaypoint();
      }
      tx = entity.waypoint.x; tz = entity.waypoint.z; speed = entity.speed.patrol;
    }

    const mx = tx - entity.pos.x, mz = tz - entity.pos.z, ml = Math.hypot(mx, mz) || 1;
    if (speed > 0) { entity.pos.x += mx / ml * speed * dt; entity.pos.z += mz / ml * speed * dt; }
    const limit = world.roomHalf - 0.5;
    entity.pos.x = Math.max(-limit, Math.min(limit, entity.pos.x));
    entity.pos.z = Math.max(-limit, Math.min(limit, entity.pos.z));
    const bob = entity.kind === 'duende'
      ? Math.abs(Math.sin(now * 0.012 + entity.pos.x)) * 0.12
      : Math.sin(now * 0.004 + entity.pos.x) * 0.05;
    entity.group.position.set(entity.pos.x, bob, entity.pos.z);
    if (speed > 0) entity.group.rotation.y = Math.atan2(mx, mz);
    const hunting = entity.state === 'hunt' || entity.state === 'lunge';
    const dreadRate = entity.kind === 'sayona' ? 5.5
      : entity.kind === 'llorona' ? 4.5
        : entity.kind === 'duende' ? 3
          : entity.kind === 'sombra' ? (entity.state === 'lunge' ? 5.5 : 1.4)
            : 4.2;
    if (hunting && !lit) world._dread = Math.min(100, world._dread + dt * dreadRate);
    if (entity.eyes) {
      entity.eyes[0].material.emissiveIntensity = lit
        ? 0.7
        : hunting ? 2.6 + Math.sin(now * 0.018) * 0.9 : 1.5;
    }
    if (dist < entity.catchRadius && entity.grace <= 0 && canSee) {
      if (entity.kind === 'duende' && !world.hidden) {
        world._dread = Math.min(100, world._dread + 14);
        world.play?.('giggle', { dist: 1 });
        entity.state = 'flee'; entity.fleeT = 2.6; entity.grace = 1.2;
        const kx = dx / (dist || 1), kz = dz / (dist || 1), limit = world.roomHalf - 0.6;
        cam.position.x = Math.max(-limit, Math.min(limit, cam.position.x + kx * 1.4));
        cam.position.z = Math.max(-limit, Math.min(limit, cam.position.z + kz * 1.4));
        world._banner?.('¡LOS DUENDES!');
      } else {
        world.entityCatch?.(entity);
        if (frame) frame.stopped = true;
        return true;
      }
    }
    return false;
  }

  function animateEntity(entity, now, dt) {
    if (entity.delay !== undefined && entity.delay > 0) return;
    const group = entity.group;
    if (!group || !group.visible) return;
    const time = now * 0.001;
    if (entity.breathe) {
      const breathe = Math.sin(time * entity.breathe.spd + (entity.phase || 0)) * entity.breathe.amp;
      group.scale.set(1 + breathe, 1 + breathe * 0.6, 1 + breathe);
    }
    if (entity.lurch) group.rotation.z = Math.sin(time * entity.lurch.spd + (entity.phase || 0)) * entity.lurch.amp;
    if (entity.armReach) {
      const target = entity.state === 'hunt' || entity.state === 'lunge' ? 1 : 0;
      entity.reachT = (entity.reachT || 0) + (target - (entity.reachT || 0)) * Math.min(1, dt * 2.2);
      entity.armReach.position.z = entity.armReach.userData.z0 + entity.reachT * 0.45;
      entity.armReach.rotation.x = entity.armReach.userData.rx0 - entity.reachT * 0.6;
    }
    if (entity.kind === 'sayona' && entity.faceCalm && entity.faceTrue) {
      const target = entity.calm ? 0 : 1;
      entity.revealT = (entity.revealT || 0) + (target - (entity.revealT || 0)) * Math.min(1, dt * 1.6);
      entity.faceCalm.material.opacity = 1 - entity.revealT;
      entity.faceTrue.material.opacity = entity.revealT;
      if (entity.irises) {
        const trueOn = entity.revealT > 0.5;
        for (const iris of entity.irises) iris.material = trueOn ? iris.userData.trueMat : iris.userData.calmMat;
      }
      if (entity.jaw) entity.jaw.position.y = entity.jaw.userData.y0 - entity.revealT * 0.06;
      if (entity.fangs) {
        const showFangs = entity.revealT > 0.5;
        for (let i = 0; i < entity.fangs.length; i++) entity.fangs[i].visible = showFangs;
      }
    }
    if (entity.eyelids) {
      const faceTransition = entity.kind === 'sayona' && entity.revealT > 0.02 && entity.revealT < 0.98;
      let blink = 0;
      if (!faceTransition) {
        const blinkTime = (time + entity.blinkOffset) % entity.blinkPeriod;
        if (blinkTime < 0.16) {
          blink = blinkTime < 0.045
            ? blinkTime / 0.045
            : 1 - (blinkTime - 0.045) / 0.115;
        }
      }
      for (let i = 0; i < entity.eyelids.length; i++) {
        const lid = entity.eyelids[i];
        const data = lid.userData;
        lid.position.y = data.openY + (data.closedY - data.openY) * blink;
        lid.scale.y = data.openScaleY + (data.closedScaleY - data.openScaleY) * blink;
      }
    }
  }

  return { spawn, tick, animate, remove, clear };
}

export function createNullBestiary() {
  function spawn(kind, x, z) {
    const pos = DEFAULT_VECTOR(x, 0, z);
    const entity = { kind, type: kind, x, z, pos, group: null, state: {}, tick() {} };
    return entity;
  }

  function tick() {}
  function animate() {}
  function remove() { return false; }
  function clear() {}

  return { spawn, tick, animate, remove, clear };
}
