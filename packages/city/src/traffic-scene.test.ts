import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createTraffic, type TrafficData } from "./traffic-scene";

function fixture() {
  const model = new THREE.Group();
  for (const name of ["Car_test_body", "Train_test_car01"]) {
    const object = new THREE.Object3D();
    object.name = name;
    model.add(object);
  }
  const city = new THREE.Group();
  for (const colour of ["G", "Y", "R"]) {
    const material = new THREE.MeshStandardMaterial();
    material.name = `SG_VehA_${colour}`;
    city.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  }
  const data: TrafficData = {
    paths: [
      {
        name: "road",
        kind: "road",
        pts: [
          [0, 0, 0],
          [500, 0, 0],
        ],
        length: 500,
        stops: [{ distance: 165, group: "A" }],
      },
      {
        name: "rail",
        kind: "rail",
        pts: [
          [0, 0, 0],
          [500, 0, 0],
        ],
        length: 500,
        stationCentre: 30,
      },
    ],
    vehicles: [
      { controller: "Car_test", path: "road", s: 0 },
      { controller: "Train_test", path: "rail", s: 0, cars: 1, car_length: 10, gap: 0 },
    ],
  };
  return { model, city, traffic: createTraffic(data, model, city) };
}

describe("traffic scene", () => {
  it("keeps a car stopped at the red lamp and moves it after green", () => {
    const { model, city, traffic } = fixture();
    traffic.update(20);
    const car = model.getObjectByName("Car_test_body") as THREE.Object3D;
    const red = city.children.find(
      (child) =>
        (child as THREE.Mesh).material &&
        ((child as THREE.Mesh).material as THREE.Material).name === "SG_VehA_R",
    ) as THREE.Mesh;
    expect(car.position.x).toBeCloseTo(165);
    expect((red.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
    traffic.update(19);
    expect(car.position.x).toBeCloseTo(165);
    traffic.update(2);
    expect(car.position.x).toBeGreaterThan(165);
  });
  it("stops a train at the simulated platform and departs on its scheduled minute", () => {
    const { model, traffic } = fixture();
    const train = model.getObjectByName("Train_test_car01") as THREE.Object3D;
    traffic.update(10);
    expect(train.position.x).toBeCloseTo(30);
    traffic.update(49);
    expect(train.position.x).toBeCloseTo(30);
    traffic.update(2);
    expect(train.position.x).toBeGreaterThan(30);
  });
});
