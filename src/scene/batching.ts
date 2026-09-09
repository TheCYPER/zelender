import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Batch static objects sharing a material; animated descendants stay separate. */
export function batchStaticMeshes(parent: THREE.Object3D, recursive = false) {
  parent.updateWorldMatrix(true, true);
  const inverse = parent.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  const visit = (object: THREE.Object3D) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material)) return;
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(object);
    buckets.set(key, bucket);
  };
  if (recursive) parent.traverse(visit); else parent.children.forEach(visit);
  const obsolete = new Set<THREE.BufferGeometry>();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const pieces = meshes.map(mesh => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      return geometry;
    });
    const merged = mergeGeometries(pieces);
    pieces.forEach(piece => piece.dispose());
    if (!merged) continue;
    const batch = new THREE.Mesh(merged, meshes[0].material);
    batch.castShadow = meshes[0].castShadow;
    batch.receiveShadow = meshes[0].receiveShadow;
    meshes.forEach(mesh => { mesh.removeFromParent(); obsolete.add(mesh.geometry); });
    parent.add(batch);
  }
  // Shared geometries may still be used by a singleton bucket.
  parent.traverse(object => { if (object instanceof THREE.Mesh) obsolete.delete(object.geometry); });
  obsolete.forEach(geometry => geometry.dispose());
}
