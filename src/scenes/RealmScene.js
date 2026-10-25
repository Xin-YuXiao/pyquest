// ============================================================
// Project 秘境场景（课程 Project 的通关后隐藏关卡，注册表见 data/realms.js）
// - RealmHallScene     秘境大厅：村庄「秘境之门」之后，北墙四扇课题之门 + 课题石碑
// - RealmFieldScene    外庭：课题链前五步（选题 → 文献 → 数据 → 分析 → 验证）按序解锁，
//                      第五步解开时东侧圣所之门当场解封
// - RealmSanctumScene  圣所：第六步「报告」是 BOSS 符文（答对破盾），击败秘境 BOSS → 课题封印页 + 徽章
// 三个场景都沿用 WorldScene 的地图 / 交互 / 小怪 / BOSS 招牌机制；
// 章节进度一律不碰（enterRegion / isBossShielded 覆写），进度只写 G.realms（core/realms.js）。
// 课题符文的作答照常进学习记录（kind = 'trial'），答错的题会进错题本。
// ============================================================
import { G, updateHud, healHearts } from '../core/state.js';
import { WorldScene } from './WorldScene.js';
import { REALMS, REALM_HALL, REALM_STEPS, realmSlot, hallSpawnKey } from '../data/realms.js';
import { buildRealmHall, buildRealmField, buildRealmSanctum } from '../data/realmMaps.js';
import {
  realmState, stepState, solveRealmStep, sealRealm, badgeCount, realmBossShielded,
  STEP_COUNT, FIELD_STEPS,
} from '../core/realms.js';
import { QUESTIONS } from '../data/quizBank.js';
import { showVictory } from '../ui/modal.js';
import { showBossBanner, hideBossBanner } from '../ui/BossBanner.js';
import { ICON } from '../ui/icons.js';
import { sfx } from '../audio/sfx.js';

/** 课题符文交互 / 提示半径（与主线符文石同为 260px） */
const TRIAL_RADIUS = 260;
const STEP_MARK = ['①', '②', '③', '④', '⑤', '⑥'];
const LABEL_FONT = '"ZCOOL KuaiLe","PingFang SC",sans-serif';

/** 秘境在 WorldScene 眼里的「章」视图：只提供场景基类 / BOSS / 重生需要的字段，不进 CHAPTERS */
function realmView(realm) {
  return {
    id: `realm-${realm.id}`,
    title: `${realm.project} · ${realm.title}`,
    fieldKey: realm.fieldKey, lairKey: realm.lairKey,
    fieldName: realm.fieldName, lairName: realm.lairName,
    bossName: realm.bossName, bossMechanic: realm.bossMechanic,
    shardLabel: '课题', npcName: '课题石碑',
    theme: realm.theme, victory: realm.victory,
  };
}

const HALL_VIEW = {
  id: 'realm-hall', title: REALM_HALL.name,
  fieldKey: REALM_HALL.key, lairKey: REALM_HALL.key,
  fieldName: REALM_HALL.name, lairName: REALM_HALL.name,
  bossName: '', shardLabel: '课题', npcName: '秘境石碑', theme: { palette: 'dungeon' },
};

/** 课题链一行进度：✓选题 → ✓文献 → 数据 → …（已解的打勾） */
function chainLine(steps) {
  return REALM_STEPS.map((n, i) => (i < steps ? `✓${n}` : n)).join(' → ');
}

// ---------- 课题符文（外庭与圣所共用） ----------

function spawnTrial(scene, p) {
  const sprite = scene.add.image(p.x, p.y + 16, 'tower').setOrigin(0.5, 0.94).setDepth(p.y);
  scene.add.image(p.x, p.y + 4, 'ts_shadow').setDisplaySize(120, 60).setAlpha(0.5).setDepth(p.y - 1);
  // 当前可解的那一步：金色光晕呼吸
  const aura = scene.add.image(p.x, p.y - 130, 'particle')
    .setTint(0xffd257).setAlpha(0.22).setScale(44).setDepth(p.y - 0.5);
  scene.tweens.add({ targets: aura, alpha: 0.36, scale: 52, duration: 1400, yoyo: true, repeat: -1, ease: 'sine.inout' });
  const label = scene.add.text(p.x, p.y - 330, '', {
    fontFamily: LABEL_FONT, fontSize: '46px', color: '#ffd257',
    stroke: '#2c2438', strokeThickness: 12, align: 'center',
  }).setOrigin(0.5, 1).setDepth(1950);

  const it = {
    kind: 'trial', custom: true, radius: TRIAL_RADIUS,
    step: p.step, bossRune: !!p.bossRune, x: p.x, y: p.y,
    sprite, aura, label, alive: true,
  };
  it.onInteract = () => interactTrial(scene, it);
  it.hint = (press) => trialHint(scene, it, press);
  scene.interactables.push(it);
  scene.trials.push(it);
  refreshTrial(scene, it);
}

/** 按课题进度刷新符文外观：已解 = 灰 + ✓，当前 = 金光，封印 = 暗紫 */
function refreshTrial(scene, it) {
  const st = stepState(G, scene.realm.id, it.step);
  const name = `${STEP_MARK[it.step]} ${REALM_STEPS[it.step]}`;
  it.state = st;
  it.alive = st !== 'solved';
  it.aura.setVisible(st === 'next');
  if (st === 'solved') {
    it.sprite.setTint(0x8a8496);
    it.label.setText(`${name} ✓`).setColor('#9fd8c8');
  } else if (st === 'next') {
    it.sprite.clearTint();
    it.label.setText(name).setColor('#ffd257');
  } else {
    it.sprite.setTint(0x5c5470);
    it.label.setText(name).setColor('#8a8496');
  }
}

function trialHint(scene, it, press) {
  const i = it.step;
  const st = stepState(G, scene.realm.id, i);
  if (st === 'solved') return `第 ${i + 1} 步「${REALM_STEPS[i]}」已完成 ✓`;
  if (st === 'next') return `${press} 解读课题符文 · 第 ${i + 1} 步「${REALM_STEPS[i]}」`;
  const n = realmState(G, scene.realm.id).steps;
  return `第 ${i + 1} 步封印中：先完成第 ${n + 1} 步「${REALM_STEPS[n]}」`;
}

function interactTrial(scene, it) {
  const id = scene.realm.id;
  const st = stepState(G, id, it.step);
  if (st === 'solved') {
    scene.floatText(it.x, it.y - 300, `「${REALM_STEPS[it.step]}」已完成 ✓`, '#3ddad7');
    return;
  }
  if (st === 'locked') {
    // 越级：不开题，提示真正该做的那一步（科研流程有先后依赖）
    const n = realmState(G, id).steps;
    sfx.hitEnemy();
    scene.floatText(it.x, it.y - 300, `先完成第 ${n + 1} 步「${REALM_STEPS[n]}」`, '#9fb8ff');
    return;
  }
  openTrialQuiz(scene, it);
}

/** 打开课题符文的答题面板：题目每步固定（不走同池随机抽题），答错扣心规则与主线一致 */
function openTrialQuiz(scene, it) {
  const realm = scene.realm;
  const step = realm.steps[it.step];
  const q = { ...QUESTIONS[step.qid], id: step.qid, chapterBoss: it.bossRune };
  scene.quiz.open(q, {
    slot: realmSlot(realm, it.step), // 学习记录：哪块课题符文
    kind: 'trial',                   // 学习记录：秘境作答（错题本按题目所属章归档）
    heading: `${realm.project} · 第 ${it.step + 1} 步 · ${REALM_STEPS[it.step]}`,
    onCorrect: () => {
      if (!solveRealmStep(G, realm.id, it.step)) return;
      updateHud(); // 进度变化 → 自动存档
      sfx.pickup();
      scene.trials.forEach((t) => refreshTrial(scene, t));
      if (it.bossRune) { scene.breakBossShield(); return; }
      healHearts(1);
      sfx.heal();
      scene.floatText(it.x, it.y - 300, `+1 ❤ 「${REALM_STEPS[it.step]}」完成`, '#ffd257');
      scene.spawnShardFx(it.x, it.y - 88);
      if (it.step === FIELD_STEPS - 1) scene.openSanctumDoor();
    },
  });
}

// ---------- 场景 ----------

/** 秘境大厅：四扇课题之门，门下标注 Project 名与进度 */
export class RealmHallScene extends WorldScene {
  constructor() { super(REALM_HALL.key); this.ch = HALL_VIEW; }

  init(data) { this.spawnKey = data && data.spawn ? data.spawn : 'fromVillage'; }

  enterRegion() { G.realm = 'hall'; }

  create() {
    this.mapDef = buildRealmHall();
    super.create();
    // 课题之门下方的门牌：Project 名 + 课题名 + 进度
    this.mapDef.props.filter((p) => p.type === 'door' && p.realmId).forEach((p) => {
      const realm = REALMS.find((r) => r.id === p.realmId);
      const s = realmState(G, realm.id);
      const status = s.done ? `✦ ${realm.badge}` : s.steps ? `课题 ${s.steps} / ${STEP_COUNT}` : '未开始';
      this.add.text(p.x, p.y + 96, `${realm.project}\n${realm.title}\n${status}`, {
        fontFamily: LABEL_FONT, fontSize: '40px', color: s.done ? '#ffd257' : '#f6ecd8',
        stroke: '#2c2438', strokeThickness: 10, align: 'center', lineSpacing: 4,
      }).setOrigin(0.5, 0).setDepth(1950);
    });
  }

  musicCue() { return 'title'; }

  talkToElder() {
    const n = badgeCount(G);
    this.dialogue.say({
      name: '秘境石碑',
      lines: [
        '欢迎来到 Project 秘境——课程的八个 Project，在这里各是一片小小的世界。',
        '每片秘境都有一条六步课题链：选题 → 文献 → 数据 → 分析 → 验证 → 报告，前一步解开，下一步才会亮起。',
        '前五步的课题符文在外庭；第六步「报告」在圣所里——向守护者汇报成功，才能击败它、封印课题。',
        `已获得课题徽章 ${n} / ${REALMS.length}：${REALMS.map((r) => `${r.project}「${r.title}」${realmState(G, r.id).done ? '✦' : `${realmState(G, r.id).steps}/${STEP_COUNT}`}`).join('，')}。`,
      ],
    });
  }
}

/** 外庭：五块课题符文 + 课题石碑（+ 可选观测台），第五步解开时圣所之门解封 */
export class RealmFieldScene extends WorldScene {
  constructor(realm) { super(realm.fieldKey); this.realm = realm; this.ch = realmView(realm); }

  init(data) { this.spawnKey = data && data.spawn ? data.spawn : 'fromHall'; }

  enterRegion() { G.realm = this.realm.id; }

  create() {
    this.trials = [];
    this.mapDef = buildRealmField(this.realm);
    super.create();
  }

  musicCue() { return this.realm.music; }

  spawnProp(p) {
    if (p.type === 'trial') { spawnTrial(this, p); return; }
    super.spawnProp(p);
  }

  talkToElder() {
    const realm = this.realm;
    const s = realmState(G, realm.id);
    let next;
    if (s.done) next = `课题已封印——「${realm.badge}」已收入行囊。`;
    else if (s.steps < FIELD_STEPS) next = `下一步：第 ${s.steps + 1} 步「${REALM_STEPS[s.steps]}」——${realm.steps[s.steps].task}。`;
    else if (s.steps === FIELD_STEPS) next = `前五步已完成！东侧的${realm.lairName}已经打开，去向${realm.bossName}「报告」吧。`;
    else next = `报告已经递上——去${realm.lairName}击败${realm.bossName}，封印本课题！`;
    this.dialogue.say({
      name: `${realm.project} · 课题石碑`,
      lines: [...realm.intro, `课题链：${chainLine(s.steps)}`, next],
    });
  }

  /** 第五步「验证」解开：东侧圣所之门当场解封（门的 requires 同时转为满足） */
  openSanctumDoor() {
    const it = this.interactables.find((i) => i.kind === 'doorlink' && i.prop.to === this.realm.lairKey);
    if (!it || !it.locked) return;
    it.locked = false;
    it.sprite.clearTint();
    if (it.body) it.body.body.enable = false;
    const aura = this.add.image(it.x, it.y - 72, 'particle')
      .setTint(0xffd257).setAlpha(0.16).setScale(36).setDepth(it.y - 2);
    this.tweens.add({ targets: aura, alpha: 0.3, scale: 42, duration: 900, yoyo: true, repeat: -1, ease: 'sine.inout' });
    sfx.openGate();
    this.cameras.main.shake(240, 0.004);
    this.floatText(it.x, it.y + 180, `${this.realm.lairName}之门开启了！`, '#ffd257');
  }
}

/** 圣所：第六步「报告」= BOSS 符文；击败秘境 BOSS → 课题封印页 + 徽章 */
export class RealmSanctumScene extends WorldScene {
  constructor(realm) { super(realm.lairKey); this.realm = realm; this.ch = realmView(realm); }

  init(data) { this.spawnKey = data && data.spawn ? data.spawn : 'fromField'; }

  enterRegion() { G.realm = this.realm.id; }

  create() {
    this.trials = [];
    const def = buildRealmSanctum(this.realm);
    if (realmState(G, this.realm.id).done) def.boss = null; // 已封印：守护者不再出现
    this.mapDef = def;
    super.create();

    // BOSS 招牌机制：同章节巢穴——护盾期机制进圣所即布置；带着破盾进度重进则直接开战
    this.events.once('shutdown', hideBossBanner);
    const mech = this.boss && this.boss.mech;
    if (!mech) return;
    const shielded = this.isBossShielded();
    mech.onLairReady(shielded);
    if (!shielded) {
      mech.activate('reenter');
      this.announceMechanic();
    } else if (mech.preShield) {
      this.announceMechanic();
    }
  }

  isBossShielded() { return realmBossShielded(G, this.realm.id); }

  musicCue() { return realmState(G, this.realm.id).done ? 'lair-calm' : 'boss'; }

  spawnProp(p) {
    if (p.type === 'trial') { spawnTrial(this, p); return; }
    super.spawnProp(p);
  }

  announceMechanic() {
    const m = this.realm.bossMechanic;
    if (m) showBossBanner({ bossName: this.realm.bossName, name: m.name, tip: m.tip });
  }

  /** 第六步「报告」答对：护盾破碎，招牌机制开战 */
  breakBossShield() {
    if (!this.boss || !this.boss.active) return;
    sfx.shieldBreak();
    this.boss.clearTint();
    this.cameras.main.flash(300);
    this.cameras.main.shake(300, 0.006);
    this.floatText(this.boss.x, this.boss.y - 32, '报告无懈可击——护盾破碎了！', '#ff9db3');
    if (this.boss.mech) {
      this.boss.mech.activate('shieldBroken');
      this.announceMechanic();
    }
  }

  onBossDefeated() {
    const realm = this.realm;
    sealRealm(G, realm.id);
    updateHud();
    const n = badgeCount(G);
    this.time.delayedCall(1100, () => {
      hideBossBanner(); // 破盾横幅还没自动收起时（速杀 BOSS），别叠在封印页上
      showVictory(this.ch, {
        stats: [
          { icon: ICON.key, num: `${STEP_COUNT} / ${STEP_COUNT}`, label: '课题步骤' },
          { icon: ICON.star, num: realm.badge, label: '获得徽章' },
          { icon: ICON.flag, num: `${n} / ${REALMS.length}`, label: '课题徽章' },
        ],
        onNext: () => this.scene.start(REALM_HALL.key, { spawn: hallSpawnKey(realm) }),
      });
    });
  }
}

/** 工厂：大厅 + 每个秘境的外庭与圣所（Phaser 需要每个场景独立的类与 key） */
export function makeRealmScenes() {
  const out = [RealmHallScene];
  for (const realm of REALMS) {
    out.push(class extends RealmFieldScene { constructor() { super(realm); } });
    out.push(class extends RealmSanctumScene { constructor() { super(realm); } });
  }
  return out;
}

/** 全部秘境场景 key（测试接缝的 active() 据此在场景里查找当前场景） */
export const REALM_SCENE_KEYS = [REALM_HALL.key, ...REALMS.flatMap((r) => [r.fieldKey, r.lairKey])];
