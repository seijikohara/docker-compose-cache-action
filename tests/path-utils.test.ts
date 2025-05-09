import { sanitizePathComponent } from '../src/path-utils';

describe('path-utils', () => {
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
