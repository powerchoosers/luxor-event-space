'use client'

import { Canvas, useLoader } from '@react-three/fiber'
import { ContactShadows, Html, OrbitControls, RoundedBox } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { LayoutItem } from './EventLayoutDesigner'

type Props = {
  items: LayoutItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  roomWidthFeet: number
  roomDepthFeet: number
  mainRoomDepthFeet: number
  secondaryRoomWidthFeet: number
}

const FEET_TO_SCENE = 0.34

export function EventLayout3D({ items, selectedId, onSelect, roomWidthFeet, roomDepthFeet, mainRoomDepthFeet, secondaryRoomWidthFeet }: Props) {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  const backdrop = dark ? '#121315' : '#e4e6e6'
  const sceneWidth = roomWidthFeet * FEET_TO_SCENE
  const sceneDepth = roomDepthFeet * FEET_TO_SCENE
  return (
    <div className="relative h-full min-h-[460px] w-full overflow-hidden bg-[#e4e6e6] dark:bg-[#121315]">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [sceneWidth * 1.08, Math.max(10, sceneDepth * 0.52), sceneDepth * 0.72], fov: 48, near: 0.1, far: 100 }}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={[backdrop]} />
        <fog attach="fog" args={[backdrop, 48, 92]} />
        <ambientLight intensity={0.82} />
        <hemisphereLight args={['#f7fbff', '#687075', 0.9]} />
        <directionalLight castShadow position={[7, 14, 5]} intensity={1.65} color="#fffef9" shadow-mapSize={[1024, 1024]} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} />
        <Suspense fallback={null}>
          <Room dark={dark} roomWidthFeet={roomWidthFeet} roomDepthFeet={roomDepthFeet} mainRoomDepthFeet={mainRoomDepthFeet} secondaryRoomWidthFeet={secondaryRoomWidthFeet} />
          {items.map((item) => <LayoutModel key={item.id} item={item} roomWidthFeet={roomWidthFeet} roomDepthFeet={roomDepthFeet} selected={selectedId === item.id} onSelect={() => onSelect(item.id)} />)}
          <ContactShadows position={[0, 0.015, 0]} opacity={0.42} scale={roomWidthFeet * FEET_TO_SCENE} blur={2.6} far={roomDepthFeet * FEET_TO_SCENE} />
        </Suspense>
        <OrbitControls makeDefault target={[0, 0.55, 0]} minDistance={6} maxDistance={48} minPolarAngle={0.25} maxPolarAngle={Math.PI / 2.08} enableDamping dampingFactor={0.08} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-black/10 bg-white/85 px-3 py-1.5 text-[9px] font-bold text-stone-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/60 dark:text-stone-300">Drag to orbit · Scroll to zoom · Right-drag to move</div>
    </div>
  )
}

function Room({ dark, roomWidthFeet, roomDepthFeet, mainRoomDepthFeet, secondaryRoomWidthFeet }: { dark: boolean; roomWidthFeet: number; roomDepthFeet: number; mainRoomDepthFeet: number; secondaryRoomWidthFeet: number }) {
  const floor = useLoader(THREE.TextureLoader, '/images/portal/luxor-layout-gray-floor-v2.png')
  const tiledFloor = useMemo(() => {
    const texture = floor.clone()
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(Math.max(1, roomWidthFeet / 4), Math.max(1, roomDepthFeet / 12))
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    texture.needsUpdate = true
    return texture
  }, [floor, roomDepthFeet, roomWidthFeet])

  const width = roomWidthFeet * FEET_TO_SCENE
  const depth = roomDepthFeet * FEET_TO_SCENE
  const mainDepth = mainRoomDepthFeet * FEET_TO_SCENE
  const lowerWidth = secondaryRoomWidthFeet * FEET_TO_SCENE
  const lowerDepth = depth - mainDepth
  const mainCenterZ = -depth / 2 + mainDepth / 2
  const lowerCenterZ = -depth / 2 + mainDepth + lowerDepth / 2
  return <group>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, mainCenterZ]}><planeGeometry args={[width, mainDepth]} /><meshStandardMaterial map={tiledFloor} color="#c0c7c8" roughness={0.5} metalness={0.03} /></mesh>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, lowerCenterZ]}><planeGeometry args={[lowerWidth, lowerDepth]} /><meshStandardMaterial map={tiledFloor} color="#c0c7c8" roughness={0.5} metalness={0.03} /></mesh>
    <RoomWalls dark={dark} width={width} depth={mainDepth} centerZ={mainCenterZ} />
    <RoomWalls dark={dark} width={lowerWidth} depth={lowerDepth} centerZ={lowerCenterZ} omitTop />
    {[-0.3, 0, 0.3].map((ratio) => <VenueChandelier key={ratio} position={[0, 2.68, mainCenterZ + mainDepth * ratio]} />)}
  </group>
}

function RoomWalls({ dark, width, depth, centerZ, omitTop = false }: { dark: boolean; width: number; depth: number; centerZ: number; omitTop?: boolean }) {
  const wallColor = dark ? '#252729' : '#f1f2f0'
  const baseboardColor = dark ? '#111315' : '#292826'
  const wallHeight = 2.35
  const baseboardHeight = 0.13
  return <group>
    <mesh receiveShadow position={[-width / 2, wallHeight / 2, centerZ]}><boxGeometry args={[0.12, wallHeight, depth]} /><meshStandardMaterial color={wallColor} roughness={0.86} /></mesh>
    <mesh receiveShadow position={[width / 2, wallHeight / 2, centerZ]}><boxGeometry args={[0.12, wallHeight, depth]} /><meshStandardMaterial color={wallColor} roughness={0.86} /></mesh>
    {!omitTop && <mesh receiveShadow position={[0, wallHeight / 2, centerZ - depth / 2]}><boxGeometry args={[width, wallHeight, 0.12]} /><meshStandardMaterial color={wallColor} roughness={0.86} /></mesh>}
    <mesh receiveShadow position={[0, wallHeight / 2, centerZ + depth / 2]}><boxGeometry args={[width, wallHeight, 0.12]} /><meshStandardMaterial color={wallColor} roughness={0.86} /></mesh>
    {[-1, 1].map((side) => <mesh key={`side-${side}`} position={[side * (width / 2 - 0.04), baseboardHeight / 2, centerZ]}><boxGeometry args={[0.08, baseboardHeight, Math.max(depth - 0.12, 0.1)]} /><meshStandardMaterial color={baseboardColor} roughness={0.56} /></mesh>)}
    {!omitTop && <mesh position={[0, baseboardHeight / 2, centerZ - depth / 2 + 0.04]}><boxGeometry args={[width, baseboardHeight, 0.08]} /><meshStandardMaterial color={baseboardColor} roughness={0.56} /></mesh>}
    <mesh position={[0, baseboardHeight / 2, centerZ + depth / 2 - 0.04]}><boxGeometry args={[width, baseboardHeight, 0.08]} /><meshStandardMaterial color={baseboardColor} roughness={0.56} /></mesh>
  </group>
}

function VenueChandelier({ position }: { position: [number, number, number] }) {
  const bulbs = 18
  return <group position={position}>
    <mesh position={[0, 0.48, 0]}><cylinderGeometry args={[0.018, 0.018, 0.96, 10]} /><meshStandardMaterial color="#24211e" metalness={0.68} roughness={0.24} /></mesh>
    <mesh position={[0, 0.98, 0]}><cylinderGeometry args={[0.16, 0.16, 0.06, 20]} /><meshStandardMaterial color="#24211e" metalness={0.68} roughness={0.24} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.76, 0.045, 10, 48]} /><meshStandardMaterial color="#201e1b" metalness={0.72} roughness={0.22} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}><torusGeometry args={[0.61, 0.025, 8, 48]} /><meshStandardMaterial color="#b58a43" metalness={0.72} roughness={0.22} /></mesh>
    {Array.from({ length: bulbs }, (_, index) => {
      const angle = (index / bulbs) * Math.PI * 2
      return <group key={index} position={[Math.cos(angle) * 0.76, -0.06, Math.sin(angle) * 0.76]}>
        <mesh><sphereGeometry args={[0.06, 12, 12]} /><meshStandardMaterial color="#fff0c8" emissive="#f3bb5c" emissiveIntensity={1.8} roughness={0.34} /></mesh>
      </group>
    })}
    <pointLight color="#ffd58d" intensity={1.65} distance={8} decay={2} />
  </group>
}

function LayoutModel({ item, roomWidthFeet, roomDepthFeet, selected, onSelect }: { item: LayoutItem; roomWidthFeet: number; roomDepthFeet: number; selected: boolean; onSelect: () => void }) {
  const width = Math.max(item.width * FEET_TO_SCENE, 0.22)
  const depth = Math.max(item.height * FEET_TO_SCENE, 0.22)
  const x = ((item.x / 100) * roomWidthFeet + item.width / 2) * FEET_TO_SCENE - (roomWidthFeet * FEET_TO_SCENE) / 2
  const z = ((item.y / 100) * roomDepthFeet + item.height / 2) * FEET_TO_SCENE - (roomDepthFeet * FEET_TO_SCENE) / 2
  return <group position={[x, 0, z]} rotation={[0, -THREE.MathUtils.degToRad(item.rotation), 0]} onClick={(event) => { event.stopPropagation(); onSelect() }}>
    <Furniture item={item} width={width} depth={depth} selected={selected} />
    {selected && <Html position={[0, Math.max(2.15, depth), 0]} center distanceFactor={12}><div className="whitespace-nowrap rounded-md bg-[#1e1812]/90 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[#f3d486] shadow-lg">{item.label} · {item.width}′ × {item.height}′</div></Html>}
  </group>
}

function Furniture({ item, width, depth, selected }: { item: LayoutItem; width: number; depth: number; selected: boolean }) {
  const accent = selected ? '#e4b955' : item.color || '#e4d1ad'
  if (item.kind === 'round-table') return <RoundTable radius={Math.min(width, depth) * 0.34} seats={item.seats} color={accent} />
  if (item.kind === 'cocktail-table') return <CocktailTable radius={Math.min(width, depth) * 0.3} color={accent} />
  if (item.kind === 'rectangle-table') return <RectangleTable width={width * 0.72} depth={depth * 0.58} seats={item.seats} color={accent} />
  if (item.kind === 'chair') return <Chair color={accent} scale={Math.min(width, depth) * 1.35} />
  if (item.kind === 'throne-chair') return <ThroneChair color={accent} scale={Math.min(width, depth) * 0.88} />
  if (item.kind === 'sofa') return <SofaModel width={width * 0.82} color={selected ? '#c69a48' : '#d8c5a5'} />
  if (item.kind === 'stage') return <Platform width={width} depth={depth} height={0.45} color={selected ? '#c99a43' : '#4c4035'} label="STAGE" />
  if (item.kind === 'dance-floor') return <DanceFloor width={width} depth={depth} selected={selected} />
  if (item.kind === 'bar') return <Bar width={width} depth={depth} selected={selected} />
  if (item.kind === 'dj-booth') return <DjBooth width={width} depth={depth} selected={selected} />
  if (item.kind === 'backdrop') return <Backdrop width={width} selected={selected} />
  if (item.kind === 'balloon-arch') return <BalloonArch width={width} depth={depth} selected={selected} />
  if (item.kind === 'pipe-drape') return <PipeDrape width={width} selected={selected} />
  if (item.kind === 'stanchions') return <Stanchions width={width} />
  if (item.kind === 'vip-area') return <VipArea width={width} depth={depth} selected={selected} />
  return <Florals selected={selected} />
}

function RoundTable({ radius, seats, color }: { radius: number; seats: number; color: string }) {
  const count = Math.max(1, Math.min(seats, 12))
  return <group>
    <mesh castShadow receiveShadow position={[0, 0.42, 0]}><cylinderGeometry args={[radius * 1.06, radius * 1.02, 0.68, 56]} /><meshStandardMaterial color={color} roughness={0.94} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.79, 0]}><cylinderGeometry args={[radius, radius, 0.12, 56]} /><meshPhysicalMaterial color={color} roughness={0.58} clearcoat={0.08} clearcoatRoughness={0.42} /></mesh>
    <mesh castShadow position={[0, 0.38, 0]}><cylinderGeometry args={[radius * 0.11, radius * 0.18, 0.76, 24]} /><meshStandardMaterial color="#705239" metalness={0.32} roughness={0.42} /></mesh>
    <mesh castShadow position={[0, 0.02, 0]}><cylinderGeometry args={[radius * 0.44, radius * 0.44, 0.05, 32]} /><meshStandardMaterial color="#62432d" metalness={0.24} roughness={0.48} /></mesh>
    {Array.from({ length: count }, (_, i) => { const angle = (i / count) * Math.PI * 2; return <group key={i} position={[Math.cos(angle) * radius * 1.5, 0, Math.sin(angle) * radius * 1.5]} rotation={[0, -angle + Math.PI / 2, 0]}><Chair color="#242321" scale={0.42}/></group> })}
    <Centerpiece />
  </group>
}

function RectangleTable({ width, depth, seats, color }: { width: number; depth: number; seats: number; color: string }) {
  const perSide = Math.max(1, Math.ceil(Math.min(seats, 12) / 2))
  return <group>
    <RoundedBox castShadow receiveShadow args={[width * 1.03, 0.66, depth * 1.12]} radius={0.08} smoothness={4} position={[0, 0.42, 0]}><meshStandardMaterial color={color} roughness={0.94}/></RoundedBox>
    <RoundedBox castShadow receiveShadow args={[width, 0.1, depth]} radius={0.06} smoothness={4} position={[0, 0.79, 0]}><meshPhysicalMaterial color={color} roughness={0.58} clearcoat={0.08} clearcoatRoughness={0.42}/></RoundedBox>
    {[-1, 1].flatMap((side) => [-1, 1].map((end) => <mesh key={`${side}-${end}`} castShadow position={[side * width * 0.4, 0.37, end * depth * 0.34]}><cylinderGeometry args={[0.055, 0.08, 0.72, 12]}/><meshStandardMaterial color="#6c4e35" metalness={0.32} roughness={0.42}/></mesh>))}
    {[-1,1].flatMap((side) => Array.from({ length: perSide }, (_, i) => <group key={`${side}-${i}`} position={[-width / 2 + (i + .5) * width / perSide, 0, side * depth * 1.08]} rotation={[0, side > 0 ? Math.PI : 0, 0]}><Chair color="#242321" scale={0.4}/></group>))}
  </group>
}

function CocktailTable({ radius, color }: { radius: number; color: string }) { return <group><mesh castShadow receiveShadow position={[0,1.05,0]}><cylinderGeometry args={[radius,radius,0.09,40]}/><meshPhysicalMaterial color={color} roughness={.38} clearcoat={.2}/></mesh><mesh castShadow position={[0,.54,0]}><cylinderGeometry args={[.055,.11,1.05,24]}/><meshStandardMaterial color="#8b6a4a" metalness={.62} roughness={.26}/></mesh><mesh castShadow position={[0,.02,0]}><cylinderGeometry args={[radius*.36,radius*.36,.04,30]}/><meshStandardMaterial color="#8b6a4a" metalness={.62} roughness={.26}/></mesh></group> }
function Chair({ color, scale = 0.5 }: { color: string; scale?: number }) { return <group scale={scale}><RoundedBox castShadow args={[.74,.13,.7]} radius={.055} smoothness={3} position={[0,.43,0]}><meshStandardMaterial color={color} roughness={.62}/></RoundedBox><RoundedBox castShadow args={[.68,.82,.12]} radius={.06} smoothness={3} position={[0,.91,.28]} rotation={[-.08,0,0]}><meshStandardMaterial color={color} roughness={.62}/></RoundedBox>{[[-.27,-.25],[.27,-.25],[-.27,.25],[.27,.25]].map(([x,z],i)=><mesh key={i} castShadow position={[x,.2,z]} rotation={[0,0,(x > 0 ? -.04 : .04)]}><cylinderGeometry args={[.035,.045,.43,10]}/><meshStandardMaterial color="#191a1b" metalness={.62} roughness={.28}/></mesh>)}</group> }
function SofaModel({ width, color }: { width: number; color: string }) { return <group><RoundedBox castShadow args={[width,.42,.82]} radius={.14} smoothness={5} position={[0,.31,0]}><meshStandardMaterial color={color} roughness={.78}/></RoundedBox><RoundedBox castShadow args={[width*.9,.3,.56]} radius={.11} smoothness={5} position={[0,.59,-.04]}><meshStandardMaterial color="#e7d8bf" roughness={.76}/></RoundedBox><RoundedBox castShadow args={[width,.78,.2]} radius={.11} smoothness={5} position={[0,.76,.31]}><meshStandardMaterial color={color} roughness={.8}/></RoundedBox>{[-1,1].map(side=><RoundedBox key={side} castShadow args={[.2,.52,.82]} radius={.09} smoothness={4} position={[side * width / 2,.45,0]}><meshStandardMaterial color={color} roughness={.8}/></RoundedBox>)}{[-1,1].flatMap(side=>[-1,1].map(depth=> <mesh key={`${side}-${depth}`} castShadow position={[side * width*.4,.08,depth*.27]}><cylinderGeometry args={[.055,.07,.16,12]}/><meshStandardMaterial color="#5d4330" metalness={.5} roughness={.34}/></mesh>))}</group> }
function Platform({ width, depth, height, color, label }: { width: number; depth: number; height: number; color: string; label: string }) { return <group><RoundedBox castShadow receiveShadow args={[width,height,depth]} radius={.06} smoothness={3} position={[0,height/2,0]}><meshStandardMaterial color={color} roughness={.5} metalness={.08}/></RoundedBox>{Array.from({length:Math.max(2, Math.floor(width/.6))},(_,i)=><mesh key={i} position={[-width/2+(i+.5)*width/Math.max(2,Math.floor(width/.6)),height+.004,0]}><boxGeometry args={[.018,.01,depth*.92]}/><meshBasicMaterial color="#2c211b" transparent opacity={.36}/></mesh>)}<Html position={[0,height+.04,0]} center transform rotation={[-Math.PI/2,0,0]} distanceFactor={10}><span className="text-[7px] font-black tracking-[.22em] text-white">{label}</span></Html></group> }
function DanceFloor({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { const panel = selected ? '#d4aa58' : '#b98755'; return <group><RoundedBox receiveShadow args={[width+.12,.1,depth+.12]} radius={.04} smoothness={3} position={[0,.05,0]}><meshStandardMaterial color="#4b3224" roughness={.38} metalness={.08}/></RoundedBox><mesh receiveShadow position={[0,.107,0]}><boxGeometry args={[width,.03,depth]}/><meshPhysicalMaterial color={panel} roughness={.32} clearcoat={.22} clearcoatRoughness={.28}/></mesh>{Array.from({length:5},(_,i)=><mesh key={`x${i}`} position={[-width/2+(i+1)*width/6,.13,0]}><boxGeometry args={[.018,.012,depth]}/><meshBasicMaterial color="#6f4930"/></mesh>)}{Array.from({length:4},(_,i)=><mesh key={`z${i}`} position={[0,.13,-depth/2+(i+1)*depth/5]}><boxGeometry args={[width,.012,.018]}/><meshBasicMaterial color="#6f4930"/></mesh>)}</group> }
function Bar({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { return <group><RoundedBox castShadow args={[width,1.05,depth]} radius={.08} smoothness={4} position={[0,.53,0]}><meshStandardMaterial color={selected ? '#c69a48' : '#513524'} roughness={.42} metalness={.1}/></RoundedBox><RoundedBox castShadow args={[width*.84,.5,.035]} radius={.025} smoothness={2} position={[0,.57,depth/2+.02]}><meshStandardMaterial color="#a77a39" metalness={.44} roughness={.26}/></RoundedBox><mesh castShadow position={[0,1.1,0]}><boxGeometry args={[width+.16,.1,depth+.12]}/><meshPhysicalMaterial color="#d5b67e" roughness={.22} clearcoat={.32}/></mesh></group> }
function DjBooth({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { return <group><RoundedBox castShadow args={[width,.9,depth]} radius={.08} smoothness={4} position={[0,.45,0]}><meshStandardMaterial color={selected ? '#bd9147' : '#211e1c'} roughness={.36} metalness={.16}/></RoundedBox><RoundedBox castShadow args={[width*.75,.35,.03]} radius={.02} smoothness={2} position={[0,.48,depth/2+.02]}><meshStandardMaterial color="#2f2c28" metalness={.44} roughness={.24}/></RoundedBox>{[-.28,.28].map(x=><mesh key={x} position={[x*width,.95,0]}><cylinderGeometry args={[.16,.16,.08,32]}/><meshStandardMaterial color="#caa24c" metalness={.65} roughness={.18}/></mesh>)}</group> }
function Backdrop({ width, selected }: { width: number; selected: boolean }) { return <group><RoundedBox castShadow args={[width,2.6,.18]} radius={.08} smoothness={4} position={[0,1.3,0]}><meshStandardMaterial color={selected ? '#d6af65' : '#e8ddca'} roughness={.78}/></RoundedBox><mesh position={[0,1.45,.11]}><torusGeometry args={[.64,.035,16,50]}/><meshStandardMaterial color="#b88b42" metalness={.5} roughness={.24}/></mesh></group> }
function ThroneChair({ color, scale = 0.7 }: { color: string; scale?: number }) { return <group scale={scale}><RoundedBox castShadow args={[1.15,.18,.95]} radius={.12} smoothness={4} position={[0,.55,0]}><meshStandardMaterial color={color} roughness={.38} metalness={.08}/></RoundedBox><RoundedBox castShadow args={[1.08,1.45,.2]} radius={.16} smoothness={4} position={[0,1.22,.34]}><meshStandardMaterial color={color} roughness={.38} metalness={.08}/></RoundedBox><mesh castShadow position={[0,1.98,.34]}><sphereGeometry args={[.18,20,20]}/><meshStandardMaterial color="#caa24c" metalness={.5} roughness={.26}/></mesh>{[-.42,.42].map((x) => <mesh key={x} castShadow position={[x,.32,0]}><cylinderGeometry args={[.07,.09,.6,16]}/><meshStandardMaterial color="#b78a3d" metalness={.4} roughness={.3}/></mesh>)}</group> }
function BalloonArch({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { return <group>{[...Array(11)].map((_, i) => { const t = i / 10; const angle = Math.PI * t; return <mesh key={i} castShadow position={[(t - .5) * width, .65 + Math.sin(angle) * Math.max(width * .42, 1.1), 0]}><sphereGeometry args={[Math.max(depth * .22, .16), 18, 18]}/><meshStandardMaterial color={selected ? '#e5b75e' : i % 3 === 0 ? '#f2e4c9' : i % 3 === 1 ? '#caa24c' : '#b87f79'} roughness={.52}/></mesh> })}</group> }
function PipeDrape({ width, selected }: { width: number; selected: boolean }) { return <group><mesh castShadow position={[-width / 2, 1.4, 0]}><cylinderGeometry args={[.045,.055,2.8,14]}/><meshStandardMaterial color="#b78a3d" metalness={.6} roughness={.22}/></mesh><mesh castShadow position={[width / 2, 1.4, 0]}><cylinderGeometry args={[.045,.055,2.8,14]}/><meshStandardMaterial color="#b78a3d" metalness={.6} roughness={.22}/></mesh><RoundedBox castShadow args={[width,2.55,.08]} radius={.02} smoothness={2} position={[0,1.35,0]}><meshStandardMaterial color={selected ? '#dfbd73' : '#d9d0c3'} roughness={.94} transparent opacity={.92}/></RoundedBox></group> }
function Stanchions({ width }: { width: number }) { return <group>{[-width / 2, width / 2].map((x) => <group key={x} position={[x,0,0]}><mesh castShadow position={[0,.52,0]}><cylinderGeometry args={[.16,.2,1.04,20]}/><meshStandardMaterial color="#b78a3d" metalness={.65} roughness={.24}/></mesh><mesh castShadow position={[0,1.03,0]}><sphereGeometry args={[.2,18,18]}/><meshStandardMaterial color="#caa24c" metalness={.65} roughness={.22}/></mesh></group>)}<mesh castShadow position={[0,.72,0]} rotation={[0,0,Math.atan2(.18, Math.max(width, .2))]}><cylinderGeometry args={[.025,.025,Math.max(width, .2),10]}/><meshStandardMaterial color="#8b6b4c" roughness={.62}/></mesh></group> }
function VipArea({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { return <group><mesh receiveShadow position={[0,.025,0]}><boxGeometry args={[width,.05,depth]}/><meshStandardMaterial color={selected ? '#c99b48' : '#896a54'} roughness={.95}/></mesh><group position={[0,0,-depth*.25]}><SofaModel width={Math.min(width*.75,3.1)} color="#d8c4a1"/></group></group> }
function Florals({ selected }: { selected: boolean }) { return <group><mesh castShadow position={[0,.35,0]}><cylinderGeometry args={[.11,.16,.7,16]}/><meshStandardMaterial color="#b99155"/></mesh>{Array.from({length:8},(_,i)=>{const a=i/8*Math.PI*2; return <mesh key={i} castShadow position={[Math.cos(a)*.27,.78+Math.sin(i*2)*.08,Math.sin(a)*.27]}><sphereGeometry args={[.18,18,18]}/><meshStandardMaterial color={selected ? '#e0b85f' : i%2 ? '#f1e6d1':'#788866'} roughness={.9}/></mesh>})}</group> }
function Centerpiece() { return <group position={[0,.88,0]}><mesh castShadow position={[0,.14,0]}><cylinderGeometry args={[.05,.08,.28,12]}/><meshStandardMaterial color="#b5935c"/></mesh>{[0,1,2,3,4].map(i=><mesh key={i} castShadow position={[Math.cos(i*1.25)*.12,.34+Math.sin(i)*.05,Math.sin(i*1.25)*.12]}><sphereGeometry args={[.1,12,12]}/><meshStandardMaterial color={i%2 ? '#f0e4cf':'#83906f'}/></mesh>)}</group> }
