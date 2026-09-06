import board from './board.json';
import tickets from './tickets.json';
export const COLORS = ['red','orange','yellow','green','blue','pink','black','white','wild'] as const;
export type Color = typeof COLORS[number];
export type RouteColor = Color | 'gray';
export type Mode = 'classic' | '1910' | 'big' | 'mega';
export interface Route { id:string; a:string; b:string; length:number; color:RouteColor }
export interface Ticket { id:string; a:string; b:string; points:number; set:string; big:boolean }
export const CITIES = board.cities as Record<string,number[]>;
export const ROUTES = board.routes as Route[];
export const TICKETS = tickets as Ticket[];
export const TICKET_BY_ID = Object.fromEntries(TICKETS.map(t=>[t.id,t]));
export const ROUTE_BY_ID = Object.fromEntries(ROUTES.map(r=>[r.id,r]));
export const POINTS = [0,1,2,4,7,10,15];
export const PALETTE:Record<RouteColor,string> = {red:'#c95643',orange:'#d68a3c',yellow:'#dbbd55',green:'#5d8e68',blue:'#5188ab',pink:'#b87c9a',black:'#404547',white:'#f1e9d5',wild:'#ae965d',gray:'#aaa58e'};
export const PLAYER_COLORS = ['#d9674e','#4f97c2','#dfb345','#71a77c','#a98ac5'];
export const MODES:Record<Mode,{name:string;description:string;initial:number;keep:number;draw:number;longest:boolean;globe:boolean}> = {
 classic:{name:'Classic',description:'30 original tickets, with revised 1910 values. The timeless coast-to-coast adventure.',initial:3,keep:2,draw:3,longest:true,globe:false},
 '1910':{name:'USA 1910',description:'35 new journeys. Complete the most tickets to win the Globetrotter bonus.',initial:3,keep:2,draw:3,longest:false,globe:true},
 big:{name:'Big Cities',description:'35 tickets through seven major cities. Close competition, no end-game bonuses.',initial:4,keep:2,draw:4,longest:false,globe:false},
 mega:{name:'The Mega Game',description:'All 69 tickets. Both bonuses. A grand American railway adventure.',initial:5,keep:3,draw:4,longest:true,globe:true},
};
export function ticketDeck(mode:Mode){return TICKETS.filter(t=>mode==='mega'||(mode==='big'?t.big:t.set===(mode==='classic'?'classic':'1910'))).map(t=>t.id)}
