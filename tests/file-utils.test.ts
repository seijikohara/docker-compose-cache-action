import { formatFileSize, sanitizePathComponent } from '../src/file-utils';

describe('file-utils', () => {
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

  describe('sanitizePathComponent', () => {
    it('should maintain safe characters unchanged', () => {
      expect(sanitizePathComponent('normal-text')).toBe('normal-text');
      expect(sanitizePathComponent('with.dot')).toBe('with.dot');
      expect(sanitizePathComponent('underscore_example')).toBe('underscore_example');
      expect(sanitizePathComponent('numbers123')).toBe('numbers123');
    });

    it('should replace unsafe characters with hyphens', () => {
      expect(sanitizePathComponent('path/with/slashes')).toBe('path-with-slashes');
      expect(sanitizePathComponent('file\\with\\backslashes')).toBe('file-with-backslashes');
      expect(sanitizePathComponent('file:with:colons')).toBe('file-with-colons');
      expect(sanitizePathComponent('file*with*asterisks')).toBe('file-with-asterisks');
      expect(sanitizePathComponent('file?with?questions')).toBe('file-with-questions');
      expect(sanitizePathComponent('file"with"quotes')).toBe('file-with-quotes');
      expect(sanitizePathComponent('file<with>brackets')).toBe('file-with-brackets');
      expect(sanitizePathComponent('file|with|pipes')).toBe('file-with-pipes');
    });

    it('should handle mixed safe and unsafe characters', () => {
      expect(sanitizePathComponent('mixed/path.with*special?chars')).toBe('mixed-path.with-special-chars');
      expect(sanitizePathComponent('image:2023-05-01.png')).toBe('image-2023-05-01.png');
    });

    it('should handle empty strings', () => {
      expect(sanitizePathComponent('')).toBe('');
    });
  });
});
