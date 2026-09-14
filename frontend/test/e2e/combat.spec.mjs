import { test, expect, chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'

const API=18200,WORLD=18201,WEB=18202,processes=[]; let fakeApi, guestId=0
function json(res,status,body){res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':`http://127.0.0.1:${WEB}`,'access-control-allow-credentials':'true','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(body))}
async function waitFor(url){for(let i=0;i<150;i++){try{if((await fetch(url)).ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error(`timeout ${url}`)}
function start(cmd,args,env={}){const p=spawn(cmd,args,{cwd:new URL('../..',import.meta.url),env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>out+=x);p.output=()=>out;processes.push(p);return p}
async function enter(context){const p=await context.newPage();await p.goto(`http://127.0.0.1:${WEB}`);await p.locator('.enter-game-button').click();await p.waitForFunction(()=>window.__ZHIWOJING_E2E__?.snapshot()?.currentId,null,{timeout:15000});await p.keyboard.press('g');await expect(p.locator('.autonomy-mode__label')).toHaveText('真人控制中');return p}
const snap=p=>p.evaluate(()=>window.__ZHIWOJING_E2E__.snapshot()); const hp=async(p,id)=>(await snap(p)).players[id]?.hp
async function move(p,key,ms){await p.keyboard.down(key);await p.waitForTimeout(ms);await p.keyboard.up(key)}
async function approach(p,aid,bid){for(let i=0;i<5;i++){const s=await snap(p),a=s.players[aid],b=s.players[bid],dx=b.x-a.x,dy=b.y-a.y;if(Math.hypot(dx,dy)<42){await move(p,Math.abs(dx)>=Math.abs(dy)?(dx>=0?'ArrowRight':'ArrowLeft'):(dy>=0?'ArrowDown':'ArrowUp'),15);return}const horizontal=Math.abs(dx)>=Math.abs(dy);await move(p,horizontal?(dx>=0?'ArrowRight':'ArrowLeft'):(dy>=0?'ArrowDown':'ArrowUp'),Math.min(220,Math.max(30,Math.abs(horizontal?dx:dy)*3)))}}

test.beforeAll(async()=>{fakeApi=createServer((req,res)=>{if(req.method==='OPTIONS')return json(res,200,{});if(req.url==='/api/health')return json(res,200,{status:'ok'});if(req.url==='/api/oauth/status')return json(res,200,{configured:false,integrationReady:false});if(req.url==='/api/me')return json(res,200,{id:1,name:'E2E 玩家'});if(req.url==='/api/auth/guest'){const id=++guestId;return json(res,200,{token:`e2e-${id}`,user:{id,name:`E2E 玩家 ${id}`}});}if(req.url==='/api/agent/step')return json(res,503,{detail:{code:'MANUAL'}});return json(res,404,{})});fakeApi.listen(API,'127.0.0.1');await once(fakeApi,'listening');const world=start(process.execPath,['dist/server/node-server.js'],{RPGJS_HOST:'127.0.0.1',RPGJS_PORT:String(WORLD),AVATAR_API_URL:`http://127.0.0.1:${API}`});const web=start('node_modules/.bin/vite',['--host','127.0.0.1','--port',String(WEB)],{RPG_TYPE:'mmorpg',VITE_E2E:'true',VITE_API_URL:`http://127.0.0.1:${API}`,VITE_RPGJS_SERVER_HOST:`127.0.0.1:${WORLD}`});try{await Promise.all([waitFor(`http://127.0.0.1:${WORLD}/health`),waitFor(`http://127.0.0.1:${WEB}`)])}catch(e){throw Error(`${e}\n${world.output()}\n${web.output()}`)}})
test.afterAll(async()=>{for(const p of processes)p.kill('SIGTERM');await Promise.all(processes.map(p=>p.exitCode===null?once(p,'exit'):null));await new Promise(r=>fakeApi.close(r))})

test('real two-client hit sync, focus guard, and dodge invincibility',async()=>{test.setTimeout(90000);const browser=await chromium.launch(),ca=await browser.newContext(),cb=await browser.newContext();try{
 const [a,b]=await Promise.all([enter(ca),enter(cb)]),sa=await snap(a),sb=await snap(b),aid=sa.currentId,bid=sb.currentId
 await Promise.all([a.waitForFunction(id=>!!window.__ZHIWOJING_E2E__.snapshot().players[id],bid),b.waitForFunction(id=>!!window.__ZHIWOJING_E2E__.snapshot().players[id],aid)])
 for(let i=0;i<6 && await hp(b,bid)===100;i++){await approach(a,aid,bid);await a.keyboard.press('j');await a.waitForTimeout(750)}await expect.poll(()=>hp(b,bid),{timeout:5000}).toBeLessThan(100)
 const afterHit=await hp(b,bid);await expect.poll(()=>hp(a,bid)).toBe(afterHit);await expect(b.locator('.combat-hud span')).toHaveText(`${afterHit} / 100`)
 await b.keyboard.press('b');const input=b.locator('.chat-input');await expect(input).toBeFocused();const focused=await snap(b)
 for(const key of ['j','f','k','Shift'])await b.keyboard.press(key);await b.waitForTimeout(300);const protectedState=await snap(b)
 expect(protectedState.players[bid].hp).toBe(focused.players[bid].hp);expect(protectedState.players[bid].x).toBe(focused.players[bid].x);expect(protectedState.players[bid].y).toBe(focused.players[bid].y);await b.keyboard.press('Escape')
 await a.waitForTimeout(750);await approach(a,aid,bid);const beforeDodge=await snap(b);await b.keyboard.down('ArrowLeft');await b.keyboard.press('Shift');await b.waitForTimeout(25);await a.keyboard.press('j');await b.keyboard.up('ArrowLeft');await b.waitForTimeout(250);const afterDodge=await snap(b)
 expect(afterDodge.players[bid].hp).toBe(afterHit);expect(Math.hypot(afterDodge.players[bid].x-beforeDodge.players[bid].x,afterDodge.players[bid].y-beforeDodge.players[bid].y)).toBeGreaterThan(0)
}finally{await ca.close();await cb.close();await browser.close()}})
