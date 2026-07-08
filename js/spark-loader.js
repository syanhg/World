// Shared by the full-screen viewer and the mini catalog previews.
export async function loadSparkModules() {
  const [THREE, spark, addons] = await Promise.all([
    import("three"),
    import("@sparkjsdev/spark"),
    import("three/addons/controls/OrbitControls.js")
  ]);
  return { THREE, SparkRenderer: spark.SparkRenderer, SplatMesh: spark.SplatMesh, OrbitControls: addons.OrbitControls };
}

export function frameSplat(THREE, splat) {
  const box = splat.getBoundingBox(true);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.5) * 0.5;
  return { center, radius };
}
