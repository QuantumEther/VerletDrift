/**
 * Unit tests for logger module
 * Tests shouldLog matrix, sampling, trace windows, and log budget
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logger, setMode, setLevel, setChannelsAllowlist, setTraceWindow, getConfig } from '../js/debug/logger.js';

describe('Logger Module', () => {
  beforeEach(() => {
    // Reset to default state
    setMode('quiet');
    setLevel('warn');
    setChannelsAllowlist(null);
  });

  describe('shouldLog matrix', () => {
    it('should allow all errors regardless of mode', () => {
      setMode('quiet');
      expect(logger.shouldLog('error', 'test')).toBe(true);
      expect(logger.shouldLog('error', 'tires')).toBe(true);
      expect(logger.shouldLog('error', 'any_channel')).toBe(true);
    });

    it('should allow all warnings regardless of mode', () => {
      setMode('quiet');
      expect(logger.shouldLog('warn', 'test')).toBe(true);
      setMode('tuning');
      expect(logger.shouldLog('warn', 'test')).toBe(true);
    });

    it('should respect level hierarchy in tuning mode', () => {
      setMode('tuning');
      expect(logger.shouldLog('error', 'test')).toBe(true);
      expect(logger.shouldLog('warn', 'test')).toBe(true);
      expect(logger.shouldLog('info', 'test')).toBe(true);
      expect(logger.shouldLog('debug', 'test')).toBe(true);
      expect(logger.shouldLog('trace', 'test')).toBe(false); // trace not in window
    });

    it('should block below-threshold levels', () => {
      setMode('quiet'); // level: warn
      expect(logger.shouldLog('info', 'test')).toBe(false);
      expect(logger.shouldLog('debug', 'test')).toBe(false);
      expect(logger.shouldLog('trace', 'test')).toBe(false);
    });

    it('should respect channel allowlist', () => {
      setMode('tuning');
      setChannelsAllowlist(['tires', 'engine']);
      expect(logger.shouldLog('debug', 'tires')).toBe(true);
      expect(logger.shouldLog('debug', 'engine')).toBe(true);
      expect(logger.shouldLog('debug', 'smoke')).toBe(false);
      expect(logger.shouldLog('debug', 'any_other')).toBe(false);
    });

    it('should allow all channels when allowlist is null', () => {
      setMode('tuning');
      setChannelsAllowlist(null);
      expect(logger.shouldLog('debug', 'tires')).toBe(true);
      expect(logger.shouldLog('debug', 'smoke')).toBe(true);
      expect(logger.shouldLog('debug', 'custom')).toBe(true);
    });
  });

  describe('Mode switching', () => {
    it('should switch between modes correctly', () => {
      const config1 = getConfig();
      expect(config1.mode).toBe('quiet');

      setMode('tuning');
      const config2 = getConfig();
      expect(config2.mode).toBe('tuning');
      expect(config2.level).toBe('debug'); // tuning preset

      setMode('trace');
      const config3 = getConfig();
      expect(config3.mode).toBe('trace');
      expect(config3.level).toBe('trace'); // trace preset
    });

    it('should allow manual level override after mode switch', () => {
      setMode('tuning');
      setLevel('info');
      const config = getConfig();
      expect(config.level).toBe('info'); // overridden
      expect(config.mode).toBe('tuning');
    });
  });

  describe('Sampling', () => {
    it('should track frame-based sampling state', () => {
      setMode('tuning');
      const messages = [];

      // Mock logger to capture calls
      const originalDebug = console.log;
      let callCount = 0;
      console.log = () => { callCount++; };

      // Sample every 5 frames
      for (let i = 0; i < 15; i++) {
        logger.sampleEvery('debug', 'test', 5, () => `frame ${i}`);
        logger.incrementFrameCount();
      }

      // Should be called at frames 0, 5, 10 = 3 times
      expect(callCount).toBe(3);

      console.log = originalDebug;
    });

    it('should not log when not in trace window', () => {
      setMode('trace');
      const originalTrace = console.log;
      let callCount = 0;
      console.log = () => { callCount++; };

      // Without trace window, trace logs should not appear
      logger.trace('test', 'this should not log');
      expect(callCount).toBe(0);

      console.log = originalTrace;
    });

    it('should log within trace window', () => {
      setMode('trace');
      const originalTrace = console.log;
      let callCount = 0;
      console.log = () => { callCount++; };

      // Set trace window
      setTraceWindow('test', 1000);
      logger.trace('test', 'this should log');
      expect(callCount).toBe(1);

      console.log = originalTrace;
    });
  });

  describe('onChange tracking', () => {
    it('should only log when value changes', () => {
      setMode('tuning');
      const originalLog = console.log;
      let callCount = 0;
      console.log = () => { callCount++; };

      // First value change
      logger.onChange('debug', 'test', 'speed', 10, () => 'speed changed');
      expect(callCount).toBe(1);

      // Same value again - should not log
      logger.onChange('debug', 'test', 'speed', 10, () => 'speed changed');
      expect(callCount).toBe(1);

      // Different value - should log
      logger.onChange('debug', 'test', 'speed', 20, () => 'speed changed');
      expect(callCount).toBe(2);

      console.log = originalLog;
    });
  });

  describe('Log budget', () => {
    it('should prevent spam with log budget', () => {
      setMode('tuning');
      const originalLog = console.log;
      let callCount = 0;
      console.log = () => { callCount++; };

      // Try to log 2000 times per second (exceeds 1000 budget)
      for (let i = 0; i < 2000; i++) {
        logger.info('test', 'spam');
      }

      // Should not exceed budget
      expect(callCount).toBeLessThanOrEqual(1000);

      console.log = originalLog;
    });
  });

  describe('Configuration persistence', () => {
    it('should maintain configuration through getConfig', () => {
      setMode('tuning');
      setLevel('info');
      setChannelsAllowlist(['tires']);

      const config = getConfig();
      expect(config.mode).toBe('tuning');
      expect(config.level).toBe('info');
      expect(config.channels).toEqual(['tires']);
    });
  });
});
