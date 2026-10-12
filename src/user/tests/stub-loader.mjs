/**
 * Lets the app's API client run under plain Node, for tests.
 *
 * api.ts reaches for React Native's AsyncStorage, which cannot be loaded
 * outside a phone. Everything else it imports is a type and is stripped.
 */
const ASYNC_STORAGE = '@react-native-async-storage/async-storage';

const stub = `
  const store = new Map();
  export default {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
    removeItem: async (key) => { store.delete(key); },
  };
`;

export async function resolve(specifier, context, next) {
  if (specifier === ASYNC_STORAGE) {
    return {
      url: `data:text/javascript,${encodeURIComponent(stub)}`,
      shortCircuit: true,
    };
  }
  return next(specifier, context);
}
