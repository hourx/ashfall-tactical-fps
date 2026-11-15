// Every number the game is tuned by lives here, so balance changes never touch logic.
// Colours are the six of the look plan: canvas, surface, dust, rust, teal and amber.

export const PALETTE = {
  canvas: '#0d1114',
  surface: '#161d21',
  dust: '#8f8b7e',
  rust: '#a8552f',
  teal: '#2f7f86',
  amber: '#e8b459',
  ink: '#e6e2d8',
  danger: '#c8452f',
};

// Movement is Quake-like: ground acceleration with friction, a small air control,
// and a crouch that halves speed so stopping to aim always pays.
export const MOVE = {
  gravity: 19.6,
  runSpeed: 5.6,
  walkSpeed: 2.9,
  crouchSpeed: 2.6,
  accel: 62,
  airAccel: 9,
  friction: 9.5,
  jumpSpeed: 5.2,
  stepHeight: 0.34,
  radius: 0.34,
  standHeight: 1.78,
  crouchHeight: 1.2,
  eyeStand: 1.62,
  eyeCrouch: 1.02,
  mouseSensitivity: 0.0022,
  maxPitch: Math.PI / 2 - 0.03,
};

export const WEAPONS = [
  {
    id: 'knife', name: 'Field Knife', slot: 3, price: 0, kind: 'melee',
    damage: 62, headMul: 1.8, rpm: 130, mag: 0, reserve: 0, reload: 0,
    spreadStand: 0, spreadMove: 0, spreadCrouch: 0, recoil: 0, range: 2.1,
  },
  {
    id: 'wren', name: 'Wren-9', slot: 1, price: 200, kind: 'hitscan',
    damage: 23, headMul: 3.0, rpm: 430, mag: 15, reserve: 60, reload: 1.9,
    spreadStand: 0.5, spreadMove: 3.6, spreadCrouch: 0.34, recoil: 0.9, range: 62,
  },
  {
    id: 'cinder', name: 'Cinder SMG', slot: 1, price: 1250, kind: 'hitscan',
    damage: 25, headMul: 2.6, rpm: 800, mag: 30, reserve: 90, reload: 2.3,
    spreadStand: 0.85, spreadMove: 4.4, spreadCrouch: 0.6, recoil: 0.62, range: 46,
  },
  {
    id: 'vantage', name: 'Vantage-7', slot: 1, price: 2700, kind: 'hitscan',
    damage: 34, headMul: 3.3, rpm: 600, mag: 30, reserve: 90, reload: 2.6,
    spreadStand: 0.4, spreadMove: 5.4, spreadCrouch: 0.26, recoil: 1.3, range: 90,
  },
  {
    id: 'ember', name: 'Ember frag', slot: 4, price: 300, kind: 'grenade',
    damage: 96, headMul: 1, rpm: 60, mag: 1, reserve: 0, reload: 0,
    spreadStand: 0, spreadMove: 0, spreadCrouch: 0, recoil: 0, range: 0,
    fuse: 1.7, blastRadius: 5.4, throwSpeed: 16,
  },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

// Round rules: two teams, freeze time to buy, a bomb the attackers plant and the
// defenders defuse, and a first-to-seven match.
export const ROUND = {
  freezeTime: 6,
  roundTime: 100,
  bombTime: 40,
  plantTime: 3.2,
  defuseTime: 5,
  endDelay: 3.4,
  roundsToWin: 7,
  maxRounds: 13,
  startMoney: 800,
  maxMoney: 9000,
  killReward: 300,
  winReward: 3250,
  lossReward: 1400,
  plantReward: 300,
  defuseReward: 300,
  armourPrice: 650,
  armourAbsorb: 0.5,
};

export const BOT = {
  // The player is the third attacker: two bot teammates, three defenders.
  attackCount: 2,
  defendCount: 3,
  health: 100,
  fovDeg: 112,
  viewRange: 52,
  hearingRange: 15,
  reaction: 0.26,
  aimTurn: 2.6,
  fireRange: 34,
  strafeSpeed: 2.4,
  patrolSpeed: 3.5,
};

export const MATCH = {
  siteRadius: 2.9,
  playerTeam: 'attack',
};

export const TICK = 1 / 60;
