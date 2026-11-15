// Réglages des commandes du mode astronaute (sauvegardés localement).

export interface ControlSettings {
  /** Sensibilité de la caméra à la souris (0.3 .. 2.5). */
  lookSensitivity: number;
  /** Sensibilité du joystick droit (0.3 .. 2.5). */
  joystickSensitivity: number;
  invertY: boolean;
  /** Diamètre des joysticks en pixels. */
  joystickSize: number;
  /** Opacité des joysticks (0.2 .. 1). */
  joystickOpacity: number;
}

export const DEFAULT_CONTROLS: ControlSettings = {
  lookSensitivity: 1,
  joystickSensitivity: 1,
  invertY: false,
  joystickSize: 124,
  joystickOpacity: 0.85,
};

const KEY = 'infectium.controls.v1';

export function loadControls(): ControlSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CONTROLS };
    return { ...DEFAULT_CONTROLS, ...(JSON.parse(raw) as Partial<ControlSettings>) };
  } catch {
    return { ...DEFAULT_CONTROLS };
  }
}

export function saveControls(settings: ControlSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* stockage indisponible */
  }
}
