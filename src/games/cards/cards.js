// ============================================================
// 阵列牌局 · 卡牌目录（纯数据，无 DOM）
// 三类卡：
//   选择器 sel   —— 方括号里的下标 / 切片 / 掩膜，决定「打谁」：[1:4]、[::2]、[hp > 5]、[:, 0] …（0 费）
//   操作   op    —— 原地运算，决定「怎么打」：-= 3、//= 2、= 0 …；不配选择器单独打出 = 整个数组一起算（广播），+1 费
//   技能   skill —— block += 5（格挡）、draw(2)（抽牌）
// 「自由咒语」free 是一张特殊选择器：方括号里的内容由玩家自己写，实时预览会命中谁。
// 卡牌 id 就是它的代码文字（选择器 '[1:4]'、操作 '-= 3'），技能与自由咒语用固定 id。
// ============================================================

/** 一维 / 二维下标的中文说明（同一张 [1] 在二维阵型里是「整行」） */
function selDesc(code) {
  const inner = code.slice(1, -1).trim();
  if (inner.startsWith('hp ') || inner.startsWith('atk ') || inner.startsWith('(')) {
    return { d1: '布尔掩膜：条件成立的全部敌人', d2: '布尔掩膜：条件成立的全部敌人' };
  }
  if (/^-?\d+$/.test(inner)) {
    const i = Number(inner);
    const one = i < 0 ? `倒数第 ${-i} 个（负下标从末尾数）` : `下标 ${i} 的那一个`;
    return { d1: one, d2: i < 0 ? `倒数第 ${-i} 行整行` : `第 ${i} 行整行` };
  }
  if (/^:, *-?\d+$/.test(inner)) {
    const j = inner.split(',')[1].trim();
    return { d1: '', d2: Number(j) < 0 ? `倒数第 ${-Number(j)} 列（每行的这一列）` : `第 ${j} 列（每一行的第 ${j} 个）` };
  }
  if (/^-?\d+, *-?\d+$/.test(inner)) {
    const [r, c] = inner.split(',').map((s) => s.trim());
    return { d1: '', d2: `第 ${r} 行第 ${c} 列的那一个` };
  }
  if (inner.includes(',')) return { d1: '', d2: '行切片, 列切片：圈出一块' };
  const m = /^(-?\d*):(-?\d*)(?::(-?\d*))?$/.exec(inner);
  if (m) {
    const [, a, b, s] = m;
    const step = s ? Number(s) : 1;
    if (!a && !b && step !== 1) {
      return { d1: `从头开始每隔 ${step - 1} 个取一个`, d2: `从第 0 行开始每隔 ${step - 1} 行` };
    }
    if (a && !b && step !== 1) return { d1: `从下标 ${a} 开始每隔 ${step - 1} 个`, d2: `从第 ${a} 行开始每隔 ${step - 1} 行` };
    const from = a ? `下标 ${a}` : '开头';
    const to = b ? `下标 ${Number(b) - 1}` : '末尾';
    const text = b && Number(b) < 0 ? `${from}到倒数第 ${-Number(b) + 1} 个` : `${from}到${to}（左闭右开）`;
    return { d1: text, d2: text.replace(/下标/g, '第').replace(/个/g, '行') };
  }
  return { d1: '', d2: '' };
}

const sel = (code) => ({ id: code, kind: 'sel', code, cost: 0, ...selDesc(code) });
const op = (code, cost, name, d1) => ({ id: code, kind: 'op', code, cost, name, d1, d2: d1 });

export const FREE = 'free';
export const WHOLE_ARRAY_SURCHARGE = 1;

const SEL_CODES = [
  '[0]', '[1]', '[2]', '[3]', '[4]', '[-1]', '[-2]',
  '[:2]', '[:3]', '[3:]', '[1:4]', '[2:5]', '[1:3]', '[::2]', '[1::2]',
  '[hp > 5]', '[hp > 6]', '[hp < 4]', '[hp >= 8]', '[atk > 3]',
  '[:, 0]', '[:, -1]', '[:, 1]', '[0:2, 1:3]', '[1:, 2:]', '[0, 0]', '[-1, -1]',
];

export const CARDS = Object.fromEntries([
  ...SEL_CODES.map(sel),
  op('-= 1', 0, '轻击', '每个被选中的敌人生命 −1'),
  op('-= 3', 1, '斩击', '每个被选中的敌人生命 −3'),
  op('-= 5', 2, '重斩', '每个被选中的敌人生命 −5'),
  op('-= 8', 2, '裂地斩', '每个被选中的敌人生命 −8'),
  op('//= 2', 1, '对半斩', '生命整除 2（砍掉一半，向下取整）'),
  op('= 0', 3, '归零', '被选中的敌人生命直接变成 0'),
  { id: FREE, kind: 'sel', free: true, code: '[ ✎ ]', cost: 0, d1: '自由咒语：方括号里的内容由你来写', d2: '自由咒语：方括号里的内容由你来写' },
  { id: 'block5', kind: 'skill', code: 'block += 5', cost: 1, name: '格挡', d1: '本回合抵挡 5 点伤害', d2: '本回合抵挡 5 点伤害', block: 5 },
  { id: 'block8', kind: 'skill', code: 'block += 8', cost: 2, name: '铁壁', d1: '本回合抵挡 8 点伤害', d2: '本回合抵挡 8 点伤害', block: 8 },
  { id: 'draw2', kind: 'skill', code: 'draw(2)', cost: 1, name: '洞察', d1: '再抽 2 张牌', d2: '再抽 2 张牌', draw: 2 },
].map((c) => [c.id, c]));

export const getCard = (id) => CARDS[id] || null;

/** 卡面说明：一维 / 二维阵型用不同措辞 */
export const cardDesc = (card, ndim) => (ndim === 2 ? card.d2 || card.d1 : card.d1 || card.d2);

/** 一张卡的「打出费用」：操作卡不配选择器 = 整个数组，+1 */
export const opCost = (opCard, wholeArray) => opCard.cost + (wholeArray ? WHOLE_ARRAY_SURCHARGE : 0);
