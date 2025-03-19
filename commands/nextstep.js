import { sendCharacterGenStep } from '../chargen.js';
import { saveGameData, getGameData } from '../utils.js';

export async function nextStep(message) {
  const channelId = message.channel.id;
  const game = getGameData(channelId); // Use getGameData

  if (!game) {
    message.channel.send('No game in progress.');
    return;
  }

  if (game.gmId !== message.author.id) {
    message.channel.send('Only the GM can use this command.');
    return;
  }

  game.characterGenStep++;
  saveGameData();
  const gameChannel = message.guild.channels.cache.get(game.textChannelId);
  sendCharacterGenStep(gameChannel, game);
}
