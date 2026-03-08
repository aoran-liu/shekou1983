// =============================================
// 蛇口1983 · 制度变量分支系统 v2.0
// =============================================

// ══════════════════════════════════════════
// 音频系统（HTML5 Audio BGM + Web Speech TTS）
// ══════════════════════════════════════════
const Audio = (() => {
  let current = null;   // 当前BGM Audio元素
  let bgmName = '';
  let muted = false;
  let ttsEnabled = true;
  const synth = window.speechSynthesis;

  const TRACKS = {
    solemn:  'assets/bgm-solemn.mp3',   // 庄严历史感
    tense:   'assets/bgm-tense.mp3',    // 紧张悬疑
    joyful:  'assets/bgm-joyful.mp3',   // 喜庆结算
    ambient: 'assets/bgm-ambient.mp3',  // 日常环境音
  };

  const LABEL = {
    solemn: '📜 历史庄严', tense: '⚡ 紧张悬疑',
    joyful: '🎉 喜庆', ambient: '🔧 日常环境音',
  };

  function play(key) {
    const src = TRACKS[key];
    if (!src) return stopBgm();
    // 同一曲目不重复加载
    if (current && current._key === key && !current.paused) return;
    stopBgm(500);
    const a = new window.Audio(src);
    a._key = key;
    a.loop = true;
    a.volume = muted ? 0 : 0.3;
    a.play().catch(() => {});
    current = a;
    bgmName = LABEL[key] || key;
    updateBar();
  }

  function stopBgm(fadeMs = 600) {
    if (!current) return;
    const a = current;
    current = null;
    bgmName = '';
    if (fadeMs > 0) {
      const step = a.volume / (fadeMs / 50);
      const t = setInterval(() => {
        a.volume = Math.max(0, a.volume - step);
        if (a.volume <= 0) { clearInterval(t); a.pause(); }
      }, 50);
    } else {
      a.pause();
    }
    updateBar();
  }

  // 场景→曲目映射
  const SCENE_BGM = {
    s0: null, s1: 'solemn',
    s2: 'tense',
    s3: 'ambient',
    s4: 'solemn',
    s5: 'tense',
    s6: 'tense',
    s7: 'solemn',
    s8: 'tense',
    s9: 'joyful',
    s10: 'solemn',
  };

  function forScreen(id) {
    const key = SCENE_BGM[id];
    if (key) play(key); else stopBgm();
  }

  // ── TTS 朗读 ──────────────────────────────
  function speak(text) {
    if (!ttsEnabled || !synth) return;
    synth.cancel();
    const plain = text.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, '').replace(/\s+/g, ' ').trim();
    if (!plain) return;
    const utt = new SpeechSynthesisUtterance(plain);
    utt.lang = 'zh-CN';
    utt.rate = 0.88;
    utt.pitch = 0.95;
    const voices = synth.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh-CN') && /female|ting|mei|xiao/i.test(v.name))
      || voices.find(v => v.lang.startsWith('zh-CN'))
      || voices.find(v => v.lang.startsWith('zh'));
    if (zhVoice) utt.voice = zhVoice;
    synth.speak(utt);
  }

  function stopSpeak() { if (synth) synth.cancel(); }

  function toggleMute() {
    muted = !muted;
    if (current) current.volume = muted ? 0 : 0.3;
    updateBar();
  }

  function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    if (!ttsEnabled) stopSpeak();
    updateBar();
  }

  function updateBar() {
    const lbl = document.getElementById('bgmLabel');
    const muteBtn = document.getElementById('bgmMuteBtn');
    const ttsBtn = document.getElementById('bgmTtsBtn');
    if (lbl) lbl.textContent = bgmName || '— 无BGM —';
    if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
    if (ttsBtn) ttsBtn.textContent = ttsEnabled ? '🗣️' : '🔕';
  }

  // 暴露便捷方法
  const playTense = () => play('tense');
  const playJoyful = () => play('joyful');
  const playAmbient = () => play('ambient');
  const playSolemn = () => play('solemn');

  return { forScreen, speak, stopSpeak, toggleMute, toggleTTS,
           playTense, playJoyful, playAmbient, playSolemn, stopBgm, updateBar };
})();

// ── 游戏状态 ──────────────────────────────
const G = {
  identity: null,       // worker / woman / manager / elder
  boxes: 0,
  wage: 0,
  bonusBoxes: 0,
  stamina: 5,
  timerSec: 540,
  timerInterval: null,
  gameOver: false,
  eventFired: false,
  event2Fired: false,
  milestoneShown: false,   // 防止100箱弹窗重复触发
  choices: {},
  archivesUnlocked: new Set(['slogan']),
  playCount: parseInt(localStorage.getItem('sk83_plays') || '0'),

  // ── 三个制度价值变量（核心新增）──
  values: {
    reform:      0,   // 改革认同度  -3 ~ +3
    solidarity:  0,   // 集体意识    -3 ~ +3
    agency:      0,   // 个人能动性  -3 ~ +3
  },
};

// 修改value并钳位，并更新立场标签
function addVal(key, delta) {
  G.values[key] = Math.max(-3, Math.min(3, G.values[key] + delta));
  updateStanceTags();
}
function val(key) { return G.values[key]; }

// 立场标签：显示在S3面板底部（或其他幕次）
function updateStanceTags() {
  const el = document.getElementById('stanceTags');
  if (!el) return;
  const tags = [];
  const { reform, solidarity, agency } = G.values;
  if (reform >= 1) tags.push(`<span class="stance-tag stance-reform">改革派 +${reform}</span>`);
  else if (reform <= -1) tags.push(`<span class="stance-tag" style="border-color:#888;color:#888">保守派 ${reform}</span>`);
  if (solidarity >= 1) tags.push(`<span class="stance-tag stance-solidarity">集体主义 +${solidarity}</span>`);
  if (agency >= 1) tags.push(`<span class="stance-tag stance-agency">个人主义 +${agency}</span>`);
  el.innerHTML = tags.length ? tags.join('') : '<span style="font-size:10px;color:rgba(255,255,255,.2);letter-spacing:1px">选择将影响你的历史角色</span>';
}

// ── 历史档案数据 ──────────────────────────
const ARCHIVES = {
  slogan: {
    year: '1979', title: '「时间就是金钱，效率就是生命」',
    sub: '蛇口工业区首块标语牌',
    text: '1979年，袁庚在蛇口工业区立起这块标语牌，在当时引发全国巨大争议——「时间就是金钱」被认为是宣扬资本主义。\n\n1992年邓小平南巡，在蛇口亲自肯定了这句话。从此这句口号进入中国改革开放史的核心叙事。',
    note: '这块标语牌的原件，现存于深圳博物馆。',
    img: 'assets/banner-slogan.jpg',
  },
  wage: {
    year: '1981', title: '定额超产奖励制度通知',
    sub: '1981年11月 · 蛇口工业区劳资处',
    text: '根据袁庚同志指示，自本月起在招商局码头试行「定额超产奖励制度」。工人完成基础定额后，每超产一箱集装箱奖励4分钱，不设上限。\n\n这是中国内地第一个打破平均主义的计件工资制度。第一个月，最勤快的工人工资是最懈怠者的3倍。',
    note: '这4分钱，撬动了整个中国的分配制度改革。',
  },
  wage_solidarity: {
    year: '1981', title: '工友互助：集体谈判的第一次尝试',
    sub: '1981年 · 蛇口工业区',
    text: '计件制推行初期，部分工人自发联合，要求管理层在制定定额时充分听取工人意见。\n\n这是蛇口最早的集体协商实践，虽然规模有限，但开创了工人主动参与制度设计的先例。',
    note: '这次集体协商未被正式记录，但在多位老工人的回忆录中有所提及。',
  },
  contract: {
    year: '1983', title: '劳动合同书（蛇口第一份）',
    sub: '1983年3月 · 蛇口工业区',
    text: '蛇口在全国率先推行劳动合同制，打破「铁饭碗」。合同规定双方权利义务，企业可依法解雇，工人可依法辞职。\n\n当年，黄大发成为中国第一个被依法解除劳动合同的工人，引发全国报道。蛇口的做法在争议声中被全国推广。',
    note: '1986年，《劳动合同法》在全国正式推行，蛇口是先行者。',
    img: 'assets/doc-contract.jpg',
  },
  contract_negotiated: {
    year: '1983', title: '合同谈判内幕：一次被压下去的修订',
    sub: '1983年 · 蛇口工业区（内部档案）',
    text: '1983年劳动合同制推行时，有工人代表提出「女工怀孕期间不得解雇」的条款修订要求。\n\n这一要求经过内部讨论后，以「条件尚不成熟」为由被暂时搁置。直至1994年《劳动法》出台，这一保护才得以明确写入法律。',
    note: '这份内部讨论记录来自南山区档案馆，2019年对外开放。',
  },
  bidding: {
    year: '1984', title: '工程招投标公告（蛇口第一份）',
    sub: '1984年 · 蛇口工业区建委',
    text: '蛇口在全国率先将工程建设项目面向社会公开招标，以价格和质量为评标标准，明确拒绝以关系作为参考依据。\n\n这一举措引发巨大争议——在当时，「按关系」是全国工程发包的默认规则。但招标结果证明，按规则选出的单位，工期和质量都优于关系户。',
    note: '中国《招投标法》1999年出台，蛇口早了整整15年。',
  },
  insurance: {
    year: '1985', title: '蛇口工业区社会保险制度方案',
    sub: '1985年 · 蛇口工业区',
    text: '蛇口在全国率先建立个人缴纳型社会保险制度，涵盖养老、医疗、工伤三项保障。个人缴纳比例为工资的5%，企业配套缴纳。\n\n这打破了原有「国家全包」的体制——工人第一次需要为自己的保障付费，也第一次拥有了与工作单位无关的独立保障账户。',
    note: '这是中国社会保障制度改革的起点之一。',
  },
  vote: {
    year: '1986', title: '蛇口工业区管委会选举公告',
    sub: '1986年 · 蛇口工业区',
    text: '1986年，蛇口工业区举行中国内地第一次工业区管理委员会公开选举，候选人需公开竞选演讲，由全体工人投票决定。\n\n这一举措在当时具有重大的政治意义，是中国基层民主的最早实践之一，也是蛇口「特区精神」的重要组成部分。',
    note: '这次选举被视为中国基层民主的一次重要实验。',
    img: 'assets/doc-ballot.jpg',
  },
  fengbo: {
    year: '1988', title: '蛇口风波：一场关于「自私」的辩论',
    sub: '1988年1月 · 蛇口招待所',
    text: '1988年1月，一批大学生来到蛇口进行交流，在演讲中称蛇口工人来此打工是「为了个人利益，是自私的」。\n\n台下的工人们集体反驳，认为个人利益与国家利益并不对立，「多劳多得」本身就是为社会创造价值。\n\n这场争论引发全国讨论，史称「蛇口风波」，成为改革开放思想解放史上的重要事件。',
    note: '这场辩论的完整记录，被收入《蛇口档案》，现存于南山博物馆。',
  },
};

// ── NPC台词默认池 ──────────────────────────
const NPC_LINES = [
  '快点！这批货赶着出口，超额完成今天的指标能多拿奖金！',
  '加油加油！你已经超过今天目标一半了！',
  '听说隔壁班老王昨天搬了120箱，你要加把劲！',
  '袁庚主任说了，多劳多得，不再吃大锅饭！',
  '你知道吗，我们比内地工人工资高多了，珍惜机会！',
  '时间就是金钱——快！',
  '再坚持一下，收工了咱去吃肠粉！',
];
let npcIdx = 0;

// ── 工具 ──────────────────────────────────
function $(id) { return document.getElementById(id); }

const cursor = $('cursor');
if (cursor) {
  document.addEventListener('mousemove', e => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });
}

// ── 屏幕切换 ──────────────────────────────
function goTo(id) {
  // BGM切换（暂时关闭）
  // Audio.forScreen(id);

  // 控制全局退出按钮显隐
  const exitBtn = $('globalExit');
  if (exitBtn) exitBtn.style.display = (id === 's0' || id === 's1') ? 'none' : 'block';

  if (id === 's2') setTimeout(injectS2, 80);
  if (id === 's3') setTimeout(initTask, 80);
  if (id === 's4') setTimeout(injectS4, 80);
  if (id === 's5') setTimeout(injectS5, 80);
  if (id === 's6') setTimeout(injectS6, 80);
  if (id === 's7') setTimeout(injectS7, 80);
  if (id === 's8') setTimeout(injectS8, 80);
  if (id === 's9') setTimeout(buildReport, 80);
  if (id === 's10') setTimeout(buildArchiveHall, 80);

  document.querySelectorAll('.screen.active').forEach(s => {
    s.classList.remove('visible');
    const sid = s.id;
    setTimeout(() => { if (sid !== id) s.classList.remove('active'); }, 700);
  });

  const el = $(id);
  if (!el) return;
  el.classList.add('active');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
  setTimeout(() => {
    el.querySelectorAll('.screen-video').forEach(v => v.play().catch(()=>{}));
  }, 100);
}

function transition(fn) {
  const cover = $('transCover');
  cover.classList.add('on');
  setTimeout(() => {
    fn();
    setTimeout(() => cover.classList.remove('on'), 600);
  }, 400);
}

// ── 开场 ──────────────────────────────────
window.addEventListener('load', () => {
  const s0 = $('s0');
  s0.classList.add('active');
  const vid = $('s0Video');
  if (vid) vid.play().catch(()=>{});
  setTimeout(() => {
    s0.classList.add('visible');
    setTimeout(() => {
      $('s0Content').classList.add('go');
      $('s0Credit').classList.add('go');
    }, 400);
  }, 100);

  // ── 所有幕次 act-header 注入退出按钮 ──────
  document.querySelectorAll('.act-header').forEach(header => {
    const btn = document.createElement('button');
    btn.className = 'exit-btn';
    btn.innerHTML = '✕ 退出';
    btn.onclick = () => {
      if (confirm('退出当前体验？进度将不会保存。')) {
        clearInterval(G.timerInterval);
        G.timerInterval = null;
        restart();
      }
    };
    header.appendChild(btn);
  });

  // S3 面板退出按钮已在 HTML 中固定，无需动态注入
});

// ── S1: 身份选择 ──────────────────────────
function chooseIdentity(id) {
  // 防重复点击：已选过就忽略
  if (G.identity) return;
  G.identity = id;
  G.values = { reform: 0, solidarity: 0, agency: 0 };
  document.querySelectorAll('.id-card-choice').forEach(c => {
    c.classList.remove('selected');
    c.style.pointerEvents = 'none'; // 禁用所有卡片
  });
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) el.classList.add('selected');
  transition(() => goTo('s2'));
}

// ══════════════════════════════════════════
// S2: 幕一·1979·炸山（第一个分支：建立初始价值倾向）
// ══════════════════════════════════════════
function injectS2() {
  const choicesEl = $('s2-choices');
  if (!choicesEl || choicesEl.dataset.injected) return;
  choicesEl.dataset.injected = '1';

  // 根据身份给选项不同的颜色提示
  const isMgr = G.identity === 'manager';
  const isElder = G.identity === 'elder';

  choicesEl.innerHTML = `
    <p class="choice-prompt">听完袁庚的「开山炮」演讲，你心里想的是……</p>
    <div class="choice-row" style="flex-wrap:wrap;gap:10px">
      <button class="choice-btn s2-choice" onclick="s2Choose('reform',this)">
        🔥 这是历史的必然
        <small>改革的方向是对的</small>
      </button>
      <button class="choice-btn s2-choice" onclick="s2Choose('solidarity',this)">
        🤝 炸山容易，建设难
        <small>靠大家一起才能成</small>
      </button>
      <button class="choice-btn s2-choice" onclick="s2Choose('agency',this)">
        💼 我只是想找份好工作
        <small>先顾好自己</small>
      </button>
      ${isElder ? `<button class="choice-btn s2-choice" onclick="s2Choose('elder',this)">
        😒 这跟以前说的不一样
        <small>变化太快了，不踏实</small>
      </button>` : ''}
    </div>`;
}

function s2Choose(type, el) {
  document.querySelectorAll('.s2-choice').forEach(b => { b.classList.remove('selected'); b.disabled = true; });
  el.classList.add('selected');
  if (type === 'reform')     { addVal('reform', 1); }
  if (type === 'solidarity') { addVal('solidarity', 1); }
  if (type === 'agency')     { addVal('agency', 1); }
  if (type === 'elder')      { addVal('solidarity', -1); addVal('reform', -1); }
  G.choices.s2 = type;

  const replyMap = {
    reform:     '改革的浪潮，你已感受到它的方向。历史将证明，你站对了时代的一边。',
    solidarity: '山还没炸平，路还没修好——但你知道，靠一个人的力气，这片土地不会改变。',
    agency:     '家里还有人等着你的工资。先站稳这片土地，再想其他的。',
    elder:      '变化来得太快。二十年的经验，在这片工地上，好像突然不值钱了。',
  };
  const replyText = replyMap[type] || replyMap.reform;

  const choicesEl = $('s2-choices');
  if (choicesEl) {
    // 短暂显示选中状态后弹窗
    setTimeout(() => {
      showHistoryModal(
        replyText,
        `1979年7月，招商局蛇口工业区破土动工。<br>
        这声炮响，是中国改革开放的第一声。<br><br>
        两年后，蛇口码头将试行中国第一个计件工资制度——<br>
        <strong style="color:var(--cream)">多劳多得，从这里开始。</strong>`,
        's3',
        '进入 1981年 · 计件工资 →',
        undefined, undefined, 's2'
      );
    }, 400);
  }
}

// ══════════════════════════════════════════
// S3: 幕二·1981·计件（主交互 + 2次分支事件）
// ══════════════════════════════════════════
const IDENTITY_DATA = {
  worker: {
    npcName: '阿芳 · 凯达厂工友',
    npcLines: [
      '快点！这批货赶着出口，超额完成今天的指标能多拿奖金！',
      '加油！你已经超过今天目标一半了！',
      '听说隔壁班老王昨天搬了120箱，你要加把劲！',
      '袁庚主任说了，多劳多得，不再吃大锅饭！',
      '时间就是金钱——快！',
      '再坚持一下，收工了咱去吃肠粉！',
    ],
    hudLoc: '📍 招商局蛇口码头 · 计件工资制第一天',
    // 事件A（boxes≥30触发）
    eventA: {
      speaker: '老赵拦住你说',
      text: '「我干了十五年，每月工资跟你一样。从今天起，你靠计件能赚我三倍……这公平吗？」',
      opts: [
        { label: '多劳多得才公平', key: 'reform_yes',
          effect: () => { addVal('reform',1); addVal('solidarity',-1); },
          reply: '老赵沉默了一会儿：「你们年轻人，有干劲，好……」他转身继续搬货，速度慢下来了。' },
        { label: '你说得也有道理', key: 'solidarity_yes',
          effect: () => { addVal('solidarity',1); addVal('reform',-1); },
          reply: '「谢谢你，小伙子。」老赵拍了拍你的肩膀。「以后有机会，咱们一起去找管理层谈谈。」' },
      ],
    },
    // 事件B（boxes≥60触发，仅当solidarity≥1）
    eventB_condition: () => val('solidarity') >= 1,
    eventB: {
      speaker: '阿芳小声对你说',
      text: '「老赵他们几个老工人，想联名写信给管委会，说计件制定额太高了。你愿意一起签名吗？」',
      opts: [
        { label: '签，工人要发声', key: 'collective_yes',
          effect: () => { addVal('solidarity', 2); addVal('agency', 1); },
          reply: '「好！」阿芳眼睛亮了。「人多了才有用。」她把你的名字写在最后一行。',
          archiveUnlock: 'wage_solidarity' },
        { label: '算了，别惹事', key: 'collective_no',
          effect: () => { addVal('agency', -1); },
          reply: '阿芳点点头：「也是，各人自扫门前雪吧。」但她眼神里有一丝失望。' },
      ],
    },
    // 事件B（boxes≥60，当solidarity<1）
    eventB_alt: {
      speaker: '阿芳问你',
      text: '「你今天超额了吗？我差6箱就能拿超额奖励了。你帮我搬2箱，晚上我请你吃肠粉？」',
      opts: [
        { label: '好啊，互相帮忙', key: 'help_yes',
          effect: () => { addVal('solidarity', 1); },
          reply: '阿芳咧嘴笑了：「好兄弟！」你帮她搬完，她塞给你一颗糖。「先甜一下。」' },
        { label: '我自己也不够', key: 'help_no',
          effect: () => { addVal('agency', 1); },
          reply: '「行，我自己来。」她转头又开始拼命搬，汗水湿透了工装背后。' },
      ],
    },
  },

  woman: {
    npcName: '班长陈姐 · 凯达厂',
    npcLines: [
      '阿芳，你手速快，今天多完成几件，奖金够你寄回家了！',
      '加油！你妈在东莞等你寄钱呢，别拖！',
      '听说明天要抽查，做好一点别被扣钱！',
      '这批货是出口香港的，质量要过关！',
      '休息五分钟，喝口水，待会继续！',
      '你今天比昨天快多了，这月奖金有希望！',
    ],
    hudLoc: '📍 凯达厂缝纫车间 · 计件制第一天',
    eventA: {
      speaker: '班长陈姐压低声音',
      text: '「计件制做得多拿得多，但阿芳，女工要注意——签了合同之后，厂里有权随时解雇。你有没有想过，万一怀孕了……」',
      opts: [
        { label: '先把眼前的活做好', key: 'focus',
          effect: () => { addVal('agency', 1); },
          reply: '「你说得对，先顾眼前。」以后的事以后再说——但陈姐那句话，你没法真的忘掉。' },
        { label: '这政策对女工不公平', key: 'unfair',
          effect: () => { addVal('solidarity', 1); addVal('reform', -1); },
          reply: '陈姐叹了口气：「我也这么想，但说了有什么用……等哪天有人敢出头，我第一个举手。」' },
      ],
    },
    eventB_condition: () => val('solidarity') >= 1,
    eventB: {
      speaker: '小王（同宿舍的女工）找到你',
      text: '「厂里另一个女工被解雇了，说是效率不达标，但她私下说是因为刚怀孕。大家要联名投诉，你签吗？」',
      opts: [
        { label: '签！这不公平', key: 'sign_protest',
          effect: () => { addVal('solidarity', 2); },
          reply: '你在联名信上签了字。小王握了握你的手：「谢谢你。就算没用，也要说出来。」',
          archiveUnlock: 'wage_solidarity' },
        { label: '我怕被记恨，先看看', key: 'wait',
          effect: () => { addVal('agency', -1); },
          reply: '小王没说什么，只是点了点头。但你看见她转身时眼眶红了。' },
      ],
    },
    eventB_alt: {
      speaker: '陈姐悄声问你',
      text: '「你今天完成多少了？差一点就超额了，要不要加把劲冲一下？厂长看着呢。」',
      opts: [
        { label: '冲！争取超额奖励', key: 'push',
          effect: () => { addVal('agency', 1); },
          reply: '你低头猛干。手指有点麻了，但数字往上跳的感觉，让你上瘾。' },
        { label: '算了，累了，够用就好', key: 'rest',
          effect: () => { addVal('solidarity', 1); },
          reply: '你停下来休息，陪旁边的新来的小妹讲了几句话。工作嘛，别把自己搞垮了。' },
      ],
    },
  },

  manager: {
    npcName: '袁庚主任 · 工业区管委会',
    npcLines: [
      '陈志远，今天码头数据你要盯紧，这是计件制改革的第一天。',
      '效率上去了吗？记录好每个工人的完成量，这是历史数据。',
      '上面有人质疑计件制是走资本主义，你要有心理准备。',
      '改革不能只看今天，要看这套制度能不能持续。',
      '工人有意见吗？有意见很正常，慢慢来。',
      '数据比表态重要——今天的产量会说话。',
    ],
    hudLoc: '📍 蛇口工业区管委会办公室 · 监测计件制首日',
    eventA: {
      speaker: '电话铃响，是上级来问',
      text: '「陈志远，听说你们今天开始按件发工资？北京有同志说这是在搞资本主义那套，你们有政策依据吗？」',
      opts: [
        { label: '「有依据，袁庚主任批准的」', key: 'defend',
          effect: () => { addVal('reform', 1); addVal('agency', 1); },
          reply: '电话那头沉默了一会儿：「行，你们自己把握，出了问题你们负责。」你挂了电话，手心有点汗。' },
        { label: '「我们在摸索，请上级指导」', key: 'hedge',
          effect: () => { addVal('reform', -1); addVal('solidarity', 1); },
          reply: '电话那头口气缓和：「那你们注意，别走偏了。」你在心里叹了口气——有些话，说不出口。' },
      ],
    },
    eventB_condition: () => val('reform') >= 1,
    eventB: {
      speaker: '老工人代表找到你',
      text: '「陈干部，计件定额是谁定的？我们老工人一天搬不了100箱。能不能按工龄也给点补偿？」',
      opts: [
        { label: '「我去跟袁庚主任谈谈」', key: 'advocate',
          effect: () => { addVal('solidarity', 2); addVal('reform', 1); },
          reply: '你当天下午去找了袁庚。袁庚沉吟片刻：「定额可以根据工种分类……你这个建议合理，我来批。」',
          archiveUnlock: 'wage_solidarity' },
        { label: '「政策刚定，先执行吧」', key: 'follow',
          effect: () => { addVal('agency', 1); addVal('solidarity', -1); },
          reply: '老工人点点头，没再说话。你看见他离开时背稍微弓了一些——比来的时候。' },
      ],
    },
    eventB_alt: {
      speaker: '秘书送来今天的数据',
      text: '「陈干部，今天码头产量比上周提升了40%。你要不要写个简报报给上面？」',
      opts: [
        { label: '写，让上面知道改革成果', key: 'report_up',
          effect: () => { addVal('reform', 1); addVal('agency', 1); },
          reply: '你连夜写了简报，附上数据图表。这份报告后来成为全国推广计件制的重要参考文件之一。' },
        { label: '先等等，看看工人反馈再说', key: 'wait_feedback',
          effect: () => { addVal('solidarity', 1); },
          reply: '你决定先听听工人怎么说。改革的成败，数据是一方面，但人才是关键。' },
      ],
    },
  },

  elder: {
    npcName: '小李 · 新来的年轻工人',
    npcLines: [
      '赵师傅，你干这么多年了，今天计件制，你怎么看？',
      '赵师傅你懂的多，教教我们怎么搬快一点？',
      '赵师傅，听说以前大锅饭的时候，大家都不用这么拼命？',
      '你以前工资多少？和现在比呢？',
      '赵师傅，你觉得这改革是好事吗？',
      '唉，我觉得这里节奏太快了，跟不上……',
    ],
    hudLoc: '📍 招商局蛇口码头 · 计件工资制第一天',
    eventA: {
      speaker: '你停下来，看着年轻工人们飞快地搬货',
      text: '「他们一箱接一箱，工资噌噌往上跳。你二十年的经验，今天什么都不值。小李问你：赵师傅，你今天搬了多少？」',
      opts: [
        { label: '「我有我的节奏」', key: 'pride',
          effect: () => { addVal('agency', 1); addVal('reform', -1); },
          reply: '你说得很硬气，但心里清楚——这套新规则，不是为你设计的。' },
        { label: '「……我不如他们」', key: 'accept',
          effect: () => { addVal('reform', 1); addVal('solidarity', 1); },
          reply: '这是你第一次承认时代变了。说出口的那一刻，有些东西松动了——不是屈服，是放下。' },
      ],
    },
    eventB_condition: () => val('solidarity') >= 1,
    eventB: {
      speaker: '老王（和你一样的老工人）找到你',
      text: '「老赵，我今天搬了40箱，累成这样才拿1块6。你说咱们老人家，在这套新规则里怎么活？要不一起去找管理层，要求给老工人单独定额？」',
      opts: [
        { label: '「去！这不公平」', key: 'fight',
          effect: () => { addVal('solidarity', 2); addVal('reform', -1); },
          reply: '你和老王去找了陈志远。对方听完，沉默了一会儿：「我……你们等一下，我去问问袁庚主任。」',
          archiveUnlock: 'wage_solidarity' },
        { label: '「算了，别折腾了」', key: 'give_up',
          effect: () => { addVal('agency', -1); addVal('solidarity', -1); },
          reply: '「老赵，你这……」老王摇摇头走了。你继续搬货。每搬一箱，就像承认一次：时代变了，自己跟不上了。' },
      ],
    },
    eventB_alt: {
      speaker: '小李问你',
      text: '「赵师傅，你教我怎么搬快点吧？你经验多，肯定有诀窍。」',
      opts: [
        { label: '教他，把经验传下去', key: 'teach',
          effect: () => { addVal('solidarity', 1); addVal('agency', 1); },
          reply: '你教他怎么站位省力，怎么借力。小李速度快了一倍。「谢谢赵师傅！」——也许，经验有另一种价值。' },
        { label: '「自己琢磨去」', key: 'refuse',
          effect: () => { addVal('reform', -1); },
          reply: '小李讪讪走了。你继续搬着属于自己节奏的货。快，不是唯一的评判标准。' },
      ],
    },
  },
};

function getIdentityData() {
  return IDENTITY_DATA[G.identity] || IDENTITY_DATA.worker;
}

// 视差
document.addEventListener('mousemove', e => {
  const s3 = $('s3');
  if (!s3 || !s3.classList.contains('active')) return;
  const w = window.innerWidth - 360;
  const h = window.innerHeight;
  const cx = (e.clientX / w) - 0.5;
  const cy = (e.clientY / h) - 0.5;
  const pl0 = $('pl0'), pl1 = $('pl1');
  if (pl0) pl0.style.transform = `translate(${cx*-14}px,${cy*-8}px)`;
  if (pl1) pl1.style.transform = `translate(${cx*-26}px,${cy*-16}px)`;
});

// 点击场景也触发搬运
document.addEventListener('click', e => {
  const s3 = $('s3');
  if (!s3 || !s3.classList.contains('active')) return;
  if (e.target.closest('.panel')) return;
  doWork(e);
});

function initTask() {
  G.boxes = 0; G.wage = 0; G.bonusBoxes = 0;
  G.stamina = 5; G.timerSec = 540;
  G.eventFired = false; G.event2Fired = false; G.gameOver = false;
  clearInterval(G.timerInterval);
  updateTaskUI();

  const idata = getIdentityData();
  const npcName = $('npc-name-el');
  const hudLoc = $('sh-loc-el');
  if (npcName) npcName.textContent = idata.npcName;
  if (hudLoc) hudLoc.textContent = idata.hudLoc;
  NPC_LINES.splice(0, NPC_LINES.length, ...idata.npcLines);
  npcIdx = 0;
  const npcEl = $('npcText');
  if (npcEl) { npcEl.textContent = idata.npcLines[0]; npcEl.classList.add('npc-text-anim'); }

  const ab = $('archiveBtn3');
  if (ab) { ab.classList.remove('lit'); ab.textContent = '🔒 完成任务后解锁历史档案'; }

  G.timerInterval = setInterval(() => {
    if (G.gameOver) return;
    G.timerSec--;
    if (G.timerSec <= 0) { G.timerSec = 0; endTask(); return; }
    updateTimer();
    updateStamina();
    if (G.timerSec % 55 === 0) cycleNpc();
    if (!G.eventFired && G.boxes >= 30) triggerEvent('A');
    if (!G.event2Fired && G.boxes >= 60) triggerEvent('B');
  }, 1000);
}

function doWork(e) {
  if (G.gameOver) return;
  if (!G.timerInterval) resumeTask();

  // 体力消耗：每20箱掉1格（超额时每10箱掉1格）
  const prevStaminaMark = G.boxes > 100
    ? Math.floor((G.boxes - 100) / 10)
    : Math.floor(G.boxes / 20);

  G.boxes++;
  if (G.boxes > 100) G.bonusBoxes++;

  const newStaminaMark = G.boxes > 100
    ? Math.floor((G.boxes - 100) / 10)
    : Math.floor(G.boxes / 20);

  if (newStaminaMark > prevStaminaMark && G.stamina > 0) {
    G.stamina = Math.max(0, G.stamina - 1);
    updateStamina(true); // true = 闪烁动画
  }

  // 体力为0时每箱只算0.6箱（疲劳惩罚）
  const efficiency = G.stamina === 0 ? 0.6 : 1;
  G.wage = parseFloat((G.wage + 0.04 * efficiency + (G.boxes > 100 ? 0.02 * efficiency : 0)).toFixed(2));

  const btn = $('workBtn');
  if (btn) {
    btn.classList.remove('clicked');
    void btn.offsetWidth;
    btn.classList.add('clicked');
    setTimeout(() => btn.classList.remove('clicked'), 280);
  }
  spawnFx(e);
  updateTaskUI();
  if (G.boxes % 20 === 0) cycleNpc();
  if (G.boxes >= 100 && !G.milestoneShown) {
    G.milestoneShown = true;
    unlockTaskArchive();
  }
}

function spawnFx(e) {
  const fx = $('fx3');
  if (!fx) return;
  const btn = $('workBtn');
  let x, y;
  if (btn) {
    const r = btn.getBoundingClientRect();
    x = r.left + r.width / 2 + (Math.random() - 0.5) * 60;
    y = r.top + r.height / 2 + (Math.random() - 0.5) * 20;
  } else if (e && e.clientX) {
    x = e.clientX; y = e.clientY;
  } else {
    x = window.innerWidth * 0.4; y = window.innerHeight * 0.5;
  }
  const box = document.createElement('div');
  box.className = 'fx-box';
  box.textContent = '📦';
  box.style.left = (x - 16) + 'px';
  box.style.top  = (y - 16) + 'px';
  const tx = (Math.random() - 0.5) * 200;
  const ty = -(80 + Math.random() * 120);
  box.style.setProperty('--tx', tx + 'px');
  box.style.setProperty('--ty', ty + 'px');
  box.style.setProperty('--r', ((Math.random() - 0.5) * 180) + 'deg');
  fx.appendChild(box);
  setTimeout(() => box.remove(), 700);
  const money = document.createElement('div');
  money.className = 'fx-money';
  money.textContent = G.boxes > 100 ? '+¥0.06' : '+¥0.04';
  money.style.left = (x - 20) + 'px';
  money.style.top  = (y - 40) + 'px';
  fx.appendChild(money);
  setTimeout(() => money.remove(), 900);
}

function updateTaskUI() {
  const wage = $('wage'), boxes = $('boxes');
  const progBoxes = $('progBoxes'), progN = $('progN');
  const progBonus = $('progBonus'), progBonusN = $('progBonusN');
  if (wage) wage.textContent = '¥ ' + G.wage.toFixed(2);
  if (boxes) boxes.textContent = G.boxes + ' / 100';
  const pct = Math.min(100, G.boxes);
  if (progBoxes) progBoxes.style.width = pct + '%';
  if (progN) progN.textContent = pct + '%';
  const bonusPct = Math.min(100, G.bonusBoxes / 50 * 100);
  if (progBonus) progBonus.style.width = bonusPct + '%';
  if (progBonusN) progBonusN.textContent = '¥' + (G.bonusBoxes * 0.02).toFixed(2);
}

function updateTimer() {
  const el = $('timer');
  if (!el) return;
  const m = Math.floor(G.timerSec / 60).toString().padStart(2, '0');
  const s = (G.timerSec % 60).toString().padStart(2, '0');
  el.textContent = m + ':' + s;
  if (G.timerSec < 120) el.classList.add('danger');
}

function updateStamina(animate) {
  const el = $('stamina');
  if (!el) return;
  const filled = G.stamina;
  const empty = 5 - G.stamina;
  el.innerHTML = `<span style="color:${G.stamina <= 1 ? 'var(--red)' : 'var(--gold)'}">${'●'.repeat(filled)}</span><span style="opacity:.3">${'○'.repeat(empty)}</span>`;
  if (animate) {
    el.classList.remove('stamina-drain');
    void el.offsetWidth;
    el.classList.add('stamina-drain');
    if (G.stamina === 0) {
      const npc = $('npcText');
      if (npc) {
        npc.classList.remove('npc-text-anim');
        void npc.offsetWidth;
        npc.textContent = '你已经累了……每一箱都比上一箱更重。但你还是没停下来。';
        npc.classList.add('npc-text-anim');
      }
      // 体力耗尽 → 如果已达100箱，自动触发结算弹窗
      if (G.boxes >= 100 && !document.getElementById('milestoneModal') && !G.gameOver) {
        clearInterval(G.timerInterval);
        G.timerInterval = null;
        const cb = document.getElementById('collectBtn');
        if (cb) cb.style.display = 'block';
        showMilestoneModal();
      }
    }
  }
}

function cycleNpc() {
  npcIdx = (npcIdx + 1) % NPC_LINES.length;
  const el = $('npcText');
  if (!el) return;
  el.classList.remove('npc-text-anim');
  void el.offsetWidth;
  el.textContent = NPC_LINES[npcIdx];
  el.classList.add('npc-text-anim');
}

function unlockTaskArchive() {
  const btn = $('archiveBtn3');
  if (!btn || btn.classList.contains('lit')) return;
  btn.classList.add('lit');
  btn.textContent = '📂 解锁档案：4分钱改变中国';
  btn.onclick = () => openArchive('wage');
  G.archivesUnlocked.add('wage');

  // 显示「收工结算」按钮
  const cb = document.getElementById('collectBtn');
  if (cb) cb.style.display = 'block';

  // 暂停计时器，弹出二选一弹窗
  clearInterval(G.timerInterval);
  G.timerInterval = null;
  showMilestoneModal();
}

function showMilestoneModal() {
  const modal = document.createElement('div');
  modal.id = 'milestoneModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:8000;
    background:rgba(4,10,22,.75);backdrop-filter:blur(12px);
    display:flex;align-items:center;justify-content:center;
  `;
  modal.innerHTML = `
    <div style="
      background:rgba(10,20,40,.98);
      border:1px solid rgba(200,150,42,.4);
      padding:36px 40px;max-width:460px;width:90%;
      box-shadow:0 0 60px rgba(200,150,42,.12);
      text-align:center;
    ">
      <div style="font-size:28px;margin-bottom:12px">🎉</div>
      <div style="font-size:11px;color:var(--gold);letter-spacing:4px;margin-bottom:10px">目标达成</div>
      <div style="font-size:20px;color:var(--cream);margin-bottom:8px;font-weight:bold">
        你已完成 <span style="color:var(--gold)">100箱</span>
      </div>
      <div style="font-size:13px;color:rgba(242,232,208,.6);line-height:1.8;margin-bottom:28px">
        今日基础工资已到手 <strong style="color:var(--cream)">¥4.00</strong><br>
        每多搬一箱，额外奖励 ¥0.06<br>
        <span style="font-size:11px;color:rgba(242,232,208,.4)">多劳多得——这就是计件制</span>
      </div>
      <div style="display:flex;gap:12px">
        <button onclick="keepWorking()" style="
          flex:1;padding:14px;
          background:transparent;
          border:1px solid rgba(200,150,42,.5);
          color:var(--gold);
          font-size:12px;letter-spacing:2px;
          cursor:pointer;font-family:inherit;
          transition:all .2s;
        " onmouseover="this.style.background='rgba(200,150,42,.1)'"
           onmouseout="this.style.background='transparent'">
          💪 继续搬运<br>
          <span style="font-size:10px;color:rgba(242,232,208,.4);letter-spacing:0">拿更多超额奖金</span>
        </button>
        <button onclick="collectWage()" style="
          flex:1;padding:14px;
          background:var(--red);border:none;
          color:white;
          font-size:12px;letter-spacing:2px;
          cursor:pointer;font-family:inherit;
          transition:opacity .2s;
        " onmouseover="this.style.opacity='.85'"
           onmouseout="this.style.opacity='1'">
          💰 领取工资<br>
          <span style="font-size:10px;color:rgba(255,255,255,.6);letter-spacing:0">收工结算</span>
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function keepWorking() {
  // 关弹窗，恢复计时器，继续搬
  const modal = document.getElementById('milestoneModal');
  if (modal) modal.remove();
  if (!G.timerInterval && !G.gameOver) {
    G.timerInterval = setInterval(() => {
      if (G.gameOver) return;
      G.timerSec--;
      if (G.timerSec <= 0) { G.timerSec = 0; collectWage(); return; }
      updateTimer();
      if (G.timerSec % 55 === 0) cycleNpc();
    }, 1000);
  }
}

function collectWage() {
  const modal = document.getElementById('milestoneModal');
  if (modal) modal.remove();
  if (G.gameOver) return;
  G.gameOver = true;
  clearInterval(G.timerInterval);
  G.timerInterval = null;
  showWageModal();
}

// ── S3 内联事件（两次，计时器暂停） ──────────
function triggerEvent(which) {
  const idata = getIdentityData();
  // ⚠️ 强制禁用搬运按钮，必须选择才能继续
  const wb = $('workBtn');
  if (wb) { wb.disabled = true; wb.style.opacity = '0.35'; wb.style.cursor = 'not-allowed'; }

  if (which === 'A') {
    G.eventFired = true;
    clearInterval(G.timerInterval);
    G.timerInterval = null;
    showInlineEvent(idata.eventA, 'A');
  } else {
    G.event2Fired = true;
    clearInterval(G.timerInterval);
    G.timerInterval = null;
    const evB = (idata.eventB_condition && idata.eventB_condition())
      ? idata.eventB : idata.eventB_alt;
    showInlineEvent(evB, 'B');
  }
}

function showInlineEvent(ev, which) {
  const npcEl = $('npcText');
  if (!npcEl) return;
  npcEl.classList.remove('npc-text-anim');
  void npcEl.offsetWidth;
  npcEl.innerHTML = `
    <strong style="color:var(--gold);font-size:10px;letter-spacing:1px">▶ ${ev.speaker}：</strong><br>
    <span style="color:rgba(242,232,208,.9);line-height:1.8">${ev.text}</span>
    <div class="ev-opts-row" style="margin-top:10px">
      ${ev.opts.map(o => `
        <button onclick="resolveEvent('${which}','${o.key}')" class="ev-opt-btn">
          ${o.label}
        </button>`).join('')}
    </div>`;
  npcEl.classList.add('npc-text-anim');
}

function resolveEvent(which, key) {
  const idata = getIdentityData();
  const evKey = which === 'A' ? 'eventA'
    : ((idata.eventB_condition && idata.eventB_condition()) ? 'eventB' : 'eventB_alt');
  const ev = idata[evKey];
  const opt = ev.opts.find(o => o.key === key);
  if (!opt) return;

  if (opt.effect) opt.effect();
  if (opt.archiveUnlock) G.archivesUnlocked.add(opt.archiveUnlock);
  G.choices['s3_' + which] = key;

  // 显示回复 + 继续搬运按钮（恢复搬运按钮）
  const npcEl = $('npcText');
  if (npcEl) {
    npcEl.classList.remove('npc-text-anim');
    void npcEl.offsetWidth;
    npcEl.innerHTML = `
      <span style="color:rgba(242,232,208,.82);font-style:italic;line-height:1.8">${opt.reply}</span>
      <div style="margin-top:10px">
        <button onclick="resumeTask()" style="
          padding:7px 20px;background:transparent;
          border:1px solid var(--gold);color:var(--gold);
          cursor:pointer;font-size:11px;letter-spacing:3px;font-family:inherit">
          继续搬运 →
        </button>
      </div>`;
    npcEl.classList.add('npc-text-anim');
  }
}

function resumeTask() {
  // 恢复搬运按钮
  const wb = $('workBtn');
  if (wb) { wb.disabled = false; wb.style.opacity = '1'; wb.style.cursor = 'pointer'; }
  cycleNpc();
  if (G.timerInterval) return;
  G.timerInterval = setInterval(() => {
    if (G.gameOver) return;
    G.timerSec--;
    if (G.timerSec <= 0) { G.timerSec = 0; endTask(); return; }
    updateTimer();
    updateStamina();
    if (G.timerSec % 55 === 0) cycleNpc();
  }, 1000);
}

function endTask() {
  collectWage();
}

function showWageModal() {
  const baseBoxes = Math.min(G.boxes, 100);
  const bonusBoxes = Math.max(0, G.boxes - 100);
  const baseWage = (baseBoxes * 0.04).toFixed(2);
  const bonusWage = (bonusBoxes * 0.06).toFixed(2);
  const totalWage = G.wage.toFixed(2);
  const monthPct = ((G.wage / 40) * 100).toFixed(0);

  const modal = document.createElement('div');
  modal.id = 'wageModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:8000;
    background:rgba(4,10,22,.88);backdrop-filter:blur(20px);
    display:flex;align-items:center;justify-content:center;
  `;
  modal.innerHTML = `
    <div style="
      background:rgba(10,20,40,.98);border:1px solid rgba(200,150,42,.4);
      padding:36px 44px;max-width:520px;width:90%;position:relative;
      box-shadow:0 0 60px rgba(200,150,42,.15);
    ">
      <!-- 收工，不再提供返回继续 -->
      <div style="font-size:10px;color:var(--gold);letter-spacing:4px;margin-bottom:24px;text-align:center;padding-top:8px">
        ── 今日收工 · 1981年3月1日 ──
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
        <div style="background:rgba(255,255,255,.04);padding:14px;text-align:center">
          <div style="font-size:24px;color:var(--cream);font-family:'Courier New',monospace">¥${baseWage}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:4px">基础工资（${baseBoxes}箱×¥0.04）</div>
        </div>
        <div style="background:rgba(200,150,42,.08);padding:14px;text-align:center;border:1px solid rgba(200,150,42,.2)">
          <div style="font-size:24px;color:var(--gold);font-family:'Courier New',monospace">+¥${bonusWage}</div>
          <div style="font-size:10px;color:rgba(200,150,42,.6);margin-top:4px">超额奖励（${bonusBoxes}箱×¥0.06）</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:8px">今日总收入</div>
        <div style="font-size:42px;color:var(--cream);font-family:'Courier New',monospace;letter-spacing:2px">¥${totalWage}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:8px">你搬了 <strong style="color:var(--cream)">${G.boxes}箱</strong>，目标100箱</div>
      </div>
      <div style="
        border-top:1px solid rgba(255,255,255,.08);
        padding-top:18px;margin-bottom:24px;
        font-size:12px;color:rgba(242,232,208,.6);line-height:1.9;
      ">
        <span style="color:var(--gold);font-size:10px;letter-spacing:3px">── 历史回响 ──</span><br><br>
        1981年，内地工人平均月薪约¥40元。<br>
        你今天一天，赚到了月薪的 <strong style="color:var(--cream)">${monthPct}%</strong>。<br><br>
        这就是计件制——<strong style="color:var(--cream)">多劳多得</strong>，第一次在中国的土地上成真。<br>
        1981年后，蛇口码头工人平均月收入达到内地同类工人的3倍。<br>
        这个数字，很快引起了全国的注意。
      </div>
      <button id="wageModalBtn" onclick="closeWageAndNext()" disabled style="
        width:100%;padding:14px;background:rgba(120,30,30,.5);border:none;
        color:rgba(255,255,255,.4);font-size:12px;letter-spacing:4px;cursor:not-allowed;font-family:inherit;
        transition:all .3s;
      ">进入 1983年 · 劳动合同 → (3)</button>
    </div>`;
  document.body.appendChild(modal);

  // 3秒倒计时防连点
  let countdown = 3;
  const btn = document.getElementById('wageModalBtn');
  const timer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.style.background = 'var(--red)';
      btn.style.color = 'white';
      btn.style.cursor = 'pointer';
      btn.textContent = '进入 1983年 · 劳动合同 →';
    } else {
      btn.textContent = `进入 1983年 · 劳动合同 → (${countdown})`;
    }
  }, 1000);
}

function closeWageModal() {
  // 关闭弹窗，恢复搬运（继续赚更多）
  const modal = document.getElementById('wageModal');
  if (modal) modal.remove();
  // 恢复搬运按钮和计时器
  G.gameOver = false;
  const wb = document.getElementById('workBtn');
  if (wb) {
    wb.disabled = false;
    wb.style.opacity = '1';
    wb.style.cursor = 'pointer';
    wb.style.background = '';
    wb.innerHTML = `
      <span class="work-btn-icon" id="workBtnIcon">🧱</span>
      <span class="work-btn-label">继续搬运</span>
      <span class="work-btn-hint">超额越多，奖金越多！</span>`;
    wb.onclick = () => doWork(null);
  }
  if (!G.timerInterval) {
    G.timerInterval = setInterval(() => {
      if (G.gameOver) return;
      G.timerSec--;
      if (G.timerSec <= 0) { G.timerSec = 0; endTask(); return; }
      updateTimer();
      updateStamina();
      if (G.timerSec % 55 === 0) cycleNpc();
    }, 1000);
  }
}

function closeWageAndNext() {
  const modal = document.getElementById('wageModal');
  if (modal) modal.remove();
  clearInterval(G.timerInterval);
  G.timerInterval = null;
  transition(() => goTo('s4'));
}

// ══════════════════════════════════════════
// S4: 幕三·1983·合同（条件选项）
// ══════════════════════════════════════════
function injectS4() {
  const idata = getIdentityData();
  // 注入身份内心独白
  if (idata.s4Extra) {
    const contractVis = document.querySelector('#s4 .contract-visual');
    if (contractVis) {
      const existExtra = document.querySelector('#s4 .identity-extra');
      if (existExtra) existExtra.remove();
      const div = document.createElement('div');
      div.className = 'identity-extra';
      div.innerHTML = idata.s4Extra.extraBlock;
      contractVis.insertAdjacentElement('afterend', div);
    }
  }

  // 条件解锁选项
  const choicesEl = $('s4-choices');
  if (!choicesEl) return;

  const opts = [
    { key: 'sign', label: '✍️ 直接签字', sub: '改变从签名开始', always: true },
    { key: 'collective', label: '🤝 联合工友集体谈判', sub: '人多才有底气',
      condition: () => val('solidarity') >= 1,
      conditionTip: '（需要：你在意集体）' },
    { key: 'negotiate', label: '📋 要求修改合同条款', sub: '争取更好的保障',
      condition: () => val('agency') >= 1,
      conditionTip: '（需要：你有个人主见）' },
  ];

  choicesEl.innerHTML = opts.map(o => {
    const unlocked = o.always || (o.condition && o.condition());
    return `<button class="choice-btn ${unlocked ? '' : 'locked-choice'}"
      onclick="${unlocked ? `makeChoiceVal('s4','${o.key}',this)` : 'showLockedTip(this)'}">
      ${o.label}
      <small>${o.sub}</small>
      ${!unlocked ? `<span class="lock-tip">${o.conditionTip}</span>` : ''}
    </button>`;
  }).join('');
}

function showLockedTip(el) {
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}

// ══════════════════════════════════════════
// S5: 幕四·1984·招标（根据身份不同）
// ══════════════════════════════════════════
function injectS5() {
  // 如果是manager，可以解锁「参与竞标」选项
  const bidExtra = $('bid-extra');
  if (bidExtra && G.identity === 'manager' && val('reform') >= 1) {
    bidExtra.style.display = 'block';
  }
}

let selectedBid = null;
function selectBid(id) {
  selectedBid = id;
  ['A','B','C'].forEach(x => $('bid'+x) && $('bid'+x).classList.remove('selected'));
  $('bid'+id) && $('bid'+id).classList.add('selected');
  const btn = $('bidConfirm');
  if (btn) btn.style.display = 'block';
}
function confirmBid() {
  if (!selectedBid) return;
  G.choices.bid = selectedBid;
  G.archivesUnlocked.add('bidding');

  const BID_RESULTS = {
    A: {
      val: () => addVal('reform', 1),
      text: `中标公告张贴出来：深圳建工一处，报价¥48万，中标。<br><br>
        袁庚主任在公告旁边亲笔写了八个字：<br>
        <strong style="color:var(--gold)">「按价论标，公平竞争。」</strong><br><br>
        工地上有人不服：「凭什么便宜的就能拿？」<br>
        项目管理处的人回答：「凭账本。」`,
      history: `这次招标的全程记录被整理成报告，1984年在全国基建工作会议上作为典型案例宣读。<br>
        1985年，国务院颁布《建设工程招标投标暂行规定》，公开招标制度在全国推行。<br>
        <strong style="color:var(--cream)">蛇口的这一次，是起点。</strong>`
    },
    B: {
      val: () => addVal('solidarity', 1),
      text: `合同签了，工程开工了。<br>
        广州建总的师傅们手艺不错，按期完工。<br><br>
        只是，三年后审计报告里有一行数字：<br>
        同期蛇口通过公开竞标完成的同类工程，<br>
        <strong style="color:var(--gold)">平均造价低了23%。</strong><br><br>
        袁庚在日记里写道：「关系，是效率最昂贵的成本。」`,
      history: `1985年起，蛇口所有工程项目强制公开招标，再未出现「指定承包」的情况。<br>
        那23%的差价，后来成了课本里的一道例题，<br>
        <strong style="color:var(--cream)">教学生理解「市场竞争」四个字的含义。</strong>`
    },
    C: {
      val: () => { addVal('agency', 1); addVal('reform', 1); },
      text: `消息传出去，舆论哗然。<br>
        「把工程给外国人，这是卖国！」<br><br>
        竣工那天，工期提前了15天，质量验收全优。<br>
        袁庚在竣工仪式上说：<br>
        <strong style="color:var(--gold)">「让结果说话。」</strong>`,
      history: `这是蛇口第一个外资承包工程项目。竣工报告随后被送到国务院参阅。<br>
        此后三年，蛇口引入外资参与工程建设增加了11倍。<br>
        <strong style="color:var(--cream)">「让结果说话」，后来成了蛇口改革最常被引用的一句话。</strong>`
    },
  };

  const r = BID_RESULTS[selectedBid];
  if (r) r.val();

  // S5招标结果弹窗
  if (r) {
    showHistoryModal(r.text, r.history, 's6', '进入 1985年 · 工伤保险 →', undefined, undefined, 's5');
  } else {
    transition(() => goTo('s6'));
  }
}

// ══════════════════════════════════════════
// S6: 幕五·1985·保险（solidarity分支）
// ══════════════════════════════════════════
function injectS6() {
  const extraEl = $('s6-solidarity-event');
  if (!extraEl) return;
  if (val('solidarity') >= 2) {
    // 解锁：帮助受伤工友的额外场景
    extraEl.style.display = 'block';
    extraEl.innerHTML = `
      <div class="quote-box" style="border-color:var(--gold);margin-bottom:16px">
        <div class="qb-speaker" style="color:var(--gold)">突发事件</div>
        <div class="qb-text">你的工友老刘在工地受伤了。他没有保险，医药费需要自己垫付。<br>
        你这个月的工资是32元，医药费需要15元。</div>
      </div>
      <div class="choice-row" style="margin-bottom:16px">
        <button class="choice-btn" onclick="s6HelpFriend(true,this)">
          🏥 借给他15元
          <small>工友有难，不能不管</small>
        </button>
        <button class="choice-btn" onclick="s6HelpFriend(false,this)">
          😔 实在拿不出
          <small>自己也不宽裕</small>
        </button>
      </div>`;
  }
}

function s6HelpFriend(help, el) {
  document.querySelectorAll('#s6-solidarity-event .choice-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  if (help) {
    addVal('solidarity', 1);
    G.choices.s6_help = 'yes';
    // 工资实际减少（影响结算）
    G.wage = Math.max(0, G.wage - 15);
  } else {
    addVal('agency', 1);
    G.choices.s6_help = 'no';
  }
  el.closest('.choice-row').insertAdjacentHTML('afterend',
    `<p style="font-size:12px;color:rgba(242,232,208,.6);font-style:italic;margin-top:8px">
    ${help ? '老刘握着你的手，说不出话。这15元，你很久没忘。' : '你低着头走回宿舍，没有开灯。'}
    </p>`);
}

// ══════════════════════════════════════════
// S7: 幕六·1986·选举（三条路线分叉）
// ══════════════════════════════════════════
function injectS7() {
  const el = $('s7-vote-content');
  if (!el || el.dataset.injected) return;
  el.dataset.injected = '1';

  if (val('reform') >= 2) {
    // 改革路线：你被提名为候选人
    el.innerHTML = `
      <div class="quote-box" style="border-color:var(--red);margin-bottom:16px">
        <div class="qb-speaker" style="color:var(--red)">你被提名了</div>
        <div class="qb-text">「你在蛇口表现突出，工友们推荐你作为管委会候选人。你愿意公开竞选演讲吗？」</div>
      </div>
      <div class="choice-row">
        <button class="choice-btn" onclick="s7VoteChoice('run',this)">
          🎤 接受提名，公开演讲<small>让大家知道我的主张</small>
        </button>
        <button class="choice-btn" onclick="s7VoteChoice('support',this)">
          👏 推荐别人，自己投票<small>幕后支持改革</small>
        </button>
      </div>`;
  } else if (val('solidarity') >= 2) {
    // 集体路线：联合工友推选候选人（3轮对话）
    el.innerHTML = `
      <div class="quote-box" style="border-color:var(--gold);margin-bottom:16px">
        <div class="qb-speaker">工友们找到你</div>
        <div class="qb-text">「我们几个商量了，想联名推荐张大勇竞选管委会。他公道，大家信任他。你怎么看？」</div>
      </div>
      <div class="choice-row">
        <button class="choice-btn" onclick="s7SolidarityRound(1,this)">
          ✅ 张大勇确实不错，支持<small>集体的选择</small>
        </button>
        <button class="choice-btn" onclick="s7SolidarityRound(2,this)">
          🤔 我觉得老陈更合适<small>提出不同意见</small>
        </button>
      </div>`;
  } else {
    // 普通路线：只是投一票，旁观
    el.innerHTML = `
      <p style="color:rgba(242,232,208,.7);font-size:13px;line-height:1.9;margin-bottom:16px">
      你拿着选票，站在投票箱前。台上几个候选人刚刚完成了演讲。<br>
      这是蛇口第一次真正意义上的选举——在这之前，中国没有一个工业区做过这件事。<br>
      你把票投进去。没有人知道你选了谁，但历史记住了这一刻。</p>
      <div class="choice-row">
        <button class="choice-btn" onclick="voteFor('reform_candidate',this)">
          ☑ 投给主张继续改革的候选人<small>让变化继续</small>
        </button>
        <button class="choice-btn" onclick="voteFor('stability_candidate',this)">
          ☑ 投给主张稳定发展的候选人<small>先把成果巩固</small>
        </button>
      </div>`;
  }
}

const S7_HISTORY_TEXT = `1986年的蛇口选举，是中国改革开放以来<br>
    第一次由基层工人直接投票选出管理委员。<br>
    新华社记者在场，但报道被压了三个月才发出。<br>
    <strong style="color:var(--cream)">二十年后，这次选举进入了大学教材。</strong>`;

function showS7History(replyText) {
  const el2 = $('s7-vote-content');
  if (el2) el2.insertAdjacentHTML('beforeend', `
    <p style="color:rgba(242,232,208,.8);font-size:13px;margin-top:16px;font-style:italic;line-height:1.8">${replyText}</p>`);
  setTimeout(() => showHistoryModal(replyText, S7_HISTORY_TEXT, 's8', '进入 1988年 · 蛇口风波 →', undefined, undefined, 's7'), 800);
}

function s7VoteChoice(choice, el) {
  document.querySelectorAll('#s7-vote-content .choice-btn').forEach(b => { b.classList.remove('selected'); b.disabled = true; });
  el.classList.add('selected');
  G.choices.vote = choice;
  if (choice === 'run') addVal('reform', 2);
  else addVal('reform', 1);
  G.archivesUnlocked.add('vote');

  const replyText = choice === 'run'
    ? '你站上了台，说出了你对蛇口的期望。掌声响起来——不热烈，但真诚。<br>不管结果如何，你今天让更多人听见了你的声音。'
    : '你把票投给了你信任的人，坐回座位上。<br>不是所有参与都需要站在聚光灯下。你的一票，同样是历史的一部分。';
  showS7History(replyText);
}

function s7SolidarityRound(pick, el) {
  document.querySelectorAll('#s7-vote-content .choice-btn').forEach(b => { b.classList.remove('selected'); b.disabled = true; });
  el.classList.add('selected');
  G.choices.vote = pick === 1 ? 'solidarity_yes' : 'solidarity_alt';
  addVal('solidarity', 1);
  G.archivesUnlocked.add('vote');

  const replyText = pick === 1
    ? '联名推荐书交上去了。三天后，张大勇以最高票当选。<br>那天，你们宿舍买了瓶啤酒庆祝。集体推选的这个人，替集体说了三年的话。'
    : '你提出了不同意见。最后大家投票，还是选了张大勇。你也投了他——集体的决定，就是你的决定。';
  showS7History(replyText);
}

function voteFor(candidate, el) {
  document.querySelectorAll('#s7-vote-content .choice-btn').forEach(b => { b.classList.remove('selected'); b.disabled = true; });
  el.classList.add('selected');
  G.choices.vote = candidate;
  if (candidate === 'reform_candidate') addVal('reform', 1);
  else addVal('solidarity', 1);
  G.archivesUnlocked.add('vote');

  const replyText = candidate === 'reform_candidate'
    ? '你投给了主张继续改革的候选人。<br>你不知道他会不会赢，但你知道你选了什么。'
    : '你投给了主张稳定发展的候选人。<br>改革不是只有一种方向，稳扎稳打也是一种答案。';
  showS7History(replyText);
}

// ══════════════════════════════════════════
// S8: 幕七·1988·蛇口风波（结局分叉）
// ══════════════════════════════════════════
function injectS8() {
  const idata = getIdentityData();
  const tag     = $('s8-tag');
  const title   = $('s8-title');
  const body    = $('s8-body');
  const quote   = $('s8-afang-quote');
  const choices = $('s8-choices');
  if (tag)   tag.textContent   = idata.s8Tag;
  if (title) title.textContent = idata.s8Title;
  if (body)  body.innerHTML    = idata.s8Body;
  if (quote) quote.textContent = idata.s8AfangQuote;
  if (choices) {
    choices.innerHTML = idata.s8Choices.map(c => `
      <button class="choice-btn" onclick="finalChoice('${c.key}',this)">
        ${c.label}<small>${c.sub}</small>
      </button>`).join('');
  }
}

function finalChoice(key, el) {
  document.querySelectorAll('#s8 .choice-btn').forEach(b => { b.classList.remove('selected'); b.disabled = true; });
  el.classList.add('selected');
  G.choices.s8 = key;
  G.archivesUnlocked.add('fengbo');
  if (key === 'support' || key === 'standup' || key === 'open' || key === 'change') addVal('reform', 1);
  if (key === 'silent') addVal('agency', -1);
  if (key === 'doubt' || key === 'agree') addVal('solidarity', 1);
  if (key === 'cry') addVal('solidarity', 1);
  if (key === 'record') { addVal('reform', 1); addVal('agency', 1); }
  if (key === 'control') addVal('solidarity', -1);

  // S8 蛇口风波历史注脚弹窗
  showHistoryModal(
    '你做出了选择。在这个礼堂里，每一个选择都是真实的——没有标准答案，只有真实的人。',
    `1988年1月，「蛇口风波」在全国引发讨论。<br>
    《人民日报》、《光明日报》相继刊载文章，争论持续了整整半年。<br>
    核心问题只有一个：<br>
    <strong style="color:var(--cream)">为个人利益打工——究竟是不是自私的？</strong><br><br>
    蛇口工人的回答，写进了改革开放的历史。<br>
    没有一个人后悔说出了那句话。`,
    's9',
    '查看你的历史档案 →',
    undefined, undefined, 's8'
  );
}

// 通用选择（S4/S5/S6，含历史效应反馈）
function makeChoiceVal(screen, choice, el) {
  G.choices[screen] = choice;
  document.querySelectorAll(`#${screen} .choice-btn`).forEach(b => { b.classList.remove('selected'); b.disabled = true; });
  if (el) el.classList.add('selected');

  const archiveMap = { s4: 'contract', s6: 'insurance' };
  if (archiveMap[screen]) G.archivesUnlocked.add(archiveMap[screen]);

  // ── S4 合同 ──────────────────────────────
  const S4_RESULTS = {
    sign: {
      val: () => addVal('reform', 1),
      text: `你在第一行签上了自己的名字。<br><br>
        笔放下的那一刻，你感到一种奇怪的轻——<br>
        铁饭碗没了，但压在铁饭碗上的那块石头，也没了。<br><br>
        从今天起，你可以辞职，可以跳槽，<br>
        可以去广州，去上海，去任何有工作的地方。<br>
        这在以前，叫「流氓罪」。`,
      history: `1983年，蛇口2700名工人签订劳动合同，成为全国第一批合同制工人。<br>
        1994年，《劳动法》正式颁布，劳动合同制写入法律，覆盖全国所有企业。<br>
        <strong style="color:var(--cream)">你是第一批，也是时代的先锋。</strong>`,
      next: 's5', nextLabel: '进入 1984年 · 公开招标 →'
    },
    collective: {
      val: () => { addVal('solidarity', 2); G.archivesUnlocked.add('contract_negotiated'); },
      text: `你和七个工友联名，要求将合同期从一年延长为两年。<br><br>
        劳资处沉默了三天。<br>
        第四天，通知下来了：<br>
        合同期改为两年，可续签，解雇需提前一个月告知。<br><br>
        处长说：「这是蛇口的规矩，不代表全国。」<br>
        但你知道，规矩是人立的。`,
      history: `1986年，蛇口劳动合同标准文本被劳动部专程来学习，<br>
        作为起草全国劳动合同示范文本的参考蓝本。<br>
        <strong style="color:var(--cream)">集体的声音，改变了一部法律的形状。</strong>`,
      next: 's5', nextLabel: '进入 1984年 · 公开招标 →'
    },
    negotiate: {
      val: () => { addVal('agency', 2); G.archivesUnlocked.add('contract_negotiated'); },
      text: `你在签字前，在第三条下面写下一行字：<br>
        「解除合同需提前三十天书面通知。」<br><br>
        劳资处的人皱了皱眉，打了个电话，沉默了很久，<br>
        最后在上面盖了章。<br><br>
        「这是你自己要求的，」他说，「你自己负责。」<br>
        你说：「好。」`,
      history: `1994年颁布的《劳动法》第二十六条规定：<br>
        用人单位解除劳动合同，应提前三十日书面通知。<br>
        <strong style="color:var(--cream)">这一条款，与你今天在合同上写下的那行字，一字不差。</strong>`,
      next: 's5', nextLabel: '进入 1984年 · 公开招标 →'
    },
  };

  // ── S5 招标（由 confirmBid 处理，此处仅占位）──

  // ── S6 保险 ──────────────────────────────
  const S6_RESULTS = {
    help: {
      val: () => addVal('solidarity', 1),
      text: `七个工友，每人出了几块钱。<br>王福的手术费凑够了。<br><br>
        那天晚上，大家在宿舍喝了瓶汽水，<br>
        没什么人说话，但都没有早睡。<br><br>
        王福后来说：「那天我才知道，蛇口虽然没有大锅饭，<br>
        但蛇口的人，没有变成冷血的机器。」`,
      history: `1985年，工人们联名上书，要求建立强制性工伤保险制度。<br>
        管委会采纳了这一建议。蛇口成为全国第一个建立个人缴纳型社会保险制度的工业区。<br>
        <strong style="color:var(--cream)">王福，是那封联名信上的第一个名字。</strong>`,
      next: 's7', nextLabel: '进入 1986年 · 民主选举 →'
    },
    insurance: {
      val: () => addVal('reform', 1),
      text: `你写了一封信给管委会，<br>
        附上了王福的诊断书和那张收费单据。<br><br>
        信里只有一个问题：<br>
        「如果我们都没有保险，下一个王福是谁？」<br><br>
        三个月后，管委会公告下来：<br>
        蛇口工业区全员强制参保，个人缴纳2%，企业缴纳8%。`,
      history: `这一制度比全国社会保险制度早了整整八年。<br>
        1993年，国务院社保体制改革方案直接引用了蛇口模式作为设计基础。<br>
        <strong style="color:var(--cream)">一封信，提前了八年。</strong>`,
      next: 's7', nextLabel: '进入 1986年 · 民主选举 →'
    },
  };

  // 查找对应结果并展示
  let result = null;
  if (screen === 's4') { result = S4_RESULTS[choice]; if (result) result.val(); }
  if (screen === 's6') { result = S6_RESULTS[choice]; if (result) result.val(); }

  if (result) {
    showHistoryResult(screen, result);
  } else {
    // 兜底：直接跳关
    const nextMap = { s4: 's5', s6: 's7' };
    if (nextMap[screen]) setTimeout(() => transition(() => goTo(nextMap[screen])), 600);
  }
}

// 通用历史效应结果展示
// 历史效应结果：居中弹窗形式（可叉掉）
function showHistoryResult(screen, result) {
  // screen参数优先，其次result.screen
  showHistoryModal(result.text, result.history, result.next, result.nextLabel, result.videoSrc, result.year, screen || result.screen);
}

// 视频素材映射（有了就用，没有就显示纯色背景）
const SCENE_VIDEOS = {
  's2': 'assets/scenes/s2_1979_炸山爆破_有声.mp4',
  's3': 'assets/scenes/s3_1981_码头搬货_有声.mp4',
  's4': 'assets/scenes/s4_1983_签劳动合同_有声.mp4',
  's5': 'assets/scenes/s5_1984_工地建设_有声.mp4',
  's6': 'assets/scenes/s6_1985_工伤保险_静音.mp4',
  's7': 'assets/scenes/s7_1986_民主选举_有声.mp4',
  // 's8': 待补充
};

function showHistoryModal(text, history, nextScreen, nextLabel, videoSrc, year, currentScreen) {
  const old = document.getElementById('historyModal');
  if (old) old.remove();

  const vid = videoSrc || SCENE_VIDEOS[currentScreen] || null;  // 只用currentScreen，不fallback到nextScreen
  // 有声音的视频列表（保留原声，不muted）
  const WITH_AUDIO = new Set([
    'assets/scenes/s2_1979_炸山爆破_有声.mp4',
    'assets/scenes/s3_1981_码头搬货_有声.mp4',
    'assets/scenes/s4_1983_签劳动合同_有声.mp4',
    'assets/scenes/s5_1984_工地建设_有声.mp4',
    'assets/scenes/s7_1986_民主选举_有声.mp4',
  ]);
  const hasAudio = vid && WITH_AUDIO.has(vid);
  const YEAR_MAP = {'s2':'1979','s3':'1981','s4':'1983','s5':'1984','s6':'1985','s7':'1986','s8':'1988','s9':'结算'};
  const yearLabel = year || YEAR_MAP[currentScreen] || YEAR_MAP[nextScreen] || '';

  const modal = document.createElement('div');
  modal.id = 'historyModal';
  modal.className = 'history-modal-v2';
  modal.innerHTML = `
    <div class="hm-card">
      ${vid ? `
      <div class="hm-video-wrap">
        <video src="${vid}" autoplay ${hasAudio ? "" : "muted"} loop playsinline
          ${hasAudio ? 'id="hmVid" style="opacity:.7"' : ''}></video>
        <div class="hm-video-overlay"></div>
        <div class="hm-video-year">${yearLabel}</div>
      </div>` : `
      <div class="hm-video-wrap" style="background:linear-gradient(135deg,rgba(10,20,40,.9),rgba(30,10,10,.9));display:flex;align-items:center;justify-content:center">
        <div class="hm-video-year" style="position:static;font-size:64px;opacity:.15">${yearLabel}</div>
      </div>`}

      <div class="hm-body">
        <p class="hm-narrative" id="hmNarrative"></p>
        <div class="hm-divider"></div>
        <span class="hm-history-label">── 历史回响 ──</span>
        <p class="hm-history-text">${history}</p>
      </div>

      <div class="hm-footer">
        <button class="hm-close" onclick="Audio.stopSpeak();const t=document.getElementById('ttsPlayer');if(t){t.pause();t.remove();}document.getElementById('historyModal').remove()" title="关闭，停留在当前页">✕</button>
        <button class="hm-next" id="historyNextBtn"
          onclick="Audio.stopSpeak();const tp=document.getElementById('ttsPlayer');if(tp){tp.pause();tp.remove();}document.getElementById('historyModal').remove();transition(()=>goTo('${nextScreen}'))"
          disabled>${nextLabel} (3)</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // 视频音量调低（不遮旁白）
  if (hasAudio) {
    setTimeout(() => {
      const v = document.getElementById('hmVid');
      if (v) v.volume = 0.12;
    }, 100);
  }

  // 打字机效果
  const narEl = document.getElementById('hmNarrative');
  if (narEl) typewriterHTML(narEl, text, 18);

  // TTS音频播放（用currentScreen幕次对应的mp3）
  const ttsKey = currentScreen;  // 严格用当前幕，不fallback
  // 文件编号与幕次的实际对应（1.MP3=S2旁白，以此类推）
  const ttsMap = {
    's2':'assets/narration/s2_1979_炸山_旁白.mp3',
    's3':'assets/narration/s3_1981_计件_旁白.mp3',
    's4':'assets/narration/s4_1983_合同_旁白.mp3',
    's5':'assets/narration/s5_1984_招标_旁白.mp3',
    's6':'assets/narration/s6_1985_保险_旁白.mp3',
    's7':'assets/narration/s7_1986_选举_旁白.mp3',
    's8':'assets/narration/s8_1988_风波_旁白.mp3',
  };
  if (ttsMap[ttsKey]) {
    const ttsAudio = new window.Audio(ttsMap[ttsKey]);
    ttsAudio.id = 'ttsPlayer';
    // 移除旧的tts播放
    const oldTts = document.getElementById('ttsPlayer');
    if (oldTts) { oldTts.pause(); oldTts.remove(); }
    document.body.appendChild(ttsAudio);
    setTimeout(() => ttsAudio.play().catch(()=>{}), 600);
  }

  // 3秒防连点倒计时
  let cd = 3;
  const btn = document.getElementById('historyNextBtn');
  const t = setInterval(() => {
    cd--;
    if (cd <= 0) {
      clearInterval(t);
      btn.disabled = false;
      btn.textContent = nextLabel;
    } else {
      btn.textContent = `${nextLabel} (${cd})`;
    }
  }, 1000);
}

// 打字机：支持HTML标签（整体输出，逐字显示纯文本部分）
function typewriterHTML(el, html, msPerChar) {
  // 先设置完整HTML（保留标签），再逐字淡入
  el.innerHTML = html;
  const chars = el.querySelectorAll ? null : null;
  // 简单实现：把text node拆成span逐个显示
  const text = el.innerText;
  el.innerHTML = html.replace(/(<[^>]+>)/g, '$1')
    .split('').map((ch, i) =>
      ch === '<' ? ch : // 跳过标签起始（实际上html已经被设置，这里用另一种方式）
      `<span class="typewriter-char" style="animation-delay:${i * msPerChar}ms">${ch === '\n' ? '<br>' : ch}</span>`
    ).join('');
  // 更简洁方式：直接用innerHTML + CSS动画
  el.innerHTML = '';
  const div = document.createElement('div');
  div.innerHTML = html;
  const rawText = div.textContent;
  let i = 0;
  const interval = setInterval(() => {
    if (i >= rawText.length) { clearInterval(interval); el.innerHTML = html; return; }
    el.textContent = rawText.substring(0, i + 1);
    i++;
  }, msPerChar);
}

// ══════════════════════════════════════════
// S9: 结算报告（五种结局）
// ══════════════════════════════════════════
function buildReport() {
  G.playCount++;
  localStorage.setItem('sk83_plays', G.playCount);

  const identityNames = {
    worker:  { label: '改革先锋',      color: '#E8B94A' },
    woman:   { label: '时代见证者',    color: '#FFFFFF' },
    manager: { label: '制度设计者',    color: '#C8962A' },
    elder:   { label: '历史夹缝中的人', color: '#887E6A' },
  };
  const charNames = {
    worker: '张建国', woman: '林阿芳', manager: '陈志远', elder: '老赵'
  };
  const id = identityNames[G.identity] || identityNames.worker;
  const verdict = getVerdict();

  if ($('rptIdentity')) { $('rptIdentity').textContent = id.label; $('rptIdentity').style.color = id.color; }
  if ($('rptName')) $('rptName').textContent = charNames[G.identity] || '张建国';
  if ($('r-boxes')) $('r-boxes').textContent
 = G.boxes + ' 箱';
  if ($('r-wage')) $('r-wage').textContent = '¥ ' + G.wage.toFixed(2);
  if ($('r-choices')) $('r-choices').textContent = Object.keys(G.choices).length + ' 次';
  if ($('r-archives')) $('r-archives').textContent = G.archivesUnlocked.size + ' / ' + Object.keys(ARCHIVES).length;
  if ($('rptVerdict')) $('rptVerdict').textContent = verdict.text;
  if ($('rptEndingTag')) {
    $('rptEndingTag').textContent = verdict.tag;
    $('rptEndingTag').style.color = verdict.color;
  }
  if ($('rptHistory')) $('rptHistory').textContent = `你在1983年这一天赚了 ¥${G.wage.toFixed(2)}，相当于当时内地工人月均工资（¥40）的 ${((G.wage/40)*100).toFixed(0)}%。蛇口工人平均月收入是内地的3倍，是当时中国收入最高的工人群体之一。`;

  // 显示三维价值雷达文字
  const valEl = $('rptValues');
  if (valEl) {
    const { reform, solidarity, agency } = G.values;
    valEl.innerHTML = `
      <div class="val-bar-row">
        <span class="val-lbl">改革认同</span>
        <div class="val-track"><div class="val-fill" style="width:${Math.max(0,(reform+3)/6*100).toFixed(0)}%;background:var(--red)"></div></div>
        <span class="val-n">${reform > 0 ? '+' : ''}${reform}</span>
      </div>
      <div class="val-bar-row">
        <span class="val-lbl">集体意识</span>
        <div class="val-track"><div class="val-fill" style="width:${Math.max(0,(solidarity+3)/6*100).toFixed(0)}%;background:var(--gold)"></div></div>
        <span class="val-n">${solidarity > 0 ? '+' : ''}${solidarity}</span>
      </div>
      <div class="val-bar-row">
        <span class="val-lbl">个人能动</span>
        <div class="val-track"><div class="val-fill" style="width:${Math.max(0,(agency+3)/6*100).toFixed(0)}%;background:#7EB3E8"></div></div>
        <span class="val-n">${agency > 0 ? '+' : ''}${agency}</span>
      </div>`;
  }

  const quotes = [
    '「打破大锅饭，多劳者多得——这4分钱，开创了中国计件工资制的先河。」',
    '「时间就是金钱，效率就是生命。——1979年，蛇口，中国改革的第一声。」',
    '「蛇口的改革不是一天发生的，是一箱一箱集装箱搬出来的。」',
  ];
  if ($('rptQuote')) $('rptQuote').textContent = quotes[G.playCount % quotes.length];
}

function getVerdict() {
  const { reform, solidarity, agency } = G.values;
  const dominant = Math.max(reform, solidarity, agency);

  if (reform >= 3 && reform >= solidarity && reform >= agency)
    return {
      tag: '结局 A · 改革的见证者',
      color: '#D4122A',
      text: '你每一次都选择站在改革这一边。历史证明，你的选择推动了中国往前走了一步。但你也知道——有些人，因为改革，被留在了原地。',
    };
  if (solidarity >= 3 && solidarity >= reform && solidarity >= agency)
    return {
      tag: '结局 B · 时代的守望者',
      color: '#C8962A',
      text: '你选择与人同行，而非独自向前。蛇口的改革是千万人的改革，你是其中真实的一个。你不是历史的主角，但历史因你而完整。',
    };
  if (agency >= 3 && agency >= reform && agency >= solidarity)
    return {
      tag: '结局 C · 命运的书写者',
      color: '#7EB3E8',
      text: '你从不等待历史安排，你主动做选择，承担后果。在1983年的蛇口，这种人不多见，但正是这些人，写下了那个时代最锋利的一页。',
    };
  if (Math.abs(reform - solidarity) <= 1 && Math.abs(reform - agency) <= 1 && dominant >= 1)
    return {
      tag: '结局 D · 蛇口的普通人',
      color: '#F2E8D0',
      text: '你没有极端的选择，没有鲜明的标签。你是大多数——改革时代里最真实的存在。历史的洪流中，正是无数个"普通人"，让改革得以落地。',
    };
  if (reform <= -1 && solidarity <= -1)
    return {
      tag: '结局 E · 历史的旁观者',
      color: '#887E6A',
      text: '你看见了一切，但始终没有全然选择。也许你的谨慎是对的；也许有些事，需要亲历才能理解。蛇口的故事，还在继续。',
    };
  // 默认
  return {
    tag: '结局 D · 蛇口的普通人',
    color: '#F2E8D0',
    text: '你是大多数——改革时代里最真实的存在。历史的洪流中，正是无数个"普通人"，让改革得以落地。',
  };
}

// ══════════════════════════════════════════
// S10: 档案馆
// ══════════════════════════════════════════
function buildArchiveHall() {
  const grid = $('archiveGrid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(ARCHIVES).forEach(([key, data]) => {
    const unlocked = G.archivesUnlocked.has(key);
    const card = document.createElement('div');
    card.className = 'doc-card' + (unlocked ? '' : ' locked');
    if (unlocked) {
      card.onclick = () => openArchive(key);
      card.innerHTML = `
        <div class="doc-stamp-badge">已解锁</div>
        <div class="doc-year">${data.year}</div>
        <div class="doc-title">${data.title}</div>
        <div class="doc-sub">${data.sub}</div>
        <div class="doc-text">${data.text.substring(0,80)}……</div>
        <div class="doc-note">${data.note}</div>`;
    } else {
      card.innerHTML = `
        <div class="doc-year">${data.year}</div>
        <div class="doc-title">🔒 ${data.title}</div>
        <div class="doc-sub">完成对应幕次后解锁</div>
        <div class="doc-text" style="opacity:.4">继续体验以解锁此档案……</div>`;
    }
    grid.appendChild(card);
  });
}

function openArchive(key) {
  const data = ARCHIVES[key];
  if (!data) return;
  const content = $('modalContent');
  content.innerHTML = `
    <div class="mc-tag">${data.year} · 历史档案</div>
    <div class="mc-title">${data.title}</div>
    ${data.img ? `<img class="mc-img" src="${data.img}" onerror="this.style.display='none'">` : ''}
    <div class="mc-body">${data.text.replace(/\n/g,'<br><br>')}</div>
    <div class="mc-note">${data.note}</div>`;
  $('modalOverlay').classList.add('on');
  $('modal').classList.add('on');
}

function closeModal() {
  $('modalOverlay').classList.remove('on');
  $('modal').classList.remove('on');
}

function showArchive() { transition(() => goTo('s10')); }

function exitToHome() {
  if (!confirm('退出当前体验？进度将不会保存。')) return;
  clearInterval(G.timerInterval);
  G.timerInterval = null;
  const exitBtn = $('globalExit');
  if (exitBtn) exitBtn.style.display = 'none';
  restart();
}

// ── 开场：点「进入历史」后全屏视频+叙事 ──────
function playIntroScene() {
  // 创建全屏覆盖层
  const overlay = document.createElement('div');
  overlay.id = 'introOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9000;background:#000;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    opacity:0;transition:opacity .8s;
  `;

  overlay.innerHTML = `
    <video id="introVid" src="assets/intro.mp4" playsinline
      style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55"></video>
    <div style="position:relative;z-index:2;max-width:720px;padding:0 40px;text-align:center">
      <p id="introLine" style="
        font-size:15px;color:rgba(242,232,208,.9);line-height:2;
        letter-spacing:.5px;min-height:120px;
        text-shadow:0 2px 20px rgba(0,0,0,.9);
      "></p>
      <div id="introDots" style="margin-top:32px;display:flex;gap:8px;justify-content:center;opacity:.4">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--gold);display:inline-block"></span>
        <span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.3);display:inline-block"></span>
        <span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.3);display:inline-block"></span>
        <span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.3);display:inline-block"></span>
      </div>
    </div>
    <button id="introSkip" onclick="skipIntro()" style="
      position:absolute;bottom:32px;right:32px;
      background:transparent;border:1px solid rgba(255,255,255,.2);
      color:rgba(255,255,255,.35);padding:7px 18px;
      font-size:11px;letter-spacing:2px;cursor:pointer;font-family:inherit;
    ">跳过 →</button>
  `;
  document.body.appendChild(overlay);

  // 淡入
  requestAnimationFrame(() => requestAnimationFrame(() => { overlay.style.opacity = '1'; }));
  const vid = document.getElementById('introVid');
  if (vid) vid.play().catch(()=>{});

  // 叙事文字序列
  const lines = [
    '1978年。中国，改革开放元年。',
    '深圳，一个默默无闻的小渔村，\n即将成为中国历史上最大胆的试验场。',
    '1979年，招商局常务副董事长袁庚\n在深圳蛇口打响了改革开放的「第一炮」。',
    '「时间就是金钱，效率就是生命。」\n——这句话，在当时的中国，被视为洪水猛兽。',
    '但蛇口，做到了。\n\n计件工资、劳动合同、公开招标、民主选举……\n每一项，都是中国历史上的第一次。',
    '现在，你将以一个普通工人的视角，\n亲历这段改变中国的历史。',
  ];

  let lineIdx = 0;
  const lineEl = document.getElementById('introLine');
  const dots = document.getElementById('introDots')?.querySelectorAll('span');

  function showNextLine() {
    if (lineIdx >= lines.length) {
      // 全部文字播完，跳入S1
      skipIntro();
      return;
    }
    if (lineEl) {
      lineEl.style.opacity = '0';
      lineEl.style.transform = 'translateY(8px)';
      lineEl.style.transition = 'opacity .5s, transform .5s';
      setTimeout(() => {
        lineEl.textContent = lines[lineIdx].replace(/\\n/g, '\n');
        lineEl.style.whiteSpace = 'pre-line';
        lineEl.style.opacity = '1';
        lineEl.style.transform = 'translateY(0)';
        if (dots) {
          dots.forEach((d, i) => {
            d.style.background = i === lineIdx % dots.length ? 'var(--gold)' : 'rgba(255,255,255,.3)';
          });
        }
      }, 400);
    }
    lineIdx++;
    // 每段停留时间
    const delay = lineIdx <= 2 ? 3000 : 4500;
    window.introTimer = setTimeout(showNextLine, delay);
  }

  showNextLine();
}

function skipIntro() {
  clearTimeout(window.introTimer);
  const overlay = document.getElementById('introOverlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.remove(); transition(() => goTo('s1')); }, 600);
  } else {
    transition(() => goTo('s1'));
  }
}

function restart() {
  G.identity = null; G.boxes = 0; G.wage = 0; G.bonusBoxes = 0;
  G.stamina = 5; G.timerSec = 540; G.gameOver = false;
  G.eventFired = false; G.event2Fired = false; G.milestoneShown = false;
  G.choices = {}; G.archivesUnlocked = new Set(['slogan']);
  G.values = { reform: 0, solidarity: 0, agency: 0 };
  NPC_LINES.splice(0, NPC_LINES.length,
    '快点！这批货赶着出口，超额完成今天的指标能多拿奖金！',
    '加油加油！你已经超过今天目标一半了！',
    '袁庚主任说了，多劳多得，不再吃大锅饭！',
    '时间就是金钱——快！',
    '再坚持一下，收工了咱去吃肠粉！',
  );
  clearInterval(G.timerInterval);
  G.timerInterval = null;
  // 恢复身份卡片可点击，清除选中状态
  document.querySelectorAll('.id-card-choice').forEach(c => {
    c.style.pointerEvents = '';
    c.classList.remove('selected');
  });
  // 清除各幕历史结果块（防止重玩时残留）
  document.querySelectorAll('.history-result').forEach(el => el.remove());
  // 清除s2选择注入标记
  const s2c = document.getElementById('s2-choices');
  if (s2c) { s2c.innerHTML = ''; delete s2c.dataset.injected; }
  const wm = document.getElementById('wageModal');
  if (wm) wm.remove();
  const mm = document.getElementById('milestoneModal');
  if (mm) mm.remove();
  const hm = document.getElementById('historyModal');
  if (hm) hm.remove();
  transition(() => goTo('s1'));
}
