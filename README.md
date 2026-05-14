# React + Vite

## Huni Desktop App

The frontend can run inside an Electron desktop window.

Install the new desktop dependencies once:

```bash
npm install
```

Start the backend first from `messaging-app-backend`, then run the desktop app from this frontend folder:

```bash
npm run electron:dev
```

Build a Windows installer:

```bash
npm run electron:dist
```

Build an unpacked Windows app folder for quick testing:

```bash
npm run electron:pack
```

The desktop app expects the backend API to be available at the configured `VITE_API_BASE`, currently `http://localhost:4000`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# messenger-app-frontend
