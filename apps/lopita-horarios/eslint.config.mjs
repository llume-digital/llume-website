// Comprobación mínima del JavaScript de la interfaz (sin build): variables sin declarar y restos sin usar.
// Se ejecuta en CI con `npx eslint@10.13.0`; no hace falta instalar nada en el proyecto.
export default [
  {
    files: ['app/static/**/*.js', 'offline/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', history: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly', fetch: 'readonly', console: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', getComputedStyle: 'readonly',
        CSS: 'readonly', Intl: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly',
        FormData: 'readonly', File: 'readonly', FileReader: 'readonly', Response: 'readonly', Request: 'readonly',
        Headers: 'readonly', AbortController: 'readonly', Event: 'readonly', CustomEvent: 'readonly',
        HTMLElement: 'readonly', Node: 'readonly', MutationObserver: 'readonly', ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly', matchMedia: 'readonly', alert: 'readonly', confirm: 'readonly',
        prompt: 'readonly', open: 'readonly', print: 'readonly', scrollTo: 'readonly', innerWidth: 'readonly',
        innerHeight: 'readonly', crypto: 'readonly', caches: 'readonly', self: 'readonly', importScripts: 'readonly',
        Worker: 'readonly', postMessage: 'readonly', indexedDB: 'readonly', TextEncoder: 'readonly',
        TextDecoder: 'readonly', atob: 'readonly', btoa: 'readonly', structuredClone: 'readonly',
        queueMicrotask: 'readonly', performance: 'readonly', Notification: 'readonly', clients: 'readonly',
        loadPyodide: 'readonly', BroadcastChannel: 'readonly', DOMParser: 'readonly', Image: 'readonly',
        SpeechRecognition: 'readonly', webkitSpeechRecognition: 'readonly', ServiceWorker: 'readonly',
        Element: 'readonly', AbortSignal: 'readonly',
        __ARCHIVOS__: 'readonly',  // en sw.js, el servidor y construir_offline.py lo cambian por la lista de archivos
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
];
