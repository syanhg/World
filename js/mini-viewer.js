// Auto-rotating, no-controls splat previews shown in catalog tiles.
import { PREVIEW_ORDER, MAX_CONCURRENT_MINI_LOADS } from "./constants.js";
import { state } from "./state.js";
import { pickSpzUrl } from "./format.js";
import { loadSparkModules, frameSplat } from "./spark-loader.js";

const miniViewers = new Map();
const miniTokens = new WeakMap();
let miniObserver = null;

export function ensureMiniObserver() {
  if (miniObserver) return miniObserver;
  miniObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const canvas = entry.target;
        if (entry.isIntersecting) {
          const world = state.worlds.find((item) => item.id === canvas.dataset.worldId);
          if (world) startMiniViewer(canvas, world);
        } else {
          stopMiniViewer(canvas);
        }
      });
    },
    { rootMargin: "150px" }
  );
  return miniObserver;
}

let activeMiniLoads = 0;
const miniQueue = [];

export function runMiniQueue() {
  if (state.mainViewerOpen) return;
  while (activeMiniLoads < MAX_CONCURRENT_MINI_LOADS && miniQueue.length) {
    miniQueue.shift()();
  }
}

export function startMiniViewer(canvas, world) {
  if (miniViewers.has(canvas) || miniTokens.has(canvas)) return;
  const spzUrl = pickSpzUrl(world.spzUrls, PREVIEW_ORDER);
  if (!spzUrl) return;

  const token = { cancelled: false };
  miniTokens.set(canvas, token);

  const run = () => {
    if (token.cancelled) {
      runMiniQueue();
      return;
    }
    activeMiniLoads++;
    buildMiniViewer(canvas, spzUrl)
      .then((built) => {
        if (token.cancelled) {
          built.dispose();
        } else {
          miniViewers.set(canvas, built);
        }
      })
      .catch(() => {})
      .finally(() => {
        activeMiniLoads--;
        runMiniQueue();
      });
  };

  miniQueue.push(run);
  runMiniQueue();
}

export function stopMiniViewer(canvas) {
  const token = miniTokens.get(canvas);
  if (token) token.cancelled = true;
  miniTokens.delete(canvas);
  const built = miniViewers.get(canvas);
  if (built) {
    built.dispose();
    miniViewers.delete(canvas);
  }
}

async function buildMiniViewer(canvas, spzUrl) {
  const { THREE, SparkRenderer, SplatMesh } = await loadSparkModules();

  const width = canvas.clientWidth || 108;
  const height = canvas.clientHeight || 108;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 2000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const spark = new SparkRenderer({ renderer, maxStdDev: Math.sqrt(5) });
  scene.add(spark);

  const splat = new SplatMesh({ url: spzUrl });
  scene.add(splat);
  await splat.initialized;

  const { center, radius } = frameSplat(THREE, splat);
  let angle = Math.random() * Math.PI * 2;

  function animate() {
    angle += 0.004;
    camera.position.set(
      center.x + Math.sin(angle) * radius * 1.5,
      center.y + radius * 0.2,
      center.z + Math.cos(angle) * radius * 1.5
    );
    camera.lookAt(center);
    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(animate);

  return {
    renderer,
    animate,
    dispose() {
      renderer.setAnimationLoop(null);
      splat.dispose();
      renderer.dispose();
    }
  };
}

export function pauseMiniViewers() {
  miniViewers.forEach((v) => v.renderer.setAnimationLoop(null));
}

export function resumeMiniViewers() {
  miniViewers.forEach((v) => v.renderer.setAnimationLoop(v.animate));
}
