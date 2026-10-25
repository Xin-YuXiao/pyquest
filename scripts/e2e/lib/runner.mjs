// ============================================================
// 章节端到端测试 · 共享运行器（runChapterE2E）
//
// 各章脚本（scripts/e2e-chN.mjs）只声明章节差异（labels + steps），
// 完整流程与全部断言在此统一执行，保证各章测试行为一致：
//   新游戏 → gotoChapter 跳章 → 集碎片 → 封印门（不足/集齐）→ 进巢穴 →
//   祝福符文 → BOSS 符文破盾 → 挥剑命中（蛇：断尾两击）→ 击败通关 →
//   存档 → 下一章衔接（ch3：抽题/世界地图）→ 刷新续玩
//
// 交互路径保持真实：答题走真实 DOM 点击（选项 → 确认 → 反馈 → 领取），
// 开门/开符文走真实键盘 E，攻击走真实键盘 J；
// 作弊只通过 window.__PYQUEST__ 语义动作（见 src/core/seam.js）：
//   gotoChapter / teleport / godmode / clearMinions / pinBoss / slayBoss / setShards，
//   状态读取一律走只读快照 state()。
//
// 调试：E2E_TRACE=1 时打印每次符文开面板尝试与答错现场（默认关闭，不影响断言）。
// 稳定性护栏见 evalRetry / quizClick / click（状态校验 + 有界重试），仅测试侧。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../../../src/data/chapters.js';

export async function runChapterE2E(spec) {
  const CH = CHAPTERS.find((c) => c.id === spec.chapterId);
  const NEXT = CHAPTERS.find((c) => c.id === CH.id + 1) || null;
  const FIELD = CH.buildField(CH);
  const LAIR = CH.buildLair(CH);
  const L = spec.labels;
  const CH_NUM = CH.title.split(' · ')[0];                 // 「第二章」
  const badgeName = (id) => CHAPTERS.find((c) => c.id === id).title.split(' · ')[0];

  const BASE = process.env.BASE_URL || 'http://localhost:5173/';
  mkdirSync('scripts/shots', { recursive: true });

  const errors = [];
  const steps = [];
  let failed = false;
  let assertions = 0;

  const browser = await chromium.launch();
  // 视口高度 900：#stage 按「宽/960」等比缩放，宽度受限时游戏渲染与 1000×700
  // 完全一致；但全套 190 题里最高的题（如 sp15，12 行代码 + 长解析）答题面板
  // 连反馈高约 805px，700 高视口会把「确认/领取」按钮挤出屏幕外，点击永远
  // 无法命中（原脚本同视口下的潜在偶发失败根源）。900 给足余量，交互不变。
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

  // 测试环境封闭化：游戏本体全部由本地 dev server 提供，页面里只有字体走外网
  // CDN（index.html 的 Google Fonts / jsdelivr）。弱网/离线时这些请求会长期
  // pending，卡住截图与 networkidle，并把网络错误混进「浏览器报错」断言。
  // 这里对外部请求直接返回空 200，测试不依赖外部网络、行为完全确定。
  const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
  await page.route('**/*', (route) => (
    isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
  ));

  const shot = async (name) => {
    await page.screenshot({ path: `scripts/shots/${name}.png` });
    steps.push(`📷 ${name}`);
    console.log(`📷 ${name}`);
  };
  const check = (cond, label) => {
    assertions++;
    if (cond) { steps.push(`  ✓ ${label}`); console.log(`  ✓ ${label}`); }
    else { failed = true; steps.push(`  ✗ ${label}`); console.log(`  ✗ ${label}`); }
  };

  // ---------- 稳定性护栏（仅测试侧） ----------
  // 偶发 CDP 点击卡死：事件已生效（选项已选中/面板已关闭）但 Promise 迟迟不返回；
  // 以及偶发的场景切换瞬间 active() 为空。这里统一做「状态校验 + 有界重试」，
  // 不改变正常路径的时序常数（320/480/380/420 …），也不放宽任何断言。
  const evalRetry = async (pageFn, arg, tries = 4) => {
    let last;
    for (let i = 0; i < tries; i++) {
      try { return await page.evaluate(pageFn, arg); }
      catch (e) { last = e; await page.waitForTimeout(350); }
    }
    throw last;
  };
  /** 有界点击：卡死时快速失败重试；效果以 verifyFn 状态为准 */
  async function quizClick(sel, verifyFn, tries = 4) {
    const safeVerify = async () => {
      try { return await verifyFn(); }
      catch (e) { return false; } // 瞬时状态（如场景切换间隙）视作未就绪
    };
    for (let i = 0; i < tries; i++) {
      if (verifyFn && await safeVerify()) return true;
      try { await page.click(sel, { timeout: 2500 }); }
      catch (e) { /* 卡死/未生效：由 verifyFn 决定是否重试 */ }
      await page.waitForTimeout(160);
      if (verifyFn && await safeVerify()) return true;
    }
    return verifyFn ? safeVerify() : false;
  }
  /** 普通按钮点击（无独立校验条件，后续步骤自带等待/断言兜底） */
  async function click(sel) {
    for (let i = 0; i < 3; i++) {
      try { return await page.click(sel, { timeout: 8000 }); }
      catch (e) { await page.waitForTimeout(300); }
    }
    return page.click(sel); // 最后一搏：默认超时，让真实错误浮出
  }

  // ---------- seam 访问（只读查询 + 语义动作） ----------
  const activeKey = () => evalRetry(() => window.__PYQUEST__.active().scene.settings.key);
  const state = () => page.evaluate(() => window.__PYQUEST__.state());
  const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
  const godmode = () => evalRetry(() => window.__PYQUEST__.godmode());
  const waitForScene = (key) => page.waitForFunction((k) => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
    return !!(s && s.player);
  }, key, { timeout: 6000 });
  /** 等标题画面就绪：BootScene.create 跑完（按钮文案与点击处理都已挂好）才算。
   *  代替刷新后的固定等待——机器负载高时启动远超 1.4s，固定等待会读到 index.html
   *  里的默认文案「开始冒险」、点击也落在尚未挂处理函数的按钮上 */
  const waitForTitle = async () => {
    await page.waitForFunction(() => {
      const s = window.__PYQUEST__ && window.__PYQUEST__.scene('Boot');
      return !!(s && s.sys.isActive());
    }, null, { timeout: 30000 });
    await page.waitForTimeout(200);
  };

  /** 为符文选一个安全的靠近点：距目标符文 < 260，且避开其他符文/封印门（282）、
   *  引导石碑（302）、水晶实体（180）与地图边界——防止 E 被邻近交互抢占 */
  function approachPoint(map, r) {
    const npc = map.props.find((p) => p.type === 'npc');
    const solids = map.props.filter((p) => p.type === 'crystal');
    const others = map.props.filter((p) => (p.type === 'rune' && p.qid !== r.qid) || p.type === 'doorlink');
    const W = map.w * 128, H = map.h * 128;
    for (let radius = 120; radius <= 250; radius += 20) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = r.x + Math.round(Math.cos(a) * radius);
        const py = r.y + Math.round(Math.sin(a) * radius);
        if (px < 200 || py < 200 || px > W - 200 || py > H - 200) continue;
        if (others.some((o) => Math.hypot(px - o.x, py - o.y) < 282)) continue;
        if (solids.some((o) => Math.hypot(px - o.x, py - o.y) < 180)) continue;
        if (npc && Math.hypot(px - npc.x, py - npc.y) < 302) continue;
        return [px, py];
      }
    }
    return [r.x, r.y + 192]; // 兜底：样板默认位
  }

  /** 打开指定符文的答题面板：先取安全靠近点，失败再按南/东/北/西方位轮询；
   *  通过 runeRolls 槽位记录确认打开的正是这块符文（错了取消重试） */
  async function openRune(map, r, label) {
    const closeDialogue = async () => {
      for (let i = 0; i < 12; i++) {
        if (await page.locator('#dialogue.show').count() === 0) return;
        await page.keyboard.press('KeyE');
        await page.waitForTimeout(240);
      }
    };
    const candidates = [
      approachPoint(map, r),
      [r.x, r.y + 192], [r.x + 192, r.y], [r.x, r.y - 192], [r.x - 192, r.y],
    ];
    for (const [px, py] of candidates) {
      await closeDialogue();
      await tele(px, py);
      await page.waitForTimeout(320);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(480);
      if (process.env.E2E_TRACE) {
        const t = await page.evaluate((slot) => {
          const s = window.__PYQUEST__.active();
          const rune = s && s.interactables && s.interactables.find((i) => i.qid === slot);
          return {
            key: s && s.scene && s.scene.settings.key,
            player: s && s.player && [Math.round(s.player.x), Math.round(s.player.y), !!s.player.dying],
            quizOpen: s && s.quiz && s.quiz.isOpen, dlg: s && s.dialogue && s.dialogue.isOpen,
            rune: rune && { alive: rune.alive, x: rune.x, y: rune.y, d: Math.round(Math.hypot(rune.x - s.player.x, rune.y - s.player.y)) },
            bd: document.getElementById('quiz-backdrop').className,
          };
        }, r.qid).catch((e) => ({ err: String(e) }));
        console.log(`[trace] ${label} cand(${px},${py}) →`, JSON.stringify(t));
      }
      if (await page.locator('#quiz-backdrop.show').count() === 1) {
        const mine = await evalRetry((slot) => {
          const s = window.__PYQUEST__.active();
          return s.quiz.isOpen && !!window.__PYQUEST__.state().runeRolls[slot];
        }, r.qid);
        if (mine) {
          check(true, `${label} 答题面板打开`);
          return true;
        }
        // 打开的是邻近符文：取消后换点重试（校验面板确已关闭）
        await quizClick('#quiz-cancel', () => page.evaluate(
          () => !window.__PYQUEST__.active().quiz.isOpen,
        ));
        await page.waitForTimeout(400);
      }
    }
    await closeDialogue();
    check(false, `${label} 答题面板打开`);
    throw new Error(`openRune: ${label}（${r.qid}）5 个候选点均无法打开答题面板`);
  }

  /** 点击选项 → 确认 → 领取奖励（两段确认）。题目从题池随机抽取，正确项动态读取；
   *  每步点击后校验面板状态（selected / phase / isOpen），卡死时自动补点 */
  async function answerCorrect(label) {
    const ansIdx = await evalRetry(() => window.__PYQUEST__.active().quiz.q.answer);
    await quizClick(`#quiz-options .opt:nth-child(${ansIdx + 1})`,
      () => page.evaluate((i) => window.__PYQUEST__.active().quiz.selected === i, ansIdx));
    await quizClick('#quiz-confirm',
      () => page.evaluate(() => window.__PYQUEST__.active().quiz.phase === 'correct'));
    await page.waitForTimeout(380);
    const ok = await page.locator('#quiz-feedback.ok').count() === 1;
    if (!ok && process.env.E2E_TRACE) {
      const d = await page.evaluate(() => {
        const q = window.__PYQUEST__.active().quiz;
        return {
          quiz: { isOpen: q.isOpen, phase: q.phase, selected: q.selected, qid: q.q && q.q.id, answer: q.q && q.q.answer },
          fb: document.getElementById('quiz-feedback').className,
          fbText: document.getElementById('quiz-feedback').textContent.slice(0, 40),
          chapter: document.getElementById('quiz-chapter').textContent,
          hearts: window.__PYQUEST__.state().hearts,
          player: (() => { const p = window.__PYQUEST__.active().player; return p && [Math.round(p.x), Math.round(p.y), !!p.dying]; })(),
        };
      }).catch((e) => ({ err: String(e) }));
      console.log(`[trace] answerCorrect FAIL ${label} ansIdx=${ansIdx} →`, JSON.stringify(d));
    }
    check(ok, `${label} 答对`);
    await quizClick('#quiz-confirm', // 关闭 / 领取
      () => page.evaluate(() => !window.__PYQUEST__.active().quiz.isOpen));
    await page.waitForTimeout(420);
  }

  // ---------- 步骤实现 ----------
  const handlers = {
    /** 全新开始：清存档 → 标题 → 新游戏（落村庄） */
    async newGame() {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await waitForTitle();
      await click('#btn-start');
      await waitForScene(CHAPTERS[0].fieldKey);
      await page.waitForTimeout(700);
      check(await activeKey() === CHAPTERS[0].fieldKey, '新游戏从村庄开始');
    },

    /** 跳章：语义动作把前序章节标记通关，落到本章野外 */
    async gotoChapter(step) {
      await evalRetry((id) => window.__PYQUEST__.gotoChapter(id), CH.id);
      await waitForScene(CH.fieldKey);
      await page.waitForTimeout(700);
      check(await activeKey() === CH.fieldKey, `进入${CH.title}`);
      await godmode();
      if (step.shot) await shot(step.shot);
    },

    /** 野外碎片符文全答（badge=true 时断言题目来自本章题池），集齐碎片 */
    async collectShards(step) {
      const shardRunes = FIELD.props.filter((p) => p.type === 'rune' && !p.healRune && !p.bossRune);
      check(shardRunes.length === CH.shardsNeeded, `${L.place}有 ${CH.shardsNeeded} 块碎片符文（实际 ${shardRunes.length}）`);
      for (const r of shardRunes) {
        await openRune(FIELD, r, `符文 ${r.qid}`);
        if (step.badge) {
          const badge = await page.locator('#quiz-chapter').textContent();
          check(badge.includes(L.badge), `题目来自${L.badge}题池（${badge}）`);
        }
        await answerCorrect(`${r.qid}（${L.pool}随机题）`);
        if (process.env.E2E_TRACE) {
          const t = await page.evaluate((slot) => {
            const st = window.__PYQUEST__.state();
            const q = window.__PYQUEST__.active().quiz;
            return {
              ch: st.current, shards: st.progress[st.current].shards,
              slotAnswered: st.answered.includes(slot),
              runeRolls: Object.keys(st.runeRolls),
              qAnswered: st.qAnswered.length,
              quiz: { isOpen: q.isOpen, qid: q.q && q.q.id },
            };
          }, r.qid).catch((e) => ({ err: String(e) }));
          console.log(`[trace] after ${r.qid} →`, JSON.stringify(t));
        }
      }
      const g1 = await state();
      check(g1.progress[CH.id].shards === CH.shardsNeeded, `集齐 ${CH.shardsNeeded} 枚${L.shard}（实际 ${g1.progress[CH.id].shards}）`);
    },

    /** 封印门：碎片不足时拒绝开启，集齐后按 E 解开 */
    async sealedGate() {
      const door = FIELD.props.find((p) => p.type === 'doorlink');
      await evalRetry(([id, n]) => window.__PYQUEST__.setShards(id, n), [CH.id, 0]);
      await tele(door.x, door.y + 192);
      await page.waitForTimeout(300);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(400);
      check(await page.locator('#dialogue.show').count() === 1, '碎片不足时封印之门拒绝开启');
      for (let i = 0; i < 6; i++) {
        if (await page.locator('#dialogue.show').count() === 0) break;
        await page.keyboard.press('KeyE');
        await page.waitForTimeout(260);
      }
      await evalRetry(([id, n]) => window.__PYQUEST__.setShards(id, n), [CH.id, CH.shardsNeeded]);
      await tele(door.x, door.y + 192);
      await page.waitForTimeout(300);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(500);
      const gateOpen = (await state()).progress[CH.id].gateOpen;
      check(gateOpen, L.gateOpen);
    },

    /** 穿过封印门（走进巢穴传送门中心）→ 进入巢穴，冻结 BOSS、清小怪 */
    async enterLair(step) {
      const portal = FIELD.portals.find((p) => p.to === CH.lairKey);
      await tele(portal.rect.x + portal.rect.w / 2, portal.rect.y + portal.rect.h / 2);
      await waitForScene(CH.lairKey);
      await page.waitForTimeout(700);
      check(await activeKey() === CH.lairKey, `进入${CH.lairName}`);
      await godmode();
      await evalRetry(([k, x, y]) => {
        window.__PYQUEST__.pinBoss(k, x, y); // 钉回出生点，位置确定性
        window.__PYQUEST__.clearMinions(k);
      }, [CH.lairKey, LAIR.boss.x, LAIR.boss.y]);
      if (step.shot) await shot(step.shot);
    },

    /** BOSS 初始处于符文护盾状态 */
    async bossShielded() {
      check((await state()).progress[CH.id].bossShielded, `${CH.bossName}初始处于护盾状态`);
    },

    /** 祝福符文（回心不产碎片）：答 count 块；checkCount 时断言巢穴有 3 块 */
    async healRunes(step) {
      const healRunes = LAIR.props.filter((p) => p.type === 'rune' && p.healRune);
      if (step.checkCount) {
        check(healRunes.length === 3, `${L.lairPlace}有 3 块祝福符文（实际 ${healRunes.length}）`);
      }
      for (let i = 0; i < step.count; i++) {
        const r = healRunes[i];
        await openRune(LAIR, r, `符文 ${r.qid}`);
        await answerCorrect(`${r.qid}（${L.healPool}）`);
        if (i === 0) {
          const healCheck = (await state()).progress[CH.id].shards;
          check(healCheck === CH.shardsNeeded, `祝福符文不产碎片（碎片仍 ${healCheck}）`);
        }
      }
    },

    /** BOSS 符文：答对破盾（badge=true 时断言 BOSS 谜题来自本章题池） */
    async bossRune(step) {
      const bossRune = LAIR.props.find((p) => p.type === 'rune' && p.bossRune);
      await openRune(LAIR, bossRune, 'BOSS 符文');
      if (step.badge) {
        const bossBadge = await page.locator('#quiz-chapter').textContent();
        check(bossBadge.includes(L.badge), `BOSS 谜题来自${L.badge}题池（${bossBadge}）`);
      }
      await answerCorrect(`BOSS 符文（${L.topic}综合随机题）`);
      check((await state()).progress[CH.id].bossShielded === false, L.shieldBroken);
    },

    /** 攻击 BOSS：蛇（两击 → hp 11/10、断尾 6→5 节）；史莱姆（一击 → hp 9） */
    async bossFight(step) {
      const bossX = LAIR.boss.x, bossY = LAIR.boss.y;
      const isSnake = CH.boss === 'snake';
      if (isSnake) {
        const segs = await page.evaluate((k) => window.__PYQUEST__.scene(k).boss?.segs?.length ?? -1, CH.lairKey);
        check(segs === 6, `${CH.bossName}有 6 节身体（实际 ${segs}）`);
      }
      await evalRetry(([k, x, y]) => window.__PYQUEST__.pinBoss(k, x, y), [CH.lairKey, bossX, bossY]);
      await tele(bossX, bossY - 192); // BOSS 正上方，挥剑命中
      await page.waitForTimeout(250);
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(320);
      if (isSnake) {
        const h1 = await page.evaluate((k) => {
          const b = window.__PYQUEST__.scene(k).boss;
          return { hp: b ? b.hp : -1, segs: b ? b.segs.length : -1 };
        }, CH.lairKey);
        check(h1.hp === 11, `破盾后挥剑命中${L.bossShort}（hp=${h1.hp}）`);
        check(h1.segs === 6, `第一击后身体完整（剩 ${h1.segs} 节）`);
        // 第一击的击退会让 BOSS 恢复行动，重新冻结复位后再补一击
        await evalRetry(([k, x, y]) => window.__PYQUEST__.pinBoss(k, x, y), [CH.lairKey, bossX, bossY]);
        await page.waitForTimeout(420); // 等攻击与受击硬直结束
        await page.keyboard.press('KeyJ'); // 第二击 → hp 10（偶数）触发断尾
        await page.waitForTimeout(450);
        const h2 = await page.evaluate((k) => {
          const b = window.__PYQUEST__.scene(k).boss;
          return { hp: b ? b.hp : -1, segs: b ? b.segs.length : -1 };
        }, CH.lairKey);
        check(h2.hp === 10, `第二击命中（hp=${h2.hp}）`);
        check(h2.segs === 5, `hp 降到一半档位时断尾（剩 ${h2.segs} 节）`);
      } else {
        const hp = await page.evaluate((k) => {
          const b = window.__PYQUEST__.scene(k).boss;
          return b ? b.hp : -1;
        }, CH.lairKey);
        check(hp === 9, `破盾后挥剑命中${L.bossShort}（hp=${hp}）`);
      }
      if (step.shot) await shot(step.shot);
    },

    /** 补刀击败 BOSS（走 hurt→die→onBossDefeated 真实链路）→ 通关结算 */
    async victory(step) {
      await evalRetry((k) => window.__PYQUEST__.slayBoss(k), CH.lairKey);
      await page.waitForTimeout(2600);
      const gEnd = await state();
      check(gEnd.progress[CH.id].done, L.done);
      if (step.allDoneIds) {
        check(step.allDoneIds.every((id) => gEnd.progress[id].done === true), '通关章节进度全部标记完成');
      }
      check(await page.locator('#victory').evaluate((el) => !el.classList.contains('hidden')), '胜利画面出现');
      let title = await page.locator('#victory-title').textContent();
      if (step.stripSpaces) title = title.replace(/\s/g, '');
      check(title.includes(L.victoryTitle), step.stripSpaces
        ? `显示「${L.victoryTitle}」标题`
        : `显示${L.victoryTitle}通关标题`);
      if (L.stats) {
        const stats = await page.locator('#victory-stats').textContent();
        check(stats.includes(L.stats), `${L.statsLabel}（${stats}）`);
      }
      if (step.shot) await shot(step.shot);
    },

    /** 通关进度已自动写入 localStorage（ch2 额外断言 gateOpen） */
    async saveCheck(step) {
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v2') || 'null'));
      const ok = !!saved && saved.progress[CH.id].done === true
        && (!step.gateOpen || saved.progress[CH.id].gateOpen === true);
      check(ok, `${CH_NUM}进度已自动存档（v2）`);
    },

    /** 下一章衔接：btn-next → 下一章野外（终章则返回村庄） */
    async nextChapter(step) {
      if (step.village) {
        const nextText = (await page.locator('#btn-next').textContent()).trim();
        check(nextText.includes('返回村庄'), `终章结算按钮为「${nextText}」（无下一章）`);
        await click('#btn-next');
        await waitForScene(CHAPTERS[0].fieldKey);
        await page.waitForTimeout(700);
        check(await activeKey() === CHAPTERS[0].fieldKey, `通关后返回${CHAPTERS[0].fieldName}（自由探索）`);
      } else {
        await click('#btn-next');
        await waitForScene(NEXT.fieldKey);
        await page.waitForTimeout(700);
        check(await activeKey() === NEXT.fieldKey, L.next);
      }
      await godmode();
      if (step.shot) await shot(step.shot);
    },

    /** 抽查下一章题池可用（答一块下一章碎片符文） */
    async sampleNextRune(step) {
      const nextField = NEXT.buildField(NEXT);
      const nextRune = nextField.props.find((p) => p.type === 'rune' && !p.healRune && !p.bossRune);
      const nextBadge = badgeName(NEXT.id);
      await openRune(nextField, nextRune, `${nextBadge}符文 ${nextRune.qid}`);
      const badge = await page.locator('#quiz-chapter').textContent();
      check(badge.includes(nextBadge), `${nextBadge}题目来自${step.pool}题池（${badge}）`);
      await answerCorrect(`${nextRune.qid}（${step.pool}随机题）`);
      const gn = await state();
      check(gn.progress[NEXT.id].shards >= 1, `${nextBadge}碎片计数正常`);
    },

    /** 世界地图：Tab 呼出 · 章节状态 · 快速传送 · 锁定不可点 */
    async worldMap(step) {
      const travelCh = CHAPTERS.find((c) => c.id === step.travelToId);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(400);
      check(await page.locator('#map-backdrop.show').count() === 1, 'Tab 呼出世界地图');
      if (step.shotOpen) await shot(step.shotOpen);
      const nodeCount = await page.locator('#map-path .map-node').count();
      check(nodeCount === CHAPTERS.length, `地图显示 ${CHAPTERS.length} 个章节节点（实际 ${nodeCount}）`);
      check(await page.locator(`.map-node[data-id="${step.lockedNodeId}"].locked`).count() === 1,
        `${badgeName(step.lockedNodeId)}未解锁显示为锁定 🔒`);
      for (const id of step.doneNodeIds) {
        check(await page.locator(`.map-node[data-id="${id}"].done`).count() === 1, `${badgeName(id)}显示已通关 ✓`);
      }
      check(await page.locator(`.map-node[data-id="${step.hereNodeId}"].here`).count() === 1,
        `当前所在章（${badgeName(step.hereNodeId)}）📍 高亮`);
      const subText = await page.locator('#map-sub').textContent();
      check(subText.includes(step.stats), `地图头部显示总进度（${subText}）`);
      // Tab 再按一次关闭
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
      check(await page.locator('#map-backdrop.show').count() === 0, '再按 Tab 关闭地图');
      // 重新打开并点击已通关章节传送
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);
      await click(`.map-node[data-id="${step.travelToId}"]`);
      await waitForScene(travelCh.fieldKey);
      await page.waitForTimeout(700);
      check(await activeKey() === travelCh.fieldKey, `点击节点快速传送回${travelCh.fieldName}`);
      check(await page.locator('#map-backdrop.show').count() === 0, '传送后地图自动关闭');
      check((await state()).current === step.travelToId, `当前位置更新为${badgeName(step.travelToId)}`);
      if (step.shotTravel) await shot(step.shotTravel);
      // 锁定章节不可点击：打开地图确认后关闭
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);
      const lockedClickable = await page.locator(`.map-node[data-id="${step.lockedNodeId}"]`).evaluate((el) => getComputedStyle(el).cursor);
      check(lockedClickable === 'not-allowed', '锁定章节节点不可点击');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
    },

    /** 刷新 → 继续冒险：标题按钮落点、读档进度与场景还原 */
    async resume(step) {
      await page.reload({ waitUntil: 'networkidle' });
      await waitForTitle();
      const btnText = (await page.locator('#btn-start').textContent()).trim();
      check(btnText.includes(L.resumeBtn), `标题画面显示「${btnText}」`);
      if (step.newGameBtn) {
        const btnNewVisible = await page.locator('#btn-new').evaluate((el) => el.style.display !== 'none');
        check(btnNewVisible, '「新的冒险」按钮出现');
      }
      await click('#btn-start'); // 继续冒险 → 读档
      await waitForScene(L.resumeScene).catch(() => {}); // 落点不对时交给下面的断言报告
      await page.waitForTimeout(700);
      if (L.resumeDone) {
        const gResume = await state();
        check(L.resumeDone.ids.every((id) => gResume.progress[id].done === true), L.resumeDone.label);
      }
      check(await activeKey() === L.resumeScene, L.resumeSceneLabel);
      if (step.shot) await shot(step.shot);
    },
  };

  // ---------- 执行 ----------
  try {
    for (const step of spec.steps) {
      await handlers[step.type](step);
    }
  } catch (err) {
    failed = true;
    errors.push(`[runner] ${err && err.message ? err.message : err}`);
    console.error('执行中断:', err);
  }

  // ---- 汇总 ----
  console.log(`=== E2E ${CH_NUM}测试结果 ===（断言 ${assertions} 项）`);
  for (const s of steps) console.log(s);
  if (errors.length) { console.log('浏览器错误:'); console.log(errors.join('\n')); }
  else console.log('浏览器无报错 ✓');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
}
