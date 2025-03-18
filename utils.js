import fs from 'fs';
import ytdl from 'ytdl-core';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection
} from '@discordjs/voice';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder } from 'discord.js';
import { TRAIT_TIMEOUT, TIME_INTERVAL, defaultVirtues, defaultVices, defaultMoments, confirmButtonYesLabel, confirmButtonNoLabel } from './config.js';
import { client } from './index.js';

export const gameData = {};
export const blocklist = {};

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
  const dmChannel = await user.createDM();

  const consentEmbed = new EmbedBuilder()
  .setColor(0x0099FF)
  .setTitle('Is this Correct?')
  .setDescription(`${question}`);
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('input_yes')
        .setLabel(confirmButtonYesLabel)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('input_no')
        .setLabel(confirmButtonNoLabel)
        .setStyle(ButtonStyle.Danger)
    );

  const consentMessage = await user.send({
    embeds: [consentEmbed],
    components: [row],
  });

  const filter = (interaction) =>
    interaction.user.id === user.id && interaction.message.id === consentMessage.id;
  
  const collector = dmChannel.createMessageComponentCollector({
      filter: filter,
      time: time,
    });

  return new Promise((resolve) => {
    collector.on('collect', async (interaction) => {
        await interaction.deferUpdate();
        if (interaction.customId === 'input_yes') {
          await interaction.editReply({ content: 'Confirmed.', embeds: [], components: [] });
          resolve(true);
        } else if (interaction.customId === 'input_no') {
          await interaction.editReply({ content: 'Please try again.', embeds: [], components: [] });
          resolve(false);
        }
        collector.stop();
    });
    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
          await consentMessage.edit({
              content: 'Confirmation timed out.',
              embeds: [],
              components: [],
          });
      }
      resolve(false);
    });
  });
}

export async function askForTraits(message, gameChannel, game, playerId) {
  const player = await message.guild.members.fetch(playerId);
  const user = player.user;
  let virtue, vice;

  do {
    const dmChannel = await user.createDM();
    const initialMessage = await user.send('Please DM me a Virtue and a Vice, separated by a comma (e.g., "Courageous, Greedy").');
    const timer = await countdown(user, TRAIT_TIMEOUT, initialMessage);

    const filter = m => m.author.id === playerId;
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: TRAIT_TIMEOUT, errors: ['time'] });

    clearInterval(timer);
    await initialMessage.edit(`Traits Received`);

    if (collected.size > 0) {
      [virtue, vice] = collected.first().content.split(',').map(s => sanitizeString(s.trim()));
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

export async function askPlayersForCharacterInfo(message, channelId) {
  const game = gameData[channelId];
  const playerIds = game.playerOrder;

  for (const playerId of playerIds) {
    try {
      const player = await message.guild.members.fetch(playerId);
      const user = player.user;

      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'name', "What's your character's name or nickname?", 60000);

      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'look', 'What does your character look like at a quick glance?', 60000);

      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'concept', 'Briefly, what is your character\'s concept (profession or role)?', 60000);

    } catch (error) {
      console.error(`Error requesting character info from player ${playerId}:`, error);
      message.channel.send(`Failed to get character info from player <@${playerId}>. Game cancelled.`);
      delete gameData[channelId];
      return;
    }
  }
}

export async function askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, time, retryCount = 0) {
  let input;
  do {
    try {
      const dmChannel = await user.createDM();
      const initialMessage = await user.send(question);
      const timer = await countdown(user, time, initialMessage);

      const filter = m => m.author.id === playerId;
      const collected = await dmChannel.awaitMessages({ filter, max: 1, time: time, errors: ['time'] });

      clearInterval(timer);
      await initialMessage.edit(`${field} Received`);

      if (collected.size > 0) {
        input = sanitizeString(collected.first().content);
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

export async function askForMoment(user, game, playerId, time) {
  let input;
  do {
    try {
      const initialMessage = await user.send('Please DM me your Moment.');
      const timer = countdown(user, time, initialMessage);

      const filter = m => m.author.id === playerId;
      const collected = await dmChannel.awaitMessages({ filter, max: 1, time: time, errors: ['time'] });

      clearInterval(timer);
      await initialMessage.edit(`Moment Received`);

      if (collected.size > 0) {
        input = sanitizeString(collected.first().content);
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

function assignRandomMoment(user, player) {
  player.moment = defaultMoments[Math.floor(Math.random() * defaultMoments.length)];
  user.send(`You timed out. A random Moment has been assigned: "${player.moment}"`);
}

export async function askForBrink(user, game, playerId, prompt, time){
  let input;
  do {
    try {
      const initialMessage = await user.send(prompt);
      const timer = countdown(user, time, initialMessage);

      const filter = m => m.author.id === playerId;
      const collected = await dmChannel.awaitMessages({ filter, max: 1, time: time, errors: ['time'] });

      clearInterval(timer);
      await initialMessage.edit(`Brink Received`);

      if (collected.size > 0) {
        input = sanitizeString(collected.first().content);
        const confirmation = await confirmInput(user, `Your Brink: ${input}`, time);
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
