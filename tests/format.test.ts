import { formatExecutionTime, formatFileSize } from '../src/format';

describe('Format Module', () => {
  describe('formatFileSize', () => {
    it('should return N/A for undefined input', () => {
      expect(formatFileSize(undefined)).toBe('N/A');
    });

    it('should return 0 Bytes for zero input', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(formatFileSize(100)).toBe('100 Bytes');
      expect(formatFileSize(1023)).toBe('1023 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10 KB');
    });

    it('should format megabytes correctly', () => {
      const oneMB = 1024 * 1024;
      expect(formatFileSize(oneMB)).toBe('1 MB');
      expect(formatFileSize(oneMB * 1.5)).toBe('1.5 MB');
      expect(formatFileSize(oneMB * 10)).toBe('10 MB');
    });

    it('should format gigabytes correctly', () => {
      const oneGB = 1024 * 1024 * 1024;
      expect(formatFileSize(oneGB)).toBe('1 GB');
      expect(formatFileSize(oneGB * 1.5)).toBe('1.5 GB');
      expect(formatFileSize(oneGB * 10)).toBe('10 GB');
    });

    it('should format terabytes correctly', () => {
      const oneTB = 1024 * 1024 * 1024 * 1024;
      expect(formatFileSize(oneTB)).toBe('1 TB');
      expect(formatFileSize(oneTB * 1.5)).toBe('1.5 TB');
    });

    it('should format petabytes correctly', () => {
      const onePB = 1024 * 1024 * 1024 * 1024 * 1024;
      expect(formatFileSize(onePB)).toBe('1 PB');
      expect(formatFileSize(onePB * 1.5)).toBe('1.5 PB');
    });

    it('should trim trailing zeros in decimal part', () => {
      const size = 1024 * 1024 * 1.2; // 1.2 MB
      expect(formatFileSize(size)).toBe('1.2 MB');

      const sizeExact = 1024 * 1024 * 2; // 2.0 MB
      expect(formatFileSize(sizeExact)).toBe('2 MB');
    });

    it('should handle very large numbers and use the largest unit', () => {
      const extremelyLarge = 1024 * 1024 * 1024 * 1024 * 1024 * 1024; // 1 exabyte
      expect(formatFileSize(extremelyLarge)).toBe('1024 PB');
    });
  });

  describe('formatExecutionTime', () => {
    it('should calculate the difference between timestamps correctly', () => {
      // Value representing 1 hour 2 minutes 3 seconds
      const startTime = 1000;
      const endTime = 1000 + 3600000 + 120000 + 3000; // start + 1h + 2m + 3s

      const result = formatExecutionTime(startTime, endTime);

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

      const result = formatExecutionTime(startTime, endTime);

      // For zero duration, result should be empty or not contain time units
      expect(result).not.toContain('hour');
      expect(result).not.toContain('minute');
      expect(result).not.toContain('second');
    });

    it('should handle hours only', () => {
      const startTime = 1000;
      const endTime = 1000 + 3600000; // start + 1h

      const result = formatExecutionTime(startTime, endTime);

      // Should contain only hours
      expect(result).toContain('hour');
      expect(result).not.toContain('minute');
      expect(result).not.toContain('second');
    });

    it('should handle minutes only', () => {
      const startTime = 1000;
      const endTime = 1000 + 120000; // start + 2m

      const result = formatExecutionTime(startTime, endTime);

      // Should contain only minutes
      expect(result).not.toContain('hour');
      expect(result).toContain('minute');
      expect(result).not.toContain('second');
    });

    it('should handle seconds only', () => {
      const startTime = 1000;
      const endTime = 1000 + 3000; // start + 3s

      const result = formatExecutionTime(startTime, endTime);

      // Should contain only seconds
      expect(result).not.toContain('hour');
      expect(result).not.toContain('minute');
      expect(result).toContain('second');
    });
  });
});
