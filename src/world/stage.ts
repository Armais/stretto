import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';

/** Cámara de persecución baja, pegada al coche. Los reflejos del asfalto dependen de esto. */
export const CAM_Z = 6.4;
export const CAM_H = 2.4;

export const SKY_TOP = 0x04060b;
/** Bruma con el resplandor anaranjado de la ciudad. La niebla usa el mismo color. */
export const HAZE = 0x2a2830;

/**
 * Mapa de entorno nocturno para los reflejos de la pintura y del asfalto mojado: cielo azul
 * muy oscuro y un anillo de farolas cálidas alrededor.
 */
function nightEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0a0e17);
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb867).multiplyScalar(6), side: THREE.DoubleSide });
  const panel = new THREE.PlaneGeometry(3, 0.8);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = new THREE.Mesh(panel, lamp);
    m.position.set(Math.cos(a) * 10, 5 + (i % 2) * 2, Math.sin(a) * 10);
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: 0x1b2436, side: THREE.DoubleSide }),
  );
  sky.position.y = 14;
  sky.rotation.x = Math.PI / 2;
  env.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

/** Renderizador, cámara de persecución, luces y bloom. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private shake = 0;
  private camX = 0;
  private readonly hemi: THREE.HemisphereLight;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // En el móvil, como mucho 1,5: son un 44 % menos de píxeles que a 2, para la escena y el bloom.
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
    // Neutral conserva el color de los neones; ACES los lleva a blanco.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(SKY_TOP);
    this.scene.fog = new THREE.FogExp2(HAZE, 0.0062);
    this.scene.environment = nightEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.7;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2000);

    // Noche urbana: cielo azul oscuro arriba, rebote cálido de las farolas abajo.
    this.hemi = new THREE.HemisphereLight(0x2c3a55, 0x3a2a18, 1.1);
    const rim = new THREE.DirectionalLight(0xd6deff, 0.7);
    rim.position.set(0, 8, 10);
    this.scene.add(this.hemi, rim);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Solo florecen las luces de verdad: farolas, faros, pilotos, ventanas y líneas de cambio.
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.4, 0.82));
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms['offset'].value = 1.0;
    vignette.uniforms['darkness'].value = 1.15;
    this.composer.addPass(vignette);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Cielo, niebla y luz ambiente del escenario. */
  setLook(look: { skyTop: number; haze: number; fog: number; hemiSky: number; hemiGround: number; hemi: number; exposure: number }): void {
    (this.scene.background as THREE.Color).setHex(look.skyTop);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(look.haze);
    fog.density = look.fog;
    this.hemi.color.setHex(look.hemiSky);
    this.hemi.groundColor.setHex(look.hemiGround);
    this.hemi.intensity = look.hemi;
    this.renderer.toneMappingExposure = look.exposure;
  }

  /** Sacudida de cámara, de 0 a 1. */
  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  /** `speed01`: 0 en primera, 1 en la velocidad máxima. */
  follow(carX: number, speed01: number, dt: number): void {
    this.camX += (carX * 0.7 - this.camX) * Math.min(1, dt * 6);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake * this.shake;
    const jx = (Math.random() - 0.5) * s * 0.8;
    const jy = (Math.random() - 0.5) * s * 0.5;
    this.camera.position.set(this.camX + jx, CAM_H + jy, CAM_Z);
    this.camera.lookAt(this.camX * 0.9, 0.9, -16);
    const fov = 60 + speed01 * 14;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  render(): void {
    this.composer.render();
  }

  /**
   * Compila por detrás los shaders de lo que hay en escena. Si no, cada material nuevo se
   * compila al pintarlo por primera vez y para el hilo principal (hasta 1,3 s con el escenario).
   */
  warm(): void {
    // La escena se pinta en la textura del bloom, no en pantalla: con otro destino el shader
    // sale distinto (sin tone mapping) y habría que compilarlo otra vez al pintar.
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.composer.readBuffer);
    this.renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
    this.renderer.setRenderTarget(prev);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
