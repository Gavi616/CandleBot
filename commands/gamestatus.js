export async function gameStatus(messageOrChannel) {
  let channelId, gameChannelName;

  if (messageOrChannel.channel) {
    channelId = messageOrChannel.channel.id;
    gameChannelName = messageOrChannel.channel.name;
  } else {
    channelId = messageOrChannel.id;
    gameChannelName = messageOrChannel.name;
  }

  const game = gameData[channelId];

  if (!game) {
    if (messageOrChannel.channel) {
      messageOrChannel.channel.send(`There is no game in progress in #${gameChannelName}.`);
    } else {
      console.log(`There is no game in progress in #${gameChannelName}.`);
    }
    return;
  }

  let statusMessage = `**Game Status in #${gameChannelName}**:\n`;
  statusMessage += `Theme / Module: ${game.theme}\n`;
  statusMessage += `Game Mode: ${game.gameMode}\n`
  statusMessage += `GM: <@${game.gmId}>\n`;
  statusMessage += `Players: ${game.playerOrder.map(playerId => `<@${playerId}>`).join(', ')}\n\n`;

  if (game.characterGenStep < 9) {
    statusMessage += `Character Generation Step: ${game.characterGenStep}\n`;
  } else if (game.inLastStand) {
    statusMessage += "All candles have been extinguished. We are in **The Last Stand**.\n";
  } else {
    statusMessage += `Current Scene: ${game.scene}\n`;
    statusMessage += `Communal Dice Remaining: ${game.dicePool}\n`;
  }
  if (messageOrChannel.channel) {
    await messageOrChannel.channel.send(statusMessage);
  } else {
    await messageOrChannel.send(statusMessage);
  }
}