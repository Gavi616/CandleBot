import { gameData, sanitizeString, saveGameData, getDMResponse } from '../utils.js';
import { CONSENT_TIMEOUT } from '../config.js';

export async function leaveGame(message, args) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const playerId = message.author.id;

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (!game.players[playerId]) {
    message.reply('You are not a player in this game.');
    return;
  }

  const confirmation = await getDMResponse(message.author, `Are you sure you want to leave the game in <#${channelId}>?`, CONSENT_TIMEOUT, m => m.author.id === playerId, "Leave Game Confirmation");

  if (confirmation && confirmation.toLowerCase() === 'yes') {
    const reason = sanitizeString(args.join(' ') || 'No reason provided.');

    delete game.players[playerId];
    game.playerOrder = game.playerOrder.filter(id => id !== playerId);
    saveGameData();

    message.channel.send(`<@${playerId}> has left the game. Reason: ${reason}`);
  } else {
    message.channel.send(`<@${playerId}> did not confirm or timed out. They have not left the game.`);
  }

  saveGameData();
}
