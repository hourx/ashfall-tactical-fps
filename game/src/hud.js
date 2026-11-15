// The overlay: scoreline, clock, health, ammo, money, killfeed, objective bar, the
// buy menu, the radar, and the full-screen cards between rounds. Pure DOM, no canvas
// work beyond the radar, so it costs almost nothing.
import { BLOCKS, SITES } from './world.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    hud: $('hud'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    scoreAttack: $('score-attack'),
    scoreDefend: $('score-defend'),
    timer: $('timer'),
    phaseLabel: $('phase-label'),
    roundLabel: $('round-label'),
    bombStatus: $('bomb-status'),
    bombTimer: $('bomb-timer'),
    killfeed: $('killfeed'),
    objective: $('objective'),
    objectiveFill: $('objective-fill'),
    objectiveLabel: $('objective-label'),
    health: $('health'),
    armour: $('armour'),
    frags: $('frags'),
    money: $('money'),
    ammo: $('ammo'),
    weaponName: $('weapon-name'),
    notice: $('notice'),
    hint: $('hint'),
    buy: $('buy'),
    buyList: $('buy-list'),
    buyMoney: $('buy-money'),
    screen: $('screen'),
    screenEyebrow: $('screen-eyebrow'),
    screenTitle: $('screen-title'),
    screenBody: $('screen-body'),
    screenAction: $('screen-action'),
    screenFine: $('screen-fine'),
    screenControls: $('screen-controls'),
    radar: $('radar'),
    damage: $('damage'),
  };

  const radarCtx = el.radar.getContext('2d');
  const size = el.radar.width;
  const span = 42; // world units across the radar
  const scale = size / span;
  const toPx = (x, z) => [(x + span / 2) * scale, (z + span / 2) * scale];

  // The static layer is drawn once: walls, crates, and both plant zones.
  const base = document.createElement('canvas');
  base.width = size;
  base.height = size;
  {
    const ctx = base.getContext('2d');
    ctx.fillStyle = 'rgba(10,14,16,0.82)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(120,140,148,0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= span; i += 6) {
      const p = i * scale;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
    for (const block of BLOCKS) {
      const [x, y] = toPx(block.x - block.w / 2, block.z - block.d / 2);
      ctx.fillStyle = block.kind === 'wall' ? 'rgba(60,74,80,0.9)' : block.kind === 'crate' ? 'rgba(120,72,44,0.9)' : 'rgba(74,88,94,0.9)';
      ctx.fillRect(x, y, block.w * scale, block.d * scale);
    }
    for (const [name, site] of Object.entries(SITES)) {
      const [x, y] = toPx(site.x, site.z);
      ctx.strokeStyle = name === 'A' ? 'rgba(64,158,166,0.9)' : 'rgba(176,92,58,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, site.r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(name, x - 3, y + 4);
    }
  }

  let noticeUntil = 0;
  let hitUntil = 0;
  let damageUntil = 0;
  let buyOpen = false;

  const now = () => performance.now() / 1000;

  return {
    el,
    isBuyOpen: () => buyOpen,

    setCrosshair(spreadPx) {
      const gap = Math.min(26, 4 + spreadPx * 1.4);
      el.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    },

    setHealth(health, armour) {
      const hp = Math.max(0, Math.round(health));
      el.health.textContent = String(hp);
      el.health.classList.toggle('low', hp <= 35);
      el.armour.textContent = armour > 0 ? `${Math.round(armour)} ARM` : 'NO ARMOUR';
    },

    setFrags(count) {
      el.frags.textContent = count > 0 ? `FRAG ×${count}` : 'NO FRAG';
    },

    setMoney(money) {
      el.money.textContent = `$${Math.round(money)}`;
    },

    setAmmo(mag, reserve, weaponName) {
      if (mag === null) {
        el.ammo.innerHTML = '—';
        el.weaponName.textContent = weaponName;
        el.ammo.classList.remove('empty');
        return;
      }
      el.ammo.innerHTML = `${mag}<span>/${reserve}</span>`;
      el.weaponName.textContent = weaponName;
      el.ammo.classList.toggle('empty', mag === 0);
    },

    setScore(attack, defend, round) {
      el.scoreAttack.textContent = String(attack);
      el.scoreDefend.textContent = String(defend);
      el.roundLabel.textContent = `ROUND ${round}`;
    },

    setTimer(seconds, label, urgent) {
      const total = Math.max(0, Math.ceil(seconds));
      el.timer.textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      el.phaseLabel.textContent = label;
      el.timer.classList.toggle('urgent', Boolean(urgent));
    },

    setBomb(planted, timer) {
      el.bombStatus.hidden = !planted;
      if (!planted) return;
      el.bombTimer.textContent = Math.max(0, timer).toFixed(1);
      el.bombStatus.classList.toggle('critical', timer < 10);
    },

    setObjective(active, label, progress) {
      el.objective.hidden = !active;
      if (!active) return;
      el.objectiveLabel.textContent = label;
      el.objectiveFill.style.width = `${Math.min(100, Math.max(0, progress * 100)).toFixed(1)}%`;
    },

    notice(text, seconds = 2.4) {
      el.notice.textContent = text;
      el.notice.classList.remove('fade');
      noticeUntil = now() + seconds;
    },

    hint(text) {
      if (!text) {
        el.hint.textContent = '';
        return;
      }
      el.hint.textContent = text;
    },

    hit(headshot) {
      el.hitmarker.classList.toggle('head', Boolean(headshot));
      el.hitmarker.classList.add('on');
      hitUntil = now() + (headshot ? 0.28 : 0.16);
    },

    hurt() {
      el.damage.classList.add('on');
      damageUntil = now() + 0.35;
    },

    kill(entry) {
      const row = document.createElement('li');
      row.className = 'kill-row';
      if (entry.byPlayer) row.classList.add('mine');
      if (entry.onPlayer) row.classList.add('theirs');
      row.innerHTML = `<b>${entry.killer}</b><span class="gun">${entry.weapon}${entry.headshot ? ' · HS' : ''}</span><b>${entry.victim}</b>`;
      el.killfeed.appendChild(row);
      while (el.killfeed.children.length > 5) el.killfeed.firstChild.remove();
      setTimeout(() => row.classList.add('out'), 5200);
      setTimeout(() => row.remove(), 6000);
    },

    clearKillfeed() {
      el.killfeed.replaceChildren();
    },

    showScreen({ eyebrow = '', title, body = '', action = '', fine = '', controls = false, tone = 'default' }) {
      el.screenEyebrow.textContent = eyebrow;
      el.screenTitle.textContent = title;
      el.screenBody.textContent = body;
      el.screenAction.textContent = action;
      el.screenAction.hidden = !action;
      el.screenFine.textContent = fine;
      el.screenControls.hidden = !controls;
      el.screen.className = `visible ${tone}`;
    },

    hideScreen() {
      el.screen.className = '';
    },

    isScreenOpen: () => el.screen.classList.contains('visible'),

    // Buy menu: rebuilt from the catalogue so prices and funds never drift.
    openBuy(items, money) {
      buyOpen = true;
      el.buy.hidden = false;
      el.buyMoney.textContent = `$${Math.round(money)}`;
      el.buyList.replaceChildren();
      items.forEach((item, index) => {
        const row = document.createElement('button');
        row.className = 'buy-row';
        row.dataset.id = item.id;
        row.disabled = money < item.price;
        row.innerHTML = `<span class="key">${index + 1}</span><span class="name">${item.label}${item.detail ? `<span class="detail">${item.detail}</span>` : ''}</span><span class="price">$${item.price}</span>`;
        el.buyList.appendChild(row);
      });
    },

    refreshBuy(items, money) {
      el.buyMoney.textContent = `$${Math.round(money)}`;
      const rows = el.buyList.querySelectorAll('.buy-row');
      rows.forEach((row, index) => {
        row.disabled = money < items[index].price;
      });
    },

    closeBuy() {
      buyOpen = false;
      el.buy.hidden = true;
    },

    // Radar: friendlies always, enemies only when a teammate can see them, plus the bomb.
    radar(player, bots, bomb) {
      const ctx = radarCtx;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(base, 0, 0);

      if (bomb?.planted) {
        const [bx, by] = toPx(bomb.x, bomb.z);
        ctx.fillStyle = '#e0512e';
        ctx.beginPath();
        ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const bot of bots) {
        if (!bot.alive) continue;
        const friendly = bot.team === player.team;
        if (!friendly && !bot.visibleToPlayer) continue;
        const [x, y] = toPx(bot.pos.x, bot.pos.z);
        ctx.fillStyle = friendly ? '#5fb0b8' : '#d9563a';
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      const [px, py] = toPx(player.pos.x, player.pos.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-player.yaw);
      ctx.fillStyle = '#e8b459';
      ctx.beginPath();
      ctx.moveTo(0, -5.5);
      ctx.lineTo(3.6, 4.5);
      ctx.lineTo(0, 2.6);
      ctx.lineTo(-3.6, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },

    // Anything time-based is cleared here, once per rendered frame.
    tick() {
      const t = now();
      if (noticeUntil && t > noticeUntil) {
        el.notice.classList.add('fade');
        noticeUntil = 0;
      }
      if (hitUntil && t > hitUntil) {
        el.hitmarker.classList.remove('on');
        hitUntil = 0;
      }
      if (damageUntil && t > damageUntil) {
        el.damage.classList.remove('on');
        damageUntil = 0;
      }
    },
  };
}
