import { mutation, query, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { applyAction, botAction, newGame, newPlayer, playerView, type Game } from '../src/game/engine';
const mode=v.union(v.literal('classic'),v.literal('1910'),v.literal('big'),v.literal('mega'));
const color=v.union(...(['red','orange','yellow','green','blue','pink','black','white','wild'] as const).map(v.literal));
const action=v.union(v.object({type:v.literal('start')}),v.object({type:v.literal('keep'),tickets:v.array(v.string())}),v.object({type:v.literal('draw'),source:v.number(),expected:v.optional(color)}),v.object({type:v.literal('tickets')}),v.object({type:v.literal('claim'),route:v.string(),color,wilds:v.number()}),v.object({type:v.literal('pass')}));
function identity(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid session. Reload the page.');return bytesToHex(sha256(new TextEncoder().encode(token)))}
function nameOf(name:string){const n=name.trim().replace(/[\u0000-\u001f]/g,'');if(n.length<1||n.length>24)throw new Error('Use a name between 1 and 24 characters.');return n}
export const create=mutation({args:{token:v.string(),name:v.string(),mode},handler:async(ctx,args)=>{
 const id=identity(args.token),name=nameOf(args.name);let session=await ctx.db.query('sessions').withIndex('by_hash',q=>q.eq('hash',id)).unique();
 if(session&&Date.now()-session.lastCreate<10000)throw new Error('Please wait a few seconds before creating another room.');
 if(session)await ctx.db.patch(session._id,{lastCreate:Date.now()});else await ctx.db.insert('sessions',{hash:id,lastCreate:Date.now(),lastChat:0});
 let code='';for(let i=0;i<8;i++)code+='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)];
 while(await ctx.db.query('rooms').withIndex('by_code',q=>q.eq('code',code)).unique())code=code.slice(1)+'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)];
 await ctx.db.insert('rooms',{code,game:newGame(args.mode,newPlayer(id,name,0)),revision:0,createdAt:Date.now(),updatedAt:Date.now()});return code;
}});
export const get=query({args:{code:v.string(),token:v.string()},handler:async(ctx,{code,token})=>{
 const id=identity(token),room=await ctx.db.query('rooms').withIndex('by_code',q=>q.eq('code',code.toUpperCase())).unique();if(!room)return null;
 const game=room.game as Game;if(!game.players.some(p=>p.id===id))return {code:room.code,revision:room.revision,game:null,seats:game.players.length,phase:game.phase};
 return {code:room.code,revision:room.revision,game:playerView(game,id),seats:game.players.length,phase:game.phase};
}});
export const join=mutation({args:{code:v.string(),token:v.string(),name:v.string()},handler:async(ctx,{code,token,name})=>{
 const id=identity(token);const room=await ctx.db.query('rooms').withIndex('by_code',q=>q.eq('code',code.toUpperCase())).unique();if(!room)throw new Error('That room does not exist.');const g=room.game as Game;
 if(g.players.some(p=>p.id===id))return room.code;if(g.phase!=='lobby')throw new Error('This train has departed. Ask the host for the next game.');if(g.players.length>=5)throw new Error('This room is full.');
 const available=[0,1,2,3,4].find(c=>!g.players.some(p=>p.color===c))!;g.players.push(newPlayer(id,nameOf(name),available));
 await ctx.db.patch(room._id,{game:g,revision:room.revision+1,updatedAt:Date.now()});return room.code;
}});
export const play=mutation({args:{code:v.string(),token:v.string(),revision:v.number(),action},handler:async(ctx,args)=>{
 const id=identity(args.token),room=await ctx.db.query('rooms').withIndex('by_code',q=>q.eq('code',args.code)).unique();if(!room)throw new Error('Room not found.');if(room.revision!==args.revision)throw new Error('The game changed. Please try your move again.');
 if((room.game as Game).players.find(p=>p.id===id)?.bot)throw new Error('This seat is now controlled by the computer.');
 const game=applyAction(room.game as Game,id,args.action);
 await ctx.db.patch(room._id,{game,revision:room.revision+1,updatedAt:Date.now()});await ctx.scheduler.runAfter(600,internal.rooms.advanceBot,{roomId:room._id,revision:room.revision+1});
}});
export const manage=mutation({args:{code:v.string(),token:v.string(),operation:v.union(v.literal('bot'),v.literal('remove'),v.literal('mode'),v.literal('rematch'),v.literal('leave'),v.literal('resign')),player:v.optional(v.string()),mode:v.optional(mode)},handler:async(ctx,args)=>{
 const id=identity(args.token),room=await ctx.db.query('rooms').withIndex('by_code',q=>q.eq('code',args.code)).unique();if(!room)throw new Error('Room not found.');let g=room.game as Game;const me=g.players.find(p=>p.id===id);if(!me)throw new Error('Not seated.');
 if(args.operation==='resign'){if(g.phase!=='playing'&&g.phase!=='setup')throw new Error('No active game.');me.bot=true;me.name=me.name+' (AI)';}
 else if(args.operation==='leave'){if(g.phase!=='lobby')throw new Error('You can only leave your seat before a game starts.');g.players=g.players.filter(p=>p.id!==id);}
 else {
  if(g.players[0].id!==id)throw new Error('Only the host can change the table.');
  if(args.operation==='rematch'){if(g.phase!=='finished')throw new Error('Finish the current game first.');const players=g.players.map(p=>newPlayer(p.id,p.name,p.color,p.bot));g=newGame(g.mode,players[0]);g.players=players;}
  else{if(g.phase!=='lobby')throw new Error('The game has already started.');
   if(args.operation==='bot'){if(g.players.length>=5)throw new Error('The table is full.');const c=[0,1,2,3,4].find(c=>!g.players.some(p=>p.color===c))!;g.players.push(newPlayer('bot-'+Math.random().toString(36).slice(2),['Ada','Jules','Nellie','Arthur','Clara'][c],c,true))}
   if(args.operation==='remove'){if(args.player===id)throw new Error('Use leave to leave the table.');g.players=g.players.filter(p=>p.id!==args.player)}
   if(args.operation==='mode'&&args.mode)g.mode=args.mode;
  }
 }
 if(!g.players.length){await ctx.db.delete(room._id);return}
 await ctx.db.patch(room._id,{game:g,revision:room.revision+1,updatedAt:Date.now()});if(args.operation==='resign')await ctx.scheduler.runAfter(300,internal.rooms.advanceBot,{roomId:room._id,revision:room.revision+1});
}});
export const advanceBot=internalMutation({args:{roomId:v.id('rooms'),revision:v.number()},handler:async(ctx,args)=>{
 const room=await ctx.db.get(args.roomId);if(!room||room.revision!==args.revision)return;const g=room.game as Game;
 const p=g.phase==='setup'?g.players.find(p=>p.bot&&p.pending.length):g.phase==='playing'&&g.players[g.turn].bot?g.players[g.turn]:null;if(!p)return;
 const game=applyAction(g,p.id,botAction(g,p));await ctx.db.patch(room._id,{game,revision:room.revision+1,updatedAt:Date.now()});await ctx.scheduler.runAfter(650,internal.rooms.advanceBot,{roomId:room._id,revision:room.revision+1});
}});
export const chat=query({args:{code:v.string(),token:v.string()},handler:async(ctx,{code,token})=>{
 const id=identity(token),room=await ctx.db.query('rooms').withIndex('by_code',q=>q.eq('code',code)).unique();if(!room||!(room.game as Game).players.some(p=>p.id===id))return [];
 return (await ctx.db.query('messages').withIndex('by_room',q=>q.eq('room',room._id)).order('desc').take(100)).reverse();
}});
export const send=mutation({args:{code:v.string(),token:v.string(),text:v.string()},handler:async(ctx,{code,token,text})=>{
 const id=identity(token),room=await ctx.db.query('rooms').withIndex('by_code',q=>q.eq('code',code)).unique();const p=(room?.game as Game|undefined)?.players.find(p=>p.id===id);if(!room||!p)throw new Error('Join this room to chat.');const message=text.trim();if(!message||message.length>500)throw new Error('Messages must be 1–500 characters.');
 const session=await ctx.db.query('sessions').withIndex('by_hash',q=>q.eq('hash',id)).unique();if(session&&Date.now()-session.lastChat<750)throw new Error('Please slow down.');if(session)await ctx.db.patch(session._id,{lastChat:Date.now()});else await ctx.db.insert('sessions',{hash:id,lastCreate:0,lastChat:Date.now()});
 await ctx.db.insert('messages',{room:room._id,sender:id,name:p.name,text:message,time:Date.now()});
 const oldest=await ctx.db.query('messages').withIndex('by_room',q=>q.eq('room',room._id)).order('desc').take(110);for(const old of oldest.slice(100))await ctx.db.delete(old._id);
}});
