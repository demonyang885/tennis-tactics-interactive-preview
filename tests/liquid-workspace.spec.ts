import {test,expect,type Page} from '@playwright/test';
import {getBoardGeometry} from '../src/board/render';
import {tactics} from '../src/content/library';
import {boardFromTactic} from '../src/board/adapters';
const KEY='tennis-tactics:board-drafts:v1';
const current=(p:Page)=>p.getByTestId('flow-current');
async function ready(p:Page){await expect(current(p)).toHaveCount(1);await expect(current(p).getByTestId('board-canvas')).toBeVisible();}
async function draw(p:Page,from:[number,number],to:[number,number]){const c=current(p).getByTestId('board-canvas'),m=await c.evaluate(e=>({w:e.clientWidth,h:e.clientHeight,r:e.getBoundingClientRect().toJSON()})),g=getBoardGeometry(m.w,m.h),a=g.toCanvas(from),b=g.toCanvas(to);await p.mouse.move(m.r.x+a[0],m.r.y+a[1]);await p.mouse.down();await p.mouse.move(m.r.x+b[0],m.r.y+b[1],{steps:8});await p.mouse.up();await expect(current(p).getByTestId('board-save-live')).toHaveText('画板已保存');}
async function docs(p:Page){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)??'{"boards":[]}').boards,KEY);}
test.use({viewport:{width:390,height:844},hasTouch:true});
test('serve and receive independently persist, reopen and keep drawings',async({page})=>{
 await page.goto('/');await ready(page);await draw(page,[.64,.96],[.7,.25]);const serve=(await docs(page))[0];
 await page.getByRole('group',{name:'发球／接发视角'}).getByRole('button',{name:'接发',exact:true}).tap();await ready(page);
 expect(await docs(page)).toHaveLength(1);await draw(page,[.36,.02],[.68,.75]);const boards=await docs(page),receive=boards.find((b:{id:string})=>b.id!==serve.id);expect(receive).toBeDefined();
 await page.getByRole('group',{name:'发球／接发视角'}).getByRole('button',{name:'发球',exact:true}).tap();await ready(page);
 await expect(page.getByRole('button',{name:'发球',exact:true})).toHaveAttribute('aria-pressed','true');
 expect((await docs(page)).find((b:{id:string})=>b.id===serve.id).frames).toEqual(serve.frames);
 await page.reload();await ready(page);await expect(page.getByRole('button',{name:'发球',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'接发',exact:true}).tap();await ready(page);await page.reload();await ready(page);
 await expect(page.getByRole('button',{name:'接发',exact:true})).toHaveAttribute('aria-pressed','true');
 expect((await docs(page)).find((b:{id:string})=>b.id===receive.id).frames).toEqual(receive.frames);
});
test('tactic sheet applies initial poses plus only first shot to a new board, preserving the old one',async({page})=>{
 await page.goto('/');await ready(page);await draw(page,[.64,.96],[.7,.25]);const original=(await docs(page))[0];
 await page.getByRole('navigation',{name:'主要页面'}).getByRole('button',{name:'找打法'}).tap();const sheet=page.getByRole('dialog',{name:'找打法',exact:true});await expect(sheet).toBeVisible();
 const tactic=tactics[0],expected=boardFromTactic(tactic).frames.find(f=>f.paths.some(p=>p.kind==='shot'))!;
 await sheet.getByRole('button',{name:`使用${tactic.name}的开局`,exact:true}).tap();await ready(page);
 const boards=await docs(page),chosen=boards.find((b:{id:string})=>b.id!==original.id);expect(boards).toHaveLength(2);expect(chosen.frames).toEqual([expected]);expect(boards.find((b:{id:string})=>b.id===original.id)).toEqual(original);
 await expect(current(page).getByRole('button',{name:/^播放战术，1 拍/})).toBeEnabled();
});
test('theme changes preserve canvas pixels and icon tabs keep meaningful accessible names',async({page})=>{
 await page.goto('/');await ready(page);const nav=page.getByRole('navigation',{name:'主要页面'});expect((await nav.innerText()).trim()).toBe('');
 for(const name of ['画板','找打法','画板库'])await expect(nav.getByRole('button',{name,exact:true})).toBeVisible();
 const canvas=current(page).getByTestId('board-canvas').locator('canvas');const pixels=await canvas.evaluate(e=>e.toDataURL());
 await page.emulateMedia({colorScheme:'dark'});await expect.poll(()=>page.locator('.board-editor').evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe('rgb(248, 250, 247)');
 expect(await canvas.evaluate(e=>e.toDataURL())).toBe(pixels);
 await page.emulateMedia({colorScheme:'light'});expect(await canvas.evaluate(e=>e.toDataURL())).toBe(pixels);
});
test('key beat survives reload and library tabs retain the dock position',async({page})=>{
 await page.goto('/');await ready(page);await draw(page,[.64,.96],[.7,.25]);
 await current(page).locator('[data-dock-expand]').tap();await current(page).getByRole('toolbar',{name:'常用操作'}).getByRole('button',{name:/^打开拍次/}).tap();
 await page.getByRole('button',{name:/^编辑第 1 拍/}).tap();await page.getByRole('button',{name:'标记关键拍',exact:true}).tap();
 await expect(page.getByRole('button',{name:'标记关键拍',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'完成',exact:true}).tap();await expect.poll(async()=>(await docs(page))[0].frames[0].label).toMatch(/^★ /);
 const saved=(await docs(page))[0];await page.reload();await ready(page);expect((await docs(page))[0].frames[0].label).toBe(saved.frames[0].label);
 const nav=page.getByRole('navigation',{name:'主要页面'}),before=await nav.boundingBox();await nav.getByRole('button',{name:'画板库',exact:true}).tap();
 await expect(current(page).locator('.board-library')).toBeVisible();await expect(nav.getByRole('button',{name:'画板库',exact:true})).toHaveAttribute('aria-current','page');
 await expect.poll(async()=>Math.abs((await nav.boundingBox())!.y-before!.y)).toBeLessThan(1);
 await nav.getByRole('button',{name:'找打法',exact:true}).tap();await expect(page.getByRole('dialog',{name:'找打法',exact:true})).toBeVisible();
 expect((await docs(page))[0].frames).toEqual(saved.frames);
});
