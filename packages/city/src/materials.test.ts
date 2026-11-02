import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { cityMaterial, mergeCity, updateBuildingFade } from "./materials";

const spec = {
  kind: "facade" as const,
  color: [0.5, 0.5, 0.5] as [number, number, number],
  roughness: 0.85,
  grid: [2, 4] as [number, number],
  pairs: [
    [[0.5, 0.5, 0.5]],
    [
      [0.5, 0.5, 0.5],
      [0.6, 0.6, 0.6],
    ],
    [
      [0.1, 0.1, 0.1],
      [0.2, 0.2, 0.2],
    ],
    [
      [0.3, 0.3, 0.3],
      [0.4, 0.4, 0.4],
    ],
  ] as [number, number, number][][],
};

function uniformsFor(name: string) {
  const { material } = cityMaterial(name, spec, new THREE.MeshStandardMaterial());
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <roughnessmap_fragment>",
  };
  material.onBeforeCompile(shader as never, {} as never);
  return shader.uniforms as Record<string, { value: number | THREE.Vector4 }>;
}

describe("Blender facade parameters", () => {
  it("uses the original office window proportions", () => {
    expect(uniformsFor("F_OfficeGrey").windowBox?.value).toEqual(
      new THREE.Vector4(0.225, 0.775, 0.32, 0.8),
    );
  });
  it("uses landmark roof classification and disables ground-floor storefronts", () => {
    const uniforms = uniformsFor("F_Nikolai");
    expect(uniforms.roofThreshold?.value).toBe(0.2);
    expect(uniforms.hasShop?.value).toBe(0);
  });
  it("preserves different curtain wall mullions", () => {
    expect(uniformsFor("F_Waterras").windowBox?.value).toEqual(new THREE.Vector4(0.05, 1, 0.08, 1));
  });
});

it("treats the visible back of a downward-facing roof as an upward-facing roof", () => {
  const source = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  const { material } = cityMaterial("F_OfficeGrey", spec, source);
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <roughnessmap_fragment>",
  };
  material.onBeforeCompile(shader as never, {} as never);
  expect(shader.fragmentShader).toContain("gl_FrontFacing ? 1.0 : -1.0");
});

it("keeps station-sign UVs and the emissive texture when merging meshes", () => {
  const root = new THREE.Group();
  const sign = new THREE.MeshStandardMaterial({ emissiveMap: new THREE.Texture() });
  sign.name = "SIGN_ekimei_local_wl";
  const board = new THREE.PlaneGeometry(2, 1);
  root.add(new THREE.Mesh(board, sign), new THREE.Mesh(board.clone(), sign));
  const merged = mergeCity(root, {});
  const mesh = merged.getObjectByName("SIGN_ekimei_local_wl") as THREE.Mesh;
  expect(mesh).toBeDefined();
  expect(mesh.geometry.getAttribute("uv").count).toBe(8);
  expect((mesh.material as THREE.MeshStandardMaterial).emissiveMap).toBe(sign.emissiveMap);
  expect((mesh.material as THREE.MeshStandardMaterial).map).toBe(sign.emissiveMap);
  expect((mesh.material as THREE.MeshStandardMaterial).color).toEqual(new THREE.Color(0xffffff));
});

it("keeps building bounds separate and fades buildings without fading other scenery", () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  material.name = "shared";
  const building = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 6), material);
  building.position.set(30, 4, -20);
  building.userData.base_z = 0;
  const road = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), material);
  root.add(building, road);
  const fade = { center: { value: new THREE.Vector2() }, zoom: { value: 0 } };
  const city = mergeCity(root, {}, fade);
  expect(city.children).toHaveLength(2);
  const buildingMesh = city.children.find((child) =>
    (child as THREE.Mesh).geometry.hasAttribute("cityBounds"),
  ) as THREE.Mesh;
  const groundMesh = city.children.find((child) => child !== buildingMesh) as THREE.Mesh;
  const bounds = buildingMesh.geometry.getAttribute("cityBounds");
  expect([bounds.getX(0), bounds.getY(0), bounds.getZ(0), bounds.getW(0)]).toEqual([
    25, -23, 35, -17,
  ]);
  expect((buildingMesh.material as THREE.MeshStandardMaterial).transparent).toBe(true);
  expect((groundMesh.material as THREE.MeshStandardMaterial).transparent).toBe(false);
  updateBuildingFade(fade, 30, 20, 24);
  expect(fade.center.value).toEqual(new THREE.Vector2(30, -20));
  expect(fade.zoom.value).toBe(24);
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <alphahash_fragment>",
  };
  (buildingMesh.material as THREE.MeshStandardMaterial).onBeforeCompile(
    shader as never,
    {} as never,
  );
  expect(shader.fragmentShader).toContain("diffuseColor.a *= 1.0 - 0.7 * nearby * closeZoom");
  expect(shader.uniforms).toMatchObject({ cityFadeCenter: fade.center, cityFadeZoom: fade.zoom });
});
