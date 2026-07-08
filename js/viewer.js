// The full-screen immersive splat viewer (the modal stage), with WASD/arrow
// flying on top of OrbitControls.
import { DETAIL_ORDER } from "./constants.js";
import { state } from "./state.js";
import { pickSpzUrl } from "./format.js";
import { loadSparkModules, frameSplat } from "./spark-loader.js";
import {
  modal,
  worldCanvas,
  stageLoading,
  stageLoadingText,
  modalTitle,
  openMarbleButton,
  copyButton,
  closeModalButton
} from "./dom.js";
import { pauseMiniViewers, resumeMiniViewers, runMiniQueue } from "./mini-viewer.js";
import { setStatus } from "./status.js";

let activeWorld = state.worlds[0] || null;
let viewer = null;
let loadToken = 0;

function resetStage() {
  stageLoading.hidden = true;
  stageLoading.classList.remove("is-error");
}

function disposeViewer() {
  if (!viewer) return;
  window.removeEventListener("resize", viewer.onResize);
  window.removeEventListener("keydown", viewer.onKeyDown);
  window.removeEventListener("keyup", viewer.onKeyUp);
  viewer.renderer.setAnimationLoop(null);
  viewer.controls.dispose();
  viewer.splat.dispose();
  viewer.renderer.dispose();
  viewer = null;
}

async function buildViewer(world) {
  const spzUrl = pickSpzUrl(world.spzUrls, DETAIL_ORDER);
  if (!spzUrl) {
    throw new Error("This world does not have a Gaussian splat export available yet.");
  }

  const { THREE, SparkRenderer, SplatMesh, OrbitControls } = await loadSparkModules();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.01, 2000);
  const renderer = new THREE.WebGLRenderer({ canvas: worldCanvas, antialias: false, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);

  const spark = new SparkRenderer({ renderer, maxStdDev: Math.sqrt(5) });
  scene.add(spark);

  const splat = new SplatMesh({
    url: spzUrl,
    onProgress: (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        stageLoadingText.textContent = percent < 100 ? `Loading World Data… ${percent}%` : "Preparing 3D View…";
      }
    }
  });
  scene.add(splat);
  await splat.initialized;

  const { center, radius } = frameSplat(THREE, splat);
  camera.position.set(center.x, center.y, center.z + radius * 1.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = radius * 0.05;
  controls.maxDistance = radius * 5;
  controls.update();

  function onResize() {
    const rect = worldCanvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  window.addEventListener("resize", onResize);
  onResize();

  const pressedKeys = new Set();
  const moveKeys = new Set([
    "w", "a", "s", "d",
    "arrowup", "arrowdown", "arrowleft", "arrowright"
  ]);

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (!moveKeys.has(key)) return;
    pressedKeys.add(key);
    event.preventDefault();
  }

  function onKeyUp(event) {
    pressedKeys.delete(event.key.toLowerCase());
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  const forwardVec = new THREE.Vector3();
  const rightVec = new THREE.Vector3();
  const moveVec = new THREE.Vector3();
  const flySpeed = radius * 0.8;

  function applyKeyboardMovement(delta) {
    let forwardInput = 0;
    let rightInput = 0;
    if (pressedKeys.has("w") || pressedKeys.has("arrowup")) forwardInput += 1;
    if (pressedKeys.has("s") || pressedKeys.has("arrowdown")) forwardInput -= 1;
    if (pressedKeys.has("d") || pressedKeys.has("arrowright")) rightInput += 1;
    if (pressedKeys.has("a") || pressedKeys.has("arrowleft")) rightInput -= 1;
    if (!forwardInput && !rightInput) return;

    camera.getWorldDirection(forwardVec);
    rightVec.crossVectors(forwardVec, camera.up).normalize();

    moveVec.set(0, 0, 0);
    moveVec.addScaledVector(forwardVec, forwardInput * flySpeed * delta);
    moveVec.addScaledVector(rightVec, rightInput * flySpeed * delta);

    camera.position.add(moveVec);
    controls.target.add(moveVec);
  }

  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    applyKeyboardMovement(clock.getDelta());
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    worldId: world.id,
    renderer,
    scene,
    camera,
    controls,
    splat,
    onResize,
    onKeyDown,
    onKeyUp
  };
}

async function openWorld3d(world) {
  const myToken = ++loadToken;
  stageLoading.hidden = false;
  stageLoading.classList.remove("is-error");
  stageLoadingText.textContent = "Loading World Data…";

  const slowNoticeTimer = setTimeout(() => {
    if (loadToken === myToken) {
      stageLoadingText.textContent = "Still loading… this world's file is taking a while over your connection.";
    }
  }, 15000);

  try {
    disposeViewer();
    const built = await buildViewer(world);
    clearTimeout(slowNoticeTimer);

    // The user may have closed the modal or opened a different world while
    // this was in flight — discard the finished build instead of leaking a
    // renderer/animation loop nobody references anymore.
    if (loadToken !== myToken || !modal.open || !activeWorld || activeWorld.id !== world.id) {
      window.removeEventListener("resize", built.onResize);
      window.removeEventListener("keydown", built.onKeyDown);
      window.removeEventListener("keyup", built.onKeyUp);
      built.renderer.setAnimationLoop(null);
      built.controls.dispose();
      built.splat.dispose();
      built.renderer.dispose();
      return;
    }

    viewer = built;
    stageLoading.hidden = true;
  } catch (error) {
    clearTimeout(slowNoticeTimer);
    if (loadToken === myToken) {
      stageLoadingText.textContent = error.message;
      stageLoading.classList.add("is-error");
    }
  }
}

export function openWorld(world) {
  if (viewer && viewer.worldId !== world.id) {
    disposeViewer();
  }
  resetStage();
  pauseMiniViewers();
  state.mainViewerOpen = true;

  activeWorld = world;
  modalTitle.textContent = world.title;
  openMarbleButton.href = world.marbleUrl || "#";
  modal.showModal();

  if (viewer && viewer.worldId === world.id) {
    stageLoading.hidden = true;
  } else {
    openWorld3d(world);
  }
}

closeModalButton.addEventListener("click", () => modal.close());

modal.addEventListener("close", () => {
  disposeViewer();
  resetStage();
  state.mainViewerOpen = false;
  resumeMiniViewers();
  runMiniQueue();
});

copyButton.addEventListener("click", async () => {
  const url = activeWorld?.marbleUrl || `${location.href.split("#")[0]}#${activeWorld?.id || ""}`;
  await navigator.clipboard.writeText(url);
  setStatus("Copied", url, 100);
});
