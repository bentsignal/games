import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, loadConfigFromFile, preview } from "vite";

// A portable rendering fixture. It uses the actual game UI without credentials,
// network services, Portless, or changes to the normal application build.
const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = fileURLToPath(
  new URL("../.dev/ticket-diagnostics/", import.meta.url),
);
const { config } = await loadConfigFromFile({
  command: "build",
  mode: "ticket-diagnostics",
});
config.plugins.unshift({
  name: "ticket-diagnostics-fixture",
  enforce: "pre",
  resolveId(id) {
    if (id === "virtual:ticket-diagnostics") return "\0ticket-diagnostics";
  },
  load(id) {
    if (id !== "\0ticket-diagnostics") return;
    return `import React from 'react';
      import {createRoot} from 'react-dom/client';
      import App from '/src/App.tsx';
import "@fontsource/rye/400.css";
 import "@fontsource/bree-serif/400.css";
 import "@fontsource/fraunces/400.css";
 import "@fontsource/fraunces/600.css";
 import "@fontsource/manrope/400.css";
 import "@fontsource/manrope/600.css";
 import "@fontsource/manrope/700.css";
 import "@fontsource/ibm-plex-mono/400.css";

      import '/src/styles.css'; import '/src/classic.css';
      createRoot(document.getElementById('root')).render(React.createElement(App,{username:'Diagnostics'}));`;
  },
  transform(code, id) {
    if (id.replaceAll("\\", "/").endsWith("/src/components/PlatformHeader.tsx"))
      return `import React from 'react'; export default function PlatformHeader(){return React.createElement('header',{className:'masthead'},'Offline diagnostics fixture. Chat replies are simulated. Reload to reset the game.');}`;
    if (!id.replaceAll("\\", "/").endsWith("/src/game/useTicketRoom.ts"))
      return;
    return `import {useSyncExternalStore} from 'react';
      import {endingPreview} from '/src/game/ending-preview';
      import {playerView,applyAction} from '/src/game/engine';
      import {COLORS} from '/src/game/data';
      import {createTicketChat} from '/src/game/ticketChat';
      import {diagnosticMeasure} from '/src/game/diagnostics';
      let game=endingPreview('diagnostic-player','Diagnostics','offline');
      game.phase='playing'; game.turn=0; game.finalTurns=null;
      game.players[0].pending=[];
      game.players[0].hand=COLORS.flatMap(color=>Array(8).fill(color));
      game.players[0].trains=45;
      let revision=1;
      const view=()=>({code:'TEST2345',revision,serverNow:Date.now(),game:playerView(game,'diagnostic-player'),phase:game.phase,seats:game.players.length});
      let room=view();
      const listeners=new Set();
      const subscribe=(fn)=>{listeners.add(fn);return ()=>listeners.delete(fn)};
      const getSnapshot=()=>room;
      const chat=createTicketChat();let sequence=0;
      const replyMs=Math.min(10000,Math.max(0,Number(new URLSearchParams(location.search).get('replyMs'))||1200));
      const methods={chat,connectedServer:true,loadMoreChat:async()=>{},get:async()=>room,
        send:async(args)=>{const started=performance.now();await new Promise(resolve=>setTimeout(resolve,replyMs));chat.acknowledge(args.clientId,{_id:'chat:'+String(++sequence).padStart(12,'0'),clientId:args.clientId,sender:'diagnostic-player',name:'Diagnostics',text:args.text,time:Date.now()});diagnosticMeasure('simulated-chat-ack',started)},
        play:async(args)=>{game=applyAction(game,'diagnostic-player',args.action);revision++;room=view();for(const fn of listeners)fn()},
        create:async()=>{location.reload()},join:async()=>{},manage:async()=>{location.reload()}};
      export function useTicketRoom(){const state=useSyncExternalStore(subscribe,getSnapshot);return {...methods,room:state,confirmedRoom:state}};`;
  },
});
const result = await build({
  ...config,
  root,
  configFile: false,
  mode: "ticket-diagnostics",
  define: { "import.meta.env.DEV": "true" },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: "virtual:ticket-diagnostics",
      output: { entryFileNames: "assets/entry.js" },
    },
  },
});
const output = (Array.isArray(result) ? result[0] : result).output;
const css = output
  .filter((item) => item.fileName.endsWith(".css"))
  .map((item) => `<link rel="stylesheet" href="/${item.fileName}">`)
  .join("");
await mkdir(outDir, { recursive: true });
await writeFile(
  outDir + "/index.html",
  `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${css}<title>Ticket performance diagnostics</title></head><body><div id="root"></div><script type="module" src="/assets/entry.js"></script></body></html>`,
);
const server = await preview({
  configFile: false,
  root,
  build: { outDir },
  preview: { host: "127.0.0.1", port: 4175 },
});
const origin = server.resolvedUrls.local[0];
console.log(
  `Open ${origin}ticket/room/TEST2345?diagnostics=1\nDrag cards across the map, type in Chat, then Download diagnostics.\nChat acknowledgements are simulated at 1,200 ms. This fixture measures rendering, not production networking.`,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.httpServer.close());
