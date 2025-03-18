import { gameData } from '../utils.js';

export async function gamestatus(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const gameChannelName = message.channel.name;

  if (!game) {
    message.channel.send(`There is no game in progress in #${gameChannelName}.`);
    return;
  }

  let statusMessage = `**Game Status in #${gameChannelName}**:\n`;
  statusMessage += `GM: <@${game.gmId}>\n`;
  statusMessage += `Players: ${game.playerOrder.map(playerId => `<@${playerId}>`).join(', ')}\n\n`;

  if (game.characterGenStep < 9) {
    statusMessage += `Character Generation Step: ${game.characterGenStep}\n`;
  } else if (game.inLastStand) {
    statusMessage += "No candles remain lit. We are in **The Last Stand**.";
  } else {
    statusMessage += `Current Scene: ${game.scene}\n`;
  }
  message.channel.send(statusMessage);
}
