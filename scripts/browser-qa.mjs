import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseURL = process.env.DRIVEREACH_BASE_URL || 'http://127.0.0.1:4197';
const root = new URL('../evidence/',import.meta.url); await mkdir(new URL('screenshots/',root),{recursive:true});
const checks=[];const errors=[];const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1080},deviceScaleFactor:1});
await context.tracing.start({screenshots:true,snapshots:true});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,detail)=>checks.push({name,pass:true,detail});
const shot=async name=>page.screenshot({path:fileURLToPath(new URL(`screenshots/${name}.png`,root)),fullPage:true});
async function nav(view){await page.locator(`[data-view="${view}"]`).click();}
async function send(text){await page.locator('#turnText').fill(text);await page.locator('[aria-label="发送车主回复"]').click();await page.waitForFunction(t=>[...document.querySelectorAll('.message.user p')].some(p=>p.textContent===t),text);}
try{
  await page.request.post(`${baseURL}/api/reset`,{data:{}});
  await page.goto(baseURL);await page.waitForLoadState('networkidle');
  assert.match(await page.title(),/DriveReach/);await page.locator('.lead-row').first().waitFor();assert.equal(await page.locator('.lead-row').count(),10);
  check('页面身份与非空首屏',page.url());await shot('01-leads-desktop');
  await page.locator('#startButton').click();await page.locator('#turnText').waitFor();
  await send('丰田卡罗拉，2020年上牌，63000公里，两周内想卖，车在杭州，价格希望十万左右。');
  assert.match(await page.locator('[data-field="mileage"]').innerText(),/63,000/);
  await page.locator('[data-field="mileage"]').click();await page.locator('#evidenceDialog[open]').waitFor();assert.match(await page.locator('#evidenceContent').innerText(),/63000公里/);await shot('02-field-evidence');await page.locator('#evidenceContent [data-close]').click();
  check('新输入到字段证据','63000 公里已保存，原文可打开核对');
  await send('能不能帮我转人工报价？');await page.locator('#toggleAgents').click();await page.waitForFunction(()=>document.querySelector('.agent-state')?.textContent.includes('空闲坐席 0'));
  await page.locator('#handoffButton').click();await page.locator('#acceptButton').click();await page.waitForFunction(()=>document.querySelector('.handoff-result')?.textContent.includes('转接失败'));
  check('满载时转接失败','转接失败可见，未显示接管成功');
  await send('明天上午十点可以联系我。');await page.locator('#callbackButton').click();await page.locator('#callbackConfirmed').check();await page.locator('#callbackForm button[type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#callbackDialog').open);assert.match(await page.locator('.handoff-panel').innerText(),/已安排回拨/);
  await page.reload();await page.locator('#turnText').waitFor();assert.match(await page.locator('.handoff-panel').innerText(),/2026-11-20 10:00/);await shot('03-conversation-callback');
  check('确认回拨与刷新持久化','明确同意后创建，刷新仍显示时间');
  await nav('leads');await page.locator('[data-lead="lead-002"]').click();await page.locator('#startButton').click();await send('以后不要再联系我');
  assert.match(await page.locator('.handoff-panel').innerText(),/停止触达/);assert.equal(await page.locator('#turnText').isDisabled(),true);
  await nav('leads');await page.locator('[data-lead="lead-002"]').click();assert.equal(await page.locator('#startButton').isDisabled(),true);
  check('拒联阻断后续流程','对话结束、重新发起按钮禁用');
  await nav('operations');await page.locator('#dispatchForm button').click();await page.locator('.sim-numbers').waitFor();assert.match(await page.locator('.sim-numbers').innerText(),/新增拨号/);
  await page.locator('#evaluationButton').click();await page.locator('.eval-row:not(.header)').first().waitFor();assert.equal(await page.locator('.eval-row:not(.header)').count(),40);await shot('04-operations-desktop');
  check('调度与场景评测','调度有真实计算输出，40 条案例可见');
  const exportEvent=page.waitForEvent('download');await page.locator('#exportEvaluation').click();const exported=await exportEvent;assert.match(exported.suggestedFilename(),/evaluation/);check('评测 JSON 导出',exported.suggestedFilename());
  await page.goto(`${baseURL}/portfolio.html`);await page.waitForLoadState('networkidle');assert.match(await page.title(),/产品案例/);await page.locator('#holdoutScore').waitFor();assert.notEqual(await page.locator('#holdoutScore').innerText(),'读取中');await shot('05-portfolio-desktop');check('作品集证据呈现',await page.locator('#holdoutScore').innerText());
  await page.setViewportSize({width:390,height:844});await page.goto(baseURL);await page.waitForLoadState('networkidle');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('06-leads-mobile');
  await page.locator('[data-lead="lead-005"]').click();await page.waitForFunction(()=>location.hash==='#conversation',null,{timeout:3000});await page.locator('#startButton').click();await page.locator('#turnText').waitFor();await send('车在上海，价格还没想好');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('07-conversation-mobile');
  check('手机宽度主流程','390×844 选择线索、进入对话、提交新输入，无横向溢出');
  await page.goto(`${baseURL}/portfolio.html`);await page.waitForLoadState('networkidle');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('08-portfolio-mobile');
  assert.deepEqual(errors,[]);check('控制台与运行时健康','无 console error / pageerror；无框架错误覆盖层');
}catch(error){checks.push({name:'浏览器验收失败',pass:false,detail:error.message});await shot('qa-failure');process.exitCode=1;}
finally{const report={createdAt:new Date().toISOString(),browser:'Chromium headless (bundled Playwright)',browserPlugin:'not available',viewports:['1440×1080','390×844'],checks,errors};await writeFile(new URL('browser-qa.json',root),JSON.stringify(report,null,2));await context.tracing.stop({path:fileURLToPath(new URL('browser-trace.zip',root))});await browser.close();console.log(JSON.stringify(report,null,2));}
