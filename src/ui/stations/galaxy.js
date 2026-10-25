// ============================================================
// 第十一章观测台「星系分类台」：先当分类员，再训练分类器
// 第一关：亲手给 12 个（程序生成的「卡通」）星系分类，看自己的混淆矩阵（行 = 真实、列 = 预测，sg18）。
// 第二关：选 1–2 个特征 + k，在训练集上 fit、在测试集上 predict（sg5 / pj7），
//        看准确率与每类召回——稀有的不规则星系只占 6%：准确率很高、稀有类却一个都认不出（pj16）。
// 星系图像由特征参数画出（颜色 g−r / 集中度 / 椭率），真实巡天图像的再分发许可待核实，暂不使用。
// 键盘：第一关 1 / 2 / 3 选类别 · 第二关 1 / 2 / 3 开关特征、K 换 k、空格 fit + predict · Esc 离开
// ============================================================
import { seeded } from '../../core/observatory.js';
import {
  GALAXY, CLASS_IDS, makeGalaxyData, confusionMatrix, classMetrics, evaluateClassifier,
} from '../../core/stations.js';
import { matrixTable, pct } from './shared.js';

const NAMES = GALAXY.classes.map((c) => c.name);
const BLUE = [150, 200, 255];
const ORANGE = [255, 186, 112];

/** 颜色特征 g−r → 显示色：越大越红（椭圆星系的老年星族），越小越蓝（旋涡 / 不规则的年轻星族） */
function tint(color, alpha) {
  const t = Math.min(1, Math.max(0, (color - 0.35) / 0.6));
  const c = BLUE.map((b, i) => Math.round(b + (ORANGE[i] - b) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

/** 按特征画一个星系（只读特征与外观种子，确定性） */
export function drawGalaxy(ctx, g, size) {
  const rand = seeded(g.look + 1);
  const cx = size / 2, cy = size / 2, R = size * 0.36;
  ctx.fillStyle = '#16121f';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 18; i++) {           // 背景星点
    ctx.fillStyle = `rgba(232,227,245,${0.15 + rand() * 0.35})`;
    ctx.fillRect(rand() * size, rand() * size, 1.2, 1.2);
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((g.angle * Math.PI) / 180);
  ctx.scale(1, 1 - g.ell * 0.9);
  const blob = (x, y, r, inner, outer) => {
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  if (g.cls === 'elliptical') {
    // 光滑的椭球：集中度越高，亮核越小越亮
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    grd.addColorStop(0, 'rgba(255,250,235,1)');
    grd.addColorStop(Math.max(0.05, (1 - g.conc) * 0.55), tint(g.color, 0.9));
    grd.addColorStop(1, tint(g.color, 0));
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  } else if (g.cls === 'spiral') {
    blob(0, 0, R, tint(g.color, 0.35), tint(g.color, 0));                      // 盘
    const phase = rand() * Math.PI * 2;
    for (let a = 0; a < g.arms; a++) {                                          // 对数螺旋旋臂
      for (let t = 0; t < 1; t += 0.012) {
        const th = t * 3.2 * Math.PI + phase + (a * 2 * Math.PI) / g.arms;
        const r = R * 0.12 * Math.exp(t * 2.05);
        const x = r * Math.cos(th) + (rand() - 0.5) * R * 0.08;
        const y = r * Math.sin(th) + (rand() - 0.5) * R * 0.08;
        blob(x, y, R * (0.07 + 0.05 * (1 - t)), tint(g.color - 0.05, 0.55), tint(g.color, 0));
      }
    }
    blob(0, 0, R * (0.14 + 0.22 * g.conc), 'rgba(255,248,225,1)', tint(g.color + 0.15, 0)); // 核球
  } else {
    // 不规则：几团零散的亮块，没有明显的核（集中度低）
    const n = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const ang = rand() * Math.PI * 2, d = R * (0.15 + rand() * 0.6);
      blob(Math.cos(ang) * d, Math.sin(ang) * d, R * (0.16 + rand() * 0.2), tint(g.color - 0.1, 0.85), tint(g.color, 0));
    }
  }
  ctx.restore();
}

export function createGalaxy(ov) {
  let data = null;
  let stage = 1;
  let idx = 0;
  let labels = [];
  let feats = ['color'];
  let k = 15;
  let result = null;

  const q = (s) => ov.bodyEl.querySelector(s);

  // ---------- 第一关：你是分类员 ----------
  function renderStage1() {
    const done = idx >= data.label.length;
    q('#st-gx-s1').hidden = false;
    q('#st-gx-s2').hidden = true;
    if (!done) {
      const cv = q('#st-gx-big');
      drawGalaxy(cv.getContext('2d'), data.label[idx], cv.width);
      q('#st-gx-progress').textContent = `第 ${idx + 1} / ${data.label.length} 个`;
      q('#st-gx-label-btns').hidden = false;
      q('#st-gx-s1-result').innerHTML = '';
      ov._status('这是什么星系？旋涡有核球和旋臂、椭圆光滑偏红、不规则是一团团零散的亮块。', 'far');
      return;
    }
    q('#st-gx-label-btns').hidden = true;
    q('#st-gx-progress').textContent = '分类完成';
    const m = confusionMatrix(data.label.map((g) => g.cls), labels);
    const { acc } = classMetrics(m);
    q('#st-gx-s1-result').innerHTML = `${matrixTable(m, NAMES, { caption: `你的混淆矩阵（准确率 ${pct(acc)}）` })}
      <button class="btn primary" type="button" id="st-gx-next">进入第二关：训练分类器 <kbd>空格</kbd></button>`;
    q('#st-gx-next').addEventListener('click', toStage2);
    ov._status('对角线是你分对的，其余格子是「把谁认成了谁」（行 = 真实、列 = 预测，sg18）。'
      + '一个个看太慢了——下一关让机器来学。', 'near');
  }

  function label(c) {
    if (stage !== 1 || idx >= data.label.length) return;
    labels.push(CLASS_IDS[c]);
    idx++;
    renderStage1();
  }

  // ---------- 第二关：训练分类器 ----------
  function toStage2() {
    stage = 2;
    q('#st-gx-s1').hidden = true;
    q('#st-gx-s2').hidden = false;
    // 训练集样例：每类各两个
    const shelf = q('#st-gx-shelf');
    shelf.innerHTML = '';
    CLASS_IDS.forEach((cls, ci) => {
      data.train.filter((g) => g.cls === cls).slice(0, 2).forEach((g) => {
        const fig = document.createElement('figure');
        const cv = document.createElement('canvas');
        cv.width = 64; cv.height = 64;
        drawGalaxy(cv.getContext('2d'), g, 64);
        const cap = document.createElement('figcaption');
        cap.textContent = NAMES[ci];
        fig.append(cv, cap);
        shelf.appendChild(fig);
      });
    });
    renderStage2();
  }

  function toggleFeat(i) {
    const id = GALAXY.features[i].id;
    if (feats.includes(id)) {
      if (feats.length > 1) feats = feats.filter((f) => f !== id);
    } else {
      feats = [...feats, id].slice(-GALAXY.maxFeatures);
    }
    result = null;
    renderStage2();
  }

  function cycleK() {
    k = GALAXY.ks[(GALAXY.ks.indexOf(k) + 1) % GALAXY.ks.length];
    result = null;
    renderStage2();
  }

  function train() {
    if (stage !== 2) return;
    result = evaluateClassifier(data, feats, k);
    renderStage2();
  }

  function renderStage2() {
    GALAXY.features.forEach((f) => q(`[data-feat="${f.id}"]`).setAttribute('aria-pressed', String(feats.includes(f.id))));
    q('#st-gx-k').textContent = `k = ${k}`;
    const box = q('#st-gx-s2-result');
    if (!result) {
      box.innerHTML = '';
      if (!ov.solved) {
        ov._status(`用训练集 ${data.train.length} 个星系 fit、在没见过的测试集 ${data.test.length} 个上 predict（sg5 / pj7）。`
          + '选好特征和 k，按空格。', 'far');
      }
      return;
    }
    const rows = CLASS_IDS.map((id, i) => {
      const r = result.recall[id];
      return `<li><span>${NAMES[i]}</span><i style="width:${Math.round((r ?? 0) * 100)}%"></i><b>${r == null ? '—' : pct(r)}</b></li>`;
    }).join('');
    box.innerHTML = `
      <div class="st-row st-gx-res">
        ${matrixTable(result.matrix, NAMES, { caption: `测试集混淆矩阵（准确率 ${pct(result.acc)}）` })}
        <div class="st-gx-recall">
          <div class="st-gx-recall-title">每类召回（认出来的比例）</div>
          <ul>${rows}</ul>
          <div class="st-gx-base">对照：全猜「旋涡」的哑模型也有 ${pct(result.majorityAcc)} 准确率</div>
        </div>
      </div>`;
    if (ov.solved) return;
    if (result.pass) {
      ov._status(`过关！准确率 ${pct(result.acc)}，稀有的不规则星系召回 ${pct(result.rareRecall)}。`
        + '集中度把「一团团没有核」的不规则星系和旋涡分开了；只看准确率会被类别不平衡骗过去（pj16）。', 'ok');
      ov._solve({});
    } else if (result.acc >= GALAXY.pass.acc) {
      ov._status(`准确率 ${pct(result.acc)} 看着很高，可不规则星系只认出 ${pct(result.rareRecall ?? 0)}——`
        + `它只占 ${Math.round(GALAXY.mix.irregular * 100)}%，被多数类淹没了（pj16）。看混淆矩阵最后一行：换一个能把它分出来的特征，或者调小 k。`, 'near');
    } else {
      ov._status(`准确率 ${pct(result.acc)} 还不够（要 ≥ ${pct(GALAXY.pass.acc)}）。换个特征组合试试。`, 'far');
    }
  }

  return {
    hasHint: true,
    keys: '第一关 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 选类别 · 第二关 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 特征 · <kbd>K</kbd> 换 k · <kbd>空格</kbd> 训练 · <kbd>Esc</kbd> 离开',

    open() {
      data = makeGalaxyData(ov.attempt);
      stage = 1; idx = 0; labels = []; feats = ['color']; k = 15; result = null;
      ov.bodyEl.innerHTML = `
        <section id="st-gx-s1">
          <div class="st-row">
            <canvas class="st-gx-big" id="st-gx-big" width="220" height="220" role="img" aria-label="待分类的星系"></canvas>
            <div class="st-gx-side">
              <div class="st-gx-progress" id="st-gx-progress"></div>
              <div class="st-actions" id="st-gx-label-btns">
                ${GALAXY.classes.map((c, i) => `<button class="btn" type="button" data-label="${i}">${c.name} <kbd>${c.key}</kbd></button>`).join('')}
              </div>
              <div id="st-gx-s1-result"></div>
            </div>
          </div>
        </section>
        <section id="st-gx-s2" hidden>
          <div class="st-gx-shelf" id="st-gx-shelf" aria-label="训练集样例"></div>
          <div class="st-actions">
            ${GALAXY.features.map((f, i) => `<button class="btn" type="button" data-feat="${f.id}">${f.name} <kbd>${i + 1}</kbd></button>`).join('')}
            <button class="btn" type="button" id="st-gx-kbtn"><span id="st-gx-k"></span> <kbd>K</kbd></button>
            <button class="btn primary" type="button" id="st-gx-train">fit + predict <kbd>空格</kbd></button>
          </div>
          <div id="st-gx-s2-result"></div>
        </section>
        <p class="obs-hint" id="obs-hint" hidden>提示：k 近邻 = 找训练集里离它最近的 k 个星系投票（特征先按训练集标准化）。
          颜色能把偏红的椭圆星系分出来，可旋涡和不规则都偏蓝；不规则星系没有明显的核——哪个特征描述「核有多集中」？
          另外，k 太大时投票会被多数类淹没。评估只用测试集，调参用测试集等于泄题（pj7）。</p>`;
      ov.bodyEl.querySelectorAll('[data-label]').forEach((b) => b.addEventListener('click', () => label(Number(b.dataset.label))));
      ov.bodyEl.querySelectorAll('[data-feat]').forEach((b, i) => b.addEventListener('click', () => toggleFeat(i)));
      q('#st-gx-kbtn').addEventListener('click', cycleK);
      q('#st-gx-train').addEventListener('click', train);
      renderStage1();
    },

    tick() {},

    key(e) {
      const i = ['1', '2', '3'].indexOf(e.key);
      if (stage === 1) {
        if (i >= 0) { label(i); return true; }
        if (e.key === ' ' && idx >= data.label.length) { toStage2(); return true; }
        return false;
      }
      if (i >= 0) { toggleFeat(i); return true; }
      if (e.key === 'k' || e.key === 'K') { cycleK(); return true; }
      if (e.key === ' ') { train(); return true; }
      return false;
    },

    snapshot() {
      const m = idx >= data.label.length ? confusionMatrix(data.label.map((g) => g.cls), labels) : null;
      return {
        stage, index: idx, labels: [...labels],
        labelMatrix: m, labelAcc: m ? classMetrics(m).acc : null,
        feats: [...feats], k,
        result: result ? { acc: result.acc, rareRecall: result.rareRecall, recall: result.recall, matrix: result.matrix, pass: result.pass } : null,
      };
    },
  };
}
