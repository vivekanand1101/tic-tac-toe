import { createApp } from './app.js';
import { JevChooser } from './ai.js';
const port = Number(process.env.PORT ?? 3039);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const apiKey = (process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY)?.trim();
const chooser = apiKey ? new JevChooser(apiKey, process.env.JEV_MODEL || 'jev-latest') : undefined;
createApp(chooser).listen(port, '127.0.0.1', () => console.log(`Tic-tac-toe API running at http://127.0.0.1:${port} (${chooser ? 'Jev with minimax fallback' : 'minimax'})`));
