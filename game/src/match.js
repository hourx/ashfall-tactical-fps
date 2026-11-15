// The match: rounds, money, the bomb, and the two ways a round ends. Everything that
// changes between rounds lives here so the sim modules stay stateless.
//
// Round flow: freeze (buy) -> live -> ended -> next round. First to seven wins.
import { ROUND, WEAPON_BY_ID, MATCH } from './config.js';
import { SITES, SPAWNS, ROUTES } from './world.js';
import { resetBot } from './bots.js';
import { resetPlayer } from './player.js';

const ATTACK_ROUTES = { A: ['aLong', 'aShort'], B: ['bLong', 'bShort'] };
const DEFEND_ROUTES = { A: 'holdA', B: 'holdB' };
const LOSS_BONUS = [1400, 1900, 2400, 2900];

let killId = 0;

export function createMatch({ player, bots, hooks }) {
  const state = {
    phase: 'freeze',
    phaseTime: ROUND.freezeTime,
    round: 1,
    score: { attack: 0, defend: 0 },
    lossStreak: { attack: 0, defend: 0 },
    result: null,
    killfeed: [],
    notice: '',
    noticeUntil: 0,
    bomb: {
      planted: false,
      exploded: false,
      defused: false,
      x: 0,
      z: 0,
      timer: 0,
      plantProgress: 0,
      defuseProgress: 0,
      planter: null,
      defuser: null,
      carrier: null,
      targetSite: 'A',
    },
    stats: { kills: 0, deaths: 0, plants: 0, defuses: 0, damage: 0 },
  };

  const now = () => hooks.now();

  function say(text, seconds = 2.6) {
    state.notice = text;
    state.noticeUntil = now() + seconds;
  }

  function aliveCount(team) {
    let n = 0;
    for (const bot of bots) if (bot.team === team && bot.alive) n += 1;
    if (player.team === team && player.alive) n += 1;
    return n;
  }

  function members(team) {
    const out = [];
    for (const bot of bots) if (bot.team === team) out.push(bot);
    if (player.team === team) out.push(player);
    return out;
  }

  function attackBots() {
    return bots.filter((b) => b.team === 'attack');
  }

  // ---------------------------------------------------------------- round setup

  function startRound(ctx) {
    const site = hooks.rng() < 0.5 ? 'A' : 'B';
    const bomb = state.bomb;
    bomb.planted = false;
    bomb.exploded = false;
    bomb.defused = false;
    bomb.timer = 0;
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    bomb.planter = null;
    bomb.defuser = null;
    bomb.targetSite = site;

    state.phase = 'freeze';
    state.phaseTime = ROUND.freezeTime;
    state.result = null;
    state.killfeed = [];

    const attack = attackBots();
    // The bomb goes to one attacker: sometimes the player, so planting is a player job.
    bomb.carrier = hooks.rng() < 0.45 ? player : attack[Math.floor(hooks.rng() * attack.length)];
    if (bomb.carrier === player) say('You carry the bomb — plant it at site ' + site, ROUND.freezeTime);

    resetPlayer(player, SPAWNS.attack[0]);
    player.armour = Math.max(0, player.armour);
    player.crouching = false;

    let attackIndex = 1;
    let defendIndex = 0;
    let defendSlot = 0;
    for (const bot of bots) {
      if (bot.team === 'attack') {
        const spawn = SPAWNS.attack[attackIndex % SPAWNS.attack.length];
        attackIndex += 1;
        const lanes = ATTACK_ROUTES[site];
        const route = lanes[(bot.id + state.round) % lanes.length];
        resetBot(bot, spawn, route, ROUTES);
        bot.carryBomb = bot === bomb.carrier;
        bot.armour = state.round >= 4 ? 100 : 0;
      } else {
        // Defenders split across the two sites so a plant is never free.
        bot.holdSite = defendSlot % 2 === 0 ? 'A' : 'B';
        defendSlot += 1;
        const spawn = SPAWNS.defend[defendIndex % SPAWNS.defend.length];
        defendIndex += 1;
        resetBot(bot, spawn, DEFEND_ROUTES[bot.holdSite], ROUTES);
        bot.armour = state.round >= 3 ? 100 : 0;
      }
      bot.weapon = pickBotWeapon(bot, state.round);
      bot.ammo.mag = WEAPON_BY_ID[bot.weapon].mag;
      bot.ammo.reserve = WEAPON_BY_ID[bot.weapon].reserve;
    }

    if (player.primary) player.ammo[player.primary] = { mag: WEAPON_BY_ID[player.primary].mag, reserve: WEAPON_BY_ID[player.primary].reserve };
    if (player.secondary) player.ammo[player.secondary] = { mag: WEAPON_BY_ID[player.secondary].mag, reserve: WEAPON_BY_ID[player.secondary].reserve };
    hooks.onRoundStart?.(state, ctx);
  }

  function pickBotWeapon(bot, round) {
    const order = ['wren', 'wren', 'cinder', 'cinder', 'vantage', 'vantage', 'cinder', 'vantage'];
    const pick = order[(round - 1) % order.length];
    if (bot.team === 'defend' && round >= 3 && bot.id % 3 === 0) return 'vantage';
    return pick;
  }

  // ---------------------------------------------------------------- damage

  // If the carrier goes down before the plant, the charge passes to the nearest attacker
  // still standing, so the round never stalls with the bomb lying on a body.
  function reassignBomb() {
    const bomb = state.bomb;
    if (bomb.planted || bomb.exploded || bomb.defused) return;
    if (!bomb.carrier || bomb.carrier.alive) return;
    const at = bomb.carrier.pos;
    let best = null;
    let bestDist = Infinity;
    for (const member of members('attack')) {
      if (!member.alive) continue;
      const dist = Math.hypot(member.pos.x - at.x, member.pos.z - at.z);
      if (dist < bestDist) {
        best = member;
        bestDist = dist;
      }
    }
    bomb.carrier = best;
    if (!best) return;
    for (const bot of bots) if (bot.team === 'attack') bot.carryBomb = bot === best;
    say(best === player ? `You have the bomb — plant it at site ${bomb.targetSite}` : `${best.name} picked up the bomb`, 2.4);
  }

  function applyDamage(victim, amount, part, attacker, weaponId) {
    if (!victim.alive || state.phase !== 'live') return 0;
    let damage = amount;
    if (victim.armour > 0) {
      const absorbed = Math.min(victim.armour, damage * ROUND.armourAbsorb);
      victim.armour = Math.max(0, victim.armour - absorbed);
      damage -= absorbed;
    }
    victim.health -= damage;
    if (attacker === player) state.stats.damage += Math.min(damage, Math.max(0, victim.health + damage));
    if (victim.health > 0) {
      if (victim === player) hooks.onHurt?.(damage);
      return damage;
    }
    victim.health = 0;
    victim.alive = false;

    state.killfeed.push({
      id: (killId += 1),
      killer: attacker ? attacker.name : 'Ashfall',
      victim: victim.name,
      weapon: WEAPON_BY_ID[weaponId]?.name ?? weaponId,
      headshot: part === 'head',
      until: now() + 6,
      byPlayer: attacker === player,
      onPlayer: victim === player,
    });
    if (state.killfeed.length > 5) state.killfeed.shift();

    if (attacker === player) {
      state.stats.kills += 1;
      player.money = Math.min(ROUND.maxMoney, player.money + ROUND.killReward);
      say(`+$${ROUND.killReward} · ${part === 'head' ? 'headshot' : 'kill'}`, 1.4);
    }
    if (victim === player) {
      state.stats.deaths += 1;
      hooks.onDeath?.(attacker);
    }
    if (attacker && attacker !== player) {
      attacker.money = (attacker.money ?? 0) + ROUND.killReward;
    }
    if (victim === state.bomb.carrier) reassignBomb();
    hooks.onKill?.(attacker, victim, part);
    return damage;
  }

  // ---------------------------------------------------------------- bomb

  // Attackers: hold the key inside a site with the bomb. Progress resets on release.
  function plantTick(holder, dt) {
    const bomb = state.bomb;
    if (state.phase !== 'live' || bomb.planted) return false;
    if (holder.team !== 'attack' || bomb.carrier !== holder || !holder.alive) return false;
    const site = SITES[bomb.targetSite];
    const dist = Math.hypot(holder.pos.x - site.x, holder.pos.z - site.z);
    if (dist > MATCH.siteRadius + 0.4) {
      bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 2);
      return false;
    }
    bomb.plantProgress += dt;
    if (bomb.plantProgress < ROUND.plantTime) return false;

    bomb.planted = true;
    bomb.timer = ROUND.bombTime;
    bomb.x = holder.pos.x;
    bomb.z = holder.pos.z;
    bomb.planter = holder;
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    state.phaseTime = Math.min(state.phaseTime, ROUND.bombTime);
    if (holder === player) {
      player.money = Math.min(ROUND.maxMoney, player.money + ROUND.plantReward);
      state.stats.plants += 1;
      say(`Bomb planted at ${bomb.targetSite} · +$${ROUND.plantReward}`, 2.4);
    } else {
      say(`Bomb planted at ${bomb.targetSite}`, 2.4);
    }
    hooks.onPlant?.(holder, bomb);
    return true;
  }

  // Defenders: hold the key on the bomb. Fifty seconds of bomb versus five of defuse.
  function defuseTick(holder, dt) {
    const bomb = state.bomb;
    if (state.phase !== 'live' || !bomb.planted || bomb.defused || !holder.alive) return false;
    if (holder.team !== 'defend') return false;
    const dist = Math.hypot(holder.pos.x - bomb.x, holder.pos.z - bomb.z);
    if (dist > 1.9) {
      bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt * 2);
      bomb.defuser = null;
      return false;
    }
    bomb.defuser = holder;
    bomb.defuseProgress += dt;
    if (bomb.defuseProgress < ROUND.defuseTime) return false;

    bomb.defused = true;
    bomb.defuseProgress = ROUND.defuseTime;
    if (holder === player) {
      player.money = Math.min(ROUND.maxMoney, player.money + ROUND.defuseReward);
      state.stats.defuses += 1;
    }
    say('Bomb defused', 2.4);
    hooks.onDefuse?.(holder, bomb);
    endRound('defend', 'defuse');
    return true;
  }

  function updateBomb(dt) {
    const bomb = state.bomb;
    if (!bomb.planted || bomb.defused || bomb.exploded) return;
    bomb.timer -= dt;
    if (bomb.defuseProgress > 0 && bomb.defuser && !bomb.defuser.alive) bomb.defuseProgress = 0;
    if (bomb.timer <= 0) {
      bomb.timer = 0;
      bomb.exploded = true;
      hooks.onExplode?.(bomb);
      endRound('attack', 'explode');
    }
  }

  // ---------------------------------------------------------------- round end

  function endRound(winner, reason) {
    if (state.result) return;
    state.result = { winner, reason };
    state.phase = 'ended';
    state.phaseTime = ROUND.endDelay;
    state.score[winner] += 1;

    const loser = winner === 'attack' ? 'defend' : 'attack';
    state.lossStreak[winner] = 0;
    state.lossStreak[loser] = Math.min(state.lossStreak[loser] + 1, LOSS_BONUS.length);

    const winReward = ROUND.winReward + (winner === 'attack' && reason === 'explode' ? 0 : 0);
    const lossReward = LOSS_BONUS[Math.max(0, state.lossStreak[loser] - 1)];

    for (const member of members('attack')) {
      const gain = winner === 'attack' ? winReward : lossReward;
      member.money = Math.min(ROUND.maxMoney, (member.money ?? 0) + gain);
    }
    for (const member of members('defend')) {
      const gain = winner === 'defend' ? winReward : lossReward;
      member.money = Math.min(ROUND.maxMoney, (member.money ?? 0) + gain);
    }

    const label = reason === 'elimination' ? 'eliminated' : reason === 'explode' ? 'bomb detonated' : reason === 'defuse' ? 'bomb defused' : 'time';
    say(`${winner === player.team ? 'Round won' : 'Round lost'} — ${label}`, ROUND.endDelay);
    hooks.onRoundEnd?.(state, winner, reason);
  }

  function checkRoundEnd() {
    if (state.result) return;
    const attackAlive = aliveCount('attack');
    const defendAlive = aliveCount('defend');
    if (defendAlive === 0) {
      endRound('attack', 'elimination');
      return;
    }
    if (attackAlive === 0 && !state.bomb.planted) {
      endRound('defend', 'elimination');
      return;
    }
    if (state.phaseTime <= 0 && !state.bomb.planted) {
      endRound('defend', 'time');
    }
  }

  // ---------------------------------------------------------------- buy

  const BUYABLE = [
    { id: 'wren', label: 'Wren-9 pistol', price: 200, detail: 'SIDEARM · 23 DMG · 15 ROUNDS' },
    { id: 'cinder', label: 'Cinder SMG', price: 1250, detail: 'CLOSE RANGE · 800 RPM · 30 ROUNDS' },
    { id: 'vantage', label: 'Vantage-7 rifle', price: 2700, detail: 'RIFLE · 34 DMG · 600 RPM · 30 ROUNDS' },
    { id: 'ember', label: 'Ember frag', price: 300, detail: 'THROWN · 1.7 S FUSE · 96 MAX DMG' },
    { id: 'veil', label: 'Veil smoke', price: 300, detail: 'THROWN · 9 S CLOUD · CUTS A LANE' },
    { id: 'armour', label: 'Plate carrier', price: ROUND.armourPrice, detail: 'SOAKS HALF OF EVERY HIT UNTIL IT BREAKS' },
  ];

  function canBuy() {
    return state.phase === 'freeze' && player.alive;
  }

  function buy(id) {
    if (!canBuy()) return { ok: false, why: 'Buying is frozen time only' };
    const item = BUYABLE.find((entry) => entry.id === id);
    if (!item) return { ok: false, why: 'No such item' };
    if (player.money < item.price) return { ok: false, why: 'Not enough money' };

    if (id === 'armour') {
      if (player.armour >= 100) return { ok: false, why: 'Armour is already full' };
      player.money -= item.price;
      player.armour = 100;
      return { ok: true };
    }
    if (id === 'ember') {
      if (player.grenades >= 2) return { ok: false, why: 'Two frags is the limit' };
      player.money -= item.price;
      player.grenades += 1;
      player.ammo.ember = { mag: player.grenades, reserve: 0 };
      return { ok: true };
    }
    if (id === 'veil') {
      if (player.smokes >= 2) return { ok: false, why: 'Two smokes is the limit' };
      player.money -= item.price;
      player.smokes += 1;
      return { ok: true };
    }
    const weapon = WEAPON_BY_ID[id];
    if (player.ammo[id] && weapon.slot === 1 && player.primary === id) return { ok: false, why: 'Already equipped' };
    player.money -= item.price;
    player.ammo[id] = { mag: weapon.mag, reserve: weapon.reserve };
    if (weapon.slot === 1) {
      player.primary = id;
      player.current = id;
    } else {
      player.secondary = id;
      player.current = id;
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------- tick

  function update(dt, ctx) {
    const bomb = state.bomb;
    state.killfeed = state.killfeed.filter((entry) => entry.until > now());

    if (state.phase === 'freeze') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) {
        state.phase = 'live';
        state.phaseTime = ROUND.roundTime;
        say(`Round ${state.round} — go`, 1.6);
        hooks.onLive?.(state);
      }
      return;
    }

    if (state.phase === 'live') {
      state.phaseTime -= dt;
      // Once the bomb is down the fuse is the clock: the HUD reads bomb.timer.
      updateBomb(dt);
      if (!state.result) checkRoundEnd();
      return;
    }

    if (state.phase === 'ended') {
      state.phaseTime -= dt;
      if (state.phaseTime > 0) return;
      const decided = state.score.attack >= ROUND.roundsToWin || state.score.defend >= ROUND.roundsToWin;
      if (decided || state.round >= ROUND.maxRounds) {
        state.phase = 'matchover';
        state.matchWinner = state.score.attack === state.score.defend ? 'draw' : state.score.attack > state.score.defend ? 'attack' : 'defend';
        hooks.onMatchOver?.(state);
        return;
      }
      state.round += 1;
      startRound(ctx);
    }
  }

  return {
    state,
    startRound,
    update,
    applyDamage,
    plantTick,
    defuseTick,
    canBuy,
    buy,
    BUYABLE,
    aliveCount,
    say,
    reset() {
      state.round = 1;
      state.score.attack = 0;
      state.score.defend = 0;
      state.lossStreak.attack = 0;
      state.lossStreak.defend = 0;
      state.stats = { kills: 0, deaths: 0, plants: 0, defuses: 0, damage: 0 };
      startRound({});
    },
  };
}

// Distance from a point to the nearest live site, used by the objective prompt.
export function siteUnder(pos) {
  for (const [name, site] of Object.entries(SITES)) {
    if (Math.hypot(pos.x - site.x, pos.z - site.z) < MATCH.siteRadius) return name;
  }
  return null;
}
