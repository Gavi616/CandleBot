import Joi from 'joi';
import { client } from './index.js';

export const gameDataSchema = Joi.object({
  gm: Joi.object({
    consent: Joi.boolean().required(),
    brink: Joi.string().allow('').required()
  }).required(),
  players: Joi.object().pattern(
    Joi.string().pattern(/^\d+$/),
    Joi.object({
      playerUsername: Joi.string().required(),
      consent: Joi.boolean().allow(null).required(),
      brink: Joi.string().allow('').required(),
      moment: Joi.string().allow('').required(),
      virtue: Joi.string().allow('').required(),
      vice: Joi.string().allow('').required(),
      name: Joi.string().allow('').required(),
      look: Joi.string().allow('').required(),
      concept: Joi.string().allow('').required(),
      recordings: Joi.string().allow('').required(),
      hopeDice: Joi.number().integer().min(0).required(),
      virtueBurned: Joi.boolean().required(),
      viceBurned: Joi.boolean().required(),
      momentBurned: Joi.boolean().required(),
      isDead: Joi.boolean().required(),
      recording: Joi.string().allow('').optional(),
      gear: Joi.array().items(Joi.string()).optional()
    }).required()
  ).required(),
  playerOrder: Joi.array().items(Joi.string().pattern(/^\d+$/)).required(),
  characterGenStep: Joi.number().integer().min(1).max(9).required(),
  traitsRequested: Joi.boolean().required(),
  theme: Joi.string().allow('').required(),
  textChannelId: Joi.string().pattern(/^\d+$/).required(),
  guildId: Joi.string().pattern(/^\d+$/).required(),
  voiceChannelId: Joi.string().pattern(/^\d+$/).allow(null).required(),
  gameMode: Joi.string().valid('text-only', 'voice-plus-text').required(),
  initiatorId: Joi.string().pattern(/^\d+$/).required(),
  gmId: Joi.string().pattern(/^\d+$/).required(),
  channelId: Joi.string().pattern(/^\d+$/).required(),
  diceLost: Joi.number().integer().min(0).required(),
  lastSaved: Joi.string().isoDate().optional(),
  endGame: Joi.boolean().optional()
});

export function validateGameData(data, schema) {
  const { error } = schema.validate(data);
  if (error) {
    console.error('Validation Error:', error.details.map(detail => detail.message).join('\n'));
    return false;
  }
  return true;
}

export function validateGameSetup(message) {
  const args = message.content.slice(1).split(/ +/);
  const command = args.shift().toLowerCase();
  const gmId = args.shift().replace(/<@!?(\d+)>/, '$1');
  const playerIds = args.map(arg => arg.replace(/<@!?(\d+)>/, '$1'));

  if (command !== 'startgame') {
    return { valid: false, reason: 'Invalid command. Please use .startgame' };
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
  }

  if (playerIds.includes(gmId)) {
    return { valid: false, reason: 'The GM cannot also be a player.' };
  }

  return { valid: true, gmId, playerIds };
}