import { expect, test, type Page } from '@playwright/test';
import { getFramePose, type BoardDocument, type Point } from '../src/board/model';
import { getBoardGeometry } from '../src/board/render';
import { OPENINGS } from '../src/board/openings';
test.use({ viewport: { width: 390, height: 844 } });
const KEY='tennis-tactics:board-drafts:v1';
const current=(page:Page)=>page.getByTestId('flow-current');
const canvas=(page:Page)=>current(page).getByTestId('board-canvas');
async function start(page:Page){
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.locator('.home-plan-primary').click();await expect(canvas(page)).toBeVisible();
  await expect.poll(()=>current(page).evaluate(e=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m41))).toBeLessThan(1);
  await page.getByRole('button',{name:'收起跑位提示'}).click();
}
async function pixel(page:Page,p:Point){
  const m=await canvas(page).evaluate(e=>({w:e.clientWidth,h:e.clientHeight,r:e.getBoundingClientRect().toJSON(),rotated:e.getAttribute('data-rotated')==='true'}));
  const q=getBoardGeometry(m.w,m.h,m.rotated).toCanvas(p);return{x:m.r.x+q[0]*m.r.width/m.w,y:m.r.y+q[1]*m.r.height/m.h};
}
async function drag(page:Page,from:Point,to:Point,cancel=false){
  const a=await pixel(page,from),b=await pixel(page,to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});
  if(cancel)await canvas(page).dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});
  await page.mouse.up();
}
async function saved(page:Page):Promise<BoardDocument>{
  await expect(current(page).getByTestId('board-save-live')).toHaveText('画板已保存');
  return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).boards[0],KEY);
}
async function menu(page:Page){await current(page).getByRole('button',{name:/^打开.*的画板菜单$/}).click();}
async function openings(page:Page){await menu(page);await page.getByRole('button',{name:/^开局站位/}).click();}
function closePoint(actual:Point,expected:Point){expect(actual[0]).toBeCloseTo(expected[0],2);expect(actual[1]).toBeCloseTo(expected[1],2);}
for(const opening of OPENINGS){test(`opening ${opening.id}: roles, ball, first shot and undo`,async({page})=>{
  await start(page);await openings(page);await page.getByRole('button',{name:opening.label,exact:true}).click();
  const b=await saved(page),me=b.actors.find(a=>a.label==='我方')!,opp=b.actors.find(a=>a.label==='对手')!,ball=b.actors.find(a=>a.kind==='ball')!;
  expect(b.frames).toHaveLength(1);expect(b.frames[0].poses[me.id]).toEqual(opening.me);expect(b.frames[0].poses[opp.id]).toEqual(opening.opponent);
  expect(b.smartRally?.hitterId).toBe(opening.server==='me'?me.id:opp.id);
  const landing:Point=opening.server==='me'?[.65,.3]:[.35,.7];await drag(page,b.frames[0].poses[ball.id],landing);
  const shot=await saved(page);expect(shot.frames[0].paths[0].kind).toBe('shot');closePoint(shot.frames[0].paths[0].to,landing);
  await current(page).getByRole('button',{name:'撤销',exact:true}).click();expect((await saved(page)).frames).toEqual(b.frames);
});}
test('two phases, repeat adjustment, undo, cancellation, playback and refresh',async({page})=>{
  await start(page);await drag(page,[.64,.96],[.7,.25]);
  const shot=(await saved(page)).frames[0].paths[0];
  await drag(page,[.64,.98],[.5,.78]); // optional early recovery
  let b=await saved(page);const me=b.actors.find(a=>a.label==='我方')!,opp=b.actors.find(a=>a.label==='对手')!;
  expect(b.smartRally?.phase).toBe('move');expect(b.frames[0].paths.find(p=>p.kind==='shot')).toEqual(shot);
  closePoint(b.frames[0].paths.find(p=>p.actorId===me.id)!.to,[.5,.78]);
  await drag(page,[.5,.78],[.56,.81]); // revise, not an extra beat
  b=await saved(page);expect(b.smartRally?.phase).toBe('move');expect(b.frames[0].paths.filter(p=>p.actorId===me.id)).toHaveLength(1);
  const beforeCancel=b;await drag(page,[.56,.81],[.7,.8],true);expect((await saved(page)).frames).toEqual(beforeCancel.frames);
  await drag(page,[.30,.07],[.7,.25]);await drag(page,[.7,.25],[.32,.75]);await drag(page,[.56,.81],[.32,.75]);
  b=await saved(page);expect(b.frames).toHaveLength(3);expect(b.smartRally?.phase).toBe('shot');
  const early=b.frames[0].paths.find(p=>p.actorId===me.id)!,late=b.frames[1].paths.find(p=>p.actorId===me.id)!;
  closePoint(early.from,[.64,.98]);closePoint(early.to,[.56,.81]);expect(late.from).toEqual(early.to);closePoint(late.to,[.32,.75]);
  expect(b.frames[0].paths.find(p=>p.actorId===opp.id)).toBeDefined();expect(b.frames[0].paths.find(p=>p.kind==='shot')).toEqual(shot);
  expect(getFramePose(b.frames[0],1)[me.id]).toEqual(getFramePose(b.frames[1],0)[me.id]);
  expect(getFramePose(b.frames[0],.5)[me.id]).not.toEqual(early.from);expect(getFramePose(b.frames[1],.5)[me.id]).not.toEqual(late.from);
  await expect(current(page).getByRole('button',{name:/^播放战术，2 拍/})).toBeVisible();
  await current(page).getByRole('button',{name:'撤销',exact:true}).click();expect((await saved(page)).frames[1].paths.filter(p=>p.actorId===me.id)).toEqual([]);
  await current(page).getByRole('button',{name:'重做',exact:true}).click();expect((await saved(page)).frames).toEqual(b.frames);
  await current(page).getByRole('button',{name:/^播放战术，2 拍/}).click();await expect(current(page).getByTestId('board-playback-dock')).toBeVisible();
  await page.screenshot({path:'output/two-stage-playback.png'});
  await page.reload();await page.getByRole('button',{name:`接着画${b.title}`,exact:true}).click();await expect(canvas(page)).toBeVisible();expect((await saved(page)).frames).toEqual(b.frames);
});
test('view rotation preserves document and makes real rotated dragging work',async({page})=>{
  await start(page);await drag(page,[.64,.96],[.7,.25]);const before=await saved(page);
  await current(page).getByRole('button',{name:'调换视角 180 度'}).click();await expect(canvas(page)).toHaveAttribute('data-rotated','true');expect(await saved(page)).toEqual(before);
  await drag(page,[.3,.07],[.7,.25]);await drag(page,[.7,.25],[.32,.75]);const after=await saved(page);
  expect(after.frames[1].paths[0].kind).toBe('shot');closePoint(after.frames[1].paths[0].from,[.7,.25]);closePoint(after.frames[1].paths[0].to,[.32,.75]);
  await current(page).getByRole('button',{name:'调换视角 180 度'}).click();await expect(canvas(page)).toHaveAttribute('data-rotated','false');expect(await saved(page)).toEqual(after);
});
test('template replacement warns, cancel preserves data, confirm is undoable',async({page})=>{
  await start(page);await drag(page,[.64,.96],[.7,.25]);const before=await saved(page);
  await openings(page);await page.getByRole('button',{name:'二区接发',exact:true}).click();await expect(page.getByRole('button',{name:'确认替换站位'})).toBeVisible();expect(await saved(page)).toEqual(before);
  await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('button',{name:'一区发球',exact:true})).toBeVisible();
  await page.screenshot({path:'output/opening-menu.png'});
  await page.getByRole('button',{name:'二区接发',exact:true}).click();await page.getByRole('button',{name:'确认替换站位'}).click();expect((await saved(page)).frames).toHaveLength(1);
  await current(page).getByRole('button',{name:'撤销',exact:true}).click();expect((await saved(page)).frames).toEqual(before.frames);
});
test('real touch input follows the finger, commits two phases and fits a narrow toolbar',async({page,browserName})=>{
  test.skip(browserName!=='chromium','CDP touch injection is Chromium-only; other gesture tests run in WebKit.');
  await page.setViewportSize({width:320,height:740});await start(page);
  const buttons=current(page).locator('.board-immersive-toolbar button');
  const rects=await buttons.evaluateAll(items=>items.map(e=>e.getBoundingClientRect().toJSON()));
  expect(rects.every(r=>r.x>=0&&r.right<=320)).toBe(true);
  for(let i=1;i<rects.length;i++)expect(rects[i].x).toBeGreaterThanOrEqual(rects[i-1].right-1);
  const cdp=await page.context().newCDPSession(page);
  async function touch(from:Point,to:Point,inspect=false){
    const a=await pixel(page,from),b=await pixel(page,to);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
    for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/10,y:a.y+(b.y-a.y)*i/10,id:1}]});
    if(inspect){
      await expect.poll(()=>canvas(page).evaluate((holder,{x,y})=>{
        const c=holder.querySelector('canvas')!,r=holder.getBoundingClientRect(),scale=c.width/holder.clientWidth;
        const rgba=c.getContext('2d')!.getImageData(Math.round((x-r.x)*scale),Math.round((y-r.y)*scale),1,1).data;
        return rgba[2]-rgba[0];
      },b)).toBeGreaterThan(50);
      await page.screenshot({path:'output/touch-drag.png'});
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await touch([.64,.96],[.7,.25]);await touch([.64,.98],[.5,.78],true);await touch([.3,.07],[.7,.25]);await touch([.7,.25],[.32,.75]);await touch([.5,.78],[.32,.75]);
  const b=await saved(page),me=b.actors.find(a=>a.label==='我方')!;
  expect(b.frames[0].paths.find(p=>p.actorId===me.id)).toBeDefined();expect(b.frames[1].paths.find(p=>p.actorId===me.id)).toBeDefined();
  await cdp.detach();
});
