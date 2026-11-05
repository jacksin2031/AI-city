import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LANDMARKS, landmarkForNode } from "./landmarks";
import { mergeCity } from "./materials";

describe("landmark assets", () => {
  it("maps every landmark and station to actual building nodes and local JPEGs", () => {
    const glb = readFileSync(
      fileURLToPath(new URL("../../../apps/web/public/city3d/city.glb", import.meta.url)),
    );
    const jsonLength = glb.readUInt32LE(12);
    const model = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8")) as {
      nodes: { name: string; extras?: { base_z?: number } }[];
    };
    const nodes = new Map(model.nodes.map((node) => [node.name, node]));
    expect(new Set(LANDMARKS.map((item) => item.id)).size).toBe(LANDMARKS.length);
    for (const landmark of LANDMARKS) {
      for (const name of landmark.nodes) {
        expect(nodes.get(name)?.extras?.base_z, name).toEqual(expect.any(Number));
        expect(landmarkForNode(name)).toBe(landmark);
      }
      const image = readFileSync(
        fileURLToPath(new URL(`../../../apps/web/public${landmark.image}`, import.meta.url)),
      );
      expect([...image.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    }
    expect(landmarkForNode("unrelated-building")).toBeUndefined();
  });
  it("retains separate landmark IDs when buildings share a merged material", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    material.name = "shared";
    for (const name of ["LM_sola_city_11", "LM_jr_ochanomizu_station_181"]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
      mesh.name = name;
      mesh.userData.base_z = 0;
      root.add(mesh);
    }
    const fade = {
      center: { value: new THREE.Vector2() },
      zoom: { value: 0 },
      selected: { value: 4 },
      pulse: { value: 0.5 },
    };
    const mesh = mergeCity(root, {}, fade).children[0] as THREE.Mesh;
    const attr = mesh.geometry.getAttribute("cityLandmark");
    expect(new Set(Array.from({ length: attr.count }, (_, index) => attr.getX(index)))).toEqual(
      new Set([4, 5]),
    );
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader:
        "#include <common>\n#include <alphahash_fragment>\n#include <opaque_fragment>",
    };
    (mesh.material as THREE.MeshStandardMaterial).onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain("citySelectedLandmark");
    expect(shader.uniforms).toMatchObject({
      citySelectedLandmark: fade.selected,
      cityLandmarkPulse: fade.pulse,
    });
  });
});
