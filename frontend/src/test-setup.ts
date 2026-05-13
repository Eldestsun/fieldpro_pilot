import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement these browser Blob/Object URL APIs
global.URL.createObjectURL = () => 'blob:mock-url'
global.URL.revokeObjectURL = () => {}
