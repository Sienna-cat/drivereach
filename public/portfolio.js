const staticMode = document.documentElement.dataset.hosting === 'static';
try {
  const [baseline, report, holdout] = await Promise.all(['baseline','verified-report','first-holdout'].map(async name => {
    const response = await fetch(staticMode ? `./${name}.json` : `/api/${name}`);
    if (!response.ok) throw new Error('报告未载入');
    return response.json();
  }));
  document.querySelector('#baselineScore').textContent = `${baseline.passed} / ${baseline.total}`;
  const dev = report.results.filter(r => r.split === 'development');
  document.querySelector('#developmentScore').textContent = `${dev.filter(r => r.pass).length} / ${dev.length}`;
  document.querySelector('#holdoutScore').textContent = `${holdout.passed} / ${holdout.total}`;
  const failures = report.results.filter(r => !r.pass);
  document.querySelector('#failureDetails').textContent = failures.length
    ? `${failures.length} 个场景未通过：${failures.map(r => `${r.id}「${r.name}」`).join('、')}。可在逐例报告中查看输入、预期与实际输出。`
    : '本组规则场景全部通过，可下载逐例报告查看处理结果。';
  if (staticMode) document.querySelector('[download="drivereach-verified-report.json"]').href = './verified-report.json';
} catch {
  document.querySelector('#failureDetails').textContent = '未能读取评测报告，请刷新重试。';
}
