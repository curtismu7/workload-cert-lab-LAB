import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = createApp();
app.use(express.static(join(__dirname, '..', '..', 'web', 'dist')));
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(__dirname, '..', '..', 'web', 'dist', 'index.html')));

const PORT = Number(process.env.PORT) || 7823;
app.listen(PORT, '0.0.0.0', () => console.log(`workload-cert-lab on :${PORT}`));
