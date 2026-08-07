import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { City } from './city.js'

const POOL = { cars:120, buses:15, trucks:20, motorcycles:40, ambulances:4, firetrucks:4, police:6, pedestrians:200, cyclists:30, families:20 }
const VEHICLE_SPEED = { car:8, bus:5, truck:4.5, motorcycle:10, ambulance:12, firetruck:10, police:11 }
const VEHICLE_COLORS = [0x3b82f6,0xef4444,0x22c55e,0xf59e0b,0x8b5cf6,0xec4899,0x06b6d4,0xf97316,0x14b8a6,0x64748b]

/* ═══ FACTORIES ═════════════════════════════════════════════════════════ */

function mat(c){ return new THREE.MeshStandardMaterial({color:c,roughness:0.5,metalness:0.3}) }

function makeVehicle(type) {
  const g = new THREE.Group()
  switch(type) {
    case 'car': {
      const c = VEHICLE_COLORS[Math.floor(Math.random()*VEHICLE_COLORS.length)]
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.6,4),mat(c)); body.position.y=0.5; body.castShadow=true; g.add(body)
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.5,2),mat(0x94a3b8)); cab.position.set(0,1.05,-0.3); cab.castShadow=true; g.add(cab)
      for(const sx of[-0.6,0.6]){const hl=new THREE.Mesh(new THREE.SphereGeometry(0.08,6,6),new THREE.MeshBasicMaterial({color:0xfef3c7}));hl.position.set(sx,0.5,2.01);g.add(hl)}
      break
    }
    case 'bus': {
      const body=new THREE.Mesh(new THREE.BoxGeometry(2.2,2,8),mat(0xf97316));body.position.y=1.2;body.castShadow=true;g.add(body)
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.22,0.3,8.02),mat(0xfbbf24));stripe.position.y=1.2;g.add(stripe)
      break
    }
    case 'truck': {
      const cab=new THREE.Mesh(new THREE.BoxGeometry(2,1.5,3),mat(0x1e40af));cab.position.set(0,1,2.5);cab.castShadow=true;g.add(cab)
      const bed=new THREE.Mesh(new THREE.BoxGeometry(2.2,1,5),mat(0x475569));bed.position.set(0,0.8,-1);bed.castShadow=true;g.add(bed)
      break
    }
    case 'motorcycle': {
      const frame=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.5,1.8),mat(0x1e293b));frame.position.y=0.5;frame.castShadow=true;g.add(frame)
      break
    }
    case 'ambulance': {
      const body=new THREE.Mesh(new THREE.BoxGeometry(2,1.4,4.5),mat(0xf1f5f9));body.position.y=0.9;body.castShadow=true;g.add(body)
      const cross=new THREE.Mesh(new THREE.BoxGeometry(0.15,1,0.15),mat(0xef4444));cross.position.set(0,0.9,2.26);g.add(cross)
      const crossH=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.15,0.15),mat(0xef4444));crossH.position.set(0,0.9,2.26);g.add(crossH)
      const siren=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.15,0.3),new THREE.MeshBasicMaterial({color:0x3b82f6}));siren.position.y=1.7;g.add(siren)
      g.userData.siren=siren; break
    }
    case 'firetruck': {
      const body=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.8,6),mat(0xdc2626));body.position.y=1.1;body.castShadow=true;g.add(body)
      const ladder=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.15,5),mat(0x78716c));ladder.position.set(0,2.1,-0.5);g.add(ladder)
      const siren=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.15,0.3),new THREE.MeshBasicMaterial({color:0xef4444}));siren.position.y=2.1;g.add(siren)
      g.userData.siren=siren; break
    }
    case 'police': {
      const body=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.6,4),mat(0x1e3a8a));body.position.y=0.5;body.castShadow=true;g.add(body)
      const cab=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.5,2),mat(0x94a3b8));cab.position.set(0,1.05,-0.3);g.add(cab)
      const bar=new THREE.Mesh(new THREE.BoxGeometry(1,0.12,0.3),new THREE.MeshBasicMaterial({color:0x3b82f6}));bar.position.y=1.35;g.add(bar)
      g.userData.siren=bar; break
    }
  }
  return g
}

function makePedestrian() {
  const g = new THREE.Group()
  const skin=[0xf5d0b0,0xd2a679,0x8d5524,0xc68642]
  const cloth=[0x3b82f6,0xef4444,0x22c55e,0xf59e0b,0x8b5cf6,0xec4899,0x06b6d4,0x1e293b,0xf1f5f9]
  const s=skin[Math.floor(Math.random()*skin.length)], c=cloth[Math.floor(Math.random()*cloth.length)]
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.35,0.7,0.3),new THREE.MeshStandardMaterial({color:c,roughness:0.7}));body.position.y=0.85;g.add(body)
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.15,6,6),new THREE.MeshStandardMaterial({color:s,roughness:0.8}));head.position.y=1.4;g.add(head)
  for(const sx of[-0.08,0.08]){const leg=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.45,0.12),new THREE.MeshStandardMaterial({color:0x1e293b,roughness:0.8}));leg.position.set(sx,0.22,0);g.add(leg)}
  return g
}

function makeCyclist(){
  const g=makePedestrian()
  const frame=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.3,0.8),new THREE.MeshStandardMaterial({color:0x1e293b,metalness:0.5}));frame.position.set(0.3,0.5,0);g.add(frame)
  for(const dz of[-0.3,0.3]){const w=new THREE.Mesh(new THREE.TorusGeometry(0.15,0.02,6,12),new THREE.MeshStandardMaterial({color:0x334155}));w.rotation.y=Math.PI/2;w.position.set(0.3,0.15,dz);g.add(w)}
  return g
}

function makeFamily(){
  const g=new THREE.Group()
  const a1=makePedestrian();a1.position.x=-0.5;g.add(a1)
  const a2=makePedestrian();a2.position.x=0.5;g.add(a2)
  const child=makePedestrian();child.scale.set(0.7,0.7,0.7);child.position.set(0,0,0.4);g.add(child)
  return g
}
/* ═══ WEATHER SYSTEM ════════════════════════════════════════════════════ */

class WeatherSystem {
  constructor(scene) {
    this.scene = scene
    this.current = 'sunny'
    this.fogDensity = 0.008; this.targetFogDensity = 0.008
    this.ambientIntensity = 0.4; this.targetAmbient = 0.4
    this.sunIntensity = 1.4; this.targetSun = 1.4
    this.ambientColor = new THREE.Color(0x94a3b8); this.targetAmbientColor = new THREE.Color(0x94a3b8)
    this.sunColor = new THREE.Color(0xfff5e6); this.targetSunColor = new THREE.Color(0xfff5e6)
    this.fogColor = new THREE.Color(0x0f172a); this.targetFogColor = new THREE.Color(0x0f172a)
    this.initRain()
  }

  initRain() {
    const N = 3000, geo = new THREE.BufferGeometry(), pos = new Float32Array(N*3), vel = new Float32Array(N)
    for(let i=0;i<N;i++){pos[i*3]=(Math.random()-0.5)*300;pos[i*3+1]=Math.random()*80;pos[i*3+2]=(Math.random()-0.5)*300;vel[i]=0.3+Math.random()*0.5}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3))
    this.rain = new THREE.Points(geo,new THREE.PointsMaterial({color:0x93c5fd,size:0.15,transparent:true,opacity:0.6,depthWrite:false}))
    this.rainVel = vel; this.rain.visible = false; this.scene.add(this.rain)
  }

  set(w) {
    this.current = w
    const presets = {
      sunny:    { fog:0.008, amb:0.5,  sun:1.5, ac:0x94a3b8, sc:0xfff5e6, fc:0x0f172a, rain:false, ro:0,   rs:0.12 },
      cloudy:   { fog:0.012, amb:0.35, sun:0.8, ac:0x64748b, sc:0xd1d5db, fc:0x1e293b, rain:false, ro:0,   rs:0.12 },
      rain:     { fog:0.018, amb:0.25, sun:0.4, ac:0x475569, sc:0x9ca3af, fc:0x1e293b, rain:true,  ro:0.4, rs:0.12 },
      heavyrain:{ fog:0.025, amb:0.15, sun:0.2, ac:0x334155, sc:0x6b7280, fc:0x0f172a, rain:true,  ro:0.65,rs:0.18 },
      storm:    { fog:0.03,  amb:0.1,  sun:0.1, ac:0x1e293b, sc:0x374151, fc:0x020408, rain:true,  ro:0.8, rs:0.22 },
      fog:      { fog:0.06,  amb:0.3,  sun:0.3, ac:0x9ca3af, sc:0xd1d5db, fc:0x9ca3af, rain:false, ro:0,   rs:0.12 },
      night:    { fog:0.02,  amb:0.04, sun:0.0, ac:0x1e293b, sc:0x000000, fc:0x020408, rain:false, ro:0,   rs:0.12 },
      sunset:   { fog:0.015, amb:0.3,  sun:1.2, ac:0xf97316, sc:0xfb923c, fc:0x431407, rain:false, ro:0,   rs:0.12 },
    }
    const p = presets[w] || presets.sunny
    this.targetFogDensity=p.fog; this.targetAmbient=p.amb; this.targetSun=p.sun
    this.targetAmbientColor.set(p.ac); this.targetSunColor.set(p.sc); this.targetFogColor.set(p.fc)
    this.rain.visible=p.rain; this.rain.material.opacity=p.ro; this.rain.material.size=p.rs
    if(typeof updateWeatherUI==='function') updateWeatherUI(w)
  }

  update(dt) {
    const l = 1 - Math.pow(0.05, dt)
    this.fogDensity+=(this.targetFogDensity-this.fogDensity)*l
    this.ambientIntensity+=(this.targetAmbient-this.ambientIntensity)*l
    this.sunIntensity+=(this.targetSun-this.sunIntensity)*l
    this.ambientColor.lerp(this.targetAmbientColor,l)
    this.sunColor.lerp(this.targetSunColor,l)
    this.fogColor.lerp(this.targetFogColor,l)
    this.scene.fog = new THREE.FogExp2(this.fogColor, this.fogDensity)
    const amb=this.scene.getObjectByName('ambient'), sun=this.scene.getObjectByName('sun')
    if(amb){amb.intensity=this.ambientIntensity;amb.color.copy(this.ambientColor)}
    if(sun){sun.intensity=this.sunIntensity;sun.color.copy(this.sunColor)}
    if(this.rain.visible){
      const pos=this.rain.geometry.attributes.position, spd=this.current==='storm'?1.8:this.current==='heavyrain'?1.2:0.8
      for(let i=0;i<pos.count;i++){pos.array[i*3+1]-=this.rainVel[i]*spd*dt*60;if(pos.array[i*3+1]<0){pos.array[i*3+1]=60+Math.random()*20;pos.array[i*3]=(Math.random()-0.5)*300;pos.array[i*3+2]=(Math.random()-0.5)*300}}
      pos.needsUpdate=true
    }
    const dark=this.current==='night'||this.current==='storm'||this.current==='sunset'
    window._cityInstance?.streetLights.forEach(sl=>{if(sl.userData.bulb){sl.userData.bulb.material.emissiveIntensity=dark?3:1.5;sl.userData.spot.intensity=dark?3.5:1.2}})
  }
}

/* ═══ VEHICLE MANAGER ═══════════════════════════════════════════════════ */

class VehicleManager {
  constructor(scene) {
    this.scene = scene; this.vehicles = []; this.roads = []
    const half=300, block=40, cnt=Math.floor(600/block)
    for(let i=0;i<=cnt;i++){
      const pos=-half+i*block
      if(i%2===0){
        this.roads.push({x1:-half,z1:pos,x2:half,z2:pos,dir:'h',lane:pos+(i%4===0?3:-3)})
        this.roads.push({x1:pos,z1:-half,x2:pos,z2:half,dir:'v',lane:pos+(i%4===0?3:-3)})
      }
    }
    const types=[{type:'car',n:POOL.cars},{type:'bus',n:POOL.buses},{type:'truck',n:POOL.trucks},{type:'motorcycle',n:POOL.motorcycles},{type:'ambulance',n:POOL.ambulances},{type:'firetruck',n:POOL.firetrucks},{type:'police',n:POOL.police}]
    types.forEach(({type,n})=>{
      for(let i=0;i<n;i++){
        const m=makeVehicle(type), road=this.roads[Math.floor(Math.random()*this.roads.length)], t=Math.random()
        m.position.set(road.x1+(road.x2-road.x1)*t, 0, road.lane+(Math.random()-0.5)*2)
        if(road.dir==='v') m.rotation.y=Math.PI/2
        m.userData={type,speed:VEHICLE_SPEED[type]*(0.8+Math.random()*0.4),road,t,emergency:type==='ambulance'||type==='firetruck'||type==='police',responding:false,targetX:0,targetZ:0,turnTimer:0}
        this.scene.add(m); this.vehicles.push(m)
      }
    })
  }

  update(dt, incidentPos) {
    const half=300
    this.vehicles.forEach(v=>{
      const u=v.userData, spd=u.responding?u.speed*1.6:u.speed
      if(u.emergency&&incidentPos&&!u.responding&&v.position.distanceTo(incidentPos)<150){u.responding=true;u.targetX=incidentPos.x;u.targetZ=incidentPos.z}
      if(u.responding){
        const dx=u.targetX-v.position.x, dz=u.targetZ-v.position.z, d=Math.sqrt(dx*dx+dz*dz)
        if(d>3){v.position.x+=(dx/d)*spd*dt;v.position.z+=(dz/d)*spd*dt;v.rotation.y=Math.atan2(dx,dz)}else{u.responding=false}
        if(u.siren) u.siren.material.emissiveIntensity=0.5+Math.sin(performance.now()*0.01)*0.5
      } else {
        u.t+=(spd*dt)/200; if(u.t>1)u.t=0
        const r=u.road
        if(r.dir==='v'){v.rotation.y=Math.PI/2;v.position.x=r.lane+Math.sin(u.t*20)*0.3;v.position.z=r.z1+(r.z2-r.z1)*u.t}
        else{v.rotation.y=0;v.position.x=r.x1+(r.x2-r.x1)*u.t;v.position.z=r.lane+Math.sin(u.t*20)*0.3}
        u.turnTimer+=dt
        if(u.turnTimer>3+Math.random()*5){u.turnTimer=0;if(Math.random()>0.6){u.road=this.roads[Math.floor(Math.random()*this.roads.length)];u.t=0}}
      }
      if(v.position.x>half+10)v.position.x=-half; if(v.position.x<-half-10)v.position.x=half
      if(v.position.z>half+10)v.position.z=-half; if(v.position.z<-half-10)v.position.z=half
    })
  }
}

/* ═══ PEDESTRIAN MANAGER ════════════════════════════════════════════════ */

class PedestrianManager {
  constructor(scene) {
    this.scene=scene; this.people=[]
    const half=280
    const spawn=(Factory,n,spd)=>{for(let i=0;i<n;i++){const m=Factory();const x=(Math.random()-0.5)*half*2,z=(Math.random()-0.5)*half*2;m.position.set(x,0,z);m.userData={speed:spd*(0.5+Math.random()),tx:(Math.random()-0.5)*half*2,tz:(Math.random()-0.5)*half*2,wanderTimer:Math.random()*5};this.scene.add(m);this.people.push(m)}}
    spawn(makePedestrian,POOL.pedestrians,1.2)
    spawn(makeCyclist,POOL.cyclists,2.5)
    spawn(makeFamily,POOL.families,0.8)
  }

  update(dt, incidentPos) {
    const half=280
    this.people.forEach(p=>{
      const u=p.userData
      if(incidentPos){
        const d=p.position.distanceTo(incidentPos)
        if(d<30){const dx=p.position.x-incidentPos.x,dz=p.position.z-incidentPos.z,len=Math.sqrt(dx*dx+dz*dz)+0.01;p.position.x+=(dx/len)*u.speed*2.5*dt;p.position.z+=(dz/len)*u.speed*2.5*dt;p.rotation.y=Math.atan2(dx,dz);return}
      }
      const dx=u.tx-p.position.x,dz=u.tz-p.position.z,d=Math.sqrt(dx*dx+dz*dz)
      if(d>1){p.position.x+=(dx/d)*u.speed*dt;p.position.z+=(dz/d)*u.speed*dt;p.rotation.y=Math.atan2(dx,dz)}
      u.wanderTimer+=dt
      if(u.wanderTimer>3+Math.random()*4||d<1){u.wanderTimer=0;u.tx=(Math.random()-0.5)*half*2;u.tz=(Math.random()-0.5)*half*2}
      if(p.position.x>half)p.position.x=-half; if(p.position.x<-half)p.position.x=half
      if(p.position.z>half)p.position.z=-half; if(p.position.z<-half)p.position.z=half
    })
  }
}

/* ═══ EVENT / INCIDENT SYSTEM ═══════════════════════════════════════════ */

class EventSystem {
  constructor(scene) {
    this.scene = scene; this.activeEvents = []; this.incidentCount = 0
    this.effects = [] // particle groups for active events
  }

  trigger(type) {
    const half = 280
    const x = (Math.random()-0.5)*half*0.8, z = (Math.random()-0.5)*half*0.8
    const pos = new THREE.Vector3(x, 0, z)
    const configs = {
      accident:      {cat:'collision',title:'Road Accident',desc:'Vehicle collision on city road',cam:'CAM 5',pri:3,icon:'🚗💥'},
      multi_accident:{cat:'collision',title:'Multi Vehicle Pile-up',desc:'Multiple vehicles involved in collision',cam:'CAM 5',pri:4,icon:'🚕💥🚗'},
      building_fire: {cat:'fire',title:'Building Fire',desc:'Structural fire — emergency response',cam:'CAM 3',pri:5,icon:'🔥🏢'},
      flood:         {cat:'water_leak',title:'Flash Flood',desc:'Waterlogging — road submerged',cam:'CAM 1',pri:4,icon:'🌊🏚'},
      power_failure: {cat:'power_outage',title:'Power Failure',desc:'Electrical grid failure detected',cam:'CAM 1',pri:3,icon:'🔌⚡'},
      water_burst:   {cat:'water_leak',title:'Water Pipeline Burst',desc:'Underground pipeline ruptured',cam:'CAM 7',pri:3,icon:'🚰💥'},
      gas_leak:      {cat:'chemical',title:'Gas Leak Detected',desc:'Toxic gas concentration above threshold',cam:'CAM 8',pri:5,icon:'💨⚠️'},
      crowd_fight:   {cat:'crowd',title:'Crowd Fight',desc:'Public disturbance — crowd altercation',cam:'CAM 6',pri:3,icon:'👥😠'},
      road_block:    {cat:'road_damage',title:'Road Blockage',desc:'Obstruction on major road',cam:'CAM 1',pri:2,icon:'🚧⛔'},
      medical:       {cat:'medical',title:'Medical Emergency',desc:'Critical health emergency',cam:'CAM 2',pri:5,icon:'🚑🏥'},
    }
    const cfg = configs[type] || configs.accident
    this.incidentCount++

    // Create 3D effect at position
    const effect = this.createEffect(type, pos)
    if(effect) this.effects.push(effect)

    // Post to admin API
    fetch('/api/incidents/', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({category:cfg.cat,title:cfg.title,description:cfg.desc,latitude:17.3850,longitude:78.4867,location_address:'Smart City Digital Twin — '+cfg.cam,reporter_name:'UCRIP AI System'})
    }).then(r=>r.json()).then(d=>this.showToast(cfg,title,d.incident_id,true))
      .catch(()=>this.showToast(cfg,title,null,false))

    // Report AI detection
    this.reportDetection(type, cfg, pos)

    // Update counters
    document.getElementById('incident-count').textContent = this.incidentCount
    document.getElementById('status-text').textContent = cfg.title
    const dot = document.querySelector('.status-dot')
    dot.className = 'status-dot red'
    document.getElementById('scene-tag').textContent = 'ACTIVE INCIDENT'
    document.getElementById('scene-tag').className = 'scene-tag danger'

    // Return position for vehicle response
    return pos
  }

  createEffect(type, pos) {
    if(type==='building_fire'||type==='flood'||type==='gas_leak'){
      const N=200, geo=new THREE.BufferGeometry(), p=new Float32Array(N*3), v=[]
      for(let i=0;i<N;i++){p[i*3]=pos.x+(Math.random()-0.5)*4;p[i*3+1]=pos.y+Math.random()*3;p[i*3+2]=pos.z+(Math.random()-0.5)*4;v.push({x:(Math.random()-0.5)*0.04,y:Math.random()*0.08+0.02,z:(Math.random()-0.5)*0.04,life:Math.random()})}
      geo.setAttribute('position',new THREE.BufferAttribute(p,3))
      const colors={building_fire:0xff4400,flood:0x3b82f6,gas_leak:0xa3e635}
      const pts=new THREE.Points(geo,new THREE.PointsMaterial({color:colors[type]||0xff4400,size:type==='flood'?0.3:0.15,transparent:true,opacity:0.85,depthWrite:false,sizeAttenuation:true}))
      this.scene.add(pts)
      return {points:pts,velocities:v,origin:pos.clone(),type,life:8}
    }
    // Road events: marker
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(2,2,0.3,16),new THREE.MeshBasicMaterial({color:type==='accident'?0xef4444:0xf59e0b,transparent:true,opacity:0.5}))
    marker.position.set(pos.x,0.2,pos.z); this.scene.add(marker)
    return {marker,life:10}
  }

  reportDetection(type, cfg, pos) {
    const now = new Date()
    const detection = {
      incident_id: 'DET-' + Date.now().toString(36).toUpperCase(),
      type: type, category: cfg.cat, title: cfg.title,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      camera: cfg.cam, location: cfg.desc,
      confidence: (0.85 + Math.random()*0.14).toFixed(2),
      priority: cfg.pri, snapshot: true, video_clip: true,
    }
    window._aiDetections = window._aiDetections || []
    window._aiDetections.push(detection)
    if(window._aiDetections.length > 50) window._aiDetections.shift()
  }

  showToast(cfg, title, id, ok) {
    const el = document.getElementById('sim-toast'); if(el) el.remove()
    const t = document.createElement('div'); t.id='sim-toast'; t.className='toast '+(ok?'success':'error')
    t.innerHTML=`<strong>${ok?'✅':'⚠️'} ${ok?'Incident Reported':'Report Failed'}</strong><br/><span style="opacity:0.9">${cfg.icon} ${title}</span>${id?`<br/><span style="font-family:monospace;font-size:10px;opacity:0.7">ID: ${id}</span>`:''}`
    document.body.appendChild(t); setTimeout(()=>t.remove(),5000)
  }

  update(dt) {
    for(let i=this.effects.length-1;i>=0;i--){
      const e=this.effects[i]; e.life-=dt
      if(e.life<=0){this.scene.remove(e.points||e.marker);this.effects.splice(i,1);continue}
      if(e.points){
        const pos=e.points.geometry.attributes.position
        for(let j=0;j<e.velocities.length;j++){
          const v=e.velocities[j]; v.life-=dt*0.5
          if(v.life<=0){v.life=1;pos.array[j*3]=e.origin.x+(Math.random()-0.5)*4;pos.array[j*3+1]=e.origin.y;pos.array[j*3+2]=e.origin.z+(Math.random()-0.5)*4}
          pos.array[j*3]+=v.x*dt*60;pos.array[j*3+1]+=v.y*dt*60;pos.array[j*3+2]+=v.z*dt*60;v.y-=dt*0.01
        }
        pos.needsUpdate=true
      }
      if(e.marker){e.marker.material.opacity=0.3+Math.sin(performance.now()*0.005)*0.2}
    }
    // Auto-clear status after 8s if no active effects
    if(this.effects.length===0&&document.getElementById('scene-tag').className.includes('danger')){
      setTimeout(()=>{
        if(this.effects.length===0){
          document.getElementById('status-text').textContent='All systems normal'
          document.querySelector('.status-dot').className='status-dot green'
          document.getElementById('scene-tag').textContent='SYSTEM NORMAL'
          document.getElementById('scene-tag').className='scene-tag'
        }
      },8000)
    }
  }
}

/* ═══ CCTV SYSTEM ═══════════════════════════════════════════════════════ */

class CCTVSystem {
  constructor(scene, cameraPositions) {
    this.scene = scene
    this.cameras = cameraPositions.map((cp, i) => {
      const cam = new THREE.PerspectiveCamera(55, 16/9, 0.5, 200)
      cam.position.set(cp.x, 12, cp.z)
      cam.lookAt(new THREE.Vector3(cp.lookX, 0, cp.lookZ))
      return { cam, label: cp.label, index: i }
    })
    this.renderTargets = this.cameras.map(() => new THREE.WebGLRenderTarget(640, 360, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }))
    this.renderer = null
    this.activeCam = -1
    this.scanTimer = 0
  }

  setRenderer(renderer) { this.renderer = renderer }

  renderAll() {
    if(!this.renderer) return
    const origViewport = new THREE.Vector4()
    this.renderer.getSize(origViewport)
    this.cameras.forEach((c, i) => {
      const canvas = document.getElementById(`cctv-${i+1}`)
      if(!canvas || canvas.clientWidth === 0) return
      canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1)
      canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1)
      this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
      this.renderer.setRenderTarget(this.renderTargets[i])
      this.renderer.render(this.scene, c.cam)
      // Copy to 2D canvas
      const ctx = canvas.getContext('2d')
      ctx.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height)
      // Scanline overlay
      this.scanTimer += 0.02
      ctx.fillStyle = `rgba(34,211,238,${0.02+Math.sin(this.scanTimer+i)*0.01})`
      ctx.fillRect(0, (this.scanTimer*50+i*40) % canvas.height, canvas.width, 2)
      // Timestamp
      const now = new Date()
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, canvas.height-20, canvas.width, 20)
      ctx.fillStyle = '#22d3ee'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.fillText(`CAM ${i+1} | ${c.label} | ${now.toLocaleTimeString()}`, 5, canvas.height-6)
    })
    this.renderer.setRenderTarget(null)
    this.renderer.setSize(origViewport.z, origViewport.w, false)

    // Update HUD timestamps
    document.querySelectorAll('.cctv-feed').forEach((feed, i) => {
      const timeEl = feed.querySelector('.cam-time')
      if(timeEl) timeEl.textContent = new Date().toLocaleTimeString()
    })
  }
}

/* ═══ MAIN APPLICATION ══════════════════════════════════════════════════ */

class App {
  constructor() {
    this.canvas = document.getElementById('canvas')
    this.mapCanvas = document.getElementById('map-canvas')
    this.activeView = 'city'
    this.incidentPos = null

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference:'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0f172a)

    // Lights
    const ambient = new THREE.AmbientLight(0x94a3b8, 0.5); ambient.name = 'ambient'; this.scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xfff5e6, 1.5); sun.name = 'sun'
    sun.position.set(40, 60, 30); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 200
    sun.shadow.camera.left = -80; sun.shadow.camera.right = 80
    sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80
    this.scene.add(sun)
    const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x475569, 0.35); this.scene.add(hemi)

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
    this.camera.position.set(80, 70, 80)
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.maxPolarAngle = Math.PI / 2.05
    this.controls.minDistance = 10
    this.controls.maxDistance = 200
    this.controls.target.set(0, 5, 0)
    this.controls.update()

    // City
    this.city = new City(this.scene)
    this.city.build()
    window._cityInstance = this.city

    // Systems
    this.weather = new WeatherSystem(this.scene)
    this.vehicles = new VehicleManager(this.scene)
    this.pedestrians = new PedestrianManager(this.scene)
    this.events = new EventSystem(this.scene)
    this.cctv = new CCTVSystem(this.scene, this.city.cameraPositions)
    this.cctv.setRenderer(this.renderer)

    // Map renderer (2D top-down)
    this.mapRenderer = null
    this.mapCamera = null
    this.initMap()

    // Clock
    this.clock = new THREE.Clock()
    this.fpsFrames = 0; this.fpsTime = 0

    // Bind
    window.triggerScenario = (s) => this.triggerScenario(s)
    window.triggerEvent = (e) => this.triggerEvent(e)
    window.setWeather = (w) => this.weather.set(w)
    window.switchView = (v) => this.switchView(v)
    window.resetSimulation = () => this.resetSimulation()
    window.toggleCCTVFullscreen = () => this.toggleCCTVFullscreen()
    window.updateWeatherUI = (w) => this.updateWeatherUI(w)

    // Resize
    this.onResize()
    window.addEventListener('resize', () => this.onResize())

    // Start
    this.animate()
  }

  initMap() {
    const mc = this.mapCanvas
    if(!mc) return
    this.mapRenderer = new THREE.WebGLRenderer({ canvas: mc, antialias: true })
    this.mapRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.mapCamera = new THREE.OrthographicCamera(-320, 320, 320, -320, 1, 500)
    this.mapCamera.position.set(0, 200, 0)
    this.mapCamera.lookAt(0, 0, 0)
    // Map scene shares main scene
  }

  onResize() {
    const wrap = this.canvas.parentElement
    if(wrap && wrap.clientWidth > 0) {
      const w = wrap.clientWidth, h = wrap.clientHeight
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(w, h, false)
    }
    if(this.mapCanvas) {
      const mw = this.mapCanvas.parentElement?.clientWidth || 800
      const mh = this.mapCanvas.parentElement?.clientHeight || 600
      if(this.mapRenderer) this.mapRenderer.setSize(mw, mh, false)
    }
  }

  switchView(v) {
    this.activeView = v
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'))
    document.getElementById(`view-${v}`)?.classList.add('active')
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === v)
    })
    this.onResize()
  }

  triggerScenario(type) {
    document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'))
    document.getElementById(`btn-${type}`)?.classList.add('active')
    const pos = this.events.trigger(type === 'flood' ? 'flood' : type === 'fire' ? 'building_fire' : type === 'collapse' ? 'road_block' : 'power_failure')
    this.incidentPos = pos
  }

  triggerEvent(type) {
    const pos = this.events.trigger(type)
    this.incidentPos = pos
  }

  resetSimulation() {
    this.incidentPos = null
    this.events.effects.forEach(e => this.scene.remove(e.points || e.marker))
    this.events.effects = []
    this.events.incidentCount = 0
    document.getElementById('incident-count').textContent = '0'
    document.getElementById('status-text').textContent = 'All systems normal'
    document.querySelector('.status-dot').className = 'status-dot green'
    document.getElementById('scene-tag').textContent = 'SYSTEM NORMAL'
    document.getElementById('scene-tag').className = 'scene-tag'
    document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'))
    this.weather.set('sunny')
    document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('active'))
    document.querySelector('.weather-btn')?.classList.add('active')
    this.vehicles.vehicles.forEach(v => { v.userData.responding = false })
  }

  toggleCCTVFullscreen() {
    const grid = document.getElementById('cctv-grid')
    if(!document.fullscreenElement) grid.requestFullscreen().catch(()=>{})
    else document.exitFullscreen()
  }

  updateWeatherUI(w) {
    document.querySelectorAll('.weather-btn').forEach(b => {
      const map = {sunny:'☀️',cloudy:'☁️',rain:'🌧',heavyrain:'⛈',storm:'⛈',fog:'🌫',night:'🌙',sunset:'🌅'}
      b.classList.toggle('active', b.textContent.trim() === map[w])
    })
  }

  updateTime() {
    const now = new Date()
    const el = document.getElementById('time-display')
    if(el) el.textContent = now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) + ' — ' + now.toLocaleTimeString()
  }

  animate() {
    requestAnimationFrame(() => this.animate())
    const dt = Math.min(this.clock.getDelta(), 0.05)

    // FPS
    this.fpsFrames++; this.fpsTime += dt
    if(this.fpsTime >= 0.5){
      const fps = Math.round(this.fpsFrames / this.fpsTime)
      document.getElementById('fps-display').textContent = fps
      this.fpsFrames = 0; this.fpsTime = 0
    }

    // Update systems
    this.weather.update(dt)
    this.vehicles.update(dt, this.incidentPos)
    this.pedestrians.update(dt, this.incidentPos)
    this.events.update(dt)

    // Traffic lights
    const t = performance.now() * 0.001
    this.city.trafficLights.forEach(tl => {
      const phase = t + tl.userData.phase
      const cycle = phase % 6
      const l = tl.userData.lights
      l.red.material.opacity = cycle < 3 ? 1 : 0.15
      l.yellow.material.opacity = cycle >= 2.5 && cycle < 3 ? 1 : 0.15
      l.green.material.opacity = cycle >= 3 ? 1 : 0.15
    })

    // Stats
    document.getElementById('vehicle-count').textContent = this.vehicles.vehicles.length
    document.getElementById('people-count').textContent = this.pedestrians.people.length
    this.updateTime()

    // Render main view
    if(this.activeView === 'city') {
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }

    // CCTV
    if(this.activeView === 'cctv') {
      this.cctv.renderAll()
    }

    // Map (top-down)
    if(this.activeView === 'map' && this.mapRenderer && this.mapCamera) {
      this.mapRenderer.render(this.scene, this.mapCamera)
    }
  }
}

/* ═══ GLOBAL UI HELPERS ═════════════════════════════════════════════════ */

function showToast(category, title, id, ok) {
  const existing = document.getElementById('sim-toast'); if(existing) existing.remove()
  const t = document.createElement('div'); t.id='sim-toast'; t.className='toast '+(ok?'success':'error')
  t.innerHTML=`<strong>${ok?'✅':'⚠️'} ${ok?'Incident Reported':'Failed'}</strong><br/><span style="opacity:0.9">${title}</span>${id?`<br/><span style="font-family:monospace;font-size:10px;opacity:0.7">ID: ${id}</span>`:''}`
  document.body.appendChild(t); setTimeout(()=>t.remove(),5000)
}

/* ═══ BOOT ══════════════════════════════════════════════════════════════ */

let app
window.addEventListener('DOMContentLoaded', () => { app = new App() })
