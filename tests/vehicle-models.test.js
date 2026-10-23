import { describe, expect, it } from 'vitest';
import { VEHICLE_MODELS, visualWheelPositions } from '../js/renderer/vehicle-models.js';
import { reset, state, step } from './helpers/numerical-chassis.js';

describe('visual vehicle models', () => {
  it('defines E30 visual dimensions and wheel anchors independently of physical geometry', () => {
    const bmw = VEHICLE_MODELS['bmw-e30-m3'];
    expect(bmw.bodyLength).toBeCloseTo(4.345, 6);
    expect(bmw.bodyWidth).toBeCloseTo(1.680, 6);
    expect(bmw.wheelAnchors.frontLeft.y).toBe(-1.281);
    expect(bmw.wheelAnchors.rearLeft.y).toBe(1.281);
    expect(bmw.wheelAnchors.frontLeft.x).toBeCloseTo(-1.415 / 2, 12);
    expect(bmw.wheelAnchors.rearRight.x).toBeCloseTo(1.430 / 2, 12);
    expect(state.physicalGeometry.wheelbase).toBe(2.408);
  });

  it('maps every visual anchor through heading and COM-to-origin offset', () => {
    const pose = { centerX: 20, centerY: 30, heading: Math.PI / 2 };
    const wheels = visualWheelPositions(pose, 'bmw-e30-m3');
    expect(wheels.frontLeft.x).toBeCloseTo(21.281, 10);
    expect(wheels.frontLeft.y).toBeCloseTo(29.2925, 10);
    expect(wheels.rearRight.x).toBeCloseTo(18.719, 10);
    expect(wheels.rearRight.y).toBeCloseTo(30.715, 10);
  });

  it('leaves physical trajectories unchanged when appearance alone changes', () => {
    const run = modelId => {
      reset({ dt: .01, vx: 8, vy: -2, omega: .4 });
      state.visualVehicleModel = modelId;
      for (let i = 0; i < 20; i++) step(.01, { fx: 80, fy: 30, torque: 12 });
      const b = state.body;
      return [b.centerX,b.centerY,b.heading,b.velocityX,b.velocityY,b.angularVelocity];
    };
    expect(run('bmw-e30-m3')).toEqual(run('delorean'));
  });
});
