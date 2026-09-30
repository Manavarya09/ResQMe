import { visibleLoop, reduced } from '../lib/kit.js';

// Schematic units (not measured). Steps: [label, weight]
const JOBS = [
  { id: 'backend', name: 'backend', sub: 'Node 22 + PG 16', start: 0, dur: 100, steps: [['checkout', 1], ['setup-node', 1], ['npm ci', 2], ['jest + supertest', 5]] },
  { id: 'ai', name: 'ai-service', sub: 'Python 3.13', start: 0, dur: 70, steps: [['checkout', 1], ['setup-python', 1], ['pip install', 2], ['pytest', 3]] },
  { id: 'mobile', name: 'mobile', sub: 'Expo logic + bundle', start: 0, dur: 128, steps: [['checkout', 1], ['setup-node', 1], ['npm ci', 3], ['jest', 2], ['expo export android', 5]] },
  { id: 'docker', name: 'docker', sub: 'needs backend, ai', start: 100, dur: 56, steps: [['checkout', 1], ['build backend', 3], ['build ai', 2]] },
  { id: 'pages', name: 'pages', sub: 'site/** · separate', start: 0, dur: 40, steps: [['configure', 1], ['upload site/', 1], ['deploy', 2]] },
];
const SPAN = 160;

export default function ci(host) {
  host.innerHTML = '';
  const spans = [];
  JOBS.forEach((j) => {
    const row = document.createElement('div');
    row.className = 'ci-row';
    row.innerHTML = `<div class="nm">${j.name}<small>${j.sub}</small></div>`;
    const track = document.createElement('div');
    track.className = 'ci-track';
    const job = document.createElement('div');
    job.className = 'ci-job';
    job.style.left = `${(j.start / SPAN) * 100}%`;
    job.style.width = `${(j.dur / SPAN) * 100}%`;
    const total = j.steps.reduce((a, [, w]) => a + w, 0);
    let t = j.start;
    j.steps.forEach(([label, wgt]) => {
      const s = document.createElement('span');
      s.textContent = label;
      s.title = label;
      s.style.flexGrow = wgt;
      s.style.flexBasis = '0';
      const d = (wgt / total) * j.dur;
      spans.push({ el: s, t0: t, t1: t + d });
      t += d;
      job.appendChild(s);
    });
    track.appendChild(job);
    row.appendChild(track);
    host.appendChild(row);
  });
  const axis = document.createElement('div');
  axis.className = 'ci-axis';
  axis.innerHTML = '<span style="position:absolute;left:0;top:.2rem">push to main</span><span style="position:absolute;right:0;top:.2rem">images built</span>';
  host.appendChild(axis);
  // playhead spans the tracks column
  const head = document.createElement('div');
  head.className = 'ci-head';
  host.appendChild(head);

  function place(t) {
    const first = host.querySelector('.ci-track');
    const hb = host.getBoundingClientRect(), tb = first.getBoundingClientRect();
    const x = tb.left - hb.left + (t / SPAN) * tb.width;
    head.style.left = `${x}px`;
    head.style.top = `${first.offsetTop - 4}px`;
    head.style.height = `${axis.offsetTop - first.offsetTop + 4}px`;
    spans.forEach(({ el, t0, t1 }) => {
      el.classList.toggle('run', t >= t0 && t < t1);
      el.classList.toggle('ok', t >= t1);
    });
  }
  if (reduced()) { place(SPAN); return; }
  let t = 0;
  visibleLoop(host, (dt) => {
    t += dt * 20;
    if (t > SPAN + 40) t = 0;
    place(Math.min(t, SPAN));
  });
}
