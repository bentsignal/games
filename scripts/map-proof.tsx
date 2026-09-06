// Render the worst-case board (every train placed) for visual regression review.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, readFileSync } from "node:fs";
import Board from "../src/components/Board";
import { newGame, newPlayer, playerView } from "../src/game/engine";
import { ROUTES } from "../src/game/data";
const game = newGame("mega", newPlayer("p0", "Red", 0));
for (let i = 1; i < 5; i++)
  game.players.push(newPlayer(`p${i}`, `Player ${i + 1}`, i));
game.phase = "playing";
for (let i = 0; i < ROUTES.length; i++)
  game.claimed[ROUTES[i].id] = `p${i % 5}`;
const fonts = ["bree-serif", "rye"]
  .map(
    (name) =>
      `@font-face{font-family:"${name === "rye" ? "Rye" : "Bree Serif"}";src:url(data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/${name}/files/${name}-latin-400-normal.woff2`).toString("base64")})}`,
  )
  .join("");
const html = renderToStaticMarkup(
  <Board game={playerView(game, "p0")} onSelect={() => {}} />,
);
writeFileSync(
  "/tmp/railbound-map-proof.html",
  `<style>${fonts}${readFileSync("src/styles.css", "utf8")}${readFileSync("src/classic.css", "utf8")}body{margin:0;width:1400px;height:940px}.atlas{height:940px}.map-toolbar{display:none}.map-route{animation:none!important}</style>${html}`,
);
