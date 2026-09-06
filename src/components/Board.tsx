import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  useGLTF,
  RoundedBox,
  Line,
} from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import boardFont from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url";
import {
  CITIES,
  PALETTE,
  PLAYER_COLORS,
  ROUTES,
  type Route,
} from "../game/data";
import type { View } from "../game/engine";

const WIDTH = 24,
  DEPTH = 15.5;
export function cityPosition(name: string): [number, number, number] {
  const c = CITIES[name];
  return [(c[0] - 0.5) * WIDTH, 0.24, (0.5 - c[1]) * DEPTH];
}
const coastline = [
  [0.06, 0.97],
  [0.96, 0.97],
  [0.987, 0.91],
  [0.982, 0.81],
  [0.966, 0.75],
  [0.94, 0.72],
  [0.95, 0.68],
  [0.926, 0.65],
  [0.94, 0.6],
  [0.93, 0.53],
  [0.905, 0.48],
  [0.913, 0.43],
  [0.9, 0.39],
  [0.863, 0.34],
  [0.874, 0.28],
  [0.925, 0.12],
  [0.918, 0.082],
  [0.886, 0.094],
  [0.84, 0.23],
  [0.806, 0.25],
  [0.77, 0.225],
  [0.745, 0.195],
  [0.707, 0.17],
  [0.686, 0.135],
  [0.654, 0.16],
  [0.62, 0.13],
  [0.595, 0.11],
  [0.574, 0.115],
  [0.53, 0.04],
  [0.491, 0.052],
  [0.452, 0.105],
  [0.428, 0.17],
  [0.365, 0.155],
  [0.328, 0.17],
  [0.295, 0.173],
  [0.263, 0.185],
  [0.22, 0.2],
  [0.164, 0.217],
  [0.131, 0.263],
  [0.12, 0.305],
  [0.085, 0.337],
  [0.055, 0.41],
  [0.042, 0.48],
  [0.061, 0.55],
  [0.052, 0.59],
  [0.067, 0.65],
  [0.071, 0.72],
  [0.089, 0.75],
  [0.065, 0.8],
  [0.082, 0.85],
  [0.05, 0.9],
];
function landShape() {
  const s = new THREE.Shape();
  coastline.forEach(([x, y], i) => {
    const a = (x - 0.5) * WIDTH,
      b = (y - 0.5) * DEPTH;
    if (i === 0) s.moveTo(a, b);
    else s.lineTo(a, b);
  });
  s.closePath();
  return s;
}
function Terrain() {
  const shape = useMemo(landShape, []);
  const mountains = useMemo(
    () =>
      Array.from({ length: 65 }, (_, i) => {
        const t = i / 64;
        return {
          x: -6.6 + t * 4 + Math.sin(i * 7) * 0.42,
          z: -6.4 + t * 10,
          h: 0.15 + (Math.sin(i * 13) + 1) * 0.2,
          r: 0.25 + (Math.cos(i * 5) + 1) * 0.13,
        };
      }),
    [],
  );
  const trees = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        x: Math.sin(i * 43.4) * 9,
        z: Math.cos(i * 34.7) * 4.9,
        s: 0.07 + (i % 4) * 0.02,
      })).filter((t) => t.z < 0 || t.x < 0),
    [],
  );
  return (
    <group>
      <RoundedBox args={[25.5, 0.6, 17]} radius={0.18} position={[0, -0.55, 0]}>
        <meshStandardMaterial color="#443729" roughness={0.75} />
      </RoundedBox>
      <RoundedBox
        args={[25.1, 0.12, 16.6]}
        radius={0.13}
        position={[0, -0.19, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#86aaa6" roughness={0.85} />
      </RoundedBox>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.06, 0]}
        receiveShadow
      >
        <extrudeGeometry
          args={[
            shape,
            {
              depth: 0.18,
              bevelEnabled: true,
              bevelThickness: 0.04,
              bevelSize: 0.045,
              bevelSegments: 1,
            },
          ]}
        />
        <meshStandardMaterial color="#c8c6a0" roughness={1} />
      </mesh>
      {mountains.map((m, i) => (
        <group key={i} position={[m.x, 0.12, m.z]}>
          <mesh position={[0, m.h / 2, 0]} castShadow>
            <coneGeometry args={[m.r, m.h, 5]} />
            <meshStandardMaterial
              color={i % 3 === 0 ? "#b2b194" : "#aaa78d"}
              flatShading
            />
          </mesh>
          {m.h > 0.43 && (
            <mesh position={[0, m.h * 0.82, 0]}>
              <coneGeometry args={[m.r * 0.28, m.h * 0.32, 5]} />
              <meshStandardMaterial color="#efead7" />
            </mesh>
          )}
        </group>
      ))}
      {trees.map((t, i) => (
        <mesh key={i} position={[t.x, 0.19 + t.s, t.z]}>
          <coneGeometry args={[t.s, t.s * 2.5, 5]} />
          <meshStandardMaterial color={i % 2 ? "#829571" : "#748c6e"} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, -0.3]} position={[3.2, 0.165, -3.6]}>
        <circleGeometry args={[0.8, 30]} />
        <meshStandardMaterial color="#86aaa6" />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0.3]}
        position={[4.8, 0.166, -2.45]}
        scale={[0.35, 1, 1]}
      >
        <circleGeometry args={[0.9, 30]} />
        <meshStandardMaterial color="#86aaa6" />
      </mesh>
      <Text
        font={boardFont}
        position={[-9.8, 0.08, 2.5]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        fontSize={0.21}
        color="#426e70"
        letterSpacing={0.25}
      >
        PACIFIC OCEAN
      </Text>
      <Text
        font={boardFont}
        position={[10.55, 0.08, 2.2]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        fontSize={0.21}
        color="#426e70"
        letterSpacing={0.25}
      >
        ATLANTIC OCEAN
      </Text>
      <Text
        font={boardFont}
        position={[-0.2, 0.18, -6.9]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.24}
        color="#868b71"
        letterSpacing={0.55}
      >
        CANADA
      </Text>
      <Text
        font={boardFont}
        position={[-0.9, 0.18, 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.35}
        color="#a4a88a"
        letterSpacing={0.4}
      >
        UNITED STATES
      </Text>
      <Text
        font={boardFont}
        position={[3, 0.08, 6.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.2}
        color="#426e70"
        letterSpacing={0.18}
      >
        GULF OF MEXICO
      </Text>
    </group>
  );
}
function TrainFleet({ game }: { game?: View | null }) {
  const gltf = useGLTF("/models/locomotive.glb");
  const invalidate = useThree((state) => state.invalidate);
  const refs = useRef<THREE.InstancedMesh[]>([]);
  const parts = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const groups = new Map<
      string,
      {
        geometries: THREE.BufferGeometry[];
        material: THREE.MeshStandardMaterial;
      }
    >();
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const material = o.material as THREE.MeshStandardMaterial;
        let group = groups.get(material.name);
        if (!group) {
          group = { geometries: [], material: material.clone() };
          if (material.name.startsWith("Enamel"))
            group.material.color.set("#ffffff");
          groups.set(material.name, group);
        }
        const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
        group.geometries.push(geometry);
      }
    });
    return [...groups.values()].map((g) => ({
      geometry: mergeGeometries(g.geometries),
      material: g.material,
      tint: g.material.name.startsWith("Enamel"),
    }));
  }, [gltf.scene]);
  const placements = useMemo(
    () =>
      ROUTES.flatMap((r) => {
        const owner = game?.players.find((p) => p.id === game.claimed[r.id]);
        if (!owner) return [];
        const a = cityPosition(r.a),
          b = cityPosition(r.b),
          dx = b[0] - a[0],
          dz = b[2] - a[2],
          d = Math.hypot(dx, dz);
        const siblings = ROUTES.filter(
          (s) => (s.a === r.a && s.b === r.b) || (s.a === r.b && s.b === r.a),
        );
        const lane =
          siblings.length > 1 ? (siblings[0].id === r.id ? -0.12 : 0.12) : 0;
        return Array.from({ length: r.length }, (_, i) => {
          const t = (0.27 + ((d - 0.54) / r.length) * (i + 0.5)) / d;
          return {
            x: a[0] + dx * t - (dz / d) * lane,
            z: a[2] + dz * t + (dx / d) * lane,
            angle: -Math.atan2(dz, dx),
            color: PLAYER_COLORS[owner.color],
            scale: Math.min(0.36, (d - 0.54) / r.length / 1.6),
          };
        });
      }),
    [game?.claimed, game?.players],
  );
  useEffect(() => {
    const dummy = new THREE.Object3D();
    parts.forEach((part, index) => {
      const mesh = refs.current[index];
      if (!mesh) return;
      placements.forEach((p, i) => {
        dummy.position.set(p.x, 0.32, p.z);
        dummy.rotation.set(0, p.angle, 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (part.tint) mesh.setColorAt(i, new THREE.Color(p.color));
      });
      mesh.count = placements.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    invalidate();
  }, [placements, parts, invalidate]);
  return (
    <group>
      {parts.map((part, i) => (
        <instancedMesh
          key={i}
          ref={(m) => {
            if (m) refs.current[i] = m;
          }}
          args={[part.geometry!, part.material, 225]}
          count={0}
          castShadow
        />
      ))}
    </group>
  );
}
function Track({
  route,
  owner,
  selected,
  onSelect,
  dim,
}: {
  route: Route;
  owner?: string;
  selected: boolean;
  onSelect: (r: Route) => void;
  dim: boolean;
}) {
  const [hover, setHover] = useState(false);
  const a = cityPosition(route.a),
    b = cityPosition(route.b);
  const siblings = ROUTES.filter(
    (r) =>
      (r.a === route.a && r.b === route.b) ||
      (r.a === route.b && r.b === route.a),
  );
  const lane =
    siblings.length > 1 ? (siblings[0].id === route.id ? -0.12 : 0.12) : 0;
  const dx = b[0] - a[0],
    dz = b[2] - a[2],
    distance = Math.hypot(dx, dz),
    angle = -Math.atan2(dz, dx);
  const trim = 0.27,
    len = (distance - trim * 2) / route.length;
  const nx = -dz / distance,
    nz = dx / distance;
  const color = owner || PALETTE[route.color];
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect(route);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "auto";
      }}
    >
      <mesh
        position={[
          (a[0] + b[0]) / 2 + nx * lane,
          0.26,
          (a[2] + b[2]) / 2 + nz * lane,
        ]}
        rotation={[0, angle, 0]}
      >
        <boxGeometry args={[distance - 0.35, 0.035, 0.25]} />
        <meshStandardMaterial
          color={hover || selected ? "#faf1b7" : "#6a705b"}
          transparent
          opacity={dim ? 0.15 : 0.42}
        />
      </mesh>
      {Array.from({ length: route.length }, (_, i) => {
        const t = (trim + len * (i + 0.5)) / distance;
        return (
          <group
            key={i}
            position={[
              a[0] + dx * t + nx * lane,
              0.29,
              a[2] + dz * t + nz * lane,
            ]}
            rotation={[0, angle, 0]}
          >
            <mesh castShadow>
              <boxGeometry
                args={[Math.min(len * 0.82, 0.56), owner ? 0.13 : 0.065, 0.16]}
              />
              <meshStandardMaterial
                color={color}
                emissive={selected || hover ? "#bf9a4e" : "#000000"}
                emissiveIntensity={0.35}
                transparent={dim}
                opacity={dim ? 0.3 : 1}
              />
            </mesh>
            {!owner && (
              <mesh position={[0, 0.039, 0]}>
                <boxGeometry args={[0.02, 0.01, 0.18]} />
                <meshStandardMaterial
                  color="#f3ead4"
                  transparent
                  opacity={0.65}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
function Camera({ reset, top }: { reset: number; top: boolean }) {
  const controls = useRef<any>(null);
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const distance = aspect < 1.3 ? 31 / aspect : 25;
    camera.position.set(
      0,
      top ? distance : distance * 0.85,
      top ? 0.01 : distance * 0.53,
    );
    camera.lookAt(0, 0, 0);
    if (controls.current) {
      controls.current.target.set(0, 0, 0);
      controls.current.update();
    }
  }, [reset, top, camera, size.width, size.height]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={7}
      maxDistance={48}
      maxPolarAngle={Math.PI * 0.42}
      minPolarAngle={0}
      enableDamping
      dampingFactor={0.12}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}
export default function Board({
  game,
  selected,
  onSelect,
  focus,
  reset = 0,
  top = false,
}: {
  game?: View | null;
  selected?: string;
  onSelect: (r: Route) => void;
  focus?: string[];
  reset?: number;
  top?: boolean;
}) {
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [0, 23, 14], fov: 42, near: 0.1, far: 150 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => onSelect(null as unknown as Route)}
    >
      <color attach="background" args={["#b8c6b9"]} />
      <fog attach="fog" args={["#b8c6b9", 48, 100]} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#fff3d4", "#789a87", 0.7]} />
      <directionalLight
        position={[-8, 18, 5]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-normalBias={0.06}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.89, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#a7b6a6" roughness={1} />
      </mesh>
      <Suspense fallback={null}>
        <Terrain />
        {ROUTES.map((r) => (
          <Track
            key={r.id}
            route={r}
            selected={selected === r.id}
            owner={
              game?.claimed[r.id]
                ? PLAYER_COLORS[
                    game.players.find((p) => p.id === game.claimed[r.id])
                      ?.color || 0
                  ]
                : undefined
            }
            onSelect={onSelect}
            dim={false}
          />
        ))}
        <TrainFleet game={game} />
        {Object.keys(CITIES).map((name) => {
          const pos = cityPosition(name);
          const highlight = focus?.includes(name);
          return (
            <group key={name} position={pos}>
              {highlight && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
                  <ringGeometry args={[0.2, 0.29, 32]} />
                  <meshBasicMaterial color="#ef713c" />
                </mesh>
              )}
              <mesh position={[0, 0.07, 0]} castShadow>
                <cylinderGeometry args={[0.105, 0.13, 0.16, 12]} />
                <meshStandardMaterial
                  color={highlight ? "#ef713c" : "#f6ead1"}
                  metalness={0.2}
                />
              </mesh>
              <mesh position={[0, 0.157, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.055, 12]} />
                <meshBasicMaterial color="#364738" />
              </mesh>
              <Text
                font={boardFont}
                position={[0, 0.18, -0.23]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.235}
                color="#253e36"
                outlineWidth={0.025}
                outlineColor="#e2dfc3"
                anchorY="bottom"
              >
                {name.toUpperCase()}
              </Text>
            </group>
          );
        })}
        <Line
          points={[
            [-10.6, 0.19, 7.1],
            [-9.5, 0.19, 7.1],
          ]}
          color="#3e6258"
          lineWidth={1.5}
        />
        <Text
          font={boardFont}
          position={[-10, 0.2, 7.45]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.14}
          color="#426255"
          letterSpacing={0.08}
        >
          RAILBOUND · 1910
        </Text>
      </Suspense>
      <Camera reset={reset} top={top} />
    </Canvas>
  );
}
