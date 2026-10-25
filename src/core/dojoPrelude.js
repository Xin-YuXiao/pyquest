// ============================================================
// 代码训练场 · Python 前导代码（英雄 API + 运行玩家代码）
//
// 同一份源码跑在两处，保证行为一致：
//   - 浏览器：Pyodide Worker 里执行（_dojo_js 由 pyodide.registerJsModule 注入，call 直通关卡模拟器）；
//   - CI / 本机：scripts/verify-dojo.mjs 用 CPython 执行（_dojo_js 是一个经 stdin/stdout 问答的桥）。
// 英雄 API 每次调用都转给 JS 侧模拟器同步结算（core/dojoSim.js 的 apply）；
// 模拟器返回停止信号时抛出 _HeroStop（继承 BaseException，玩家的 except Exception 拦不住）。
// 玩家代码以文件名 <勇者代码> 编译：报错行号与每个动作对应的源码行都按它取。
// ============================================================

export const HERO_FILE = '<勇者代码>';

export const HERO_PRELUDE = String.raw`
import sys, io, json, traceback
from _dojo_js import call as _js_call

HERO_FILE = '<勇者代码>'
_DIRS = ('up', 'down', 'left', 'right')


class _HeroStop(BaseException):
    """本次运行已结束（胜负已分 / 步数用尽）"""


def _hero_line():
    f = sys._getframe(2)
    while f is not None and f.f_code.co_filename != HERO_FILE:
        f = f.f_back
    return f.f_lineno if f is not None else 0


def _hero_do(op, arg=None):
    r = _js_call(op, arg, _hero_line())
    if r == '__stop__':
        raise _HeroStop()
    return r


def _check_dir(direction, optional=False):
    if optional and direction is None:
        return
    if direction not in _DIRS:
        raise ValueError("方向只能是 'up'、'down'、'left'、'right'，收到的是 %r" % (direction,))


def move(direction):
    _check_dir(direction)
    _hero_do('move', direction)


def jump():
    _hero_do('jump', None)


def attack():
    _hero_do('attack', None)


def look(direction=None):
    _check_dir(direction, optional=True)
    return _hero_do('look', direction)


def _hero_input(*args):
    raise RuntimeError('训练场里不能用 input()——需要的数据都已经准备好了')


_HERO_API = {'move': move, 'jump': jump, 'attack': attack, 'look': look}


def _run_hero(code, api_json, vars_json):
    ns = {'__name__': '__main__', 'input': _hero_input}
    for name in json.loads(api_json):
        ns[name] = _HERO_API[name]
    ns.update(json.loads(vars_json))
    out = io.StringIO()
    old = sys.stdout
    sys.stdout = out
    err = None
    try:
        exec(compile(code, HERO_FILE, 'exec'), ns)
    except _HeroStop:
        pass
    except SyntaxError as e:
        err = {'type': type(e).__name__, 'msg': str(e.msg), 'line': e.lineno}
    except BaseException as e:
        line = None
        for fr in traceback.extract_tb(e.__traceback__):
            if fr.filename == HERO_FILE:
                line = fr.lineno
        err = {'type': type(e).__name__, 'msg': str(e), 'line': line}
    finally:
        sys.stdout = old
    return json.dumps({'stdout': out.getvalue()[-4000:], 'error': err}, ensure_ascii=False)
`;

// ---------- Python 报错 → 中文提示 ----------

const SYNTAX_MSG = [
  [/expected ':'/, '这里少了冒号 :（if / for / while / def 那一行末尾要有冒号）'],
  [/expected an indented block/, '这里需要缩进：冒号下一行的代码要往里缩 4 个空格'],
  [/unexpected indent/, '这一行多缩进了'],
  [/unindent does not match/, '缩进对不齐：同一层的代码要缩进一样多'],
  [/unterminated string literal|EOL while scanning/, '字符串的引号没有配对'],
  [/was never closed/, '括号没有闭合'],
  [/unmatched/, '多了一个右括号'],
  [/invalid syntax/, '写法不对（检查拼写、引号、括号）'],
  [/Did you mean '=='/, "比较相等要用 ==（一个 = 是赋值）"],
  [/cannot assign to/, '不能给这个东西赋值'],
];

/** err: { type, msg, line } → 「第 N 行：……」；apiNames 用于提示本关能用的函数 */
export function explainPyError(err, apiNames = []) {
  if (!err) return '';
  const where = err.line ? `第 ${err.line} 行：` : '';
  const msg = String(err.msg || '');
  let text;
  if (err.type === 'SyntaxError' || err.type === 'IndentationError' || err.type === 'TabError') {
    const hit = SYNTAX_MSG.find(([re]) => re.test(msg));
    text = `${err.type === 'SyntaxError' ? '语法错误' : '缩进错误'}——${hit ? hit[1] : msg}`;
  } else if (err.type === 'NameError') {
    const m = /name '(.+?)' is not defined/.exec(msg);
    const api = apiNames.length ? `本关能用的有：${apiNames.join(' / ')}` : '';
    text = m
      ? `名字 ${m[1]} 没有定义——拼写对吗？${api}`
      : `名字没有定义：${msg}`;
  } else if (err.type === 'TypeError') {
    if (/missing \d+ required positional argument/.test(msg)) {
      text = "调用少了参数——比如 move 要告诉它方向：move('right')";
    } else if (/takes \d+ positional arguments? but \d+ (was|were) given/.test(msg)) {
      text = '给了多余的参数（jump() 和 attack() 不需要参数）';
    } else {
      text = `类型错误：${msg}`;
    }
  } else if (err.type === 'ValueError' || err.type === 'RuntimeError') {
    text = msg;
  } else if (err.type === 'IndexError') {
    text = '列表下标越界：下标从 0 开始，最大是 len(列表) - 1';
  } else if (err.type === 'ZeroDivisionError') {
    text = '除以零了';
  } else if (err.type === 'RecursionError') {
    text = '函数一直在调用自己，停不下来了';
  } else {
    text = `${err.type}：${msg}`;
  }
  return where + text;
}
