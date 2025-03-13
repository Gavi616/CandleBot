import fs from 'fs';
import ytdl from 'ytdl-core';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection
} from '@discordjs/voice';
import { ChannelType } from 'discord.js';
import { TRAIT_TIMEOUT, defaultVirtues, defaultVices, defaultMoments } from './config.js';

export async function askForTraits(message, game, playerId) {
  const player = await message.guild.members.fetch(playerId);
  const user = player.user;
  const dmChannel = await user.createDM();

  try {
    await user.send('Please DM me a Virtue and a Vice, separated by a comma (e.g., "Courageous, Greedy").');

    const filter = m => m.author.id === playerId;
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: TRAIT_TIMEOUT, errors: ['time'] });

    if (collected.size > 0) {
      // Player responded in time. `handleCharacterGenStep1DM` will handle the rest.
      return;
    } else {
      // Player timed out. Assign random traits.
      game.players[playerId].virtue = getRandomVirtue();
      game.players[playerId].vice = getRandomVice();
      saveGameData();
      await user.send(`You timed out. Random traits have been assigned: Virtue - ${game.players[playerId].virtue}, Vice - ${game.players[playerId].vice}`);
    }
  } catch (error) {
    console.error(`Error DMing player ${playerId} or assigning random traits:`, error);
  }
}

export async function askPlayersForCharacterInfo(message, channelId) {
  const game = gameData[channelId];
  const playerIds = game.playerOrder;

  for (const playerId of playerIds) {
    try {
      const player = await message.guild.members.fetch(playerId);
      const user = player.user;

      // Ask for Name
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'name', "What's your character's name or nickname?");

      // Ask for Look
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'look', 'What does your character look like at a quick glance?');

      // Ask for Concept
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'concept', 'Briefly, what is your character\'s concept (profession or role)?');

    } catch (error) {
      console.error(`Error requesting character info from player ${playerId}:`, error);
      message.channel.send(`Failed to get character info from player <@${playerId}>. Game cancelled.`);
      delete gameData[channelId];
      saveGameData();
      return;
    }
  }
}

export async function askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, retryCount = 0) {
  try {
    const dmChannel = await user.createDM();
    await user.send(question);

    const filter = m => m.author.id === playerId;
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

    if (collected.size > 0) {
      const response = collected.first().content;
      game.players[playerId][field] = sanitizeString(response);
      saveGameData();
    } else {
      throw new Error(`Player <@${playerId}> timed out while providing ${field}.`);
    }
  } catch (error) {
    if (retryCount < 3) {
      await user.send(`You timed out. Please provide your ${field} again.`);
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, retryCount + 1);
    } else {
      throw new Error(`Player <@${playerId}> timed out after multiple retries.`);
    }
  }
}

export function assignRandomMoment(user, player) {
  player.moment = defaultMoments[Math.floor(Math.random() * defaultMoments.length)];
  user.send(`You timed out. A random Moment has been assigned: "${player.moment}"`);
}

function getRandomVirtue() {
  return defaultVirtues[Math.floor(Math.random() * defaultVirtues.length)];
}

function getRandomVice() {
  return defaultVices[Math.floor(Math.random() * defaultVices.length)];
}

export function sanitizeString(str) {
  if (typeof str !== 'string') {
    return ''; // Return an empty string if not a string
  }

  // Remove control characters (except newline and tab, if you want to keep them)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\uFFFF]/g, ''); // Removes all control characters except \t \n
  // Escape double quotes
  str = str.replace(/"/g, '\\"');
  // Escape backslashes
  str = str.replace(/\\/g, '\\\\');

  return str;
}

const numberWords = [
  "zero", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten"
];

export function numberToWords(number) {
  if (number >= 0 && number <= 10) {
    return numberWords[number];
  } else {
    return number.toString(); // Return the number as a string if it's outside the range 0-10
  }
}

import { client } from './index.js';

let gameData = {};

export function loadGameData() {
  try {
    const data = fs.readFileSync('gameData.json', 'utf8');
    gameData = JSON.parse(data);
    console.log('Game data loaded successfully.');
    printActiveGames();
  } catch (err) {
    console.error('Error loading game data:', err);
    gameData = {};
    console.log('Game data initialized.');
  }
}

export function saveGameData() {
  try {
    for (const channelId in gameData) {
      gameData[channelId].lastSaved = new Date().toISOString();
    }
    fs.writeFileSync('gameData.json', JSON.stringify(gameData));
    console.log('Game data saved successfully.');
  } catch (err) {
    console.error('Error saving game data:', err);
  }
}

export function printActiveGames() {
  if (Object.keys(gameData).length === 0) {
    console.log('-- No Active Games --');
  } else {
    console.log('--- Active Games ---');
    for (const channelId in gameData) {
      const channel = client.channels.cache.get(channelId); // Check if the channel is cached first.
      if (channel) {
        if (channel.guild) {
          console.log(`Server: ${channel.guild.name}, Channel: ${channel.name}`);
        } else {
          console.log(`Channel ID: ${channelId} (Guild not found)`);
        }
      } else {
        console.log(`Channel ID: ${channelId} (Channel not found in cache)`);
      }
    }
  }
}

export async function sendCandleStatus(message, litCandles) {
  if (litCandles === 10) {
    message.channel.send('***Ten Candles are lit.***');
  } else if (litCandles >= 1 && litCandles <= 9) {
    const words = numberToWords(litCandles);
    if (litCandles === 1) {
      message.channel.send(`***There is ${words} lit candle.***`);
    } else {
      message.channel.send(`***There are ${words} lit candles.***`);
    }
  } else {
    message.channel.send('***All candles have been extinguished.***');
  }
}

export async function slowType(channel, text, charDelay = 50, wordDelay = 500) {
  if (typeof text !== 'string' || text.trim() === '') {
    console.warn('slowType: Received empty or invalid text. Skipping slow typing.');
    return;
  }

  let currentMessage = '';
  const words = text.split(' ');
  const sentMessage = await channel.send('...'); // Send an initial message so we have something to edit

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (const char of word) {
      currentMessage += char;
      await sentMessage.edit(currentMessage);
      const randomCharDelay = charDelay + Math.floor(Math.random() * 50);
      await new Promise(resolve => setTimeout(resolve, randomCharDelay));
    }
    if (i < words.length - 1) {
      currentMessage += ' ';
      await sentMessage.edit(currentMessage);
      const randomWordDelay = wordDelay + Math.floor(Math.random() * 200);
      await new Promise(resolve => setTimeout(resolve, randomWordDelay));
    }
  }
}

export async function playAudioFromUrl(url, voiceChannel) {
  try {
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      console.error(`Invalid voice channel.`);
      return;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    // Validate the URL
    if (!ytdl.validateURL(url)) {
      console.error(`Invalid URL: ${url}`);
      return;
    }

    //Check that the bot can play audio from this link.
    const stream = ytdl(url, { filter: 'audioonly' });

    //Create the Audio Player
    const player = createAudioPlayer();
    const resource = createAudioResource(stream);
    player.play(resource);
    connection.subscribe(player);

    //Listen for errors.
    player.on('error', error => {
      console.error('Error:', error.message);
    });

    return new Promise((resolve, reject) => {
      player.on(AudioPlayerStatus.Idle, () => {
        resolve();
      });

      player.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('Error in playAudioFromUrl:', error);
  }
}
