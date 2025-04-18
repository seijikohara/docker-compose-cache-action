import { getErrorMessage } from '../src/errors';

describe('Error Utilities', () => {
  describe('getErrorMessage', () => {
    describe('normal cases', () => {
      it('should extract message from Error instances', () => {
        // Arrange
        const errorMessage = 'Test error message';
        const error = new Error(errorMessage);

        // Act
        const result = getErrorMessage(error);

        // Assert
        expect(result).toBe(errorMessage);
      });

      it('should handle custom error classes with message property', () => {
        // Arrange
        const errorMessage = 'Custom error message';
        class CustomError extends Error {
          constructor(message: string) {
            super(message);
            this.name = 'CustomError';
          }
        }
        const customError = new CustomError(errorMessage);

        // Act
        const result = getErrorMessage(customError);

        // Assert
        expect(result).toBe(errorMessage);
      });

      it('should convert string values to strings directly', () => {
        // Arrange
        const errorString = 'String error message';

        // Act
        const result = getErrorMessage(errorString);

        // Assert
        expect(result).toBe(errorString);
      });

      it('should convert number values to strings', () => {
        // Arrange
        const errorNumber = 42;

        // Act
        const result = getErrorMessage(errorNumber);

        // Assert
        expect(result).toBe('42');
      });
    });

    describe('edge cases', () => {
      it('should handle null values', () => {
        // Arrange
        const errorValue = null;

        // Act
        const result = getErrorMessage(errorValue);

        // Assert
        expect(result).toBe('Unknown error');
      });

      it('should handle undefined values', () => {
        // Arrange
        const errorValue = undefined;

        // Act
        const result = getErrorMessage(errorValue);

        // Assert
        expect(result).toBe('Unknown error');
      });

      it('should handle objects without toString method override', () => {
        // Arrange
        const errorObject = { key: 'value' };

        // Act
        const result = getErrorMessage(errorObject);

        // Assert
        expect(result).toBe('[object Object]');
      });

      it('should handle objects with toString method override', () => {
        // Arrange
        const customMessage = 'Custom object string representation';
        const errorObject = {
          toString: () => customMessage,
        };

        // Act
        const result = getErrorMessage(errorObject);

        // Assert
        expect(result).toBe(customMessage);
      });
    });
  });
});
