import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { registerSW } from "virtual:pwa-register";

registerSW({
	immediate: true,
});

const rootEl = document.getElementById("root")!;
// Remove o loader inline antes do React montar
const loader = document.getElementById("initial-loader");
if (loader) loader.remove();

createRoot(rootEl).render(<App />);
