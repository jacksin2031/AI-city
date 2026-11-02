import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { cityMaterial } from "./materials";

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
