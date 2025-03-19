import fs from 'fs';
import ytdl from 'ytdl-core';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection
} from '@discordjs/voice';
import { TRAIT_TIMEOUT, TIME_INTERVAL, defaultVirtues, defaultVices, defaultMoments, confirmButtonYesLabel, confirmButtonNoLabel, BRINK_TIMEOUT } from './config.js'; //Import BRINK_TIMEOUT
import { client } from './index.js';
import { gameDataSchema, validateGameData } from './validation.js';

export const gameData = {};
export const blocklist = {};

export function getGameData(channelId) {
  return gameData[channelId];
}

export function setGameData(channelId, data) {
  gameData[channelId] = data;
}

export function deleteGameData(channelId) {
  delete gameData[channelId];
}

export async function getDMResponse(user, prompt, time, filter) {
  try {
    const dmChannel = await user.createDM();
    const initialMessage = await user.send(prompt);
    const timer = countdown(user, time, initialMessage);

    const collected = await dmChannel.awaitMessages({ filter, max: 1, time, errors: ['time'] });

    clearInterval(timer);
    await initialMessage.edit(`Response Received`);

    if (collected.size > 0) {
      return collected.first().content.trim();
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Error getting DM response from ${user.tag}:`, error);
    return null;
  }
}

export async function requestConsent(user, prompt, yesId, noId, time) {
  try {
    const dmChannel = await user.createDM();
    const consentEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Consent Required')
      .setDescription(prompt);

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(yesId)
          .setLabel('Yes')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(noId)
          .setLabel('No')
          .setStyle(ButtonStyle.Danger)
      );

    const consentMessage = await user.send({ embeds: [consentEmbed], components: [row] });

    const filter = (interaction) =>
      interaction.user.id === user.id && interaction.message.id === consentMessage.id;

    const collector = dmChannel.createMessageComponentCollector({ filter, time });

    return new Promise((resolve) => {
      collector.on('collect', async (interaction) => {
        await interaction.deferUpdate();
        if (interaction.customId === yesId) {
          await interaction.editReply({ content: 'You have consented.', embeds: [], components: [] });
          resolve(true);
        } else if (interaction.customId === noId) {
          await interaction.editReply({ content: 'You have declined.', embeds: [], components: [] });
          resolve(false);
        }
        collector.stop();
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          await consentMessage.edit({ content: 'Consent timed out.', embeds: [], components: [] });
        }
        resolve(false);
      });
    });
  } catch (error) {
    console.error(`Error requesting consent from ${user.tag}:`, error);
    return false;
  }
}

export function getVirtualTableOrder(game, withGM = true) {
  if (withGM) {
      return [...game.playerOrder, game.gmId];
  } else {
      return [...game.playerOrder];
  }
}

export async function countdown(user, time, message) {
  const interval = TIME_INTERVAL;
  let timeLeft = time;
  let content;

  const timer = setInterval(async () => {
    timeLeft -= interval;
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);

    try {
        if (timeLeft <= 0) {
        clearInterval(timer);
        content = `Time's up! Random selections will now be made.`;
      } else {
        content = `*(Time remaining: ${minutes} minutes and ${seconds} seconds)*`;
      }
        await message.edit(content);
    } catch (error) {
        console.error('Error editing countdown message:', error);
    }
  }, interval);

  return timer;
}

async function confirmInput(user, question, time) {
  const confirmed = await requestConsent(user, question, 'input_yes', 'input_no', time);
  return confirmed;
}

export async function sendDM(user, message) {
  try {
    await user.send(message);
  } catch (error) {
    console.error(`Error DMing user ${user.tag}:`, error);
  }
}

export async function askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, time, retryCount = 0) {
  let input;
  do {
    try {
      const response = await getDMResponse(user, question, time, m => m.author.id === playerId);
      if (response) {
        input = response;
        if (!input) {
          await user.send('Invalid input. Please provide a non-empty value.');
          continue;
        }
        input = sanitizeString(input);
        if (field === 'name') {
          input = normalizeName(input);
        } else {
          input = normalizeSentence(input);
        }
        const confirmation = await confirmInput(user, `Your ${field}: ${input}`, time);
        if (!confirmation){
          continue;
        }
        game.players[playerId][field] = input;
        saveGameData();
        await user.send(`Your character's ${field} has been recorded as: ${game.players[playerId][field]}`);
        return;
      } else {
        throw new Error(`Player <@${playerId}> timed out while providing ${field}.`);
      }
    } catch (error) {
      if (retryCount < 3) {
        await user.send(`You timed out. Please provide your ${field} again.`);
        await askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, time, retryCount + 1);
        return;
      } else {
        throw new Error(`Player <@${playerId}> timed out after multiple retries.`);
      }
    }
  } while (true);
}

export async function askForTraits(message, gameChannel, game, playerId) {
  const player = await message.guild.members.fetch(playerId);
  const user = player.user;
  let virtue, vice;

  do {
    const response = await getDMResponse(user, 'Please DM me a Virtue and a Vice, separated by a comma (e.g., "Courageous, Greedy").', TRAIT_TIMEOUT, m => m.author.id === playerId);
    if (response) {
      [virtue, vice] = response.split(',').map(s => sanitizeString(s.trim()));
      virtue = normalizeVirtueVice(virtue); // Normalize virtue
      vice = normalizeVirtueVice(vice);     // Normalize vice
      const confirmation = await confirmInput(user, `Your virtue: ${virtue}, your vice: ${vice}`, TRAIT_TIMEOUT);
      if(!confirmation){
        continue;
      }
      game.players[playerId].virtue = virtue;
      game.players[playerId].vice = vice;
      saveGameData();
      return;
    } else {
      game.players[playerId].virtue = getRandomVirtue();
      game.players[playerId].vice = getRandomVice();
      saveGameData();
      await user.send(`You timed out. Random traits have been assigned: Virtue - ${game.players[playerId].virtue}, Vice - ${game.players[playerId].vice}`);
      return;
    }
  } while (true);
}

export async function askForMoment(user, game, playerId, time) {
  let input;
  do {
    try {
      const response = await getDMResponse(user, 'Please DM me your Moment.', time, m => m.author.id === playerId);
      if (response) {
        input = response;
        if (!input) {
          await user.send('Invalid input. Please provide a non-empty value.');
          continue;
        }
        input = sanitizeString(input);
        input = normalizeSentence(input);
        const confirmation = await confirmInput(user, `Your Moment: ${input}`, time);
        if (!confirmation){
          continue;
        }
        game.players[playerId].moment = input;
        return;
      } else {
        assignRandomMoment(user, game.players[playerId]);
        return;
      }
    } catch (error) {
      assignRandomMoment(user, game.players[playerId]);
      return;
    }
  } while (true);
}

export async function askForBrink(user, game, playerId, prompt, time){
  let input;
  do {
    try {
      const response = await getDMResponse(user, prompt, BRINK_TIMEOUT, m => m.author.id === playerId);
      if (response) {
        input = response;
        if (!input) {
          await user.send('Invalid input. Please provide a non-empty value.');
          continue;
        }
        input = sanitizeString(input);
        const characterName = game.players[playerId].name || user.username;
        if(playerId === game.gmId){
          input = normalizeGMBrink(input, characterName);
        } else {
          input = normalizePlayerBrink(input, characterName);
        }
        const confirmation = await confirmInput(user, `Your Brink: ${input}`, BRINK_TIMEOUT);
        if (!confirmation){
          continue;
        }
        return input;
      } else {
        return "";
      }
    } catch (error) {
      return "";
    }
  } while (true);
}

function assignRandomMoment(user, player) {
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
    return '';
  }

  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\uFFFF]/g, '');
  str = str.replace(/"/g, '\\"');
  str = str.replace(/\\(?!"|\\)/g, '\\\\');

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
    return number.toString();
  }
}

export function loadGameData() {
  try {
    const data = fs.readFileSync('gameData.json', 'utf8');
    const loadedGameData = JSON.parse(data);

    Object.keys(gameData).forEach(key => delete gameData[key]);

    Object.assign(gameData, loadedGameData);
    console.log('Game data loaded successfully.');
  } catch (err) {
    console.error('Error loading game data:', err);
    Object.keys(gameData).forEach(key => delete gameData[key]);
    console.log('Game data initialized.');
  }
}

export function saveGameData() {
  if (!validateGameData(gameData, gameDataSchema)) {
    console.error('Game data validation failed. Data not saved.');
    return;
  }

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
    return;
  }
  console.log('--- Active Games ---');
  for (const channelId in gameData) {
    if(!gameData[channelId]){
      continue;
    }
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      if(channel.guild){
        console.log(`Server: ${channel.guild.name}, Channel: ${channel.name}`);
      }
    }
  }
}

export function loadBlocklist() {
  try {
    const data = fs.readFileSync('blocklist.json', 'utf8');
    const loadedBlocklist = JSON.parse(data);

    Object.keys(blocklist).forEach(key => delete blocklist[key]);

    Object.assign(blocklist, loadedBlocklist);
    console.log('Blocklist loaded successfully.');
  } catch (err) {
    console.error(`Error loading blocklist: ${err.message}`);
    Object.keys(blocklist).forEach(key => delete blocklist[key]);
    console.log('Blocklist initialized.');
    }
}

export function saveBlocklist() {
  try {
    fs.writeFileSync('blocklist.json', JSON.stringify(blocklist));
    console.log('Blocklist saved successfully.');
    saveGameData();
  } catch (err) {
    console.error(`Error saving blocklist: ${err.message}`);
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

// Data normalization functions
export function normalizeVirtueVice(str) {
  return str.toLowerCase();
}

export function normalizeName(str) {
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function normalizeSentence(str) {
  if (!str) return "";
  str = str.charAt(0).toUpperCase() + str.slice(1);
  if (!str.endsWith('.')) {
    str += '.';
  }
  return str;
}

export function normalizePlayerBrink(str, characterName) {
  str = str || "";
  str = str.trim();
  if (!str) {
    return `${characterName} has seen you .`;
  }
  str = `${characterName} has seen you ${str}`;
  if (!str.endsWith('.')) {
    str += '.';
  }
  return str;
}

export function normalizeGMBrink(str, characterName) {
  str = str || "";
  str = str.trim();
  if (!str) {
    return `${characterName} has seen them .`;
  }
  str = `${characterName} has seen them ${str}`;
  if (!str.endsWith('.')) {
    str += '.';
  }
  return str;
}