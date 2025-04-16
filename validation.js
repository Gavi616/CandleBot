import Joi from 'joi';
import { BOT_PREFIX } from './config.js';

export const gameDataSchema = Joi.object({
  gm: Joi.object({
    consent: Joi.boolean().required(),
    brink: Joi.string().allow('').required(),
    givenBrink: Joi.string().allow('').required(),
  }).required(),
  players: Joi.object().pattern(
    Joi.string().pattern(/^\d+$/),
    Joi.object({
      playerUsername: Joi.string().required(),
      consent: Joi.boolean().allow(null).required(),
      brink: Joi.string().allow('').required(),
      givenBrink: Joi.string().allow('').required(),
      moment: Joi.string().allow('').required(),
      virtue: Joi.string().allow('').required(),
      vice: Joi.string().allow('').required(),
      name: Joi.string().allow('').required(),
      look: Joi.string().allow('').required(),
      concept: Joi.string().allow('').required(),
      hopeDice: Joi.number().integer().min(0).required(),
      virtueBurned: Joi.boolean().required(),
      viceBurned: Joi.boolean().required(),
      momentBurned: Joi.boolean().required(),
      isDead: Joi.boolean().required(),
      finalRecording: Joi.string().allow('').optional(),
      gear: Joi.array().items(Joi.string()).optional(),
      stackOrder: Joi.array().items(Joi.string()).required(),
      initialChoice: Joi.string().allow(null).required(),
      availableTraits: Joi.array().items(Joi.string()).required(),
      inventoryConfirmed: Joi.boolean().optional(),
      language: Joi.string().allow(null).optional(),
      voice: Joi.string().allow(null).optional(),
      brinkUsedThisRoll: Joi.boolean().optional(),
    }).required()
  ).required(),
  playerOrder: Joi.array().items(Joi.string().pattern(/^\d+$/)).required(),
  characterGenStep: Joi.number().integer().min(1).max(9).required(),
  theme: Joi.object({
    title: Joi.string().allow('').required(),
    description: Joi.string().allow('').required(),
  }).required(),
  textChannelId: Joi.string().pattern(/^\d+$/).required(),
  guildId: Joi.string().pattern(/^\d+$/).required(),
  voiceChannelId: Joi.string().pattern(/^\d+$/).allow(null).required(),
  gameMode: Joi.string().valid('text-only', 'voice-plus-text').required(),
  initiatorId: Joi.string().pattern(/^\d+$/).required(),
  gmId: Joi.string().pattern(/^\d+$/).required(),
  diceLost: Joi.number().integer().min(0).required(),
  ghostsSpeakTruths: Joi.boolean().default(true).optional(),
  lastSaved: Joi.string().isoDate().optional(),
  endGame: Joi.boolean().optional(),
  reminderTimers: Joi.array().items(Joi.any()).optional(),
  inLastStand: Joi.boolean().optional(),
  playingRecordings: Joi.boolean().optional(),
  pendingMartyrdom: Joi.object({
      dyingPlayerId: Joi.string().pattern(/^\d+$/).required(),
      reason: Joi.string().allow('').required(),
      gmMessageId: Joi.string().pattern(/^\d+$/).required(),
      gmTimeoutId: Joi.any().allow(null).optional(),
      playerTimeoutId: Joi.any().allow(null).optional(),
  }).optional(),
  dicePool: Joi.number().integer().min(0).optional(),
  scene: Joi.number().integer().min(1).optional(),
});

export function validateGameData(data, schema) {
  const { error, value } = schema.validate(data, { allowUnknown: false }); // Set allowUnknown to false for stricter validation
  if (error) {
    console.error('Validation Error:', error.details.map(detail => detail.message).join('\n'));
    return false;
  }
  // Overwrite the original data with the validated (and potentially cleaned) data
  // This helps remove any unknown properties if allowUnknown was true, or ensures defaults if specified
  Object.assign(data, value);
  return true;
}

export function validateGameSetup(message) {
  const args = message.content.slice(1).split(/ +/);
  const command = args.shift().toLowerCase();
  const gmId = args.shift().replace(/<@!?(\d+)>/, '$1');
  const playerIds = args.map(arg => arg.replace(/<@!?(\d+)>/, '$1'));

  if (command !== 'startgame') {
    return { valid: false, reason: `Invalid command. Please use ${BOT_PREFIX}startgame` };
  }

  if (!/^\d+$/.test(gmId)) {
    return { valid: false, reason: 'Invalid GM ID. Please mention a valid user.' };
  }

  if (playerIds.length < 1) {
    return { valid: false, reason: 'Please mention at least one player.' };
  }

  for (const playerId of playerIds) {
    if (!/^\d+$/.test(playerId)) {
      return { valid: false, reason: 'Invalid Player ID. Please mention a valid user.' };
    }
    const existingGame = Object.values(gameData).find(game => game.players && game.players[playerId]);
    if (existingGame) {
      return { valid: false, reason: `<@${playerId}> is already in a game. Players can only participate in one game at a time. They can use \`${BOT_PREFIX}leavegame [reason]\` to exit their current game.` };
    }
  }

  if (playerIds.includes(gmId)) {
    return { valid: false, reason: 'The GM cannot also be a player.' };
  }

  return { valid: true, gmId, playerIds };
}