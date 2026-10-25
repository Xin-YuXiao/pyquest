// ============================================================
// 错题本视图：学习记录汇总的一个只读视图（不单独存储清单）
// - 「曾错」= 该题主线答错次数 > 0（后来答对也保留）
// - 复习状态取汇总里的 rv（连续答对达阈值 = 已掌握，见 core/records.js）
// - 当前题库已没有的题：显示「题目已更新」、不可复习、不计入待复习数
// 全部是纯函数（输入汇总 + 题库，输出列表），供错题本界面、测试接缝与 smoke 共用。
// ============================================================

export const KIND_LABEL = { shard: '碎片', heal: '祝福', boss: 'BOSS', tower: '试炼塔', trial: '秘境' };

/** 题面摘要：压成一行、截到 limit 个字 */
function oneLine(s, limit) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > limit ? `${t.slice(0, limit)}…` : t;
}

/**
 * 汇总 stats + 题库 questions → 错题条目列表
 * 排序：章升序（未知章最后）→ 错误次数降序 → 最近作答时间降序
 */
export function buildMistakeEntries(stats, questions) {
  const out = [];
  for (const [qid, st] of Object.entries(stats || {})) {
    if (!st || !(st.w > 0)) continue;
    const q = questions[qid];
    const rv = st.rv || {};
    out.push({
      qid,
      ch: st.ch ?? null,
      kind: st.k || null,
      topic: q ? q.chapter : null,
      summary: q ? oneLine(q.prompt, 46) : '题目已更新',
      wrong: st.w,
      attempts: st.n,
      lastOk: st.lastOk,
      lastAt: st.lastAt || 0,
      streak: rv.streak || 0,
      reviews: rv.n || 0,
      mastered: !!rv.mastered,
      missing: !q,
    });
  }
  const chKey = (c) => (c == null ? Infinity : c);
  out.sort((a, b) => chKey(a.ch) - chKey(b.ch) || b.wrong - a.wrong || b.lastAt - a.lastAt);
  return out;
}

/** 待复习数（错题本按钮上的 N）：曾错、未掌握、题目仍在题库里 */
export function pendingCount(entries) {
  return entries.filter((e) => !e.missing && !e.mastered).length;
}

/**
 * 按页签与三组筛选过滤：tab 'pending'（待复习，含已下线题）| 'mastered'；
 * ch / kind / topic 取 'all' 表示不限
 */
export function filterMistakes(entries, { tab = 'pending', ch = 'all', kind = 'all', topic = 'all' } = {}) {
  return entries.filter((e) => {
    if (tab === 'mastered' ? !(e.mastered && !e.missing) : e.mastered && !e.missing) return false;
    if (ch !== 'all' && e.ch !== Number(ch)) return false;
    if (kind !== 'all' && e.kind !== kind) return false;
    if (topic !== 'all' && e.topic !== topic) return false;
    return true;
  });
}

/** 筛选下拉框的可选值（只列出现有错题里出现过的） */
export function filterOptions(entries) {
  const uniq = (xs) => [...new Set(xs.filter((x) => x != null))];
  return {
    chapters: uniq(entries.map((e) => e.ch)).sort((a, b) => a - b),
    kinds: uniq(entries.map((e) => e.kind)),
    topics: uniq(entries.map((e) => e.topic)),
  };
}
