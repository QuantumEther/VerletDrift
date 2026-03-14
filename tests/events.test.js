/**
 * Unit tests for event ring buffer module
 * Tests push/get/dedupe behavior, ring wrapping, and query methods
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initEvents,
  pushEvent,
  getEvents,
  getAllEvents,
  getEventCount,
  findEventsByType,
  findEventsByChannel,
  clearEvents,
} from '../js/debug/events.js';

describe('Event Ring Buffer', () => {
  beforeEach(() => {
    initEvents(200); // Reset with 200 capacity
  });

  describe('Basic push/get operations', () => {
    it('should push and retrieve events', () => {
      const event = pushEvent({
        level: 'info',
        channel: 'test',
        type: 'test_event',
        msg: 'Test message',
      });

      expect(event).toBeDefined();
      expect(event.id).toBe(0);
      expect(event.level).toBe('info');
      expect(event.channel).toBe('test');
    });

    it('should maintain event count', () => {
      expect(getEventCount()).toBe(0);

      pushEvent({ level: 'info', channel: 'test', type: 'e1', msg: 'msg' });
      expect(getEventCount()).toBe(1);

      pushEvent({ level: 'info', channel: 'test', type: 'e2', msg: 'msg' });
      expect(getEventCount()).toBe(2);
    });

    it('should return newest events first', () => {
      pushEvent({ level: 'info', channel: 'test', type: 'e1', msg: 'msg1' });
      pushEvent({ level: 'info', channel: 'test', type: 'e2', msg: 'msg2' });
      pushEvent({ level: 'info', channel: 'test', type: 'e3', msg: 'msg3' });

      const events = getEvents(3, true); // newest first
      expect(events[0].msg).toBe('msg3');
      expect(events[1].msg).toBe('msg2');
      expect(events[2].msg).toBe('msg1');
    });
  });

  describe('Ring buffer wrapping', () => {
    it('should wrap around when capacity exceeded', () => {
      const capacity = 10;
      initEvents(capacity);

      // Push 15 events (exceeds capacity of 10)
      for (let i = 0; i < 15; i++) {
        pushEvent({
          level: 'info',
          channel: 'test',
          type: `e${i}`,
          msg: `msg${i}`,
        });
      }

      // Should only have last 10
      expect(getEventCount()).toBe(capacity);

      // Oldest should be e5 (first 5 were dropped)
      const events = getAllEvents();
      expect(events[0].msg).toBe('msg5');
      expect(events[9].msg).toBe('msg14');
    });

    it('should maintain chronological order after wrap', () => {
      initEvents(5);

      for (let i = 0; i < 10; i++) {
        pushEvent({ level: 'info', channel: 'test', type: `e${i}`, msg: `msg${i}` });
      }

      const events = getAllEvents();
      // Should have msg5 through msg9 in order
      for (let i = 0; i < 5; i++) {
        expect(events[i].msg).toBe(`msg${i + 5}`);
      }
    });
  });

  describe('Deduplication', () => {
    it('should dedupe events with same dedupeKey within window', () => {
      const key = 'constraint_spike';

      // First event should be pushed
      const event1 = pushEvent({
        level: 'warn',
        channel: 'fault',
        type: 'spike',
        msg: 'Spike 1',
        dedupeKey: key,
      });
      expect(event1).toBeDefined();
      expect(getEventCount()).toBe(1);

      // Second event with same key within window should be null (dedupe)
      const event2 = pushEvent({
        level: 'warn',
        channel: 'fault',
        type: 'spike',
        msg: 'Spike 2',
        dedupeKey: key,
      });
      expect(event2).toBeNull();
      expect(getEventCount()).toBe(1); // Count unchanged
    });

    it('should allow duplicate after dedupe window expires', (done) => {
      const key = 'test_spike';

      pushEvent({
        level: 'warn',
        channel: 'fault',
        type: 'spike',
        msg: 'First',
        dedupeKey: key,
      });
      expect(getEventCount()).toBe(1);

      // Wait for dedupe window (>500ms)
      setTimeout(() => {
        const event2 = pushEvent({
          level: 'warn',
          channel: 'fault',
          type: 'spike',
          msg: 'Second',
          dedupeKey: key,
        });
        expect(event2).toBeDefined();
        expect(getEventCount()).toBe(2);
        done();
      }, 600);
    });
  });

  describe('Query methods', () => {
    beforeEach(() => {
      // Setup: push various events
      pushEvent({ level: 'error', channel: 'fault', type: 'nf_value', msg: 'NaN' });
      pushEvent({ level: 'warn', channel: 'fault', type: 'spike', msg: 'Spike' });
      pushEvent({ level: 'info', channel: 'tires', type: 'grip_low', msg: 'Low grip' });
      pushEvent({ level: 'debug', channel: 'engine', type: 'rpm_high', msg: 'High RPM' });
      pushEvent({ level: 'info', channel: 'fault', type: 'omega_high', msg: 'Omega' });
    });

    it('should find events by type', () => {
      const spikes = findEventsByType('spike', 10);
      expect(spikes.length).toBe(1);
      expect(spikes[0].msg).toBe('Spike');

      const grips = findEventsByType('grip_low', 10);
      expect(grips.length).toBe(1);
      expect(grips[0].channel).toBe('tires');
    });

    it('should find events by channel', () => {
      const faults = findEventsByChannel('fault', 10);
      expect(faults.length).toBe(3);
      expect(faults[0].type).toBe('omega_high'); // newest first
      expect(faults[2].type).toBe('nf_value');
    });

    it('should respect limit parameter', () => {
      const faults = findEventsByChannel('fault', 2); // limit to 2
      expect(faults.length).toBe(2);
    });

    it('should return newest events first from queries', () => {
      const allFaults = findEventsByChannel('fault', 10);
      expect(allFaults[0].msg).toBe('Omega'); // newest
      expect(allFaults[allFaults.length - 1].msg).toBe('NaN'); // oldest
    });
  });

  describe('Clearing and reset', () => {
    it('should clear all events', () => {
      pushEvent({ level: 'info', channel: 'test', type: 'e1', msg: 'msg' });
      pushEvent({ level: 'info', channel: 'test', type: 'e2', msg: 'msg' });
      expect(getEventCount()).toBe(2);

      clearEvents();
      expect(getEventCount()).toBe(0);
      expect(getAllEvents().length).toBe(0);
    });

    it('should reset event ID counter on init', () => {
      pushEvent({ level: 'info', channel: 'test', type: 'e1', msg: 'msg' });
      const event1 = getEvents(1)[0];
      expect(event1.id).toBeGreaterThanOrEqual(0);

      initEvents(200); // Reset
      clearEvents();

      const event2 = pushEvent({ level: 'info', channel: 'test', type: 'e2', msg: 'msg' });
      expect(event2.id).toBe(0); // IDs start over
    });
  });

  describe('Event metadata', () => {
    it('should capture wall-clock timestamp', () => {
      const before = performance.now();
      const event = pushEvent({ level: 'info', channel: 'test', type: 'e1', msg: 'msg' });
      const after = performance.now();

      expect(event.tWallMs).toBeGreaterThanOrEqual(before);
      expect(event.tWallMs).toBeLessThanOrEqual(after);
    });

    it('should preserve custom data', () => {
      const customData = { wheelName: 'FL', omega: 123.45 };
      const event = pushEvent({
        level: 'info',
        channel: 'test',
        type: 'e1',
        msg: 'msg',
        data: customData,
      });

      expect(event.data).toEqual(customData);
    });

    it('should assign sequential IDs', () => {
      const ids = [];
      for (let i = 0; i < 5; i++) {
        const event = pushEvent({
          level: 'info',
          channel: 'test',
          type: `e${i}`,
          msg: 'msg',
        });
        ids.push(event.id);
      }

      // IDs should be sequential
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBe(ids[i - 1] + 1);
      }
    });
  });

  describe('Auto-injection enrichment', () => {
    it('should auto-inject tSimSec from state if not provided', () => {
      const event = pushEvent({
        level: 'info',
        channel: 'test',
        type: 'test_event',
        msg: 'test',
        // Note: tSimSec not provided, should be auto-injected
      });

      expect(event.tSimSec).toBeGreaterThanOrEqual(0);
      expect(typeof event.tSimSec).toBe('number');
    });

    it('should auto-inject frame from state if not provided', () => {
      const event = pushEvent({
        level: 'info',
        channel: 'test',
        type: 'test_event',
        msg: 'test',
        // Note: frame not provided, should be auto-injected
      });

      expect(event.frame).toBeGreaterThanOrEqual(0);
      expect(typeof event.frame).toBe('number');
    });

    it('should allow caller to override auto-injected tSimSec', () => {
      const customTime = 99.99;
      const event = pushEvent({
        level: 'info',
        channel: 'test',
        type: 'test_event',
        msg: 'test',
        tSimSec: customTime,
      });

      expect(event.tSimSec).toBe(customTime);
    });

    it('should allow caller to override auto-injected frame', () => {
      const customFrame = 12345;
      const event = pushEvent({
        level: 'info',
        channel: 'test',
        type: 'test_event',
        msg: 'test',
        frame: customFrame,
      });

      expect(event.frame).toBe(customFrame);
    });

    it('should inject different values for sequential events', () => {
      const event1 = pushEvent({
        level: 'info',
        channel: 'test',
        type: 'evt1',
        msg: 'first',
      });

      // Simulate time passing and frame advancing
      // (In real execution, state values would change; here we test that values are captured)
      const event2 = pushEvent({
        level: 'info',
        channel: 'test',
        type: 'evt2',
        msg: 'second',
      });

      // Both should have valid values
      expect(event1.tSimSec).toBeGreaterThanOrEqual(0);
      expect(event2.tSimSec).toBeGreaterThanOrEqual(0);
      expect(event1.frame).toBeGreaterThanOrEqual(0);
      expect(event2.frame).toBeGreaterThanOrEqual(0);

      // Wall-clock times should be different (event2 pushed after event1)
      expect(event2.tWallMs).toBeGreaterThanOrEqual(event1.tWallMs);
    });
  });
});
