// ============================================================
// 代码训练场关卡数据（纯数据：主线程场景 / Pyodide Worker / smoke / verify-dojo 共用）
//
// 训练场是编程练习，不是题库题目（ADR-0001 管题库）；只用 W1-W2 最基础的语法，
// 概念逐级引入：顺序执行 → for → if → while → 函数 → 列表 → 综合。
// 关卡清单与概念顺序见 docs/code-dojo.md（待助教对照讲义审核）。
//
// 网格图例（每个布局一份网格，行字符串等宽）：
//   S 起点  . 地面  # 墙  ~ 水  ^ 陷阱  * 碎片  m 史莱姆  E 传送门  F 旗子
// win.type：'reach' 走上传送门即判定（须先满足碎片 / 史莱姆要求）；
//           'stop'  程序结束时勇者必须站在旗子上。
// variants：同一关的多个布局——玩家代码要在全部布局上都通过（「代码要对不同输入都成立」），
//           每个布局可带注入给 Python 的变量（vars，如路线列表 path）。
// solution 由 scripts/verify-dojo.mjs 用本机 CPython 实跑：必须在全部布局上通关；
// starter（起始代码）必须不通关。
// ============================================================

/** 按方向列表生成一条小径（碎片放在第 shardSteps 步落脚处，终点是传送门） */
function pathVariant(path, shardSteps = []) {
  const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const cells = [[0, 0]];
  for (const d of path) {
    const [x, y] = cells[cells.length - 1];
    cells.push([x + D[d][0], y + D[d][1]]);
  }
  const minX = Math.min(...cells.map((c) => c[0])) - 1;
  const minY = Math.min(...cells.map((c) => c[1])) - 1;
  const w = Math.max(...cells.map((c) => c[0])) - minX + 2;
  const h = Math.max(...cells.map((c) => c[1])) - minY + 2;
  const rows = Array.from({ length: h }, () => Array(w).fill('#'));
  cells.forEach(([x, y], i) => {
    let ch = '.';
    if (i === 0) ch = 'S';
    else if (i === cells.length - 1) ch = 'E';
    else if (shardSteps.includes(i)) ch = '*';
    rows[y - minY][x - minX] = ch;
  });
  return { grid: rows.map((r) => r.join('')), vars: { path } };
}

export const DOJO_LEVELS = [
  {
    id: 1,
    concept: '顺序执行',
    title: '第一步',
    blurb: '程序从上往下一行一行执行。每调用一次 move(方向)，勇者就朝那个方向走一格。',
    goal: '走到传送门（撞墙会晕倒）。',
    api: ['move'],
    win: { type: 'reach' },
    maxSteps: 30,
    par: { lines: 6 },
    variants: [
      {
        grid: [
          '#######',
          '#S..###',
          '###.###',
          '###..E#',
          '#######',
        ],
      },
    ],
    starter: "# 用 move('right')、move('down') 让勇者走到传送门\nmove('right')\n",
    hints: [
      '先数一数：往右走几格、往下走几格、再往右走几格？',
      "每一步都单独写一行：move('right')、move('down') ……一共 6 行。",
    ],
    solution: "move('right')\nmove('right')\nmove('down')\nmove('down')\nmove('right')\nmove('right')\n",
  },
  {
    id: 2,
    concept: 'for 循环',
    title: '长桥',
    blurb: '同一件事重复很多次时，用 for i in range(n): 让下面缩进的代码执行 n 次。',
    goal: '走过长桥到达传送门（掉进水里就失败）。挑战：只用 2 行代码。',
    api: ['move'],
    win: { type: 'reach' },
    maxSteps: 40,
    par: { lines: 2 },
    variants: [
      {
        grid: [
          '~~~~~~~~~~~~',
          'S..........E',
          '~~~~~~~~~~~~',
        ],
      },
    ],
    starter: "# 桥有 11 格长。复制 11 行也能过，但试试用 for 循环！\nmove('right')\n",
    hints: [
      'range(11) 会产生 0 到 10 这 11 个数，for 循环就会执行 11 次。',
      "for i in range(11):\n    move('right')     ← 循环体要缩进 4 个空格",
    ],
    solution: "for i in range(11):\n    move('right')\n",
  },
  {
    id: 3,
    concept: 'if 判断',
    title: '陷阱走廊',
    blurb: "look() 返回勇者前方那一格是什么（比如 'trap'、'empty'、'exit'）。用 if 根据情况做不同的事。",
    goal: '穿过走廊到传送门。三个布局的陷阱位置都不一样——同一段代码要全部通过。',
    api: ['move', 'jump', 'look'],
    win: { type: 'reach' },
    maxSteps: 40,
    par: { lines: 5 },
    variants: [
      { grid: ['##########', 'S..^...^.E', '##########'] },
      { grid: ['##########', 'S.^..^...E', '##########'] },
      { grid: ['##########', 'S^....^..E', '##########'] },
    ],
    starter: "for i in range(9):\n    # 前方是陷阱就 jump() 跳过去，否则走一步\n    move('right')\n",
    hints: [
      "look() 的结果可以拿来比较：look() == 'trap' 是 True 还是 False？",
      "if look() == 'trap':\n    jump()\nelse:\n    move('right')     ← 整段放进 for 循环里",
    ],
    solution: "for i in range(9):\n    if look() == 'trap':\n        jump()\n    else:\n        move('right')\n",
  },
  {
    id: 4,
    concept: 'while 循环',
    title: '迷雾小径',
    blurb: 'while 条件: 会一直重复，直到条件不成立。不知道要走几步时就用它。',
    goal: '停在小径尽头的旗子上（程序结束时站在旗子上才算成功，撞墙会晕倒）。小径每次长度都不一样。',
    api: ['move', 'look'],
    win: { type: 'stop' },
    maxSteps: 60,
    par: { lines: 2 },
    variants: [
      { grid: ['######', 'S...F#', '######'] },
      { grid: ['#########', 'S......F#', '#########'] },
      { grid: ['############', 'S.........F#', '############'] },
    ],
    starter: "# 小径的长度每次都不一样，数格子没用了！\n# 只要前方不是墙，就继续往前走\nmove('right')\n",
    hints: [
      "look() != 'wall' 表示「前方不是墙」——把它当作 while 的条件。",
      "while look() != 'wall':\n    move('right')",
    ],
    solution: "while look() != 'wall':\n    move('right')\n",
  },
  {
    id: 5,
    concept: '函数',
    title: '台阶阵',
    blurb: '用 def 把一段反复出现的动作起个名字，之后一行就能调用它。',
    goal: '爬上台阶到达传送门。每一级台阶都是「右、右、上」。挑战：不超过 7 行。',
    api: ['move'],
    win: { type: 'reach' },
    maxSteps: 40,
    par: { lines: 7 },
    variants: [
      {
        grid: [
          '########E',
          '########.',
          '######...',
          '####...##',
          '##...####',
          'S..######',
        ],
      },
    ],
    starter: "# 台阶的形状一直重复：右、右、上\n# 用 def 把一级台阶写成函数，再重复调用它\ndef step():\n    move('right')\n\nstep()\n",
    hints: [
      "函数体里写三行：move('right')、move('right')、move('up')。",
      "一共 4 级台阶，最后再 move('up') 一次进传送门：\nfor i in range(4):\n    step()\nmove('up')",
    ],
    solution: "def step():\n    move('right')\n    move('right')\n    move('up')\n\nfor i in range(4):\n    step()\nmove('up')\n",
  },
  {
    id: 6,
    concept: '列表遍历',
    title: '碎片清单',
    blurb: '列表把很多东西按顺序装在一起。for d in path: 会把列表里的元素一个一个取出来。',
    goal: '路线写在列表 path 里，每次都不一样。沿着路线收集全部碎片，再走进传送门。',
    api: ['move'],
    win: { type: 'reach', shards: 'all' },
    maxSteps: 40,
    par: { lines: 2 },
    variants: [
      pathVariant(['right', 'right', 'down', 'down', 'right', 'right', 'up', 'right'], [2, 5]),
      pathVariant(['down', 'right', 'right', 'right', 'down', 'right', 'up', 'up', 'right'], [3, 6]),
      pathVariant(['right', 'up', 'up', 'right', 'right', 'down', 'right', 'right'], [3, 6]),
    ],
    starter: "# 先看看今天的路线：\nprint(path)\nmove(path[0])\n",
    hints: [
      'path 是一个方向列表，比如 [\'right\', \'down\', …]；path[0] 是第一个方向。',
      'for d in path:\n    move(d)       ← d 依次等于列表里的每一个方向',
    ],
    solution: 'for d in path:\n    move(d)\n',
  },
  {
    id: 7,
    concept: '综合',
    title: '史莱姆巢穴',
    blurb: "把学过的都用上：while 一直走、if / elif / else 分情况、attack() 打倒挡路的史莱姆。",
    goal: '拿到全部碎片并走进传送门。三个布局的陷阱、史莱姆、碎片都不一样。',
    api: ['move', 'jump', 'look', 'attack'],
    win: { type: 'reach', shards: 'all' },
    maxSteps: 80,
    par: { lines: 9 },
    variants: [
      { grid: ['#############', 'S.m.^.*.m.*.E', '#############'] },
      { grid: ['#############', 'S*^.m..^*m..E', '#############'] },
      { grid: ['#############', 'Sm.*.^.m^.*.E', '#############'] },
    ],
    starter: "while look() != 'exit':\n    ahead = look()\n    # 史莱姆？陷阱？还是可以走？\n    move('right')\nmove('right')\n",
    hints: [
      "ahead == 'slime' 时 attack()，ahead == 'trap' 时 jump()，其余情况 move('right')。",
      "if ahead == 'slime':\n    attack()\nelif ahead == 'trap':\n    jump()\nelse:\n    move('right')",
    ],
    solution: "while look() != 'exit':\n    ahead = look()\n    if ahead == 'slime':\n        attack()\n    elif ahead == 'trap':\n        jump()\n    else:\n        move('right')\nmove('right')\n",
  },
];

export const dojoLevel = (id) => DOJO_LEVELS.find((l) => l.id === id) || null;

/** 英雄 API 说明（编辑器旁的提示条） */
export const DOJO_API_DOCS = {
  move: "move(方向)：走一格，方向是 'up' / 'down' / 'left' / 'right'",
  jump: 'jump()：朝面向的方向跳过一格（能越过陷阱）',
  look: "look()：看面向的前方一格，返回 'empty' / 'wall' / 'water' / 'trap' / 'shard' / 'slime' / 'exit' / 'flag'",
  attack: 'attack()：攻击面向的前方一格',
};
