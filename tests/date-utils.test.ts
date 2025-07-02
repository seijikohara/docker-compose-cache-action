import { formatTimeBetween } from '../src/date-utils';

describe('date-utils', () => {
  describe('formatTimeBetween', () => {
    it('should calculate the difference between timestamps correctly', () => {
      // Value representing 1 hour 2 minutes 3 seconds
      const startTime = 1000;
      const endTime = 1000 + 3600000 + 120000 + 3000; // start + 1h + 2m + 3s

      const result = formatTimeBetween(startTime, endTime);

      // Check the actual output - depends on date-fns implementation
      // Output format should be like "1 hour 2 minutes 3 seconds",
      // but the exact format may vary depending on date-fns version
      expect(result).toContain('hour');
      expect(result).toContain('minute');
      expect(result).toContain('second');
    });

    it('should handle zero duration', () => {
      const startTime = 1000;
      const endTime = 1000;

      const result = formatTimeBetween(startTime, endTime);

      // For zero duration, result should be empty or not contain time units
      expect(result).not.toContain('hour');
      expect(result).not.toContain('minute');
      expect(result).not.toContain('second');
    });

    it('should handle hours only', () => {
      const startTime = 1000;
      const endTime = 1000 + 3600000; // start + 1h

      const result = formatTimeBetween(startTime, endTime);

      // Should contain only hours
      expect(result).toContain('hour');
      expect(result).not.toContain('minute');
      expect(result).not.toContain('second');
    });

    it('should handle minutes only', () => {
      const startTime = 1000;
      const endTime = 1000 + 120000; // start + 2m

      const result = formatTimeBetween(startTime, endTime);

      // Should contain only minutes
      expect(result).not.toContain('hour');
      expect(result).toContain('minute');
      expect(result).not.toContain('second');
    });

    it('should handle seconds only', () => {
      const startTime = 1000;
      const endTime = 1000 + 3000; // start + 3s

      const result = formatTimeBetween(startTime, endTime);

      // Should contain only seconds
      expect(result).not.toContain('hour');
      expect(result).not.toContain('minute');
      expect(result).toContain('second');
    });
  });
});
