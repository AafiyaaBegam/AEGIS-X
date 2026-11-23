import { useEffect, useRef } from "react";
import * as THREE from "three";

function createShieldShape(scale = 1) {
  // Broad crown, machined shoulders and a deliberate lower point give the
  // AEGIS crest a more architectural silhouette than a soft generic shield.
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.58 * scale);
  shape.lineTo(0.70 * scale, 1.43 * scale);
  shape.quadraticCurveTo(1.00 * scale, 1.37 * scale, 1.00 * scale, 1.08 * scale);
  shape.lineTo(0.90 * scale, 0.18 * scale);
  shape.quadraticCurveTo(0.82 * scale, -0.70 * scale, 0, -1.57 * scale);
  shape.quadraticCurveTo(-0.82 * scale, -0.70 * scale, -0.90 * scale, 0.18 * scale);
  shape.lineTo(-1.00 * scale, 1.08 * scale);
  shape.quadraticCurveTo(-1.00 * scale, 1.37 * scale, -0.70 * scale, 1.43 * scale);
  shape.closePath();
  return shape;
}

function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 128, 5, 128, 128, 126);
  gradient.addColorStop(0, "rgba(104,228,255,0.72)");
  gradient.addColorStop(0.28, "rgba(45,170,255,0.32)");
  gradient.addColorStop(0.62, "rgba(43,102,255,0.12)");
  gradient.addColorStop(1, "rgba(25,78,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addGlow(scene, position, size, color = 0x3cbcff, opacity = 0.78) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  sprite.position.copy(position);
  sprite.scale.set(size, size, 1);
  scene.add(sprite);
  return sprite;
}

function latLonPoint(latitude, longitude, radius) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.sin(lon),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.cos(lon)
  );
}

export default function AegisScene() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 8.65);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    host.appendChild(renderer.domElement);

    const root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.AmbientLight(0xd8f4ff, 0.52));
    scene.add(new THREE.HemisphereLight(0xd6f5ff, 0x102447, 0.58));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-4.5, 5.5, 8);
    scene.add(key);
    const cyanFill = new THREE.PointLight(0x48e7ff, 11, 13, 1.65);
    cyanFill.position.set(-2.15, 0.55, 3.0);
    scene.add(cyanFill);
    const blueFill = new THREE.PointLight(0x368eff, 9, 15, 1.75);
    blueFill.position.set(2.7, 0.75, 3.2);
    scene.add(blueFill);
    const planetKey = new THREE.DirectionalLight(0xe4fbff, 1.8);
    planetKey.position.set(4.8, 3.2, 5.5);
    scene.add(planetKey);
    const planetRim = new THREE.PointLight(0x45d8ff, 9, 9.5, 1.7);
    planetRim.position.set(3.2, -0.1, -1.2);
    scene.add(planetRim);
    const violetRim = new THREE.PointLight(0xa28aff, 3.5, 18, 2);
    violetRim.position.set(2.3, 2.1, -2.6);
    scene.add(violetRim);

    // Broad studio-style highlights make the shield read as metal rather than
    // a flat, self-lit icon. The lights are positioned in front of the object.
    const shieldStudio = new THREE.SpotLight(0xffffff, 20, 16, Math.PI / 4.5, 0.42, 1.25);
    shieldStudio.position.set(-3.6, 4.1, 5.8);
    shieldStudio.target.position.set(-1.72, 0.05, 0.45);
    scene.add(shieldStudio, shieldStudio.target);
    const shieldEdgeLight = new THREE.PointLight(0x8df4ff, 9, 8.5, 1.6);
    shieldEdgeLight.position.set(-3.1, -0.9, 2.5);
    scene.add(shieldEdgeLight);

    // ------------------------------------------------------------------
    // HOLOGRAPHIC EARTH — bright sapphire oceans, cyan land relief,
    // precise geo paths, a clean atmospheric halo and sparse orbital rings.
    // ------------------------------------------------------------------
    const earthGroup = new THREE.Group();
    earthGroup.position.set(2.00, 0.10, -0.40);
    earthGroup.scale.setScalar(1.36);
    root.add(earthGroup);

    const earthGlow = addGlow(earthGroup, new THREE.Vector3(0, 0, -1.05), 4.45, 0x159cff, 0.48);
    earthGlow.renderOrder = 0;

    // A true satellite-textured Earth. Surface routes and cloud detail rotate
    // with the planet so the globe reads as one coherent object.
    const planetSurface = new THREE.Group();
    earthGroup.add(planetSurface);

    const earthMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.09,
      clearcoat: 0.78,
      clearcoatRoughness: 0.18,
      emissive: 0x061d38,
      emissiveIntensity: 0.12,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1.2, 144, 144), earthMaterial);
    planetSurface.add(earth);

    const loader = new THREE.TextureLoader();
    loader.load(
      "/textures/earth-aegis-radiance.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        earthMaterial.map = texture;
        earthMaterial.emissiveMap = texture;
        earthMaterial.emissive.set(0x061b35);
        earthMaterial.emissiveIntensity = 0.08;
        earthMaterial.needsUpdate = true;
      },
      undefined,
      () => { /* Keep the sapphire fallback material if the map is unavailable. */ }
    );

    // A very restrained, slowly drifting cloud shell adds planetary depth
    // without obscuring the land or turning the globe into a wireframe.
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xa9f0ff,
      transparent: true,
      opacity: 0.22,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    const cloudShell = new THREE.Mesh(new THREE.SphereGeometry(1.213, 112, 112), cloudMaterial);
    planetSurface.add(cloudShell);
    loader.load(
      "/textures/earth-clouds.png",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        cloudMaterial.map = texture;
        cloudMaterial.needsUpdate = true;
      },
      undefined,
      () => { cloudShell.visible = false; }
    );

    // A view-dependent atmosphere: bright at the limb, clear across the map.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.285, 128, 128),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            float facing = max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0);
            float rim = pow(1.0 - facing, 2.35);
            vec3 deepBlue = vec3(0.06, 0.32, 0.96);
            vec3 iceCyan = vec3(0.42, 0.94, 1.0);
            vec3 atmosphereColor = mix(deepBlue, iceCyan, clamp(rim * 1.4, 0.0, 1.0));
            gl_FragColor = vec4(atmosphereColor, rim * 0.88);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        depthWrite: false,
        toneMapped: false,
      })
    );
    earthGroup.add(atmosphere);
    const outerAtmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.355, 96, 96),
      new THREE.MeshBasicMaterial({
        color: 0x368eff,
        transparent: true,
        opacity: 0.065,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    earthGroup.add(outerAtmosphere);

    // A small number of precise intercontinental routes and live nodes.
    const routeMaterial = new THREE.MeshBasicMaterial({
      color: 0x9df1ff,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const routes = [
      [[38, -96], [19, 74]],
      [[19, 74], [-24, 134]],
      [[38, -96], [51, 10]],
      [[-24, 134], [37, 127]],
    ];
    routes.forEach(([from, to]) => {
      const a = latLonPoint(from[0], from[1], 1.207);
      const b = latLonPoint(to[0], to[1], 1.207);
      const middle = a.clone().add(b).normalize().multiplyScalar(1.39);
      const curve = new THREE.QuadraticBezierCurve3(a, middle, b);
      planetSurface.add(new THREE.Mesh(
        new THREE.TubeGeometry(curve, 56, 0.0035, 6, false),
        routeMaterial
      ));
    });

    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xe2fbff, toneMapped: false });
    [[38, -96], [19, 74], [-24, 134], [51, 10], [37, 127]].forEach(([lat, lon]) => {
      const position = latLonPoint(lat, lon, 1.218);
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 16), nodeMaterial);
      node.position.copy(position);
      planetSurface.add(node);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.043, 16, 16),
        new THREE.MeshBasicMaterial({
          color: 0x55ddff,
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      halo.position.copy(position);
      planetSurface.add(halo);
    });

    // Three fine geographic references give the planet a designed, scientific
    // look without covering its continents in a full wireframe.
    const globeGridMaterial = new THREE.MeshBasicMaterial({
      color: 0x9cf5ff,
      transparent: true,
      opacity: 0.19,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const globeEquator = new THREE.Mesh(
      new THREE.TorusGeometry(1.207, 0.0032, 6, 180),
      globeGridMaterial
    );
    globeEquator.rotation.x = Math.PI / 2;
    planetSurface.add(globeEquator);
    const globeMeridian = new THREE.Mesh(
      new THREE.TorusGeometry(1.207, 0.0026, 6, 180),
      globeGridMaterial
    );
    globeMeridian.rotation.y = Math.PI / 2;
    globeMeridian.rotation.z = 0.34;
    planetSurface.add(globeMeridian);

    const orbitA = new THREE.Mesh(
      new THREE.TorusGeometry(1.58, 0.006, 8, 220),
      new THREE.MeshBasicMaterial({ color: 0x8af5ff, transparent: true, opacity: 0.34 })
    );
    orbitA.rotation.set(1.08, 0.18, 0.24);
    earthGroup.add(orbitA);
    const orbitB = new THREE.Mesh(
      new THREE.TorusGeometry(1.72, 0.004, 8, 220),
      new THREE.MeshBasicMaterial({ color: 0xb2a0ff, transparent: true, opacity: 0.22 })
    );
    orbitB.rotation.set(0.62, -0.48, -0.34);
    earthGroup.add(orbitB);

    const earthDock = new THREE.Group();
    earthDock.position.set(2.02, -1.47, 0.22);
    root.add(earthDock);
    const earthDockRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.88, 0.014, 10, 160),
      new THREE.MeshBasicMaterial({ color: 0x79efff, transparent: true, opacity: 0.76, toneMapped: false })
    );
    earthDockRing.rotation.x = Math.PI / 2;
    earthDockRing.scale.set(1.2, 0.72, 1);
    earthDock.add(earthDockRing);
    const earthDockInner = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.006, 8, 140),
      new THREE.MeshBasicMaterial({ color: 0x9b8cff, transparent: true, opacity: 0.56, toneMapped: false })
    );
    earthDockInner.rotation.x = Math.PI / 2;
    earthDockInner.scale.set(1.2, 0.72, 1);
    earthDockInner.position.y = 0.018;
    earthDock.add(earthDockInner);

    // ------------------------------------------------------------------
    // AEGIS SHIELD — sculpted titanium housing, inset sapphire enamel,
    // bright machined rim, circuit traces and a precision crystal core.
    // ------------------------------------------------------------------
    const shieldGroup = new THREE.Group();
    shieldGroup.position.set(-1.78, 0.08, 0.62);
    shieldGroup.scale.setScalar(1.29);
    shieldGroup.rotation.y = -0.11;
    shieldGroup.rotation.x = 0.025;
    root.add(shieldGroup);
    addGlow(shieldGroup, new THREE.Vector3(0, 0.06, -0.52), 4.05, 0x168eff, 0.50);

    const backingGeometry = new THREE.ExtrudeGeometry(createShieldShape(1.045), {
      depth: 0.34,
      bevelEnabled: true,
      bevelSegments: 10,
      steps: 1,
      bevelSize: 0.095,
      bevelThickness: 0.09,
      curveSegments: 40,
    });
    backingGeometry.translate(0, 0, -0.205);
    shieldGroup.add(new THREE.Mesh(
      backingGeometry,
      new THREE.MeshPhysicalMaterial({
        color: 0x142c45,
        metalness: 0.78,
        roughness: 0.22,
        clearcoat: 0.92,
        clearcoatRoughness: 0.20,
      })
    ));

    const outerShape = createShieldShape(1);
    const outerGeometry = new THREE.ExtrudeGeometry(outerShape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelSegments: 10,
      steps: 1,
      bevelSize: 0.085,
      bevelThickness: 0.085,
      curveSegments: 36,
    });
    outerGeometry.translate(0, 0, -0.12);
    const outerShield = new THREE.Mesh(
      outerGeometry,
      new THREE.MeshPhysicalMaterial({
        color: 0x213c58,
        metalness: 0.82,
        roughness: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.09,
        emissive: 0x062e52,
        emissiveIntensity: 0.16,
      })
    );
    shieldGroup.add(outerShield);

    const innerShape = createShieldShape(0.885);
    const innerGeometry = new THREE.ExtrudeGeometry(innerShape, {
      depth: 0.045,
      bevelEnabled: true,
      bevelSegments: 6,
      bevelSize: 0.035,
      bevelThickness: 0.028,
      curveSegments: 36,
    });
    innerGeometry.translate(0, 0, 0.112);
    const innerPlate = new THREE.Mesh(
      innerGeometry,
      new THREE.MeshPhysicalMaterial({
        color: 0x0750a0,
        metalness: 0.46,
        roughness: 0.23,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        emissive: 0x063e80,
        emissiveIntensity: 0.32,
      })
    );
    shieldGroup.add(innerPlate);

    const plateFace = new THREE.Mesh(
      new THREE.ShapeGeometry(createShieldShape(0.82), 36),
      new THREE.MeshBasicMaterial({
        color: 0x2b8bff,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      })
    );
    plateFace.position.z = 0.161;
    shieldGroup.add(plateFace);

    // Two precise perimeter traces create a designed, machined shield edge.
    const perimeterPoints = createShieldShape(0.925).getPoints(120).map((point) =>
      new THREE.Vector3(point.x, point.y, 0.164)
    );
    const perimeter = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(perimeterPoints),
      new THREE.LineBasicMaterial({ color: 0xc5f8ff, transparent: true, opacity: 0.98, toneMapped: false })
    );
    shieldGroup.add(perimeter);

    const innerTracePoints = createShieldShape(0.77).getPoints(120).map((point) =>
      new THREE.Vector3(point.x, point.y, 0.168)
    );
    shieldGroup.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(innerTracePoints),
      new THREE.LineBasicMaterial({ color: 0x4ddfff, transparent: true, opacity: 0.60, toneMapped: false })
    ));

    const centerSpine = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 1.52, 0.012),
      new THREE.MeshBasicMaterial({ color: 0x72dfff, transparent: true, opacity: 0.18, toneMapped: false })
    );
    centerSpine.position.set(0, 0.03, 0.174);
    shieldGroup.add(centerSpine);

    // Fine circuit branches on either side of the core.
    const traceMaterial = new THREE.MeshBasicMaterial({
      color: 0x6ceaff,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const addCircuit = (points) => {
      const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0.185)));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.0045, 6, false), traceMaterial);
      shieldGroup.add(tube);
    };
    addCircuit([[-0.77, 0.50], [-0.59, 0.50], [-0.49, 0.37], [-0.40, 0.37]]);
    addCircuit([[0.77, 0.50], [0.59, 0.50], [0.49, 0.37], [0.40, 0.37]]);
    addCircuit([[-0.69, -0.43], [-0.54, -0.43], [-0.44, -0.30], [-0.40, -0.30]]);
    addCircuit([[0.69, -0.43], [0.54, -0.43], [0.44, -0.30], [0.40, -0.30]]);

    const rivetMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe1f6ff,
      metalness: 0.94,
      roughness: 0.16,
      clearcoat: 1,
      emissive: 0x135d87,
      emissiveIntensity: 0.36,
    });
    [[-0.72, 0.91], [0.72, 0.91], [-0.69, -0.48], [0.69, -0.48]].forEach(([x, y]) => {
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.035, 18, 18), rivetMaterial);
      rivet.position.set(x, y, 0.20);
      shieldGroup.add(rivet);
    });

    // AEGIS insignia: a precision-machined octagonal medallion with a raised
    // titanium A mark. The smaller reactor remains visible through its centre.
    const crestBacking = new THREE.Mesh(
      new THREE.CylinderGeometry(0.43, 0.43, 0.105, 8, 1, false),
      new THREE.MeshPhysicalMaterial({
        color: 0xd8f2ff,
        metalness: 0.98,
        roughness: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        emissive: 0x1769a9,
        emissiveIntensity: 0.46,
      })
    );
    crestBacking.rotation.x = Math.PI / 2;
    crestBacking.position.set(0, 0.04, 0.255);
    shieldGroup.add(crestBacking);

    const crestInset = new THREE.Mesh(
      new THREE.CircleGeometry(0.385, 96),
      new THREE.MeshPhysicalMaterial({
        color: 0x062b66,
        metalness: 0.82,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        emissive: 0x0874c5,
        emissiveIntensity: 0.84,
        side: THREE.DoubleSide,
      })
    );
    crestInset.position.set(0, 0.04, 0.322);
    shieldGroup.add(crestInset);

    const crestSilverRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.405, 0.022, 14, 160),
      new THREE.MeshPhysicalMaterial({
        color: 0xf4fdff,
        metalness: 0.98,
        roughness: 0.14,
        clearcoat: 1,
        emissive: 0x174a75,
        emissiveIntensity: 0.22,
      })
    );
    crestSilverRing.position.set(0, 0.04, 0.355);
    shieldGroup.add(crestSilverRing);
    const crestCyanRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.355, 0.0065, 8, 160),
      new THREE.MeshBasicMaterial({ color: 0x9cf6ff, transparent: true, opacity: 1.0, toneMapped: false })
    );
    crestCyanRing.position.set(0, 0.04, 0.37);
    shieldGroup.add(crestCyanRing);

    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 0.04, 0.40);
    shieldGroup.add(coreGroup);

    // Recessed sapphire reactor behind the A insignia.
    const coreGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.205, 40, 40),
      new THREE.MeshBasicMaterial({
        color: 0x1dc9ff,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    coreGlow.position.set(0, 0.14, -0.015);
    coreGroup.add(coreGlow);

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.125, 1),
      new THREE.MeshPhysicalMaterial({
        color: 0xf1ffff,
        metalness: 0.50,
        roughness: 0.075,
        clearcoat: 1,
        clearcoatRoughness: 0.025,
        emissive: 0x20d8ff,
        emissiveIntensity: 1.15,
      })
    );
    crystal.position.set(0, 0.14, 0.005);
    crystal.scale.set(0.82, 1.12, 0.64);
    coreGroup.add(crystal);

    const crystalEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.132, 1)),
      new THREE.LineBasicMaterial({ color: 0xf0ffff, transparent: true, opacity: 0.78, toneMapped: false })
    );
    crystalEdges.position.copy(crystal.position);
    crystalEdges.scale.copy(crystal.scale);
    coreGroup.add(crystalEdges);

    // Raised A-shaped metal emblem. This makes the shield a recognisable
    // AEGIS crest rather than a generic shield carrying a floating orb.
    const aShape = new THREE.Shape();
    aShape.moveTo(-0.34, -0.29);
    aShape.lineTo(-0.065, 0.43);
    aShape.quadraticCurveTo(0, 0.54, 0.065, 0.43);
    aShape.lineTo(0.34, -0.29);
    aShape.lineTo(0.205, -0.29);
    aShape.lineTo(0.125, -0.075);
    aShape.lineTo(-0.125, -0.075);
    aShape.lineTo(-0.205, -0.29);
    aShape.closePath();
    const aGeometry = new THREE.ExtrudeGeometry(aShape, {
      depth: 0.055,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      curveSegments: 18,
    });
    aGeometry.translate(0, 0, 0.035);
    const aEmblem = new THREE.Mesh(
      aGeometry,
      new THREE.MeshPhysicalMaterial({
        color: 0xf6ffff,
        metalness: 0.97,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.07,
        emissive: 0x1597c9,
        emissiveIntensity: 0.32,
      })
    );
    coreGroup.add(aEmblem);

    const emblemEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(aGeometry, 18),
      new THREE.LineBasicMaterial({ color: 0xf1ffff, transparent: true, opacity: 0.58, toneMapped: false })
    );
    coreGroup.add(emblemEdge);

    const coreOrbitA = new THREE.Mesh(
      new THREE.TorusGeometry(0.455, 0.0045, 8, 144),
      new THREE.MeshBasicMaterial({ color: 0x9df8ff, transparent: true, opacity: 0.82, toneMapped: false })
    );
    coreOrbitA.position.z = -0.025;
    coreOrbitA.rotation.set(0.58, 0.25, 0.12);
    coreGroup.add(coreOrbitA);
    const coreOrbitB = new THREE.Mesh(
      new THREE.TorusGeometry(0.475, 0.0035, 8, 144),
      new THREE.MeshBasicMaterial({ color: 0xb9acff, transparent: true, opacity: 0.50, toneMapped: false })
    );
    coreOrbitB.position.z = -0.035;
    coreOrbitB.rotation.set(-0.52, 0.42, 0.68);
    coreGroup.add(coreOrbitB);

    // Machined cyan edge rails reinforce the shield silhouette and catch light
    // as it gently turns. They sit on the front plate, not outside the object.
    const railMaterial = new THREE.MeshBasicMaterial({
      color: 0x8df6ff,
      transparent: true,
      opacity: 0.76,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const addShieldRail = (points) => {
      const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0.176)));
      shieldGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 0.008, 8, false), railMaterial));
    };
    addShieldRail([[-0.83, 1.00], [-0.79, 0.43], [-0.68, -0.35], [-0.39, -0.93]]);
    addShieldRail([[0.83, 1.00], [0.79, 0.43], [0.68, -0.35], [0.39, -0.93]]);

    const crownBars = new THREE.Group();
    crownBars.position.set(0, 1.12, 0.19);
    shieldGroup.add(crownBars);
    for (let i = 0; i < 5; i += 1) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.20, 0.018, 0.012),
        new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffffff : 0x6eeaff, transparent: true, opacity: i === 2 ? 0.95 : 0.58, toneMapped: false })
      );
      bar.position.x = (i - 2) * 0.24;
      crownBars.add(bar);
    }

    const platform = new THREE.Group();
    platform.position.set(-1.72, -1.56, 0.34);
    root.add(platform);
    const platformBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.02, 1.16, 0.12, 80, 1, false),
      new THREE.MeshPhysicalMaterial({
        color: 0x245987,
        metalness: 0.94,
        roughness: 0.24,
        emissive: 0x0a6eb6,
        emissiveIntensity: 0.82,
      })
    );
    platformBase.scale.set(1.10, 1, 0.70);
    platform.add(platformBase);
    const platformRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.018, 10, 160),
      new THREE.MeshBasicMaterial({ color: 0xa2fbff, transparent: true, opacity: 1.0, toneMapped: false })
    );
    platformRing.rotation.x = Math.PI / 2;
    platformRing.position.y = 0.07;
    platformRing.scale.set(1.10, 0.70, 1);
    platform.add(platformRing);
    const platformRingB = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.009, 8, 140),
      new THREE.MeshBasicMaterial({ color: 0xb8a9ff, transparent: true, opacity: 0.84, toneMapped: false })
    );
    platformRingB.rotation.x = Math.PI / 2;
    platformRingB.position.y = 0.085;
    platformRingB.scale.set(1.10, 0.70, 1);
    platform.add(platformRingB);

    // Distant data points, scanning beam and one rear orbital guide.
    const particleCount = 720;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const aqua = new THREE.Color(0x7dffe2);
    const blue = new THREE.Color(0x78d5ff);
    const violet = new THREE.Color(0xb9a6ff);
    for (let i = 0; i < particleCount; i += 1) {
      const k = i * 3;
      positions[k] = (Math.random() - 0.5) * 12.5;
      positions[k + 1] = (Math.random() - 0.5) * 6.5;
      positions[k + 2] = (Math.random() - 0.5) * 4.6 - 1.5;
      const color = Math.random() > 0.84 ? violet : (Math.random() > 0.5 ? aqua : blue);
      colors[k] = color.r; colors[k + 1] = color.g; colors[k + 2] = color.b;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ size: 0.017, vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false })
    );
    root.add(particles);

    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(8.8, 0.012),
      new THREE.MeshBasicMaterial({ color: 0x8cfff0, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    scan.position.set(0, -1.9, 1.35);
    root.add(scan);

    const rearOrbit = new THREE.Mesh(
      new THREE.TorusGeometry(4.25, 0.003, 6, 220),
      new THREE.MeshBasicMaterial({ color: 0x7c9fff, transparent: true, opacity: 0.18 })
    );
    rearOrbit.position.set(0, 0, -2.8);
    rearOrbit.rotation.set(0.12, 0.22, 0.1);
    root.add(rearOrbit);

    let frame = 0;
    let disposed = false;
    const clock = new THREE.Clock();
    const resize = () => {
      if (disposed) return;
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.position.z = width < 620 ? 10.8 : 7.4;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const animate = () => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      planetSurface.rotation.y = elapsed * 0.072;
      cloudShell.rotation.y = -elapsed * 0.009;
      earthGroup.rotation.y = Math.sin(elapsed * 0.12) * 0.018;
      orbitA.rotation.z = elapsed * 0.065;
      orbitB.rotation.z = -elapsed * 0.045;
      earthDock.rotation.y = elapsed * 0.08;
      earthDockInner.rotation.z = -elapsed * 0.12;
      shieldGroup.rotation.y = Math.sin(elapsed * 0.44) * 0.045;
      shieldGroup.position.y = 0.08 + Math.sin(elapsed * 0.78) * 0.025;
      crystal.rotation.x = elapsed * 0.16;
      crystal.rotation.y = elapsed * 0.22;
      crystalEdges.rotation.copy(crystal.rotation);
      coreOrbitA.rotation.z = elapsed * 0.18;
      coreOrbitB.rotation.z = -elapsed * 0.13;
      crestCyanRing.rotation.z = elapsed * 0.035;
      platformRing.rotation.z = elapsed * 0.16;
      platformRingB.rotation.z = -elapsed * 0.12;
      particles.rotation.y = elapsed * 0.01;
      scan.position.y = -1.9 + ((elapsed * 0.42) % 3.8);
      scan.material.opacity = 0.18 + (Math.sin(elapsed * 2.0) + 1) * 0.105;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if (material.map) material.map.dispose();
            if (material.emissiveMap && material.emissiveMap !== material.map) material.emissiveMap.dispose();
            material.dispose();
          });
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="ax-aegis-scene"
      aria-label="AEGIS-X sculpted shield and holographic Earth visualization"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}
    />
  );
}
