import { lighting } from './environment.js';
import { liquidSettings, liquidExtent, GROUND_LIFETIME } from './liquid-controls.js';
import { WetTrails } from "./wet-trails.js";
import { liquidShaderSource } from './liquid-shader-source.js';
import { dyeAbsorption, QUALITY } from './liquid-settings.js';
import {
  BODY_CROP,
  WHEEL_CROP,
} from "./vehicle-geometry.js";
import { getVehicleModel, visualWheelPositions, visualTireDimensions } from './vehicle-models.js';
import { makeSheetMesh, makeStrandMesh } from "./liquid-mesh.js";
import { getLiquidImpacts, MAX_LIQUID_EVENTS } from "./liquid-events.js";
const PREMUL = {
  color: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
  alpha: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
};
const ADD = {
  color: { srcFactor: "one", dstFactor: "one", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
};
const VERTICES = [
  {
    arrayStride: 8,
    attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
  },
];
const BUDGETS = {
  performance: { sheets: 1, strands: 24, drops: 400, detail: 2, atlas: 384 },
  balanced: { sheets: 2, strands: 36, drops: 650, detail: 3, atlas: 512 },
  high: { sheets: 2, strands: 54, drops: 1200, detail: 4, atlas: 768 },
};
const NAMES = ["frontLeft", "frontRight", "rearLeft", "rearRight"];
export class WorldLiquid {
  constructor(device, format, quality = "balanced") {
    this.baseQuality = quality;
    this.q = BUDGETS[quality] ?? BUDGETS.high;
    this.device = device;
    this.format = format;
    this.resources = [];
    this.keys = [];
    this.stats = {
      events: 0,
      airborne: 0,
      depositionRebuilds: 0,
      drawCalls: 0,
      evictions: 0,
    };
  }
  get ownedBytes() {
    return (
      this.resources.reduce(
        (n, r) =>
          n +
          (typeof r.size === "number"
            ? r.size
            : (r.width ?? 0) *
              (r.height ?? 0) *
              (r.depthOrArrayLayers ?? 1) *
              4),
        0,
      ) +
      (this.width ?? 0) * (this.height ?? 0) * 8 + (this.trails?.bytes ?? 0)
    );
  }
  get resourceCount(){return this.resources.length+(this.world?2:0)+(this.trails?.resourceCount??0);}
  getStats(time,params=this.params) {
    const { events, evictions } = getLiquidImpacts();
    const active=this.active(time,params);
    return {
      ...this.stats,
      events: events.length,
      evictions,
      active,
      drawCalls:active?this.stats.drawCalls:0,
      groundLayers:active?this.stats.groundLayers:0,
      retainedEvents: events.length,
      airborne: active?events.filter((e) => time > e.time && time - e.time < 2.8).length:0,
    };
  }
  active(time, params = this.params) {
    if(params?.liquidEnabled===false)return false;
    const s=liquidSettings(params??{});
    return (params?.showSkidMarks!==false&&this.trails?.active(time,s)) || getLiquidImpacts().events.some(e=>this.contributes(e,time,s));
  }
  contributes(e,time,s){
    const age=time-e.time;
    return age>=0 && (this.groundAlive(age,s) ||
      (s.vehicleInteraction&&e.bodyContact&&s.bodyWetness>0&&
        (s.bodyResidue>0||age<s.bodyDryingDuration*3+6)));
  }
  groundAlive(age,s){
    return !s.dryingEnabled || (s.dyeResidue>0&&!s.residueAging) || age<GROUND_LIFETIME;
  }
  track(r) {
    this.resources.push(r);
    return r;
  }
  buffer(label, data, usage) {
    const r = this.track(
      this.device.createBuffer({
        label,
        size: data.byteLength,
        usage: usage | GPUBufferUsage.COPY_DST,
      }),
    );
    this.device.queue.writeBuffer(r, 0, data);
    return r;
  }
  async init() {
    const d = this.device;
    const [raw, material, vehicle, puddles, liquid, scene, trailMaterial] = await Promise.all(
      ["common", "material", "vehicle", "puddles", "liquid", "simulator", "trail-material"].map(
        liquidShaderSource,
      ),
    );
    // A 256-byte stride serves both aligned per-event uniforms and storage reads.
    // The shared tail now carries scene lighting; the laboratory leaves it disabled.
    const common = raw;
    const readEvents =
      "@group(0) @binding(4) var<storage,read> events:array<Uniforms>;\n";
    // WGSL has no includes/generics: only the event source and atlas accessor vary.
    // The material, geometry, deposition and drying functions remain shared.
    const sceneCommon = common.replace(
      "@group(0) @binding(0) var<uniform> u: Uniforms;",
      "@group(0) @binding(0) var<uniform> frame:Uniforms;\nvar<private> u:Uniforms;\nvar<private> eventLayer:u32;\n" +
        readEvents,
    );
    const arrayPuddles = puddles.replace(
      "textureSampleLevel(groundTexture,linearSampler,uv,0.)",
      "textureSampleLevel(groundTexture,linearSampler,uv,i32(eventLayer),0.)",
    );
    const sceneModule = d.createShaderModule({
      label: "simulator-liquid-material",
      code:
        "diagnostic(off, derivative_uniformity);\n" +
        sceneCommon +
        material +
        vehicle +
        scene +
        arrayPuddles + trailMaterial,
    });
    const liquidModule = d.createShaderModule({
      label: "simulator-airborne-liquid",
      code: common + material + vehicle + liquid,
    });
    for (const m of [sceneModule, liquidModule]) {
      const errors = (await m.getCompilationInfo()).messages.filter(
        (x) => x.type === "error",
      );
      if (errors.length)
        throw Error(errors.map((x) => `${x.lineNum}: ${x.message}`).join("\n"));
    }
    this.ghostData = new Float32Array(16 * 5 * 8);
    this.ghostBuffer = this.buffer(
      "liquid-vehicle-ghosts",
      this.ghostData,
      GPUBufferUsage.STORAGE,
    );
    this.layout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: "2d-array" },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" },
        },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        {
          binding: 8,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 7,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
        {binding:9,visibility:GPUShaderStage.FRAGMENT,texture:{}},
      ],
    });
    this.airLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const depLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    const sceneLayout = d.createPipelineLayout({
        bindGroupLayouts: [this.layout],
      }),
      airLayout = d.createPipelineLayout({
        bindGroupLayouts: [this.airLayout],
      }),
      depositLayout = d.createPipelineLayout({ bindGroupLayouts: [depLayout] });
    const pipeline = (
      label,
      module,
      vs,
      fs,
      layout,
      format = this.format,
      mesh = false,
      blend = false,
    ) =>
      d.createRenderPipelineAsync({
        label,
        layout,
        vertex: {
          module,
          entryPoint: vs,
          ...(mesh ? { buffers: VERTICES } : {}),
        },
        fragment: {
          module,
          entryPoint: fs,
          targets: [{ format, ...(blend ? { blend } : {}) }],
        },
        primitive: { topology: "triangle-list", cullMode: "none" },
      });
    const p = await Promise.all([
      pipeline(
        "liquid-world-ground",
        sceneModule,
        "vs_full",
        "fs_ground",
        sceneLayout,
      ),
      pipeline(
        "liquid-world-body",
        sceneModule,
        "vs_body",
        "fs_body",
        sceneLayout,
        this.format,
        false,
        PREMUL,
      ),
      pipeline(
        "liquid-world-wheel",
        sceneModule,
        "vs_wheel",
        "fs_wheel",
        sceneLayout,
        this.format,
        false,
        PREMUL,
      ),
      pipeline(
        "liquid-world-blit",
        liquidModule,
        "vs_blit",
        "fs_blit",
        airLayout,
      ),
      pipeline(
        "liquid-world-sheet",
        liquidModule,
        "vs_sheet",
        "fs_sheet",
        airLayout,
        this.format,
        true,
        PREMUL,
      ),
      pipeline(
        "liquid-world-strand",
        liquidModule,
        "vs_strand",
        "fs_strand",
        airLayout,
        this.format,
        true,
        PREMUL,
      ),
      pipeline(
        "liquid-world-drop",
        liquidModule,
        "vs_drop",
        "fs_drop",
        airLayout,
        this.format,
        false,
        PREMUL,
      ),
      pipeline(
        "liquid-world-secondary",
        liquidModule,
        "vs_splashlet",
        "fs_drop",
        airLayout,
        this.format,
        false,
        PREMUL,
      ),
      pipeline(
        "liquid-world-deposit-sheet",
        liquidModule,
        "vs_deposit_sheet",
        "fs_deposit_sheet",
        depositLayout,
        "rg16float",
        true,
        ADD,
      ),
      pipeline(
        "liquid-world-deposit-drop",
        liquidModule,
        "vs_deposit_drop",
        "fs_deposit_drop",
        depositLayout,
        "rg16float",
        false,
        ADD,
      ),
      pipeline(
        "liquid-world-deposit-secondary",
        liquidModule,
        "vs_deposit_secondary",
        "fs_deposit_drop",
        depositLayout,
        "rg16float",
        false,
        ADD,
      ),
    ]);
    [
      this.ground,
      this.body,
      this.wheel,
      this.blit,
      this.sheet,
      this.strand,
      this.drop,
      this.secondary,
      this.depositSheet,
      this.depositDrop,
      this.depositSecondary,
    ] = p;
    this.frame = this.buffer(
      "liquid-frame",
      new Float32Array(64),
      GPUBufferUsage.UNIFORM,
    );
    this.trails=new WetTrails(d,this.frame);
    await this.trails.init(common);
    this.eventData = new Float32Array(MAX_LIQUID_EVENTS * 64);
    this.eventBuffer = this.buffer(
      "liquid-events",
      this.eventData,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.STORAGE,
    );
    this.wheelData = new Float32Array(32);
    this.wheelBuffer = this.buffer(
      "liquid-wheel-poses",
      this.wheelData,
      GPUBufferUsage.UNIFORM,
    );
    this.atlasSize = this.q.atlas;
    this.atlas = this.track(
      d.createTexture({
        label: "liquid-world-deposition-atlas",
        size: [this.atlasSize, this.atlasSize, MAX_LIQUID_EVENTS],
        format: "rg16float",
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC,
      }),
    );
    this.atlasView = this.atlas.createView({ dimension: "2d-array" });
    this.layers = Array.from({ length: MAX_LIQUID_EVENTS }, (_, i) =>
      this.atlas.createView({
        dimension: "2d",
        baseArrayLayer: i,
        arrayLayerCount: 1,
      }),
    );
    this.depositGroups = this.layers.map((_, i) =>
      d.createBindGroup({
        layout: depLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: this.eventBuffer, offset: i * 256, size: 256 },
          },
        ],
      }),
    );
    const mesh = makeSheetMesh(128, 16),
      strand = makeStrandMesh(28);
    this.sheetVertices = this.buffer(
      "liquid-membrane-mesh",
      mesh.vertices,
      GPUBufferUsage.VERTEX,
    );
    this.sheetIndices = this.buffer(
      "liquid-membrane-indices",
      mesh.indices,
      GPUBufferUsage.INDEX,
    );
    this.sheetCount = mesh.indices.length;
    this.strandVertices = this.buffer(
      "liquid-filament-mesh",
      strand.vertices,
      GPUBufferUsage.VERTEX,
    );
    this.strandIndices = this.buffer(
      "liquid-filament-indices",
      strand.indices,
      GPUBufferUsage.INDEX,
    );
    this.strandCount = strand.indices.length;
    this.ghostPipeline = await pipeline(
      "liquid-world-ghosts",
      sceneModule,
      "vs_ghost",
      "fs_ghost",
      sceneLayout,
      this.format,
      false,
      PREMUL,
    );
    this.sampler = d.createSampler({
      minFilter: "linear",
      magFilter: "linear",
    });
    const art = await Promise.allSettled([
      this.art("DeLorean.png", BODY_CROP),
      this.art("DeLorean_Wheel.png", WHEEL_CROP),
    ]);
    this.hasArt = art.every((x) => x.status === "fulfilled");
    this.bodyArt =
      art[0].status === "fulfilled" ? art[0].value : this.emptyArt();
    this.wheelArt =
      art[1].status === "fulfilled" ? art[1].value : this.emptyArt();
    const bmwArt=await Promise.allSettled([
      this.art("../../bmw-e30-m3/body.png"),
      this.art("../../bmw-e30-m3/wheel.svg"),
    ]);
    this.hasBMWArt=bmwArt.every(x=>x.status==='fulfilled');
    this.bmwBodyArt=bmwArt[0].status==='fulfilled'?bmwArt[0].value:this.emptyArt();
    this.bmwWheelArt=bmwArt[1].status==='fulfilled'?bmwArt[1].value:this.emptyArt();
    this.modelId='delorean';
  }
  emptyArt() {
    const t = this.track(
      this.device.createTexture({
        size: [1, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      }),
    );
    this.device.queue.writeTexture(
      { texture: t },
      new Uint8Array(4),
      { bytesPerRow: 4 },
      [1, 1],
    );
    return t;
  }
  async art(name, crop) {
    const r = await fetch(
      new URL(name.startsWith('../../')?`../../assets/vehicles/${name.slice(6)}`:`../../assets/vehicles/delorean/${name}`, import.meta.url),
    );
    if (!r.ok) throw Error(name);
    const source = await createImageBitmap(await r.blob());
    let bitmap;
    try {
      bitmap = crop ? await createImageBitmap(source, ...crop) : source;
    } finally {
      if(bitmap!==source)source.close();
    }
    try {
      const t = this.track(
        this.device.createTexture({
          label: `liquid-${name}`,
          size: [bitmap.width, bitmap.height],
          format: "rgba8unorm",
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        }),
      );
      this.device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: t },
        [bitmap.width, bitmap.height],
      );
      return t;
    } finally {
      bitmap.close();
    }
  }
  hasModelArt(modelId){return modelId==='bmw-e30-m3'?this.hasBMWArt:this.hasArt;}
  resize(width, height) {
    if (this.width === width && this.height === height && this.trailView===this.trails.view) return;
    const usage =
      GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    const world = this.device.createTexture({
      label: "liquid-world-substrate",
      size: [width, height],
      format: this.format,
      usage,
    });
    let scene;
    try {
      scene = this.device.createTexture({
        label: "liquid-world-refraction",
        size: [width, height],
        format: this.format,
        usage,
      });
      const entries = [
        { binding: 0, resource: { buffer: this.frame } },
        { binding: 1, resource: world.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: this.atlasView },
        { binding: 4, resource: { buffer: this.eventBuffer } },
        { binding: 5, resource: this.bodyArt.createView() },
        { binding: 6, resource: this.wheelArt.createView() },
        { binding: 7, resource: { buffer: this.wheelBuffer } },
        { binding: 8, resource: { buffer: this.ghostBuffer } },
        { binding: 9, resource: this.trails.view },
      ];
      const bindModel=(bodyArt,wheelArt)=>this.device.createBindGroup({
        layout:this.layout,
        entries:entries.map(entry=>entry.binding===5?{binding:5,resource:bodyArt.createView()}
          :entry.binding===6?{binding:6,resource:wheelArt.createView()}:entry),
      });
      const sceneGroups={delorean:bindModel(this.bodyArt,this.wheelArt)};
      if(this.hasBMWArt)sceneGroups['bmw-e30-m3']=bindModel(this.bmwBodyArt,this.bmwWheelArt);
      const airGroups = Array.from({ length: MAX_LIQUID_EVENTS }, (_, i) =>
        this.device.createBindGroup({
          layout: this.airLayout,
          entries: [
            {
              binding: 0,
              resource: {
                buffer: this.eventBuffer,
                offset: i * 256,
                size: 256,
              },
            },
            { binding: 1, resource: scene.createView() },
            { binding: 2, resource: this.sampler },
          ],
        }),
      );
      this.world?.destroy();
      this.scene?.destroy();
      this.world = world;
      this.scene = scene;
      this.sceneGroups = sceneGroups;
      this.sceneGroup = sceneGroups[this.modelId]??sceneGroups.delorean;
      this.airGroups = airGroups;
      this.worldView = world.createView();
      this.sceneView = scene.createView();
      this.trailView=this.trails.view;
      this.width = width;
      this.height = height;
    } catch (e) {
      world.destroy();
      scene?.destroy();
      throw e;
    }
  }
  prepare(state, width, height, view, ppm, drawCar) {
    this.params=state.params;
    this.modelId=state.visualVehicleModel??'delorean';
    this.model=getVehicleModel(this.modelId);
    const settings=liquidSettings(state.params);
    const quality=['', 'performance','balanced','high'][state.params.liquidQuality??0]||this.baseQuality;
    this.q=state.params.liquidQuality>0?QUALITY[quality]:(BUDGETS[quality]??BUDGETS.high);
    this.trails.prepare(width,height,state.params.gpuSkidResolution??1);
    this.trails.enabled=state.params.showSkidMarks!==false;
    this.resize(width, height);
    this.sceneGroup=this.sceneGroups?.[this.modelId]??this.sceneGroups?.delorean;
    this.drawCar = drawCar && this.hasModelArt(this.modelId);
    const { events, generation, evictions } = getLiquidImpacts(),
      time = state.loop.simulationTime;
    const c = Math.cos(state.body.heading),
      s = Math.sin(state.body.heading),
      ox = this.model.originOffset.x + this.model.bodyRect.x + this.model.bodyRect.width * 0.5,
      oy = this.model.originOffset.y + this.model.bodyRect.y + this.model.bodyRect.length * 0.5;
    const cx = state.body.centerX + ox * c - oy * s,
      cy = state.body.centerY + ox * s + oy * c;
    const frame = (this.frameData ??= new Float32Array(64));
    frame.fill(0);
    frame.set([0,18,settings.breakup,settings.concentration],4);
    frame[11]=1337;frame[18]=this.q.detail;
    frame[21]=this.trails.count>0&&state.params.showSkidMarks!==false?1:0;frame[22]=this.trails.firstSlot??0;frame[23]=settings.dryingEnabled?1:0;
    frame.set([settings.membraneThickness,settings.filamentLength,settings.dropScale,settings.roughness],28);
    frame.set([settings.reflections,settings.puddleDepth,1,settings.residueLifetime],32);
    frame.set([settings.dryingDuration,settings.dryingIrregularity,settings.surfaceAbsorption,settings.dyeResidue],36);
    frame[43]=settings.residueIrregularity;frame[47]=settings.residuePersistence;

    frame.set([width, height, ppm, time], 0);
    frame.set([cx, cy, this.model.bodyRect.width, this.model.bodyRect.length], 12);
    frame[19] = state.engine.isStalled ? 1 : 0;
    frame[20] = events.length;
    frame[26] = view.x;
    frame[27] = view.y;
    frame.set([c, s, 1, settings.residueAging?1:0], 48);
    lighting(state.params,frame.subarray(56,64));
    this.device.queue.writeBuffer(this.frame, 0, frame);
    this.events = events;
    this.rebuild = [];
    this.airborne = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i],
        age = time - e.time,
        u = this.eventData.subarray(i * 64, (i + 1) * 64);
      u.fill(0);
      const speed=Math.min(120,e.speed*state.params.liquidIntensity);
      const volume=Math.min(80,e.volume*state.params.liquidVolume);
      const extent=liquidExtent(speed,volume);
      // Original lab uniform order, followed by live heading and dye absorption.
      u.set([
        width,
        height,
        ppm,
        time,
        speed,
        volume,
        settings.breakup,
        settings.concentration,
        e.x,
        e.y,
        age,
        e.seed,
        cx,
        cy,
        this.model.bodyRect.width,
        this.model.bodyRect.length,
        e.dx,
        e.dy,
        this.q.detail,
        1,
        this.q.strands / 3,
        this.q.drops,
        this.q.sheets,
        settings.dryingEnabled?1:0,
        extent,
        this.atlasSize,
        view.x,
        view.y,
        settings.membraneThickness,
        settings.filamentLength,
        settings.dropScale,
        settings.roughness,
        settings.reflections,
        settings.puddleDepth,
        6,
        settings.residueLifetime,
        settings.dryingDuration,
        settings.dryingIrregularity,
        settings.surfaceAbsorption,
        settings.dyeResidue,
        settings.bodyWetness,
        settings.bodyRunoff,
        settings.hoodDeflection,
        settings.residueIrregularity,
        settings.bodyDryingDuration,
        settings.bodyResidue,
        this.drawCar && e.bodyContact && settings.vehicleInteraction ? 1 : 0,
        settings.residuePersistence,
        c,
        s,
        1,
        settings.residueAging?1:0,
        ...dyeAbsorption(e.hue),
        1,
      ]);
      // Only deposition-shape controls invalidate the cached settled atlas.
      const shape=[u[4],u[5],u[6],u[18],u[20],u[21],u[22],u[24]].join(':');
      const key = `${generation}:${e.id}:${Math.min(3, Math.max(0, age))}:${shape}`;
      // Simulator-only metadata in the existing stride padding: dead/offscreen
      // ground layers are skipped without losing the retained replay snapshot.
      const inView=Math.abs(e.x-view.x)<extent+width/ppm*.5&&Math.abs(e.y-view.y)<extent+height/ppm*.5;
      u[19]=age>=0&&this.groundAlive(age,settings)&&inView?1:0;
      u.set(frame.subarray(56,64),56);
      if (key !== this.keys[i]) this.rebuild.push({ i, key, age });
      if (age > 0 && age < 2.8 && inView) this.airborne.push(i);
    }
    this.device.queue.writeBuffer(
      this.eventBuffer,
      0,
      this.eventData,
      0,
      events.length * 64,
    );
    const visualWheels=visualWheelPositions(state.body,this.modelId,state.wheels);
    for (let i = 0; i < 4; i++) {
      const name = NAMES[i],
        w = visualWheels[name],
        angle =
          state.body.heading + (i < 2 ? state.steering.frontWheelAngle : 0),
        t = visualTireDimensions(this.modelId,name,state.params.wheelRadius);
      this.wheelData.set([w.x, w.y, Math.cos(angle), Math.sin(angle)], i * 4);
      this.wheelData.set([t.width, t.length, 0, 0], 16 + i * 4);
    }
    this.device.queue.writeBuffer(this.wheelBuffer, 0, this.wheelData);
    this.ghostCount = 0;
    const history = state.carPoseHistory,
      effectiveBlur =
        (state.blurAccumulator || 0) *
        (state.params.motionBlurIntensity || 0.6);
    if (this.drawCar && effectiveBlur >= 0.02 && history.length >= 2) {
      const count = Math.min(16, history.length - 1);
      const add = (x, y, c, s, w, l, alpha, kind) => {
        this.ghostData.set(
          [x, y, c, s, w, l, alpha, kind],
          this.ghostCount++ * 8,
        );
      };
      for (let i = 0; i < count; i++) {
        const pose = history[i],
          alpha = ((effectiveBlur * (i + 1)) / history.length) * 0.5;
        if (alpha < 0.005) continue;
        for (let j = 0; j < 4; j++) {
          const name = NAMES[j],
            w = pose.wheels[name],
            angle = pose.heading + (j < 2 ? pose.steerAngle : 0),
            size = visualTireDimensions(this.modelId,name,state.params.wheelRadius);
          add(
            w.x,
            w.y,
            Math.cos(angle),
            Math.sin(angle),
            size.width,
            size.length,
            alpha,
            1,
          );
        }
        const c = Math.cos(pose.heading),
          s = Math.sin(pose.heading);
        add(
          pose.cx + ox * c - oy * s,
          pose.cy + ox * s + oy * c,
          c,
          s,
          this.model.bodyRect.width,
          this.model.bodyRect.length,
          alpha,
          0,
        );
      }
      if (this.ghostCount)
        this.device.queue.writeBuffer(
          this.ghostBuffer,
          0,
          this.ghostData,
          0,
          this.ghostCount * 8,
        );
    }
    Object.assign(this.stats, {
      uploadBytes: this.trails.uploadBytes + 256 + events.length * 256 + 128 + this.ghostCount * 32,
      events: events.length,
      airborne: this.airborne.length,
      ghostSprites: this.ghostCount,
      evictions,
      drawCalls: 0,
      atlasBytes: this.atlasSize ** 2 * MAX_LIQUID_EVENTS * 4,
      targetBytes: width * height * 8 + this.trails.width*this.trails.height*8,
      wetTransfers: this.trails.count,
      wetTrailBytes:this.trails.bytes,
      hasArt: this.hasArt,
      hasBMWArt: this.hasBMWArt,
      budget: { ...this.q, atlas:this.atlasSize },
      quality,
      groundLayers: events.filter((e,i)=>this.eventData[i*64+19]>.5).length,
    });
  }
  encode(encoder, output, drawUpperWorld = () => {}) {
    const mesh = (pass, pipeline, vertices, indices, count, instances) => {
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, vertices);
      pass.setIndexBuffer(indices, "uint32");
      pass.drawIndexed(count, instances);
      this.stats.drawCalls++;
    };
    this.stats.drawCalls+=this.trails.encode(encoder);
    for (const { i, key, age } of this.rebuild) {
      const p = encoder.beginRenderPass({
        label: "world-liquid-deposition",
        colorAttachments: [
          {
            view: this.layers[i],
            loadOp: "clear",
            storeOp: "store",
            clearValue: [0, 0, 0, 0],
          },
        ],
      });
      p.setBindGroup(0, this.depositGroups[i]);
      if (age > 0) {
        mesh(
          p,
          this.depositSheet,
          this.sheetVertices,
          this.sheetIndices,
          this.sheetCount,
          this.q.sheets,
        );
        p.setPipeline(this.depositDrop);
        p.draw(6, this.q.drops);
        p.setPipeline(this.depositSecondary);
        p.draw(6, this.q.drops * 2);
        this.stats.drawCalls += 2;
      }
      p.end();
      this.keys[i] = key;
      this.stats.depositionRebuilds++;
    }
    const p = encoder.beginRenderPass({
      label: "world-puddles-and-wet-vehicle",
      colorAttachments: [
        {
          view: this.airborne.length ? this.sceneView : output,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    p.setBindGroup(0, this.sceneGroup);
    p.setPipeline(this.ground);
    p.draw(3);
    this.stats.drawCalls++;
    drawUpperWorld(p);
    p.setBindGroup(0, this.sceneGroup);
    if (this.drawCar) {
      if (this.ghostCount) {
        p.setPipeline(this.ghostPipeline);
        p.draw(6, this.ghostCount);
        this.stats.drawCalls++;
      }
      p.setPipeline(this.wheel);
      p.draw(6, 4);
      p.setPipeline(this.body);
      p.draw(6);
      this.stats.drawCalls += 2;
    }
    p.end();
    if (!this.airborne.length) return;
    const air = encoder.beginRenderPass({
      label: "world-airborne-liquid",
      colorAttachments: [{ view: output, loadOp: "clear", storeOp: "store" }],
    });
    // Even an empty history has a valid group and initialized uniform slot.
    air.setBindGroup(0, this.airGroups[0]);
    air.setPipeline(this.blit);
    air.draw(3);
    this.stats.drawCalls++;
    for (const i of this.airborne) {
      air.setBindGroup(0, this.airGroups[i]);
      mesh(
        air,
        this.sheet,
        this.sheetVertices,
        this.sheetIndices,
        this.sheetCount,
        this.q.sheets,
      );
      mesh(
        air,
        this.strand,
        this.strandVertices,
        this.strandIndices,
        this.strandCount,
        this.q.strands,
      );
      air.setPipeline(this.drop);
      air.draw(6, this.q.drops);
      air.setPipeline(this.secondary);
      air.draw(6, this.q.drops * 2);
      this.stats.drawCalls += 2;
    }
    air.end();
  }
  destroy() {
    this.trails?.destroy();
    this.world?.destroy();
    this.scene?.destroy();
    for (const r of this.resources) r.destroy?.();
    this.resources.length = 0;
    this.world = null;
    this.scene = null;
    this.width = 0;
    this.height = 0;
    this.hasArt = false;
    this.hasBMWArt = false;
  }
}
