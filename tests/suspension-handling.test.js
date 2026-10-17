import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; });
import { compareRun } from '../scripts/compare-suspension.mjs';

describe('suspension coupled to planar tire/chassis physics', () => {
  it.each(['acceleration', 'braking', 'cornering', 'transition', 'drift'])('%s remains finite with positive road loads', maneuver => {
    const r = compareRun({ maneuver });
    expect(r.minLoad).toBeGreaterThanOrEqual(0);
    expect(r.finalSpeed).toBeGreaterThan(0);
    expect(r.maxRollDegrees).toBeLessThan(10);
    if (maneuver === 'braking') expect(r.finalSpeed).toBeLessThan(20);
    if (maneuver === 'acceleration') expect(r.finalSpeed).toBeGreaterThan(5);
  });

  it('front versus rear roll stiffness changes the actual turning response', () => {
    const front = compareRun({ maneuver: 'cornering', frontBar: 40000, rearBar: 0 });
    const rear = compareRun({ maneuver: 'cornering', frontBar: 0, rearBar: 40000 });
    expect(rear.finalHeading).toBeGreaterThan(front.finalHeading + 0.01);
    const lastFront = front.samples.at(-1).loads;
    const lastRear = rear.samples.at(-1).loads;
    expect(lastFront.frontLeft - lastFront.frontRight)
      .toBeGreaterThan(lastRear.frontLeft - lastRear.frontRight);
  });

  it.each([1.74, 1.76, 1.78])('keeps the coupled transition response close with a shared %s s reversal', steeringReversal => {
    // Both steering boundaries must lie on every grid; otherwise input timing
    // error is mixed into the numerical refinement measurement.
    const expectedEvents = [
      { time: 0, angle: 0 }, { time: 0.5, angle: 0.16 },
      { time: steeringReversal, angle: -0.16 },
    ];
    const checkInput = r => {
      expect(r.steeringEvents).toHaveLength(expectedEvents.length);
      r.steeringEvents.forEach((event, i) => {
        expect(event.time).toBeCloseTo(expectedEvents[i].time, 12);
        expect(event.angle).toBe(expectedEvents[i].angle);
      });
    };
    const reference = compareRun({ dt: 0.0025, steeringReversal });
    checkInput(reference);
    for (const dt of [0.02, 0.01, 0.005]) {
      const r = compareRun({ dt, steeringReversal });
      checkInput(r);
      expect(Math.abs(r.finalSpeed / reference.finalSpeed - 1)).toBeLessThan(0.01);
      expect(Math.abs(r.finalHeading - reference.finalHeading)).toBeLessThan(0.015);
      expect(Math.abs(r.maxYaw - reference.maxYaw)).toBeLessThan(0.025);
    }
  });
});
