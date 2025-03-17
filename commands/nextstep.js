import { sendCharacterGenStep } from '../chargen.js';
import { gameData, saveGameData } from '../utils.js';

export async function nextStep(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const userId = message.author.id; //Get the user id.

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  // Explicit GM check
  if (userId !== game.gmId) {
    message.reply('Only the GM can use the `.nextstep` command.');
    return;
  }

  if (game.characterGenStep >= 8) {
    message.reply('Character generation is already complete. Use `.conflict` to continue the game.');
    return;
  }

  game.characterGenStep++;
  sendCharacterGenStep(message, channelId);
  saveGameData();
}
