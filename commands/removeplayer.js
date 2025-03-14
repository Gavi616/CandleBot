import { gameData, sanitizeString, saveGameData } from '../utils.js';

export async function removePlayer(message, args) {
  const channelId = message.channel.id;
  const game = gameData[channelId];

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (message.author.id !== game.gmId) {
    message.reply('Only the GM can use this command.');
    return;
  }

  if (args.length < 1) {
    message.reply('Usage: .removeplayer <Player ID> [Reason]');
    return;
  }

  const playerIdToRemove = args[0].replace(/<@!?(\d+)>/, '$1'); // Extract player ID from mention

  if (!game.players[playerIdToRemove]) {
    message.reply('Invalid Player ID. Please mention a valid player in this game.');
    return;
  }

  let reason = args.slice(1).join(' '); // Extract the reason (if any)

  delete game.players[playerIdToRemove];
  game.playerOrder = game.playerOrder.filter(id => id !== playerIdToRemove);
  saveGameData();

  if (reason) {
    message.channel.send(`<@${playerIdToRemove}> has been removed from the game. Reason: ${reason}`);
  } else {
    message.channel.send(`<@${playerIdToRemove}> has been removed from the game.`);
  }
}
