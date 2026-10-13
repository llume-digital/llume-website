import * as THREE from "three";

const canvas = document.getElementById("bg");
const nav = document.getElementById("nav");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = innerWidth < 860;

/* ---------- nav + reveal ---------- */
const onScrollNav = () => nav.classList.toggle("scrolled", scrollY > 20);
addEventListener("scroll", onScrollNav, { passive: true });
onScrollNav();

const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- 3D: ribbon of light ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
camera.position.set(0, 0, 7);

const COUNT = isMobile ? 18000 : 55000;
const STRANDS = 7;
const geo = new THREE.BufferGeometry();
const aT = new Float32Array(COUNT);
const aS = new Float32Array(COUNT);
const aR = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  aT[i] = Math.random();
  aS[i] = Math.floor(Math.random() * STRANDS);
  aR[i * 3] = Math.random() - 0.5;
  aR[i * 3 + 1] = Math.random() - 0.5;
  aR[i * 3 + 2] = Math.random() - 0.5;
}
geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
geo.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
geo.setAttribute("aR", new THREE.BufferAttribute(aR, 3));

const mat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uMouse: { value: new THREE.Vector2() },
    uPx: { value: renderer.getPixelRatio() },
    uSpread: { value: isMobile ? 0.25 : 1 },
    uSize: { value: isMobile ? 1.6 : 2.1 },
  },
  vertexShader: /* glsl */ `
    attribute float aT; attribute float aS; attribute vec3 aR;
    uniform float uTime, uScroll, uPx, uSize, uSpread; uniform vec2 uMouse;
    varying float vA; varying float vH;
    void main() {
      float t = fract(aT + uTime * 0.012 * (0.6 + aS * 0.12));
      float s = aS;
      float env = sin(t * 3.14159);                 // narrow at both ends
      float a = t * 3.6 - 1.4 + uScroll * 1.2;
      vec3 p;
      p.x = sin(a * 0.95 + s * 0.22) * 2.6 + cos(uTime * 0.15 + s) * 0.12;
      p.y = (t - 0.5) * 6.4 + sin(t * 5.0 + uTime * 0.25 + s * 0.6) * 0.18;
      p.z = cos(a * 0.95 + s * 0.22) * 1.9 + (s - 3.0) * 0.07;
      // turbulence + spread (wider mid-ribbon)
      float spread = (0.05 + env * 0.45) * (0.4 + fract(aR.x * 7.0));
      p += aR * spread * vec3(1.0, 0.5, 1.0);
      p += 0.05 * vec3(sin(uTime * 0.6 + aR.x * 40.0), cos(uTime * 0.5 + aR.y * 40.0), 0.0);
      // global motion: drift to the right on hero, ease over sections
      float side = mix(1.7, -1.9, smoothstep(0.08, 0.3, uScroll) * (1.0 - smoothstep(0.5, 0.75, uScroll)));
      side = mix(side, 1.6, smoothstep(0.75, 1.0, uScroll));
      float ang = uScroll * 5.0 + uMouse.x * 0.35;
      mat2 r = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
      p.xz = r * p.xz;
      p.x += side * uSpread;
      p.y += uMouse.y * 0.3;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * uPx * (11.0 / -mv.z) * (0.5 + fract(aR.y * 13.0));
      vA = (0.4 + env * 0.9) * (0.45 + fract(aR.z * 9.0) * 0.55);
      vH = clamp(env + aR.x * 0.4, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vA; varying float vH;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      if (d > 0.5) discard;
      float f = pow(1.0 - d * 2.0, 1.6);
      vec3 deep = vec3(0.72, 0.38, 0.14);
      vec3 hot = vec3(1.0, 0.86, 0.66);
      gl_FragColor = vec4(mix(deep, hot, vH), f * vA);
    }
  `,
});
const points = new THREE.Points(geo, mat);
points.frustumCulled = false; // positions are computed in the shader
scene.add(points);

/* ---------- sky: starfield + constellation rotating around Polaris ---------- */
const polarisPos = new THREE.Vector3(3.3, 1.9, -1);
const sky = new THREE.Group();
scene.add(sky);

const STARS = isMobile ? 700 : 1800;
const sPos = new Float32Array(STARS * 3), sSeed = new Float32Array(STARS);
for (let i = 0; i < STARS; i++) {
  const r = Math.sqrt(Math.random()) * 32;
  const a = Math.random() * Math.PI * 2;
  sPos[i * 3] = Math.cos(a) * r;
  sPos[i * 3 + 1] = Math.sin(a) * r;
  sPos[i * 3 + 2] = -6 - Math.random() * 10;
  sSeed[i] = Math.random();
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
starGeo.setAttribute("aSeed", new THREE.BufferAttribute(sSeed, 1));
const starMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: mat.uniforms.uTime, uPx: mat.uniforms.uPx },
  vertexShader: /* glsl */ `
    attribute float aSeed; uniform float uTime, uPx; varying float vA; varying float vC;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 2.0) + aSeed * 60.0);
      gl_PointSize = uPx * (1.0 + pow(aSeed, 6.0) * 4.0) * (0.8 + tw * 0.4);
      vA = (0.25 + aSeed * 0.6) * tw; vC = aSeed;
    }`,
  fragmentShader: /* glsl */ `
    varying float vA; varying float vC;
    void main() {
      float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      vec3 col = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.9, 0.78), step(0.75, vC));
      gl_FragColor = vec4(col, (1.0 - d * 2.0) * vA);
    }`,
});
const starfield = new THREE.Points(starGeo, starMat);
starfield.frustumCulled = false;
sky.add(starfield);

// constellation (Osa Menor-like) anchored on Polaris
const cons = [[0, 0], [-0.9, -0.7], [-1.9, -1.1], [-2.9, -0.6], [-3.2, -1.7], [-4.3, -2.0], [-4.5, -0.9], [-3.2, -0.6]];
const cp = cons.map(([x, y]) => new THREE.Vector3(x, y, -2));
const lineIdx = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
const lp = [];
lineIdx.forEach(([a, b]) => lp.push(cp[a].x, cp[a].y, cp[a].z, cp[b].x, cp[b].y, cp[b].z));
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
const constLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xbcc8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
const nodeGeo = new THREE.BufferGeometry().setFromPoints(cp.slice(1));
const nodes = new THREE.Points(nodeGeo, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 0.11, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
const constGroup = new THREE.Group();
constGroup.add(constLines, nodes);
sky.add(constGroup);

// orbit rings around the pole
const ringGroup = new THREE.Group();
[1.2, 2.2, 3.6].forEach((r, i) => {
  const pts = [];
  for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, -2)); }
  ringGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xbcc8ff, transparent: true, opacity: 0.07 - i * 0.015, depthWrite: false })));
});
sky.add(ringGroup);
sky.position.copy(polarisPos);

// Polaris itself: bright core + cross-shaped rays
const polaris = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4),
  new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: mat.uniforms.uTime },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform float uTime;
      void main() {
        vec2 p = vUv * 4.0; float r = length(p);
        float pulse = 0.92 + 0.08 * sin(uTime * 1.3);
        float core = exp(-r * 14.0) * 1.6;
        float halo = exp(-r * 2.6) * 0.32;
        float cross = (exp(-abs(p.x) * 38.0) * exp(-abs(p.y) * 1.5) + exp(-abs(p.y) * 38.0) * exp(-abs(p.x) * 1.5)) * 0.9;
        vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * p;
        float diag = (exp(-abs(q.x) * 55.0) * exp(-abs(q.y) * 3.2) + exp(-abs(q.y) * 55.0) * exp(-abs(q.x) * 3.2)) * 0.35;
        vec3 col = vec3(0.86, 0.9, 1.0) * (core + cross) + vec3(1.0, 0.8, 0.55) * halo + vec3(0.8, 0.86, 1.0) * diag;
        gl_FragColor = vec4(col * pulse, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
      }`,
  })
);
polaris.position.copy(polarisPos);
polaris.frustumCulled = false;
scene.add(polaris);

function placeSky() {
  const mobile = innerWidth < 860;
  polarisPos.set(mobile ? 1.5 : 3.3, mobile ? 3.4 : 1.9, -1);
  sky.position.copy(polarisPos);
  polaris.position.copy(polarisPos);
  polaris.scale.setScalar(mobile ? 0.8 : 1);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.position.z = w < 860 ? 9.5 : 7;
  camera.updateProjectionMatrix();
  placeSky();
}
resize();
addEventListener("resize", resize);

const mouse = new THREE.Vector2(), mouseT = new THREE.Vector2();
addEventListener("pointermove", (e) => {
  mouseT.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
});

let scrollSmooth = 0;
const clock = new THREE.Clock();
function frame() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const target = max > 0 ? scrollY / max : 0;
  scrollSmooth += (target - scrollSmooth) * 0.05;
  mouse.lerp(mouseT, 0.04);
  mat.uniforms.uTime.value = reduceMotion ? 20 : clock.getElapsedTime();
  mat.uniforms.uScroll.value = scrollSmooth;
  mat.uniforms.uMouse.value.copy(mouse);
  const t = mat.uniforms.uTime.value;
  sky.rotation.z = t * 0.012 + scrollSmooth * 0.8;       // the sky turns around Polaris
  constGroup.rotation.z = Math.sin(t * 0.15) * 0.04;
  camera.position.x = mouse.x * 0.25; camera.position.y = mouse.y * 0.15; camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  if (!reduceMotion && !document.hidden) requestAnimationFrame(frame);
  else running = false;
}
let running = true;
frame();
if (reduceMotion) addEventListener("scroll", () => requestAnimationFrame(frame), { passive: true });

/* pause when tab hidden */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !reduceMotion && !running) { running = true; requestAnimationFrame(frame); }
});

/* ---------- contact form: opens a ready-to-send email to info@llume.net ---------- */
const form = document.getElementById("contact-form");
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const d = new FormData(form);
  const body = `Nombre: ${d.get("nombre")}\nEmpresa: ${d.get("empresa") || "-"}\n\n${d.get("mensaje")}`;
  const subject = `Solicitud de reunión de 30 minutos: ${d.get("nombre")}${d.get("empresa") ? " (" + d.get("empresa") + ")" : ""}`;
  location.href = `mailto:info@llume.net?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  form.querySelector("button").textContent = "Abriendo tu correo ✓";
});
