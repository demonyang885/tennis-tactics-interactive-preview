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
  await expect(canvas(page)).toBeVisible();
  await expect(current(page)).toHaveCount(1);
  await expect.poll(()=>current(page).evaluate(e=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m41))).toBeLessThan(1);
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
async function quick(page:Page){const toggle=current(page).locator('[data-dock-expand]');await expect(toggle).toBeVisible();if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();}
async function menu(page:Page){await quick(page);await current(page).getByRole('button',{name:/^打开.*的画板菜单$/}).click();}
async function enableTwoStage(page:Page){await menu(page);const toggle=page.getByRole('switch',{name:'二段跑位，已关'});await expect(toggle).not.toBeChecked();await toggle.click();await expect(page.getByRole('switch',{name:'二段跑位，已开'})).toBeChecked();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);}
async function openings(page:Page){await menu(page);const dialog=page.getByRole('dialog',{name:'画板菜单',exact:true});for(const opening of OPENINGS)await expect(dialog.getByRole('button',{name:opening.label,exact:true})).toBeInViewport();}
function closePoint(actual:Point,expected:Point){expect(actual[0]).toBeCloseTo(expected[0],2);expect(actual[1]).toBeCloseTo(expected[1],2);}
for(const opening of OPENINGS){test(`opening ${opening.id}: roles, ball, first shot and undo`,async({page})=>{
  await start(page);await openings(page);await page.getByRole('button',{name:opening.label,exact:true}).click();
  const b=await saved(page),me=b.actors.find(a=>a.label==='我方')!,opp=b.actors.find(a=>a.label==='对手')!,ball=b.actors.find(a=>a.kind==='ball')!;
  expect(b.frames).toHaveLength(1);expect(b.frames[0].poses[me.id]).toEqual(opening.me);expect(b.frames[0].poses[opp.id]).toEqual(opening.opponent);
  expect(b.smartRally?.hitterId).toBe(opening.server==='me'?me.id:opp.id);
  const landing:Point=opening.server==='me'?[.65,.3]:[.35,.7];await drag(page,b.frames[0].poses[ball.id],landing);
  const shot=await saved(page);expect(shot.frames[0].paths[0].kind).toBe('shot');closePoint(shot.frames[0].paths[0].to,landing);
  await quick(page);await current(page).getByRole('button',{name:'撤销',exact:true}).click();expect((await saved(page)).frames).toEqual(b.frames);
});}
test('recovery waits for the return before reception, with undo, cancellation, playback and refresh',async({page})=>{
  await start(page);await enableTwoStage(page);await drag(page,[.64,.96],[.7,.25]);
  const shot=(await saved(page)).frames[0].paths[0];
  await drag(page,[.64,.98],[.5,.78]); // optional early recovery
  let b=await saved(page);const me=b.actors.find(a=>a.label==='我方')!,opp=b.actors.find(a=>a.label==='对手')!;
  expect(b.smartRally?.phase).toBe('move');expect(b.frames[0].paths.find(p=>p.kind==='shot')).toEqual(shot);
  closePoint(b.frames[0].paths.find(p=>p.actorId===me.id)!.to,[.5,.78]);
  const beforeReturn=b;await drag(page,[.5,.78],[.56,.81]);
  await expect(current(page).getByRole('alert')).toContainText('先画对方回球');expect((await saved(page)).frames).toEqual(beforeReturn.frames);
  await page.screenshot({path:'output/timing-07-guard.png'});await current(page).getByRole('button',{name:'关闭提示'}).click();
  await drag(page,[.30,.07],[.7,.25]);await drag(page,[.7,.25],[.56,.81]);
  const beforeCancel=await saved(page);await drag(page,[.5,.78],[.7,.8],true);expect((await saved(page)).frames).toEqual(beforeCancel.frames);
  await drag(page,[.5,.78],[.56,.81]);
  b=await saved(page);expect(b.frames).toHaveLength(3);expect(b.smartRally?.phase).toBe('shot');
  const early=b.frames[0].paths.find(p=>p.actorId===me.id)!,late=b.frames[1].paths.find(p=>p.actorId===me.id)!;
  closePoint(early.from,[.64,.98]);closePoint(early.to,[.5,.78]);expect(late.from).toEqual(early.to);closePoint(late.to,[.56,.81]);
  expect(b.frames[0].paths.find(p=>p.actorId===opp.id)).toBeDefined();expect(b.frames[0].paths.find(p=>p.kind==='shot')).toEqual(shot);
  expect(getFramePose(b.frames[0],1)[me.id]).toEqual(getFramePose(b.frames[1],0)[me.id]);
  expect(getFramePose(b.frames[0],.5)[me.id]).not.toEqual(early.from);expect(getFramePose(b.frames[1],.5)[me.id]).not.toEqual(late.from);
  await expect(current(page).getByRole('button',{name:/^播放战术，2 拍/})).toBeVisible();
  await quick(page);await current(page).getByRole('button',{name:'撤销',exact:true}).click();expect((await saved(page)).frames[1].paths.filter(p=>p.kind==='move')).toEqual([]);
  await quick(page);await current(page).getByRole('button',{name:'重做',exact:true}).click();expect((await saved(page)).frames).toEqual(b.frames);
  await current(page).getByRole('button',{name:/^播放战术，2 拍/}).click();await expect(current(page).getByTestId('board-playback-dock')).toBeVisible();
  await page.screenshot({path:'output/two-stage-playback.png'});
  await page.reload();await expect(canvas(page)).toBeVisible();expect((await saved(page)).frames).toEqual(b.frames);
});
test('view rotation preserves document and makes real rotated dragging work',async({page})=>{
  await start(page);await drag(page,[.64,.96],[.7,.25]);const before=await saved(page);
  await quick(page);await current(page).getByRole('button',{name:'调换视角 180 度'}).click();await expect(canvas(page)).toHaveAttribute('data-rotated','true');expect(await saved(page)).toEqual(before);
  await drag(page,[.3,.07],[.7,.25]);await drag(page,[.7,.25],[.32,.75]);const after=await saved(page);
  expect(after.frames[1].paths[0].kind).toBe('shot');closePoint(after.frames[1].paths[0].from,[.7,.25]);closePoint(after.frames[1].paths[0].to,[.32,.75]);
  await quick(page);await current(page).getByRole('button',{name:'调换视角 180 度'}).click();await expect(canvas(page)).toHaveAttribute('data-rotated','false');expect(await saved(page)).toEqual(after);
});
test('template replacement warns, cancel preserves data, confirm is undoable',async({page})=>{
  await start(page);await drag(page,[.64,.96],[.7,.25]);const before=await saved(page);
  await openings(page);await page.getByRole('button',{name:'二区接发',exact:true}).click();await expect(page.getByRole('button',{name:'确认替换站位'})).toBeVisible();expect(await saved(page)).toEqual(before);
  await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('button',{name:'一区发球',exact:true})).toBeVisible();
  await page.screenshot({path:'output/opening-menu.png'});
  await page.getByRole('button',{name:'二区接发',exact:true}).click();await page.getByRole('button',{name:'确认替换站位'}).click();expect((await saved(page)).frames).toHaveLength(1);
  await quick(page);await current(page).getByRole('button',{name:'撤销',exact:true}).click();expect((await saved(page)).frames).toEqual(before.frames);
});
test('real touch input follows the finger, commits two phases and fits a narrow toolbar',async({page,browserName})=>{
  test.skip(browserName!=='chromium','CDP touch injection is Chromium-only; other gesture tests run in WebKit.');
  await page.setViewportSize({width:320,height:740});await start(page);await enableTwoStage(page);
  const buttons=current(page).locator('.board-edit-dock button');
  const rects=await buttons.evaluateAll(items=>items.map(e=>e.getBoundingClientRect().toJSON()));
  expect(rects).toHaveLength(5);
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
  await touch([.64,.96],[.7,.25]);await touch([.64,.98],[.5,.78],true);await touch([.3,.07],[.45,.12]);await touch([.45,.12],[.7,.25]);await touch([.7,.25],[.32,.75]);await touch([.5,.78],[.32,.75]);
  const b=await saved(page),me=b.actors.find(a=>a.label==='我方')!;
  expect(b.frames[0].paths.find(p=>p.actorId===me.id)).toBeDefined();expect(b.frames[1].paths.find(p=>p.actorId===me.id)).toBeDefined();
  const receiver=b.actors.find(a=>a.label==='对手')!;closePoint(b.frames[0].paths.find(p=>p.actorId===receiver.id)!.via!,[.45,.12]);
  await cdp.detach();
});
test('workspace opens directly with icon-only glass dock and no saved blank; library returns to board',async({page})=>{
  await start(page);
  await expect(page.locator('.home-plan-primary')).toHaveCount(0);
  await expect(current(page).locator('.board-fixed-header button')).toHaveCount(0);
  await expect(current(page).getByTestId('movement-guide')).toHaveText('拖球发球');
  await expect(current(page).getByTestId('movement-guide').getByRole('button')).toHaveCount(0);
  const dock=current(page).getByRole('navigation',{name:'画板编辑工具'});
  expect((await dock.innerText()).trim()).toBe('');
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),KEY)).toBeNull();
  const before=await canvas(page).boundingBox();await quick(page);
  expect(await canvas(page).boundingBox()).toEqual(before);
  await expect(current(page).getByRole('toolbar',{name:'常用操作'})).toBeVisible();
  await current(page).getByRole('button',{name:'我的画板',exact:true}).click();
  await expect(current(page).locator('.board-library')).toBeVisible();
  await page.getByRole('button',{name:'返回上一页',exact:true}).click();
  await expect(canvas(page)).toBeVisible();
  await expect(current(page)).toHaveCount(1);
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),KEY)).toBeNull();
});
test('object hints follow the receiver and rotation; independent preference survives reload',async({page})=>{
  await start(page);await drag(page,[.64,.96],[.7,.25]);const b=await saved(page);
  const receiver=b.actors.find(a=>a.label==='对手')!;
  const hint=current(page).getByTestId('movement-guide');
  await expect(hint).toHaveAttribute('data-actor-id',receiver.id);
  await expect(hint).toHaveText('拖动接球');
  const before=await hint.boundingBox();await quick(page);await current(page).getByRole('button',{name:'调换视角 180 度'}).click();
  const after=await hint.boundingBox();expect(after!.y).toBeGreaterThan(before!.y+150);
  expect(await hint.evaluate(e=>getComputedStyle(e).pointerEvents)).toBe('none');
  await menu(page);await page.getByRole('switch',{name:'操作提示，已开'}).click();
  await page.getByRole('switch',{name:'二段跑位，已关'}).click();await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
  await page.reload();await expect(canvas(page)).toBeVisible();
  await expect(hint).toHaveCount(0);await menu(page);
  await expect(page.getByRole('switch',{name:'操作提示，已关'})).not.toBeChecked();
  await expect(page.getByRole('switch',{name:'二段跑位，已开'})).toBeChecked();
  await page.getByRole('switch',{name:'操作提示，已关'}).click();await page.keyboard.press('Escape');
  await expect(hint).toBeVisible();expect((await saved(page)).frames).toEqual(b.frames);
  await expect(current(page).getByRole('button',{name:'展开常用操作'})).toBeFocused();
});
test('movement mode defaults to single, guards early recovery and preserves routes when switched off',async({page})=>{
  await start(page);await menu(page);
  await expect(page.getByRole('switch',{name:'二段跑位，已关'})).not.toBeChecked();await page.keyboard.press('Escape');
  await drag(page,[.64,.96],[.7,.25]);const initial=await saved(page);
  await drag(page,[.64,.98],[.5,.78]);await expect(current(page).getByRole('alert')).toContainText('当前为一段跑位');
  expect(await saved(page)).toEqual(initial);
  await enableTwoStage(page);await drag(page,[.64,.98],[.5,.78]);const early=await saved(page);
  expect(early.frames[0].paths.filter(p=>p.kind==='move')).toHaveLength(1);
  await page.reload();await expect(canvas(page)).toBeVisible();
  await menu(page);await expect(page.getByRole('switch',{name:'二段跑位，已开'})).toBeChecked();
  await page.getByRole('switch',{name:'二段跑位，已开'}).click();await expect(page.getByRole('switch',{name:'二段跑位，已关'})).not.toBeChecked();
  expect((await saved(page)).frames).toEqual(early.frames);await page.keyboard.press('Escape');
  await page.reload();await expect(canvas(page)).toBeVisible();
  await menu(page);await expect(page.getByRole('switch',{name:'二段跑位，已关'})).not.toBeChecked();await page.keyboard.press('Escape');
  await drag(page,[.3,.07],[.7,.25]);await drag(page,[.7,.25],[.32,.75]);await drag(page,[.5,.78],[.32,.75]);
  const final=await saved(page);expect(final.frames).toHaveLength(3);
  expect(final.frames[0].paths.find(p=>p.id===early.frames[0].paths.find(p=>p.kind==='move')!.id)).toEqual(early.frames[0].paths.find(p=>p.kind==='move'));
  expect(final.frames[1].paths.map(p=>p.kind).sort()).toEqual(['move','shot']);
  await expect(current(page).getByRole('button',{name:/^播放战术，2 拍/})).toBeEnabled();
});
test('enabling two-stage after leaving the drawing tool actually resumes route drawing',async({page})=>{
  await start(page);await drag(page,[.64,.96],[.7,.25]);const initial=await saved(page);
  await current(page).getByRole('button',{name:'添加对象',exact:true}).click();
  await page.getByRole('button',{name:'关闭添加面板',exact:true}).click();
  await enableTwoStage(page);
  await drag(page,[.64,.98],[.5,.78]);
  const after=await saved(page),me=after.actors.find(actor=>actor.label==='我方')!;
  expect(after.frames[0].poses[me.id]).toEqual(initial.frames[0].poses[me.id]);
  expect(after.frames[0].paths.find(path=>path.actorId===me.id&&path.kind==='move')).toBeDefined();
  expect(after.frames[0].paths.find(path=>path.kind==='shot')).toEqual(initial.frames[0].paths[0]);
});
test('receiving turn survives refresh, JSON, cancellation and undo without adding a beat',async({page})=>{
  await start(page);await enableTwoStage(page);await drag(page,[.64,.96],[.7,.25]);await drag(page,[.3,.07],[.45,.12]);
  const first=await saved(page),receiver=first.actors.find(a=>a.label==='对手')!;
  await expect(current(page).getByTestId('movement-guide')).toContainText('② 变向接球');
  await drag(page,[.45,.12],[.7,.25],true);expect((await saved(page)).frames).toEqual(first.frames);
  await drag(page,[.45,.12],[.7,.25]);const b=await saved(page),route=b.frames[0].paths.find(p=>p.actorId===receiver.id)!;
  expect(b.frames).toHaveLength(2);expect(route.via).toEqual(first.frames[0].paths.find(p=>p.actorId===receiver.id)!.to);
  await expect(current(page).getByRole('button',{name:/^播放战术，1 拍/})).toBeEnabled();
  const {parseBoardJSON}=await import('../src/board/validate');expect(parseBoardJSON(JSON.stringify(b))).toEqual({ok:true,value:b});
  await quick(page);await current(page).getByRole('button',{name:'撤销',exact:true}).click();expect((await saved(page)).frames).toEqual(first.frames);
  await quick(page);await current(page).getByRole('button',{name:'重做',exact:true}).click();expect((await saved(page)).frames).toEqual(b.frames);
  await page.reload();await expect(canvas(page)).toBeVisible();
  expect((await saved(page)).frames).toEqual(b.frames);
  await menu(page);await page.getByRole('switch',{name:'二段跑位，已开'}).click();await page.keyboard.press('Escape');
  expect((await saved(page)).frames).toEqual(b.frames);
  await drag(page,[.7,.25],[.25,.65]);const continued=await saved(page);
  expect(continued.frames[0].paths.find(p=>p.actorId===receiver.id)).toEqual(route);
  await expect(current(page).getByRole('button',{name:/^播放战术，2 拍/})).toBeEnabled();
});

test('receiver changes direction within the serve flight while server recovers, then follows the return',async({page})=>{
  await start(page);await enableTwoStage(page);await menu(page);await expect(page.getByRole('switch',{name:'二段跑位，已开'})).toBeInViewport();await expect.poll(()=>page.getByRole('dialog',{name:'画板菜单',exact:true}).evaluate(e=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m42))).toBeLessThan(1);await page.screenshot({path:'output/timing-01-menu.png'});await page.keyboard.press('Escape');
  await drag(page,[.64,.96],[.7,.25]);await page.screenshot({path:'output/timing-02-serve.png'});
  await drag(page,[.3,.07],[.45,.12]);const reaction=await saved(page);
  await page.screenshot({path:'output/timing-03-reaction.png'});
  await drag(page,[.45,.12],[.7,.25]);const interception=await saved(page);
  await page.screenshot({path:'output/timing-04-intercept.png'});
  const receiver=interception.actors.find(a=>a.label==='对手')!,server=interception.actors.find(a=>a.label==='我方')!;
  const route=interception.frames[0].paths.find(p=>p.actorId===receiver.id)!;
  expect(route.via).toEqual(reaction.frames[0].paths.find(p=>p.actorId===receiver.id)!.to);
  closePoint(route.from,[.3,.07]);closePoint(route.to,[.7,.25]);expect(interception.frames).toHaveLength(2);
  await drag(page,[.64,.98],[.5,.78]);const recovered=await saved(page);
  await page.screenshot({path:'output/timing-05-simultaneous.png'});
  expect(recovered.frames[0].paths.find(p=>p.actorId===receiver.id)).toEqual(route);
  expect(getFramePose(recovered.frames[0],.25)[server.id]).not.toEqual(recovered.frames[0].poses[server.id]);
  await drag(page,[.7,.25],[.24,.7]);await drag(page,[.5,.78],[.24,.7]);const returned=await saved(page);
  expect(returned.frames[0].paths).toEqual(recovered.frames[0].paths);
  expect(returned.frames[1].paths.find(p=>p.actorId===server.id)?.from).toEqual(recovered.frames[0].paths.find(p=>p.actorId===server.id)!.to);
  await expect(current(page).getByRole('button',{name:/^播放战术，2 拍/})).toBeEnabled();
  await page.screenshot({path:'output/timing-06-return.png'});
});

test('receiving opening and rotated turn handles preserve each leg independently',async({page})=>{
  await start(page);await enableTwoStage(page);await openings(page);await page.getByRole('button',{name:'二区接发',exact:true}).click();
  let b=await saved(page);const me=b.actors.find(a=>a.label==='我方')!,ball=b.actors.find(a=>a.kind==='ball')!;
  await quick(page);await current(page).getByRole('button',{name:'调换视角 180 度'}).click();
  await drag(page,b.frames[0].poses[ball.id],[.25,.75]);
  await expect(current(page).getByTestId('movement-guide')).toContainText('① 先调整');
  await drag(page,b.frames[0].poses[me.id],[.5,.88]);await drag(page,[.5,.88],[.25,.75]);
  b=await saved(page);const route=b.frames[0].paths.find(p=>p.actorId===me.id)!;closePoint(route.via!,[.5,.88]);
  // A deliberate turn-handle drag adjusts the first leg, keeping the interception point.
  await drag(page,route.via!,[.58,.85]);const changed=await saved(page),edited=changed.frames[0].paths.find(p=>p.actorId===me.id)!;
  closePoint(edited.via!,[.58,.85]);expect(edited.to).toEqual(route.to);expect(edited.from).toEqual(route.from);
  await quick(page);await current(page).getByRole('button',{name:'撤销',exact:true}).click();expect((await saved(page)).frames).toEqual(b.frames);
  // After undo, select the route deliberately before adjusting its final endpoint.
  const at=await pixel(page,route.via!);await page.mouse.click(at.x,at.y);
  await drag(page,route.to,[.2,.7]);const final=await saved(page),last=final.frames[0].paths.find(p=>p.actorId===me.id)!;
  expect(last.via).toEqual(route.via);closePoint(last.to,[.2,.7]);expect(final.frames).toHaveLength(2);
});
