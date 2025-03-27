import { gameData, sanitizeString, saveGameData } from '../utils.js';

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

  const reason = sanitizeString(args.join(' ') || 'No reason provided.');

  delete game.players[playerId];
  game.playerOrder = game.playerOrder.filter(id => id !== playerId);
  saveGameData();

  message.channel.send(`<@${playerId}> has left the game. Reason: ${reason}`);

  saveGameData();
}
