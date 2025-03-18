import { sendCharacterGenStep } from '../chargen.js';
import { gameData, saveGameData } from '../utils.js';
import { findGameByUserId } from '../index.js';

export async function nextStep(message) {
  const channelId = message.channel.id;
  const game = findGameByUserId(message.author.id); //Use findGameByUserId() to get the game.
  
  if (!game) {
    message.channel.send('No game in progress.');
    return;
  }

  if (game.gmId !== message.author.id) { //Get the gmId from the game object.
    message.channel.send('Only the GM can use this command.');
    return;
  }

  game.characterGenStep++; // Increment the step
  saveGameData(); // Save the updated data
  const gameChannel = message.guild.channels.cache.get(game.textChannelId); //Get the game channel from the game object.
  sendCharacterGenStep(gameChannel, game); //Call sendCharacterGenStep, passing the game channel.
}
