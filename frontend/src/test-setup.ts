import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement these browser Blob/Object URL APIs
globalThis.URL.createObjectURL = () => 'blob:mock-url'
globalThis.URL.revokeObjectURL = () => {}
