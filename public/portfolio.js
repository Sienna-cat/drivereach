try {
  const [baseline, report] = await Promise.all(['/api/baseline','/api/verified-report'].map(async url => { const r=await fetch(url);if(!r.ok)return null;return r.json(); }));
  document.querySelector('#baselineScore').textContent=baseline?`${baseline.passed} / ${baseline.total}`:'尚无报告';
  if(report){const dev=report.results.filter(r=>r.split==='development'),holdout=report.results.filter(r=>r.split==='holdout');document.querySelector('#developmentScore').textContent=`${dev.filter(r=>r.pass).length} / ${dev.length}`;document.querySelector('#holdoutScore').textContent=`${holdout.filter(r=>r.pass).length} / ${holdout.length}`;const failures=report.results.filter(r=>!r.pass);document.querySelector('#failureDetails').textContent=failures.length?`${failures.length} 个场景未通过：${failures.map(r=>`${r.id}「${r.name}」`).join('、')}。当前规则词表覆盖有限，未覆盖的表达会保留缺失字段并继续询问；接入模型后需用新的独立场景验证。`:'此次合成场景全部通过；这不等于真实用户场景已被覆盖。';}
  else{document.querySelector('#developmentScore').textContent='未保存';document.querySelector('#holdoutScore').textContent='未保存';}
} catch { document.querySelector('#failureDetails').textContent='未能读取评测报告，请检查本地服务。'; }
