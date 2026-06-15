// Dev: Vite serves the client on 5201 and proxies /ws to the game server on 5202,
// so the client always talks to its own origin (same as production, where the Node
// server serves dist/ and the socket together).
export default {
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:5202', ws: true },
    },
  },
};
