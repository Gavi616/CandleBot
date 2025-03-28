import textToSpeech from '@google-cloud/text-to-speech';
import { Readable } from 'stream';
import ffmpeg from 'ffmpeg-static';
import fs from 'fs';
import ytdl from 'ytdl-core';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
  StreamType
  getVoiceConnection,
  StreamType
} from '@discordjs/voice';
import { TRAIT_TIMEOUT, BRINK_TIMEOUT, defaultVirtues, defaultVices, defaultMoments, languageOptions } from './config.js'; // Import languageOptions here
import { client } from './index.js';
import { gameDataSchema, validateGameData } from './validation.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import { TEST_USER_ID, defaultPlayerGMBrinks, defaultThreatBrinks } from './config.js';
import { sendCharacterGenStep } from './chargen.js';
import { isTesting } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';

export const gameData = {};
export const blocklist = {};
const ttsClient = new textToSpeech.TextToSpeechClient();

export async function askForVoicePreference(user, game, playerId, time) {
  const dmChannel = await user.createDM();
  const languageSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('language_select')
    .setPlaceholder('Select a language')
    .addOptions(Object.keys(languageOptions).map(key => {
      return {
        label: languageOptions[key].name,
        value: key,
        default: false,
      };
    }));
  const languageRow = new ActionRowBuilder().addComponents(languageSelectMenu);
  const voiceSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('voice_select')
    .setPlaceholder('Select a voice')
    .addOptions([{
      label: 'Select a language first',
      value: 'placeholder',
    }])
    .setDisabled(true);
  const voiceRow = new ActionRowBuilder().addComponents(voiceSelectMenu);
  const useVoiceButton = new ButtonBuilder()
    .setCustomId('use_voice')
    .setLabel('Use this Voice')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const buttonRow = new ActionRowBuilder().addComponents(useVoiceButton);
  const voiceEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Choose Your Character\'s Voice')
    .setDescription(`Please choose a language and voice for your character.`);
  const voiceMessage = await user.send({ embeds: [voiceEmbed], components: [languageRow, voiceRow, buttonRow] });

  const filter = (interaction) => interaction.user.id === user.id && interaction.message.id === voiceMessage.id;
  const collector = dmChannel.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time });
  let selectedLanguage = null;
  let selectedVoice = null;
  return new Promise((resolve) => {
    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate();
      if (interaction.customId === 'language_select') {
        selectedLanguage = interaction.values[0];
        selectedVoice = null; // Reset selected voice when language changes
        const newVoiceOptions = Object.entries(languageOptions[selectedLanguage].voices).map(([key, value]) => {
          return {
            label: value.name,
            value: key,
            default: false,
          };
        });
        voiceSelectMenu.setOptions(newVoiceOptions)
          .setDisabled(false)
          .setPlaceholder(`Select a voice in ${languageOptions[selectedLanguage].name}`);
        useVoiceButton.setDisabled(true);
        await voiceMessage.edit({ components: [languageRow, voiceRow, buttonRow] });
      } else if (interaction.customId === 'voice_select') {
        selectedVoice = interaction.values[0];
        const updatedVoiceOptions = voiceSelectMenu.options.map(option => {
          if (option.data) {
            return {
              label: option.data.label,
              value: option.data.value,
              default: option.data.value === selectedVoice,
            };
          } else {
            return {
              label: option.label,
              value: option.value,
              default: option.value === selectedVoice,
            };
          }
        });
        voiceSelectMenu.setOptions(updatedVoiceOptions);
        useVoiceButton.setDisabled(false);
        await voiceMessage.edit({ components: [languageRow, voiceRow, buttonRow] });
      }
    });
    const buttonCollector = dmChannel.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time });
    buttonCollector.on('collect', async (interaction) => {
      await interaction.deferUpdate();
      if (interaction.customId === 'use_voice') {
        if (!selectedLanguage || !selectedVoice) {
          await interaction.followUp({ content: 'Please select a language and voice first.', ephemeral: true });
          return;
        }
        game.players[playerId].language = selectedLanguage;
        game.players[playerId].voice = selectedVoice;
        await interaction.editReply({ content: `You have chosen the voice: ${languageOptions[selectedLanguage].voices[selectedVoice].name} in ${languageOptions[selectedLanguage].name}`, embeds: [], components: [] });
        collector.stop();
        buttonCollector.stop();
        resolve();
      }
    });
    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await voiceMessage.edit({ content: 'You did not choose a voice in time. Please try again.', embeds: [], components: [] });
        resolve();
      }
    });
  });
}

export async function speakInChannel(text, voiceChannel, voiceCode = 'en-US-Standard-A') { // Add voiceCode parameter
  try {
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      console.error(`Invalid voice channel.`);
      return;
    }

    const connection = getVoiceConnection(voiceChannel.guild.id);

    if (!connection) {
      console.error(`Not connected to a voice channel.`);
      return;
    }

    let language = voiceCode.substring(0, 5);
    let voice;
    if (languageOptions[language] && languageOptions[language].voices[voiceCode]) {
      voice = languageOptions[language].voices[voiceCode];
    } else {
      language = 'en-US';
      voice = languageOptions['en-US'].voices['en-US-Standard-A'];
    }

    const request = {
      input: { text: text },
      voice: { languageCode: language, ssmlGender: voice.ssmlGender },
      audioConfig: { audioEncoding: 'OGG_OPUS' },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);

    const audioStream = new Readable();
    audioStream.push(response.audioContent);
    audioStream.push(null);

    const resource = createAudioResource(audioStream, { inputType: StreamType.OggOpus });
    const player = createAudioPlayer();

    player.play(resource);
    connection.subscribe(player);

    player.on('error', error => {
      console.error('Error playing TTS audio:', error);
    });

    await new Promise((resolve, reject) => {
      player.on(AudioPlayerStatus.Idle, () => {
        resolve();
      });

      player.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('Error in speakInChannel:', error);
  }
}

export async function sendTestDM(client, message) {
  if (isTesting) {
    try {
      const testUser = await client.users.fetch(TEST_USER_ID);
      await testUser.send(message);
      console.log(`Sent test DM to ${testUser.tag}`);
    } catch (error) {
      console.error(`Error sending test DM:`, error);
    }
  }
}

function assignRandomBrink(isThreat = false) {
  const brinks = isThreat ? defaultThreatBrinks : defaultPlayerGMBrinks;
  return brinks[Math.floor(Math.random() * brinks.length)];
}

export function getGameData(channelId) {
  return gameData[channelId];
}

export function setGameData(channelId, data) {
  gameData[channelId] = data;
}

export function deleteGameData(channelId) {
  delete gameData[channelId];
}

export async function playRandomConflictSound(voiceChannel) {
  try {
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      console.error(`Invalid voice channel.`);
      return;
    }

    const connection = getVoiceConnection(voiceChannel.guild.id);

    if (!connection) {
      console.error(`Not connected to a voice channel.`);
      return;
    }
    
    // Get the directory name of the current module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Construct the path to the audio files directory
    const audioFilesDir = path.join(__dirname, 'audio_files');

    // Get a list of all files in the audio_files directory
    const files = fs.readdirSync(audioFilesDir);

    // Filter for files matching the pattern 'two_[number].mp3'
    const conflictSounds = files.filter(file => file.startsWith('two_') && file.endsWith('.mp3'));

    if (conflictSounds.length === 0) {
      console.error('No conflict sound files found.');
      return;
    }

    // Select a random sound file
    const randomSound = conflictSounds[Math.floor(Math.random() * conflictSounds.length)];
    const soundFilePath = path.join(audioFilesDir, randomSound);

    // Create an audio resource from the file
    const resource = createAudioResource(soundFilePath);

    // Create an audio player and play the resource
    const player = createAudioPlayer();
    player.play(resource);
    connection.subscribe(player);

    player.on('error', error => {
      console.error('Error playing conflict sound:', error);
    });

    // Wait for the sound to finish playing
    await new Promise((resolve, reject) => {
      player.on(AudioPlayerStatus.Idle, () => {
        resolve();
      });

      player.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('Error in playRandomConflictSound:', error);
  }
}

export async function playRandomConflictSound(voiceChannel) {
  try {
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      console.error(`Invalid voice channel.`);
      return;
    }

    const connection = getVoiceConnection(voiceChannel.guild.id);

    if (!connection) {
      console.error(`Not connected to a voice channel.`);
      return;
    }
    
    // Get the directory name of the current module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Construct the path to the audio files directory
    const audioFilesDir = path.join(__dirname, 'audio_files');

    // Get a list of all files in the audio_files directory
    const files = fs.readdirSync(audioFilesDir);

    // Filter for files matching the pattern 'two_[number].mp3'
    const conflictSounds = files.filter(file => file.startsWith('two_') && file.endsWith('.mp3'));

    if (conflictSounds.length === 0) {
      console.error('No conflict sound files found.');
      return;
    }

    // Select a random sound file
    const randomSound = conflictSounds[Math.floor(Math.random() * conflictSounds.length)];
    const soundFilePath = path.join(audioFilesDir, randomSound);

    // Create an audio resource from the file
    const resource = createAudioResource(soundFilePath);

    // Create an audio player and play the resource
    const player = createAudioPlayer();
    player.play(resource);
    connection.subscribe(player);

    player.on('error', error => {
      console.error('Error playing conflict sound:', error);
    });

    // Wait for the sound to finish playing
    await new Promise((resolve, reject) => {
      player.on(AudioPlayerStatus.Idle, () => {
        resolve();
      });

      player.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('Error in playRandomConflictSound:', error);
  }
}

export async function requestConsent(user, prompt, yesId, noId, time, title = 'Consent Required') {
  console.log(`requestConsent: Called for user ${user.tag} with prompt: ${prompt}`);
  try {
    const dmChannel = await user.createDM();
    const consentEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(title)
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
        console.log(`requestConsent: Button collected: ${interaction.customId} from ${interaction.user.tag}`);
        row.components.forEach(component => component.setDisabled(true));
        await interaction.update({ components: [row] });

        if (interaction.customId === yesId) {
          resolve(true);
        } else if (interaction.customId === noId) {
          await user.send({ content: 'You have declined.' });
          resolve(false);
        }
        collector.stop();
      });

      collector.on('end', async (collected, reason) => {
        console.log(`requestConsent: Collector ended for ${user.tag}. Reason: ${reason}`);
        if (reason === 'time') {
          await user.send('Consent Request timed out.');
        }
        resolve(false);
      });
    });
  } catch (error) {
    console.error(`Error requesting consent from ${user.tag}:`, error);
    return false;
  }
}

export async function getDMResponse(user, prompt, time, filter, title = "Response Required") {
  try {
    const dmChannel = await user.createDM();
    const responseEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(title)
      .setDescription(prompt);
    await user.send({ embeds: [responseEmbed] });

    const collected = await dmChannel.awaitMessages({ filter, max: 1, time, errors: ['time'] });

    if (collected.size > 0) {
      return collected.first().content.trim();
    } else {
      return null;
    }
  } catch (error) {
    if (error.message === 'time') {
      return null;
    }
    console.error(`Error getting DM response from ${user.tag}:`, error);
    return null;
  }
}

export async function confirmInput(user, question, time, title = "Confirm Input") {
  const dmChannel = await user.createDM();
  const consentEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(title)
    .setDescription(question);

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('input_yes')
        .setLabel('Yes')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('input_no')
        .setLabel('No')
        .setStyle(ButtonStyle.Danger)
    );

  const consentMessage = await user.send({ embeds: [consentEmbed], components: [row] });

  const filter = (interaction) =>
    interaction.user.id === user.id && interaction.message.id === consentMessage.id;

  const collector = dmChannel.createMessageComponentCollector({ filter, time, max: 1 });

  return new Promise((resolve) => {
    collector.on('collect', async (interaction) => {
      console.log(`confirmInput: Button collected: ${interaction.customId} from ${interaction.user.tag}`);
      row.components.forEach(component => component.setDisabled(true));
      await interaction.update({ components: [row] });

      if (interaction.customId === 'input_yes') {
        resolve(true);
      } else if (interaction.customId === 'input_no') {
        resolve(false);
      }
    });

    collector.on('end', async (collected, reason) => {
      console.log(`confirmInput: Collector ended for ${user.tag}. Reason: ${reason}`);
      if (reason === 'time') {
        await user.send('Input Confirmation timed out.');
      }
      if (collected.size === 0) {
        resolve(false);
      }
    });
  });
}

export function getVirtualTableOrder(game, withGM = true) {
  if (withGM) {
    return [...game.playerOrder, game.gmId];
  } else {
    return [...game.playerOrder];
  }
}

export async function sendDM(user, message) {
  try {
    await user.send(message);
  } catch (error) {
    console.error(`Error DMing user ${user.tag}:`, error);
  }
}

export async function askForCharacterInfo(user, game, playerId, field, question, time) {
export async function askForCharacterInfo(user, game, playerId, field, question, time) {
  let input;
  while (true) {
  while (true) {
    const response = await getDMResponse(user, question, time, m => m.author.id === playerId);
    if (response) {
      input = response.trim();
      input = response.trim();
      if (!input) {
        await user.send('Invalid input. Please provide a non-empty value.');
        continue;
        continue;
      }
      input = sanitizeString(input);
      if (field === 'name') {
        input = normalizeName(input);
      } else {
        input = normalizeSentence(input);
      }
      const confirmation = await confirmInput(user, `Is this correct?\n${input}`, time);
      if (confirmation) {
        game.players[playerId][field] = input;
        await user.send(`Your character's ${field} has been recorded.`);
        return;
      } else {
        continue;
      }
    } else {
      await user.send(`Request timed out. Please provide your ${field} again.`);
      continue;
      const confirmation = await confirmInput(user, `Is this correct?\n${input}`, time);
      if (confirmation) {
        game.players[playerId][field] = input;
        await user.send(`Your character's ${field} has been recorded.`);
        return;
      } else {
        continue;
      }
    } else {
      await user.send(`Request timed out. Please provide your ${field} again.`);
      continue;
    }
  }
}

export async function askForTraits(message, gameChannel, game, playerId) {
  const player = await message.guild.members.fetch(playerId);
  const user = player.user;
  let virtue, vice;

  do {
    const response = await getDMResponse(user, 'Please send a Virtue and a Vice, separated by a comma (e.g., "courageous, greedy").\nEach should be a single vague but descriptive adjective. (e.g. Sharpshooter => Steady)\nVirtues solve more problems than they create.\nVices cause more problems than they solve.', TRAIT_TIMEOUT, m => m.author.id === playerId, "Request for Traits");
    if (response) {
        if (response.trim() === "?") {
            virtue = getRandomVirtue();
            vice = getRandomVice();
            await user.send(`Random traits have been assigned:\nVirtue: ${virtue}\nVice: ${vice}`);
        } else {
            [virtue, vice] = response.split(',').map(s => sanitizeString(s.trim()));
            virtue = normalizeVirtueVice(virtue);
            vice = normalizeVirtueVice(vice);
        }

      const confirmation = await confirmInput(user, `Are you happy with these Traits?\nVirtue: ${virtue}\nVice: ${vice}`, TRAIT_TIMEOUT, "Confirm these Traits");
        if (response.trim() === "?") {
            virtue = getRandomVirtue();
            vice = getRandomVice();
            await user.send(`Random traits have been assigned:\nVirtue: ${virtue}\nVice: ${vice}`);
        } else {
            [virtue, vice] = response.split(',').map(s => sanitizeString(s.trim()));
            virtue = normalizeVirtueVice(virtue);
            vice = normalizeVirtueVice(vice);
        }

      const confirmation = await confirmInput(user, `Are you happy with these Traits?\nVirtue: ${virtue}\nVice: ${vice}`, TRAIT_TIMEOUT, "Confirm these Traits");
      if (!confirmation) {
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
      await user.send(`Request timed out. Random traits have been assigned:\nVirtue: ${game.players[playerId].virtue}\nVice: ${game.players[playerId].vice}`);
      return;
    }
  } while (true);
}

export async function askForMoment(user, game, playerId, time) {
export async function askForMoment(user, game, playerId, time) {
  let input;
  while (true) {
    const response = await getDMResponse(user, 'Please send me your Moment.\nA Moment is an event that would bring you hope andbe reasonable to achieve, kept succinct and clear to provide strong direction.\nAll Moments should have the potential for failure.', time, m => m.author.id === playerId);
  while (true) {
    const response = await getDMResponse(user, 'Please send me your Moment.\nA Moment is an event that would bring you hope andbe reasonable to achieve, kept succinct and clear to provide strong direction.\nAll Moments should have the potential for failure.', time, m => m.author.id === playerId);
    if (response) {
        if (response.trim() === "?") {
            assignRandomMoment(user, game.players[playerId]);
            return;
        }
      input = response.trim();
        if (response.trim() === "?") {
            assignRandomMoment(user, game.players[playerId]);
            return;
        }
      input = response.trim();
      if (!input) {
        await user.send('Invalid Moment. Please provide a non-empty value.');
        continue;
        continue;
      }
      input = sanitizeString(input);
      input = normalizeSentence(input);
      const confirmation = await confirmInput(user, `Are you happy with your Moment?\n${input}`, time);
      if (confirmation) {
        game.players[playerId].moment = input;
        saveGameData();
        return;
      } else {
        continue;
      }
      const confirmation = await confirmInput(user, `Are you happy with your Moment?\n${input}`, time);
      if (confirmation) {
        game.players[playerId].moment = input;
        saveGameData();
        return;
      } else {
        continue;
      }
    } else {
      assignRandomMoment(user, game.players[playerId]);
      return;
    }
  }
}

export async function askForBrink(user, game, playerId, prompt, time, isThreat = false) {
  let input;
  while (true) {
    const response = await getDMResponse(user, prompt, time, m => m.author.id === playerId, "Request for Brink");
    if (response) {
        if (response.trim() === "?") {
            if (isThreat) {
                input = assignRandomBrink(true);
            } else {
                input = assignRandomBrink(false);
            }
            
            const characterName = game.players[playerId].name || user.username;
            input = normalizeBrink(input, characterName, isThreat);
            game.players[playerId].brink = input;
            await user.send(`A random Brink has been assigned: ${input}`);
            saveGameData();
            return input;
        }
        if (response.trim() === "?") {
            if (isThreat) {
                input = assignRandomBrink(true);
            } else {
                input = assignRandomBrink(false);
            }
            
            const characterName = game.players[playerId].name || user.username;
            input = normalizeBrink(input, characterName, isThreat);
            game.players[playerId].brink = input;
            await user.send(`A random Brink has been assigned: ${input}`);
            saveGameData();
            return input;
        }
      input = response;
      if (!input) {
        await user.send('Invalid Brink. Please provide a non-empty value.');
        continue;
      }
      input = sanitizeString(input);
      const characterName = game.players[playerId].name || user.username;
      if (isThreat) {
        input = normalizeBrink(input, characterName, true);
      } else if (playerId === game.gmId) {
        input = normalizeBrink(input, characterName);
      } else {
        input = normalizeBrink(input, characterName);
      }
      const confirmation = await confirmInput(user, `Are you happy with your Brink?\n${input}`, time, "Confirm Your Brink");
      const confirmation = await confirmInput(user, `Are you happy with your Brink?\n${input}`, time, "Confirm Your Brink");
      if (confirmation) {
        game.players[playerId].brink = input;
        saveGameData();
        return input;
      } else {
        continue;
      }
    } else {
      await user.send(`You timed out. Please provide your Brink again.`);
      continue;
    }
  }
}

function assignRandomMoment(user, player) {
  player.moment = defaultMoments[Math.floor(Math.random() * defaultMoments.length)];
  user.send(`Request timed out. A random Moment has been assigned: "${player.moment}"`);
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
    for (const channelId in gameData) {
      if (!gameData[channelId].channelId) {
        gameData[channelId].channelId = channelId;
      }
    }
  } catch (err) {
    console.error('loadGameData: Error loading game data:', err);
    Object.keys(gameData).forEach(key => delete gameData[key]);
  }
}

export function saveGameData() {
  try {
    const gameDataToSave = {};
    for (const channelId in gameData) {
      if (validateGameData(gameData[channelId], gameDataSchema)) {
        gameDataToSave[channelId] = gameData[channelId];
        gameDataToSave[channelId].lastSaved = new Date().toISOString();
      } else {
        console.error(`saveGameData: Game data validation failed for channel ${channelId}. Data not saved.`);
      }
    }
    fs.writeFileSync('gameData.json', JSON.stringify(gameDataToSave));
  } catch (err) {
    console.error('saveGameData: Error saving game data:', err);
  }
}

export function printActiveGames() {
  if (Object.keys(gameData).length === 0) {
    console.log('-- No Active Games --');
    return;
  }
  console.log('--- Active Games ---');
  for (const channelId in gameData) {
    if (!gameData[channelId]) {
      continue;
    }
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      if (channel.guild) {
        console.log(`Server: ${channel.guild.name}, Channel: ${channel.name}`);
      }
    }
  }
  console.log('--------------------');
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
  } catch (err) {
    console.error(`Error saving blocklist: ${err.message}`);
  }
}

export async function sendCandleStatus(channel, litCandles) {
  if (litCandles === 10) {
    channel.send('***Ten Candles are lit.***');
  } else if (litCandles >= 1 && litCandles <= 9) {
    const words = numberToWords(litCandles);
    if (litCandles === 1) {
      channel.send(`***There is ${words} lit candle.***`);
    } else {
      channel.send(`***There are ${words} lit candles.***`);
    }
  } else {
    channel.send('***All candles have been extinguished.***');
  }
}

export async function sendConsentConfirmation(user, game, type, serverName, channelName, guildId, channelId) {
  try {
    const dmChannel = await user.createDM();
    let message;

    if (type === 'gm') {
      message = `Thank you for consenting to GM **Ten Candles** in <#${channelId}>.`;
    } else if (type === 'player') {
      message = `Thank you for consenting to play **Ten Candles** in <#${channelId}>.`;
    } else {
      console.error(`sendConsentConfirmation: Invalid consent type: ${type}`);
      return;
    }
    await dmChannel.send(message);
  } catch (error) {
    console.error(`Error sending consent confirmation to ${user.tag}:`, error);
  }
}

export async function playAudioFromUrl(url, voiceChannel) {
  try {
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      console.error(`Invalid voice channel.`);
      return;
    }

    const connection = getVoiceConnection(voiceChannel.guild.id);
    const connection = getVoiceConnection(voiceChannel.guild.id);

    if (!connection) {
      console.error(`Not connected to a voice channel.`);
    if (!connection) {
      console.error(`Not connected to a voice channel.`);
      return;
    }

    let resource;
    if (ytdl.validateURL(url)) {
      // Handle YouTube URLs
      const stream = ytdl(url, { filter: 'audioonly' });
      resource = createAudioResource(stream);
    } else {
      // Handle other URLs (like Discord attachments)
      resource = createAudioResource(url, {
        inputType: StreamType.OggOpus,
      });
    }
    let resource;
    if (ytdl.validateURL(url)) {
      // Handle YouTube URLs
      const stream = ytdl(url, { filter: 'audioonly' });
      resource = createAudioResource(stream);
    } else {
      // Handle other URLs (like Discord attachments)
      resource = createAudioResource(url, {
        inputType: StreamType.OggOpus,
      });
    }

    const player = createAudioPlayer();
    player.play(resource);
    connection.subscribe(player);

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

export async function getAudioDuration(url) {
  try {
    const info = await getInfo(url);
    const durationSeconds = parseInt(info.videoDetails.lengthSeconds);
    return durationSeconds * 1000; // Convert to ms
  } catch (error) {
    console.error(`Error getting audio duration for ${url}:`, error);
    return null;
  }
}

export async function getAudioDuration(url) {
  try {
    const info = await getInfo(url);
    const durationSeconds = parseInt(info.videoDetails.lengthSeconds);
    return durationSeconds * 1000; // Convert to ms
  } catch (error) {
    console.error(`Error getting audio duration for ${url}:`, error);
    return null;
  }
}

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

export function normalizeBrink(brink, name, isThreat = false) {
  if (brink === undefined) {
    brink = assignRandomBrink(isThreat);
    brink = assignRandomBrink(isThreat);
  }
  if (isThreat) {
    if (!name) {
      return `Someone has seen *them* ${brink.replace(/['"]+/g, '').replace(/\.+$/, '')}.`;
    } else {
      return `${name} has seen *them* ${brink.replace(/['"]+/g, '').replace(/\.+$/, '')}.`;
    }
  } else {
    if (!name) {
      return `Someone saw you ${brink.replace(/['"]+/g, '').replace(/\.+$/, '')}.`;
    } else {
      return `${name} saw you ${brink.replace(/['"]+/g, '').replace(/\.+$/, '')}.`;
    }
  }
}

export async function handleGearCommand(user, game, playerId, args) {
  const command = args[0];
  const item = args.slice(1).join(' ');

  try {
    switch (command) {
      case 'add':
        await addGear(user, game, playerId, item);
        break;
      case 'remove':
        await removeGear(user, game, playerId, item);
        break;
      case 'edit':
        await editGear(user, game, playerId, item);
        break;
      default:
        await askForGear(user, game, playerId, args);
        break;
    }
  } catch (error) {
    console.error(`Error handling gear command for ${user.tag}:`, error);
    await user.send('An error occurred while processing your gear command.');
  }
}

async function askForGear(user, game, playerId, args, retryCount = 0) {
  let gearList = [];
  if (args[0] === 'gear') {
    gearList = args.slice(1).join(' ').split(',').map(item => sanitizeString(item.trim()));
  } else {
    await user.send('Invalid command. Please use `.gear item1, item2, ...`');
    return;
  }

  if (gearList.length === 0) {
    await user.send('Please provide at least one item.');
    return;
  }

  await user.send(`Your inventory:\n${gearList.map((item, index) => `${index + 1}. ${item}`).join('\n')}`);

  const confirmation = await confirmInput(user, 'Is this inventory correct?', 60000);

  if (confirmation) {
    game.players[playerId].gear = gearList;
    saveGameData();
    await user.send('Your inventory has been saved.');
    const allPlayersHaveGear = Object.values(game.players).every(player => player.gear);
    if (allPlayersHaveGear) {
      const gameChannel = client.channels.cache.get(game.textChannelId);
      game.characterGenStep++;
      sendCharacterGenStep(gameChannel, game);
    }
  } else {
    if (retryCount < 3) {
      await user.send('Please try again.');
      await askForGear(user, game, playerId, args, retryCount + 1);
    } else {
      await user.send('Too many retries. Please contact the developer.');
    }
  }
}

async function addGear(user, game, playerId, item) {
  if (!item) {
    await user.send('Please provide an item to add.');
    return;
  }
  if (!game.players[playerId].gear) {
    game.players[playerId].gear = [];
  }
  game.players[playerId].gear.push(sanitizeString(item));
  saveGameData();
  await user.send(`Added "${item}" to your inventory.`);
}

async function removeGear(user, game, playerId, item) {
  if (!item) {
    await user.send('Please provide an item to remove from your inventory.');
    return;
  }
  if (!game.players[playerId].gear) {
    await user.send(`You have no "${item}" to remove from your inventory.`);
    return;
  }
  const index = game.players[playerId].gear.indexOf(item);
  if (index > -1) {
    game.players[playerId].gear.splice(index, 1);
    saveGameData();
    await user.send(`Removed "${item}" from your inventory.`);
  } else {
    await user.send(`"${item}" is not in your inventory.`);
  }
}

async function editGear(user, game, playerId, item, retryCount = 0) {
  if (!item) {
    await user.send('Please provide an item to edit.');
    return;
  }
  if (!game.players[playerId].gear) {
    await user.send('You have no gear to edit.');
    return;
  }
  const index = game.players[playerId].gear.indexOf(item);
  if (index > -1) {
    const newItem = await getDMResponse(user, `What would you like to change "${item}" to?`, 60000, m => m.author.id === playerId);
    if (newItem) {
      const confirmation = await confirmInput(user, `Change "${item}" to "${newItem}"?`, 60000);
      if (confirmation) {
        game.players[playerId].gear[index] = sanitizeString(newItem);
        saveGameData();
        await user.send(`Changed "${item}" to "${newItem}" in your inventory.`);
      } else {
        if (retryCount < 3) {
          await user.send('Please try again.');
          await editGear(user, game, playerId, item, retryCount + 1);
        } else {
          await user.send('Too many retries. Please contact the developer.');
        }
      }
    } else {
      await user.send(`No new item provided.`);
    }
  } else {
    await user.send(`"${item}" is not in your inventory.`);
  }
}

export async function handleTraitStacking(user, game, playerId) {
  const player = game.players[playerId];
  const dmChannel = await user.createDM();
  let stackOrder = [];
  let lotteryPlayers = [];

  const initialChoiceEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Arrange Your Trait Stack')
    .setDescription('Which Trait would you like on top of your stack?');

  const initialChoiceRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('virtue')
        .setLabel('Virtue')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('vice')
        .setLabel('Vice')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('moment')
        .setLabel('Moment')
        .setStyle(ButtonStyle.Primary)
    );

  const initialChoiceMessage = await user.send({ embeds: [initialChoiceEmbed], components: [initialChoiceRow] });

  const filter = (interaction) =>
    interaction.user.id === user.id && interaction.message.id === initialChoiceMessage.id;

  const collector = dmChannel.createMessageComponentCollector({ filter, time: 60000, max: 1 });

  collector.on('collect', async (interaction) => {
    if (collector.ended) return;
    await interaction.deferUpdate();
    if (interaction.customId === 'moment') {
      await user.send('Please wait for up to a minute for the lottery to complete.');
      lotteryPlayers.push(playerId);
      player.momentOnTop = false;
    } else {
      stackOrder.push(interaction.customId.charAt(0).toUpperCase() + interaction.customId.slice(1));
      player.momentOnTop = false;
    }
    collector.stop();
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time') {
      await user.send('You did not make a selection in time. Please try again.');
      await handleTraitStacking(user, game, playerId);
      return;
    }

    if (lotteryPlayers.length > 0) {
      await runMomentLottery(user, game, lotteryPlayers);
      if (player.momentOnTop) {
        stackOrder = ['Moment'];
      }
    }

    const remainingTraits = ['Virtue', 'Vice', 'Moment'].filter(trait => !stackOrder.includes(trait));
    while (remainingTraits.length > 0) {
      const nextChoiceEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Arrange Your Trait Stack')
        .setDescription('Which trait would you like next on your stack?');

      const nextChoiceRow = new ActionRowBuilder();
      for (const trait of remainingTraits) {
        nextChoiceRow.addComponents(
          new ButtonBuilder()
            .setCustomId(trait.toLowerCase())
            .setLabel(trait)
            .setStyle(ButtonStyle.Primary)
        );
      }

      const nextChoiceMessage = await user.send({ embeds: [nextChoiceEmbed], components: [nextChoiceRow] });

      const nextChoiceCollector = dmChannel.createMessageComponentCollector({ filter, time: 60000, max: 1 });

      await new Promise((resolve) => {
        nextChoiceCollector.on('collect', async (interaction) => {
          await interaction.deferUpdate();
          stackOrder.push(interaction.customId.charAt(0).toUpperCase() + interaction.customId.slice(1));
          remainingTraits.splice(remainingTraits.indexOf(interaction.customId.charAt(0).toUpperCase() + interaction.customId.slice(1)), 1);
          nextChoiceCollector.stop();
          resolve();
        });
        nextChoiceCollector.on('collect', async (interaction) => {
          if (nextChoiceCollector.ended) return;
          await interaction.deferUpdate();
          stackOrder.push(interaction.customId.charAt(0).toUpperCase() + interaction.customId.slice(1));
          remainingTraits.splice(remainingTraits.indexOf(interaction.customId.charAt(0).toUpperCase() + interaction.customId.slice(1)), 1);
          nextChoiceCollector.stop();
          resolve();
        });
      });
    }

    stackOrder.push('Brink');
    player.stackOrder = stackOrder;
    player.stackConfirmed = true;
    await user.send(`Your final stack order is: ${player.stackOrder.join(', ')}`);
    saveGameData();
    const allPlayersHaveConfirmed = Object.values(game.players).every(player => player.stackConfirmed);
    if (allPlayersHaveConfirmed) {
      const gameChannel = client.channels.cache.get(game.textChannelId);
      game.characterGenStep++;
      sendCharacterGenStep(gameChannel, game);
    }
  });
}

async function runMomentLottery(user, game, lotteryPlayers) {
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds
  const winnerId = lotteryPlayers[Math.floor(Math.random() * lotteryPlayers.length)];
  const winner = await client.users.fetch(winnerId);
  const loser = user;
  const player = game.players[winnerId];
  if (winnerId === user.id) {
    await winner.send('Congratulations! You won the Moment lottery. Your Moment will be on top of your stack.');
    player.momentOnTop = true;
  } else {
    await loser.send('You did not win the Moment lottery. Please continue to build your stack.');
    player.momentOnTop = false;
  }
}
