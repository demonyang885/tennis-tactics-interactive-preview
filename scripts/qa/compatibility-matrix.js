async (page) => {
  const results=[];
  for (const [name,width,height] of [['iphone-se',375,667],['iphone',390,844],['iphone-max',430,932],['iphone-landscape',844,390],['ipad',768,1024],['ipad-air',820,1180],['ipad-landscape',1024,768],['ipad-air-landscape',1180,820]]) {
    const context=await page.context().browser().newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:2});
    const p=await context.newPage();p.setDefaultTimeout(5000); const errors=[];p.on('pageerror',e=>errors.push(e.message));
    try {
      await p.goto('http://127.0.0.1:4176');
      await p.getByRole('button',{name:'画第一拍',exact:true}).waitFor();
      const home=await p.evaluate(()=>({width:document.querySelector('.device-screen').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth}));
      await p.screenshot({path:`output/playwright/compat-20260919/${name}-home.png`});
      await p.getByRole('button',{name:'画第一拍',exact:true}).tap();
      await p.getByTestId('board-canvas').waitFor();await p.waitForTimeout(700);
      const board=await p.getByTestId('board-canvas').boundingBox();
      const geometry=await p.evaluate(async()=>{const {getBoardGeometry}=await import('/src/board/render.ts');const b=document.querySelector('[data-testid="board-canvas"]').getBoundingClientRect();return getBoardGeometry(b.width,b.height).court;});
      await p.mouse.move(board.x+geometry.x+geometry.width*.64,board.y+geometry.y+geometry.height*.96);
      await p.mouse.down();await p.mouse.move(board.x+geometry.x+geometry.width*.35,board.y+geometry.y+geometry.height*.25,{steps:15});await p.waitForTimeout(1100);await p.mouse.up();
      await p.waitForTimeout(300);
      await p.getByRole('button',{name:/^播放战术，/}).tap();
      await p.waitForTimeout(200);
      const progressed=Number(await p.getByRole('slider',{name:'画板播放进度'}).inputValue())>0;
      await p.setViewportSize({width:height,height:width});await p.waitForTimeout(150);
      const rotated=await p.evaluate(()=>document.querySelector('.device-screen').getBoundingClientRect().width===innerWidth);
      await p.setViewportSize({width,height});
      await p.getByRole('button',{name:'继续修改',exact:true}).tap();
      await p.screenshot({path:`output/playwright/compat-20260919/${name}-board.png`});
      await p.getByRole('button',{name:'打开我的战术板的画板菜单'}).tap();await p.waitForTimeout(450);
      const menu=await p.getByRole('dialog').boundingBox();
      await p.getByRole('button',{name:'红土',exact:true}).tap();
      await p.getByRole('button',{name:'打开区域名称',exact:true}).tap();
      await p.getByText('修改名称',{exact:true}).tap();
      await p.getByRole('textbox',{name:'画板名称'}).fill(`兼容-${name}`);
      await p.getByRole('button',{name:'完成',exact:true}).tap();await p.waitForTimeout(500);
      await p.evaluate(()=>{
        window.compatFrames=[];window.compatRecording=true;
        const tick=()=>{if(!window.compatRecording)return;const el=document.querySelector('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting)');if(el){const b=el.getBoundingClientRect();window.compatFrames.push({x:b.x,width:b.width,viewport:innerWidth});}requestAnimationFrame(tick);};requestAnimationFrame(tick);
      });
      await p.getByRole('button',{name:'返回上一页',exact:true}).tap();await p.waitForTimeout(1100);
      const returned=await p.evaluate(()=>{window.compatRecording=false;return {badFrames:window.compatFrames.filter(f=>Math.abs(f.x)>1||Math.abs(f.width-f.viewport)>1),immersive:document.querySelector('.phone-stage').dataset.boardImmersive,storage:localStorage.getItem('tennis-tactics:board-drafts:v1')};});
      await p.reload();await p.getByRole('button',{name:`接着画兼容-${name}`,exact:true}).waitFor();
      results.push({name,home,progressed,rotated,menuWithinLimit:menu.height<=height*.625+1,returnBadFrames:returned.badFrames.length,persisted:returned.storage.includes(`兼容-${name}`),shots:JSON.parse(returned.storage).boards[0].frames.flatMap(f=>f.paths).length,errors});
    } catch(e) { results.push({name,error:e.message,errors}); }
    finally {await context.close();}
  }
  return results;
}
