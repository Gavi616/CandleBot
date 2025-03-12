import { sendCharacterGenStep } from '../chargen.js';
import { gameData } from '../index.js';
import { saveGameData } from '../utils.js';

export async function nextStep(message) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (gameData[channelId].characterGenStep >= 8) {
    message.reply('Character generation is already complete. Use `.conflict` to continue the game.');
    return;
  }

  gameData[channelId].characterGenStep++;
  saveGameData();
  sendCharacterGenStep(message, channelId);
}
