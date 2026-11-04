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
    pedestrianSignals: [],
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

it("keeps cars and train carriages upright on a sloping reverse-direction route", () => {
  const model = new THREE.Group();
  for (const name of ["Car_reverse_body", "Train_reverse_car01"]) {
    const object = new THREE.Object3D();
    object.name = name;
    model.add(object);
  }
  const data: TrafficData = {
    pedestrianSignals: [],
    paths: [
      {
        name: "reverse",
        kind: "rail",
        pts: [
          [0, 0, 0],
          [-100, 0, 5],
        ],
        length: 100.125,
      },
    ],
    vehicles: [
      { controller: "Train_reverse", path: "reverse", s: 20, cars: 1, car_length: 10, gap: 0 },
    ],
  };
  createTraffic(data, model, new THREE.Group());
  const train = model.getObjectByName("Train_reverse_car01") as THREE.Object3D;
  expect(new THREE.Vector3(0, 1, 0).applyQuaternion(train.quaternion).y).toBeGreaterThan(0.99);

  data.paths = data.paths.map((path) => ({ ...path, kind: "road" }));
  data.vehicles = [{ controller: "Car_reverse", path: "reverse", s: 20 }];
  createTraffic(data, model, new THREE.Group());
  const car = model.getObjectByName("Car_reverse_body") as THREE.Object3D;
  expect(new THREE.Vector3(0, 1, 0).applyQuaternion(car.quaternion).y).toBeGreaterThan(0.99);
});

it("uses the carriage span to avoid pitching on a single noisy track point", () => {
  const model = new THREE.Group();
  const train = new THREE.Object3D();
  train.name = "Train_spike_car01";
  model.add(train);
  const centre = 17 + Math.sqrt(18);
  const data: TrafficData = {
    pedestrianSignals: [],
    paths: [
      {
        name: "track",
        kind: "rail",
        pts: [
          [0, 0, 0],
          [17, 0, 0],
          [20, 0, 3],
          [23, 0, 0],
          [50, 0, 0],
        ],
        length: 52.5,
      },
    ],
    vehicles: [
      { controller: "Train_spike", path: "track", s: centre + 10, cars: 1, car_length: 20, gap: 0 },
    ],
  };
  createTraffic(data, model, new THREE.Group());
  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(train.quaternion);
  expect(Math.abs(forward.y)).toBeLessThan(0.05);
  expect(Math.abs(train.position.y)).toBeLessThan(0.1);
});

it("applies the Metro track height only to Marunouchi rail vehicles", () => {
  const model = new THREE.Group();
  for (const name of ["Train_metro_car01", "Train_other_car01", "Car_road_body"]) {
    const object = new THREE.Object3D();
    object.name = name;
    model.add(object);
  }
  const path = {
    pts: [
      [0, 0, 10],
      [100, 0, 10],
    ] as [number, number, number][],
    length: 100,
  };
  const data: TrafficData = {
    pedestrianSignals: [],
    paths: [
      { ...path, name: "metro", kind: "rail", line: "marunouchi" },
      { ...path, name: "other", kind: "rail", line: "chuo" },
      { ...path, name: "road", kind: "road" },
    ],
    vehicles: [
      { controller: "Train_metro", path: "metro", s: 30, cars: 1, car_length: 10 },
      { controller: "Train_other", path: "other", s: 30, cars: 1, car_length: 10 },
      { controller: "Car_road", path: "road", s: 30 },
    ],
  };
  const traffic = createTraffic(data, model, new THREE.Group(), -5.25);
  traffic.update(1);
  expect(model.getObjectByName("Train_metro_car01")?.position.y).toBeCloseTo(4.75);
  expect(model.getObjectByName("Train_other_car01")?.position.y).toBeCloseTo(10);
  expect(model.getObjectByName("Car_road_body")?.position.y).toBeCloseTo(10);
});

it("adds a shared-model car without overlapping traffic when a route loops", () => {
  const model = new THREE.Group();
  const source = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial());
  source.name = "Car_source_body";
  model.add(source);
  const data: TrafficData = {
    pedestrianSignals: [],
    paths: [
      {
        name: "road",
        kind: "road",
        pts: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        length: 100,
        stops: [],
      },
    ],
    vehicles: [
      { controller: "Car_source", path: "road", s: 98 },
      { controller: "Car_extra", sourceController: "Car_source", path: "road", s: 2 },
    ],
  };
  const traffic = createTraffic(data, model, new THREE.Group());
  const extra = model.getObjectByName("Car_extra_body") as THREE.Mesh;
  expect(extra).toBeDefined();
  expect(extra.geometry).toBe(source.geometry);
  expect(extra.material).toBe(source.material);
  traffic.update(0.5);
  expect(source.position.x).toBeGreaterThan(90);
  traffic.update(1.5);
  expect(source.position.x).toBeLessThan(extra.position.x);
  expect(extra.position.x - source.position.x).toBeGreaterThanOrEqual(6.99);
});

it("makes added cars obey the same red and green signals", () => {
  const model = new THREE.Group();
  const source = new THREE.Object3D();
  source.name = "Car_source_body";
  model.add(source);
  const data: TrafficData = {
    pedestrianSignals: [],
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
    ],
    vehicles: [
      { controller: "Car_source", path: "road", s: 300 },
      { controller: "Car_extra", sourceController: "Car_source", path: "road", s: 0 },
    ],
  };
  const traffic = createTraffic(data, model, new THREE.Group());
  const extra = model.getObjectByName("Car_extra_body") as THREE.Object3D;
  traffic.update(20);
  expect(extra.position.x).toBeCloseTo(165);
  traffic.update(19);
  expect(extra.position.x).toBeCloseTo(165);
  traffic.update(2);
  expect(extra.position.x).toBeGreaterThan(165);
});
