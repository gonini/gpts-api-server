// Test setup file
import nock from 'nock';

// Mock crypto.subtle for Edge Runtime compatibility
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn().mockImplementation(async (algorithm, data) => {
        // Simple mock implementation
        const hash = Array.from(data).reduce((acc, byte) => acc + byte, 0);
        return new Uint8Array([hash % 256, (hash >> 8) % 256, (hash >> 16) % 256, (hash >> 24) % 256]);
      })
    }
  }
});

// Clean up nock after each test
afterEach(() => {
  nock.cleanAll();
});
