// docs/story.md を会話の JSON（src/data/story）から作る。使い方: npm run story
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const data = (p) => JSON.parse(fs.readFileSync(path.join(root, 'src/data', p), 'utf8'));
const speakers = data('story/speakers.json');
const enemies = data('enemies.json').kinds;
const friendName = { momo: 'もも（うさぎ）', goro: 'ごろう（くま）', hosuke: 'ほうすけ（ふくろう）' };

const out = [];
out.push('# もりのまもりびと 物語の会話');
out.push('');
out.push('`src/data/story/stageN.json` から作った読み物用のまとめ。文章を直すときは JSON を直す。');
out.push('');
const lines = (ls) => ls.map((l) => `- ${speakers[l.who].icon} **${speakers[l.who].name}**「${l.text}」`);
for (let i = 1; i <= 8; i++) {
  const st = data(`stages/stage${i}.json`);
  const s = data(`story/stage${i}.json`);
  out.push(`## ステージ${i} ${st.name}`);
  out.push('');
  out.push('**はじまり**');
  out.push('');
  out.push(...lines(s.start));
  out.push('');
  if (s.mid) {
    const counts = {};
    for (const k of s.mid.extra || []) counts[k] = (counts[k] || 0) + 1;
    const extra = Object.entries(counts).map(([k, n]) => `${enemies[k].name}${n}体`);
    out.push(`**とちゅう（ウェーブ${s.mid.wave}）**${extra.length ? ` — おゆきちが ${extra.join('・')} を呼ぶ` : ''}`);
    out.push('');
    out.push(...lines(s.mid.lines));
    out.push('');
  }
  if (s.boss) {
    out.push('**ボスが来たとき**');
    out.push('');
    out.push(...lines(s.boss));
    out.push('');
  }
  out.push('**クリア**');
  out.push('');
  out.push(...lines(s.clear));
  out.push('');
  if (s.joins) {
    out.push(`→ ${friendName[s.joins]} が仲間になる`);
    out.push('');
  }
}
fs.writeFileSync(path.join(root, 'docs/story.md'), out.join('\n'));
