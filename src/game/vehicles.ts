// P4: los cuatro vehículos. Las palabras de DISENO.md (ventana ancha, carril lento, motor
// frágil...) se traducen aquí a números PROVISIONALES que se ajustan al probar.

export type VehicleId = 'compact' | 'muscle' | 'bike' | 'wedge';

export interface Vehicle {
  id: VehicleId;
  gears: 4 | 5 | 6;
  /** Multiplica la ventana de cambio. */
  windowScale: number;
  /** Segundos de un cambio de carril. */
  laneTime: number;
  /** Multiplica lo que baja la barra de motor. */
  damageScale: number;
  /** Nivel que hay que pasar para tenerlo (0 = desde el principio). */
  unlockAfter: number;
  /** Modelo en public/models/<model>.glb. */
  model: string;
  /** Medio largo y medio ancho, para choques y para saber dónde está el morro. */
  halfLength: number;
  halfWidth: number;
  /** Posición X de los pilotos traseros (para sus reflejos en el asfalto). */
  tails: number[];
  /** Cuánto se inclina al cambiar de carril. */
  lean: number;
  /** Para la ficha del menú. */
  traits: { window: 'wide' | 'medium' | 'narrow'; lane: 'slow' | 'normal' | 'fast' | 'veryFast'; engine: 'tough' | 'normal' | 'fragile' };
}

export const VEHICLES: Vehicle[] = [
  {
    id: 'compact',
    gears: 5,
    windowScale: 1,
    laneTime: 0.14,
    damageScale: 1,
    unlockAfter: 0,
    model: 'compacto',
    halfLength: 2.05,
    halfWidth: 0.94,
    tails: [-0.7, 0.7],
    lean: 1,
    traits: { window: 'medium', lane: 'normal', engine: 'normal' },
  },
  {
    id: 'muscle',
    gears: 4,
    windowScale: 1.25,
    laneTime: 0.2,
    damageScale: 0.75,
    unlockAfter: 1,
    model: 'muscle',
    halfLength: 2.43,
    halfWidth: 1.0,
    tails: [-0.55, 0.55],
    lean: 0.8,
    traits: { window: 'wide', lane: 'slow', engine: 'tough' },
  },
  {
    id: 'bike',
    gears: 5,
    windowScale: 1,
    laneTime: 0.09,
    damageScale: 1.35,
    unlockAfter: 2,
    model: 'moto',
    halfLength: 1.0,
    halfWidth: 0.33,
    tails: [0],
    lean: 6,
    traits: { window: 'medium', lane: 'veryFast', engine: 'fragile' },
  },
  {
    id: 'wedge',
    gears: 6,
    windowScale: 0.85,
    laneTime: 0.11,
    damageScale: 1,
    unlockAfter: 4,
    model: 'cuna',
    halfLength: 2.25,
    halfWidth: 1.02,
    tails: [-0.8, 0.8],
    lean: 0.8,
    traits: { window: 'narrow', lane: 'fast', engine: 'normal' },
  },
];

export function vehicleById(id: string): Vehicle {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
}
