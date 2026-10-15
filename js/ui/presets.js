// Preset values use the same names as the physics consumers.
export const PRESETS = {
  driftCar: {
    label: '🚗 Drift Car',
    params: {
      carMassKg: 900, tireFrictionCoeff: 1.55, peakSlipAngleDeg: 8.0,
      tireRelaxationLength: 0.22, pneumaticTrail: 0.025,
      cogHeight: 0.55, finalDriveRatio: 4.2, rollingResistanceCoeff: 0.006,
      brakeForce: 8000, steeringSelfCenterRate: 3.0, steeringCoulombFriction: 0.03,
      steeringViscousDamping: 0.3, steeringColumnInertia: 0.05,
    },
    soundParams: {
      exhaustBassGain: 0.6, exhaustBassTune: 55, exhaustBassQ: 2.0,
      driftScreechGain: 0.9, mainGain: 0.35, subGain: 0.3,
    },
  },
  heavySUV: {
    label: '🚙 Heavy SUV',
    params: {
      carMassKg: 2200, tireFrictionCoeff: 1.15, peakSlipAngleDeg: 5.5,
      tireRelaxationLength: 0.45, pneumaticTrail: 0.055,
      cogHeight: 1.3, finalDriveRatio: 3.5, rollingResistanceCoeff: 0.018,
      brakeForce: 18000, steeringSelfCenterRate: 8.0, steeringCoulombFriction: 0.12,
      steeringViscousDamping: 1.2, steeringColumnInertia: 0.25,
    },
    soundParams: {
      exhaustBassGain: 1.0, exhaustBassTune: 45, exhaustBassQ: 1.5,
      driftScreechGain: 0.25, mainGain: 0.28, subGain: 0.45,
    },
  },
  goKart: {
    label: '🏎️ Go-Kart',
    params: {
      carMassKg: 165, tireFrictionCoeff: 2.1, peakSlipAngleDeg: 11.0,
      tireRelaxationLength: 0.12, pneumaticTrail: 0.010,
      cogHeight: 0.25, finalDriveRatio: 6.5, rollingResistanceCoeff: 0.003,
      brakeForce: 3500, steeringSelfCenterRate: 2.0, steeringCoulombFriction: 0.01,
      steeringViscousDamping: 0.1, steeringColumnInertia: 0.01,
      cylinderCount: 1,
    },
    soundParams: {
      exhaustBassGain: 0.1, exhaustBassTune: 120, exhaustBassQ: 0.8,
      driftScreechGain: 0.4, mainGain: 0.4, subGain: 0.1,
    },
  },
  iceSurface: {
    label: '❄️ Ice Surface',
    params: {
      carMassKg: 1200, tireFrictionCoeff: 0.28, peakSlipAngleDeg: 4.0,
      tireRelaxationLength: 0.65, pneumaticTrail: 0.015,
      cogHeight: 0.62, finalDriveRatio: 3.8, rollingResistanceCoeff: 0.001,
      brakeForce: 4500, steeringSelfCenterRate: 1.5, steeringCoulombFriction: 0.02,
      steeringViscousDamping: 0.2, steeringColumnInertia: 0.07,
    },
    soundParams: {
      exhaustBassGain: 0.3, exhaustBassTune: 65, exhaustBassQ: 1.2,
      driftScreechGain: 0.15, mainGain: 0.3, subGain: 0.25,
    },
  },
  stockCar: {
    label: '🔧 Stock Road Car',
    params: {
      carMassKg: 1350, tireFrictionCoeff: 1.35, peakSlipAngleDeg: 7.0,
      tireRelaxationLength: 0.30, pneumaticTrail: 0.038,
      cogHeight: 0.65, finalDriveRatio: 3.9, rollingResistanceCoeff: 0.010,
      brakeForce: 12000, steeringSelfCenterRate: 6.0, steeringCoulombFriction: 0.06,
      steeringViscousDamping: 0.6, steeringColumnInertia: 0.10,
    },
    soundParams: {
      exhaustBassGain: 0.35, exhaustBassTune: 65, exhaustBassQ: 1.2,
      driftScreechGain: 0.55, mainGain: 0.30, subGain: 0.25,
    },
  },
};
