'use client'

import { Canvas } from '@react-three/fiber'
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
  const backdrop = dark ? '#12100e' : '#e9e3d8'
  const sceneWidth = roomWidthFeet * FEET_TO_SCENE
  const sceneDepth = roomDepthFeet * FEET_TO_SCENE
  return (
    <div className="relative h-full min-h-[460px] w-full overflow-hidden bg-[#e9e3d8] dark:bg-[#12100e]">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [sceneWidth * 1.08, Math.max(10, sceneDepth * 0.52), sceneDepth * 0.72], fov: 48, near: 0.1, far: 100 }}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={[backdrop]} />
        <fog attach="fog" args={[backdrop, 48, 92]} />
        <ambientLight intensity={0.82} />
        <hemisphereLight args={['#fff8e9', '#75634c', 0.9]} />
        <directionalLight castShadow position={[7, 14, 5]} intensity={1.65} color="#fff2d4" shadow-mapSize={[1024, 1024]} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} />
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
  const floor = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#d8c7ad'
    ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = 'rgba(107,82,50,.18)'
    ctx.lineWidth = 2
    for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke() }
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(8, 18)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])

  const width = roomWidthFeet * FEET_TO_SCENE
  const depth = roomDepthFeet * FEET_TO_SCENE
  const mainDepth = mainRoomDepthFeet * FEET_TO_SCENE
  const lowerWidth = secondaryRoomWidthFeet * FEET_TO_SCENE
  const lowerDepth = depth - mainDepth
  const mainCenterZ = -depth / 2 + mainDepth / 2
  const lowerCenterZ = -depth / 2 + mainDepth + lowerDepth / 2
  return <group>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, mainCenterZ]}><planeGeometry args={[width, mainDepth]} /><meshStandardMaterial map={floor} color="#eadfcf" roughness={0.76} /></mesh>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, lowerCenterZ]}><planeGeometry args={[lowerWidth, lowerDepth]} /><meshStandardMaterial map={floor} color="#eadfcf" roughness={0.76} /></mesh>
    <RoomWalls dark={dark} width={width} depth={mainDepth} centerZ={mainCenterZ} />
    <RoomWalls dark={dark} width={lowerWidth} depth={lowerDepth} centerZ={lowerCenterZ} omitTop />
    <mesh position={[0, 2.15, -depth / 2 + 0.1]}><boxGeometry args={[Math.min(width * .52, 5.2), 0.12, 0.12]} /><meshStandardMaterial color="#b78a3d" metalness={0.55} roughness={0.24} /></mesh>
    {[-0.3, 0, 0.3].map((ratio) => <pointLight key={ratio} position={[width * ratio, 2.1, -depth / 2 + 1.2]} intensity={7} distance={7} color="#ffd99a" />)}
  </group>
}

function RoomWalls({ dark, width, depth, centerZ, omitTop = false }: { dark: boolean; width: number; depth: number; centerZ: number; omitTop?: boolean }) {
  const wallColor = dark ? '#28231e' : '#f3ede4'
  const wallHeight = 2.35
  return <group><mesh receiveShadow position={[-width / 2, wallHeight / 2, centerZ]}><boxGeometry args={[0.12, wallHeight, depth]} /><meshStandardMaterial color={wallColor} roughness={0.86} /></mesh><mesh receiveShadow position={[width / 2, wallHeight / 2, centerZ]}><boxGeometry args={[0.12, wallHeight, depth]} /><meshStandardMaterial color={wallColor} roughness={0.86} /></mesh>{!omitTop && <mesh receiveShadow position={[0, wallHeight / 2, centerZ - depth / 2]}><boxGeometry args={[width, wallHeight, 0.12]} /><meshStandardMaterial color={wallColor} roughness={0.86} /></mesh>}<mesh receiveShadow position={[0, wallHeight / 2, centerZ + depth / 2]}><boxGeometry args={[width, wallHeight, 0.12]} /><meshStandardMaterial color={wallColor} roughness={0.86} /></mesh></group>
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
  return <group><mesh castShadow receiveShadow position={[0, 0.78, 0]}><cylinderGeometry args={[radius, radius, 0.12, 48]} /><meshStandardMaterial color={color} roughness={0.72} /></mesh><mesh castShadow position={[0, 0.39, 0]}><cylinderGeometry args={[radius * 0.12, radius * 0.19, 0.75, 20]} /><meshStandardMaterial color="#7b654c" metalness={0.2} roughness={0.6} /></mesh>{Array.from({ length: count }, (_, i) => { const angle = (i / count) * Math.PI * 2; return <group key={i} position={[Math.cos(angle) * radius * 1.48, 0, Math.sin(angle) * radius * 1.48]} rotation={[0, -angle + Math.PI / 2, 0]}><Chair color="#b4935f" scale={0.42}/></group> })}<Centerpiece /></group>
}

function RectangleTable({ width, depth, seats, color }: { width: number; depth: number; seats: number; color: string }) {
  const perSide = Math.max(1, Math.ceil(Math.min(seats, 12) / 2))
  return <group><RoundedBox castShadow receiveShadow args={[width, 0.12, depth]} radius={0.08} smoothness={3} position={[0, 0.78, 0]}><meshStandardMaterial color={color} roughness={0.72}/></RoundedBox>{[-1,1].map((side) => <mesh key={side} castShadow position={[side * width * 0.31, 0.38, 0]}><boxGeometry args={[0.09,0.75,Math.max(depth * 0.65,0.18)]}/><meshStandardMaterial color="#765f46"/></mesh>)}{[-1,1].flatMap((side) => Array.from({ length: perSide }, (_, i) => <group key={`${side}-${i}`} position={[-width / 2 + (i + .5) * width / perSide, 0, side * depth * .95]} rotation={[0, side > 0 ? Math.PI : 0, 0]}><Chair color="#b4935f" scale={0.4}/></group>))}</group>
}

function CocktailTable({ radius, color }: { radius: number; color: string }) { return <group><mesh castShadow position={[0,1.05,0]}><cylinderGeometry args={[radius,radius,0.09,36]}/><meshStandardMaterial color={color}/></mesh><mesh castShadow position={[0,.54,0]}><cylinderGeometry args={[.06,.12,1.05,18]}/><meshStandardMaterial color="#776149" metalness={.25}/></mesh></group> }
function Chair({ color, scale = 0.5 }: { color: string; scale?: number }) { return <group scale={scale}><mesh castShadow position={[0,.42,0]}><boxGeometry args={[.75,.11,.72]}/><meshStandardMaterial color={color} roughness={.56}/></mesh><mesh castShadow position={[0,.9,.32]} rotation={[-.08,0,0]}><boxGeometry args={[.75,.9,.1]}/><meshStandardMaterial color={color} roughness={.56}/></mesh>{[[-.28,-.27],[.28,-.27],[-.28,.27],[.28,.27]].map(([x,z],i)=><mesh key={i} castShadow position={[x,.19,z]}><boxGeometry args={[.07,.4,.07]}/><meshStandardMaterial color="#5f4b38"/></mesh>)}</group> }
function SofaModel({ width, color }: { width: number; color: string }) { return <group><RoundedBox castShadow args={[width,.48,.72]} radius={.12} smoothness={4} position={[0,.36,0]}><meshStandardMaterial color={color} roughness={.82}/></RoundedBox><RoundedBox castShadow args={[width,.72,.22]} radius={.1} smoothness={4} position={[0,.68,.3]}><meshStandardMaterial color={color} roughness={.82}/></RoundedBox>{[-1,1].map(side=><RoundedBox key={side} castShadow args={[.22,.5,.72]} radius={.08} smoothness={3} position={[side * width / 2,.48,0]}><meshStandardMaterial color={color}/></RoundedBox>)}</group> }
function Platform({ width, depth, height, color, label }: { width: number; depth: number; height: number; color: string; label: string }) { return <group><RoundedBox castShadow receiveShadow args={[width,height,depth]} radius={.06} smoothness={2} position={[0,height/2,0]}><meshStandardMaterial color={color} roughness={.6}/></RoundedBox><Html position={[0,height+.04,0]} center transform rotation={[-Math.PI/2,0,0]} distanceFactor={10}><span className="text-[7px] font-black tracking-[.22em] text-white">{label}</span></Html></group> }
function DanceFloor({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { return <group><mesh receiveShadow position={[0,.035,0]}><boxGeometry args={[width,.07,depth]}/><meshStandardMaterial color={selected ? '#d5aa58' : '#d9c3a2'} roughness={.65}/></mesh>{Array.from({length:5},(_,i)=><mesh key={`x${i}`} position={[-width/2+(i+1)*width/6,.076,0]}><boxGeometry args={[.018,.01,depth]}/><meshBasicMaterial color="#b69b74"/></mesh>)}{Array.from({length:4},(_,i)=><mesh key={`z${i}`} position={[0,.077,-depth/2+(i+1)*depth/5]}><boxGeometry args={[width,.01,.018]}/><meshBasicMaterial color="#b69b74"/></mesh>)}</group> }
function Bar({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { return <group><RoundedBox castShadow args={[width,1.05,depth]} radius={.08} smoothness={3} position={[0,.53,0]}><meshStandardMaterial color={selected ? '#c69a48' : '#6a4d33'} roughness={.48}/></RoundedBox><mesh castShadow position={[0,1.1,0]}><boxGeometry args={[width+.16,.1,depth+.12]}/><meshStandardMaterial color="#d0b17e" roughness={.35}/></mesh></group> }
function DjBooth({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { return <group><RoundedBox castShadow args={[width,.9,depth]} radius={.08} smoothness={3} position={[0,.45,0]}><meshStandardMaterial color={selected ? '#bd9147' : '#2d2926'} roughness={.44}/></RoundedBox>{[-.28,.28].map(x=><mesh key={x} position={[x*width,.95,0]}><cylinderGeometry args={[.16,.16,.08,32]}/><meshStandardMaterial color="#caa24c" metalness={.55}/></mesh>)}</group> }
function Backdrop({ width, selected }: { width: number; selected: boolean }) { return <group><RoundedBox castShadow args={[width,2.6,.18]} radius={.08} smoothness={3} position={[0,1.3,0]}><meshStandardMaterial color={selected ? '#d6af65' : '#e8ddca'} roughness={.82}/></RoundedBox><mesh position={[0,1.45,.11]}><torusGeometry args={[.64,.035,16,50]}/><meshStandardMaterial color="#b88b42" metalness={.4}/></mesh></group> }
function ThroneChair({ color, scale = 0.7 }: { color: string; scale?: number }) { return <group scale={scale}><RoundedBox castShadow args={[1.15,.18,.95]} radius={.12} smoothness={4} position={[0,.55,0]}><meshStandardMaterial color={color} roughness={.38} metalness={.08}/></RoundedBox><RoundedBox castShadow args={[1.08,1.45,.2]} radius={.16} smoothness={4} position={[0,1.22,.34]}><meshStandardMaterial color={color} roughness={.38} metalness={.08}/></RoundedBox><mesh castShadow position={[0,1.98,.34]}><sphereGeometry args={[.18,20,20]}/><meshStandardMaterial color="#caa24c" metalness={.5} roughness={.26}/></mesh>{[-.42,.42].map((x) => <mesh key={x} castShadow position={[x,.32,0]}><cylinderGeometry args={[.07,.09,.6,16]}/><meshStandardMaterial color="#b78a3d" metalness={.4} roughness={.3}/></mesh>)}</group> }
function BalloonArch({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { return <group>{[...Array(11)].map((_, i) => { const t = i / 10; const angle = Math.PI * t; return <mesh key={i} castShadow position={[(t - .5) * width, .65 + Math.sin(angle) * Math.max(width * .42, 1.1), 0]}><sphereGeometry args={[Math.max(depth * .22, .16), 18, 18]}/><meshStandardMaterial color={selected ? '#e5b75e' : i % 3 === 0 ? '#f2e4c9' : i % 3 === 1 ? '#caa24c' : '#b87f79'} roughness={.52}/></mesh> })}</group> }
function PipeDrape({ width, selected }: { width: number; selected: boolean }) { return <group><mesh castShadow position={[-width / 2, 1.4, 0]}><cylinderGeometry args={[.045,.055,2.8,14]}/><meshStandardMaterial color="#b78a3d" metalness={.6} roughness={.22}/></mesh><mesh castShadow position={[width / 2, 1.4, 0]}><cylinderGeometry args={[.045,.055,2.8,14]}/><meshStandardMaterial color="#b78a3d" metalness={.6} roughness={.22}/></mesh><RoundedBox castShadow args={[width,2.55,.08]} radius={.02} smoothness={2} position={[0,1.35,0]}><meshStandardMaterial color={selected ? '#dfbd73' : '#d9d0c3'} roughness={.94} transparent opacity={.92}/></RoundedBox></group> }
function Stanchions({ width }: { width: number }) { return <group>{[-width / 2, width / 2].map((x) => <group key={x} position={[x,0,0]}><mesh castShadow position={[0,.52,0]}><cylinderGeometry args={[.16,.2,1.04,20]}/><meshStandardMaterial color="#b78a3d" metalness={.65} roughness={.24}/></mesh><mesh castShadow position={[0,1.03,0]}><sphereGeometry args={[.2,18,18]}/><meshStandardMaterial color="#caa24c" metalness={.65} roughness={.22}/></mesh></group>)}<mesh castShadow position={[0,.72,0]} rotation={[0,0,Math.atan2(.18, Math.max(width, .2))]}><cylinderGeometry args={[.025,.025,Math.max(width, .2),10]}/><meshStandardMaterial color="#8b6b4c" roughness={.62}/></mesh></group> }
function VipArea({ width, depth, selected }: { width: number; depth: number; selected: boolean }) { return <group><mesh receiveShadow position={[0,.025,0]}><boxGeometry args={[width,.05,depth]}/><meshStandardMaterial color={selected ? '#c99b48' : '#896a54'} roughness={.95}/></mesh><group position={[0,0,-depth*.25]}><SofaModel width={Math.min(width*.75,3.1)} color="#d8c4a1"/></group></group> }
function Florals({ selected }: { selected: boolean }) { return <group><mesh castShadow position={[0,.35,0]}><cylinderGeometry args={[.11,.16,.7,16]}/><meshStandardMaterial color="#b99155"/></mesh>{Array.from({length:8},(_,i)=>{const a=i/8*Math.PI*2; return <mesh key={i} castShadow position={[Math.cos(a)*.27,.78+Math.sin(i*2)*.08,Math.sin(a)*.27]}><sphereGeometry args={[.18,18,18]}/><meshStandardMaterial color={selected ? '#e0b85f' : i%2 ? '#f1e6d1':'#788866'} roughness={.9}/></mesh>})}</group> }
function Centerpiece() { return <group position={[0,.88,0]}><mesh castShadow position={[0,.14,0]}><cylinderGeometry args={[.05,.08,.28,12]}/><meshStandardMaterial color="#b5935c"/></mesh>{[0,1,2,3,4].map(i=><mesh key={i} castShadow position={[Math.cos(i*1.25)*.12,.34+Math.sin(i)*.05,Math.sin(i*1.25)*.12]}><sphereGeometry args={[.1,12,12]}/><meshStandardMaterial color={i%2 ? '#f0e4cf':'#83906f'}/></mesh>)}</group> }
