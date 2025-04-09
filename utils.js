import textToSpeech from '@google-cloud/text-to-speech';
import { Readable } from 'stream';
import ffmpeg from 'ffmpeg-static';
import fs from 'fs';
import ytdl from 'ytdl-core';
import {
  joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection,
  StreamType
} from '@discordjs/voice';
import { defaultVirtues, defaultVices, defaultMoments, languageOptions } from './config.js';
import { client } from './index.js';
import { gameDataSchema, validateGameData } from './validation.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import { TEST_USER_ID, defaultPlayerGMBrinks, defaultThreatBrinks, reminders, randomNames, randomLooks, randomConcepts } from './config.js';
import { sendCharacterGenStep } from './chargen.js';
import { isTesting } from './index.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

export const gameData = {};
export const userBlocklist = {};
export const channelWhitelist = {};

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
  const previewVoiceButton = new ButtonBuilder()
    .setCustomId('preview_voice')
    .setLabel('Preview Voice')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  const useVoiceButton = new ButtonBuilder()
    .setCustomId('use_voice')
    .setLabel('Use this Voice')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const buttonRow = new ActionRowBuilder().addComponents(previewVoiceButton, useVoiceButton);
  const voiceEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Choose Your Character\'s Voice')
    .setDescription(`Please choose a language and voice for your character. Once you have made your selections, you can preview the voice or click "Use this Voice".`);
  const voiceMessage = await user.send({ embeds: [voiceEmbed], components: [languageRow, voiceRow, buttonRow] });

  const filter = (interaction) => interaction.user.id === user.id && interaction.message.id === voiceMessage.id;
  const collector = dmChannel.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time });
  const buttonCollector = dmChannel.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time });
  let selectedLanguage = null;
  let selectedVoice = null;
  return new Promise((resolve) => {
    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate();
      if (interaction.customId === 'language_select') {
        selectedLanguage = interaction.values[0];
        selectedVoice = null;
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
        previewVoiceButton.setDisabled(true);
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
        previewVoiceButton.setDisabled(false);
        useVoiceButton.setDisabled(false);
        await voiceMessage.edit({ components: [languageRow, voiceRow, buttonRow] });
      }
    });
    buttonCollector.on('collect', async (interaction) => {
      await interaction.deferUpdate();
      if (interaction.customId === 'use_voice') {
        if (!selectedLanguage || !selectedVoice) {
          await interaction.followUp('Please select a language and voice first.');
          return;
        }
        game.players[playerId].language = selectedLanguage;
        game.players[playerId].voice = selectedVoice;
        await interaction.editReply({ content: `You have chosen the voice: ${languageOptions[selectedLanguage].voices[selectedVoice].name} in ${languageOptions[selectedLanguage].name}`, embeds: [], components: [] });
        collector.stop();
        buttonCollector.stop();
        resolve();
      } else if (interaction.customId === 'preview_voice') {
        if (!selectedLanguage || !selectedVoice) {
          await interaction.followUp('Please select a language and voice first.');
          return;
        }
        const existingConnection = getVoiceConnection(interaction.guild.id);
        if (!existingConnection) {
          const voiceChannelId = game.voiceChannelId;
          const voiceChannel = client.channels.cache.get(voiceChannelId);
          if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
            joinVoiceChannel({
              channelId: voiceChannelId,
              guildId: interaction.guild.id,
              adapterCreator: interaction.guild.voiceAdapterCreator,
            });
          } else {
            await interaction.followUp('Voice channel not found.');
            return;
          }
        }
        const languageVerbiage = {
          'en-US': `This is a voice preview for <@${user.id}> in ${languageOptions['en-US'].name} using Google Cloud Text-To-Speech.`,
          'en-GB': `This is a voice preview for <@${user.id}> in ${languageOptions['en-GB'].name} using Google Cloud Text-To-Speech.`,
          'es-ES': `Esta es una vista previa de voz para <@${user.id}> en ${languageOptions['es-ES'].name} usando Google Cloud Text-To-Speech.`,
          'fr-FR': `Ceci est un aperçu vocal pour <@${user.id}> en ${languageOptions['fr-FR'].name} utilisant Google Cloud Text-To-Speech.`,
          'de-DE': `Dies ist eine Sprachvorschau für <@${user.id}> in ${languageOptions['de-DE'].name} mit Google Cloud Text-To-Speech.`,
        };
        const verbiage = languageVerbiage[selectedLanguage];
        await interaction.followUp(`Previewing TTS voice ${selectedVoice} in <#${game.voiceChannelId}>.`);
        const voiceChannel = client.channels.cache.get(game.voiceChannelId);
        await speakInChannel(verbiage, voiceChannel, selectedVoice);
      }
    });
    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await voiceMessage.edit({ content: 'You did not choose a voice in time. Please try again.', embeds: [], components: [] });
        resolve();
      } else {
        await voiceMessage.edit({ components: [] });
      }
    });
    buttonCollector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await voiceMessage.edit({ content: 'Response timed out, no TTS Voice was selected.', embeds: [], components: [] });
        resolve();
      } else {
        await voiceMessage.edit({ components: [] });
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

export async function respondViaDM(message, dmText) {
  try {
    await message.author.send(dmText);
    return true;
  } catch (error) {
    return false;
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
          .setStyle(ButtonStyle.Success), // Set button style to Success (green)
        new ButtonBuilder()
          .setCustomId(noId)
          .setLabel('No')
          .setStyle(ButtonStyle.Danger) // Set button style to Danger (red)
      );

    const consentMessage = await dmChannel.send({ embeds: [consentEmbed], components: [row] });
    console.log(`requestConsent: Sent consent message with ID ${consentMessage.id} to user ${user.id}`);

    const filter = (interaction) => interaction.user.id === user.id && interaction.message.id === consentMessage.id;
    const collector = dmChannel.createMessageComponentCollector({ filter, time });

    return new Promise((resolve, reject) => { // Use Promise with reject
      collector.on('collect', async (interaction) => {
        console.log(`requestConsent: Button collected: ${interaction.customId} from ${interaction.user.tag}`);
        try {
          await interaction.deferUpdate();
          // Disable all buttons
          const updatedRow = new ActionRowBuilder().addComponents(
            row.components.map((button) => ButtonBuilder.from(button).setDisabled(true))
          );
          await interaction.editReply({ components: [updatedRow] });
          if (interaction.customId === yesId) {
            resolve(true);
          } else if (interaction.customId === noId) {
            resolve(false);
          }
        } catch (error) {
          console.error(`requestConsent: Error deferring update or handling interaction:`, error);
          reject(error); // Reject the promise if there's an error
        }
        collector.stop();
      });

      collector.on('end', async (collected, reason) => {
        console.log(`requestConsent: Collector ended for ${user.tag}. Reason: ${reason}`);
        if (reason === 'time') {
          await user.send('Consent Request timed out.');
        } else if (reason !== 'user') {
          console.error(`requestConsent: Collector ended unexpectedly, reason: ${reason}`);
          reject(new Error(`Collector ended unexpectedly: ${reason}`)); // Reject if unexpected end
        }
        resolve(false);
      });
    });
  } catch (error) {
    console.error(`requestConsent: Error requesting consent from ${user.tag}:`, error);
    return Promise.reject(error); // Return a rejected promise
  }
}

export function getGameData(identifier) {
  console.log(`getGameData: Called with identifier: ${identifier}`); // Added logging
  let game = gameData[identifier];

  // If not found by channelId, try finding it by playerId
  if (!game) {
    game = Object.values(gameData).find(game => game.players && (game.players[identifier] || game.gmId === identifier));
    if (game) {
      console.log(`getGameData: Found game for playerId ${identifier}`);
    } else {
      console.warn(`getGameData: Game data not found for identifier: ${identifier}`);
    }
  } else {
    console.log(`getGameData: Found game for channelId ${identifier}`);
  }
  return game;
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
  let input;
  while (true) {
    const response = await getDMResponse(user, question, time, m => m.author.id === playerId);
    if (response) {
      input = response.trim();
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
  let input;
  while (true) {
    const response = await getDMResponse(user, 'Please send me your Moment.\nA Moment is an event that would bring you hope andbe reasonable to achieve, kept succinct and clear to provide strong direction.\nAll Moments should have the potential for failure.', time, m => m.author.id === playerId);
    if (response) {
      if (response.trim() === "?") {
        game.players[playerId].moment = getRandomMoment();
        saveGameData();
        return;
      }
      input = response.trim();

      if (!input) {
        await user.send('Invalid Moment. Please provide a non-empty value.');
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
    } else {
      return getRandomMoment();
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
          input = getRandomBrink(true);
        } else {
          input = getRandomBrink(false);
        }

        const characterName = game.players[playerId]?.name || user.username;
        input = normalizeBrink(input, characterName, isThreat);
        if (playerId === game.gmId) {
          game.gm.brink = input;
        } else {
          game.players[playerId].brink = input;
        }
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
      const characterName = game.players[playerId]?.name || user.username;
      if (isThreat) {
        input = normalizeBrink(input, characterName, true);
      } else {
        input = normalizeBrink(input, characterName);
      }
      const confirmation = await confirmInput(user, `Are you happy with your Brink?\n${input}`, time, "Confirm Your Brink");
      if (confirmation) {
        if (playerId === game.gmId) {
          game.gm.brink = input;
        } else {
          game.players[playerId].brink = input;
        }
        saveGameData();
        return input;
      } else {
        continue;
      }
    } else {
      await user.send(`Response timed out. Please provide your Brink again.`);
      continue;
    }
  }
}

export function getRandomName() {
  return randomNames[Math.floor(Math.random() * randomNames.length)];
}

export function getRandomLook() {
  return randomLooks[Math.floor(Math.random() * randomLooks.length)];
}

export function getRandomConcept() {
  return randomConcepts[Math.floor(Math.random() * randomConcepts.length)];
}

export function getRandomBrink(isThreat = false) {
  const brinks = isThreat ? defaultThreatBrinks : defaultPlayerGMBrinks;
  return brinks[Math.floor(Math.random() * brinks.length)];
}

export function getRandomMoment() {
  return defaultMoments[Math.floor(Math.random() * defaultMoments.length)];
}

export function getRandomVirtue() {
  return defaultVirtues[Math.floor(Math.random() * defaultVirtues.length)];
}

export function getRandomVice() {
  return defaultVices[Math.floor(Math.random() * defaultVices.length)];
}

export function sanitizeString(str) {
  if (typeof str !== 'string') {
    return '';
  }

  // Remove control characters, extended Unicode characters, and potentially harmful symbols
  str = str.replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Control characters
  str = str.replace(/[\u2000-\u206F]/g, ''); // Unicode punctuation
  str = str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''); // Remove surrogate pairs
  str = str.replace(/[\u2600-\u26FF]/g, ''); // Misc symbols
  str = str.replace(/[<>{}[\]]/g, ''); // Remove brackets and angle brackets
  str = str.replace(/["'`]/g, ''); // Remove quotes and backticks
  str = str.replace(/\\/g, ''); // Remove backslashes

  return str.trim(); // Trim whitespace
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
      const game = gameData[channelId];
      // Remove reminderTimers before saving
      if (game.reminderTimers) {
        delete game.reminderTimers;
      }
      if (validateGameData(game, gameDataSchema)) {
        gameDataToSave[channelId] = game;
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

export async function sendCandleStatus(channel, litCandles) {
  if (litCandles === 10) {
    channel.send('***Ten Candles are lit.*** ' + ':candle:'.repeat(litCandles));
  } else if (litCandles >= 1 && litCandles <= 9) {
    const words = numberToWords(litCandles);
    if (litCandles === 1) {
      channel.send(`***There is ${words} lit candle.*** ` + ':candle:'.repeat(litCandles));
    } else {
      channel.send(`***There are ${words} lit candles.*** ` + ':candle:'.repeat(litCandles));
    }
  } else {
    channel.send('***All candles have been extinguished.*** ' + ':wavy_dash:');
  }
}

export async function sendConsentConfirmation(user, userType, channelId) {
  try {
    const dmChannel = await user.createDM();
    let message;

    if (userType === 'gm') {
      message = `Thank you for consenting to GM **Ten Candles** in <#${channelId}>.`;
    } else if (userType === 'player') {
      message = `Thank you for consenting to play **Ten Candles** in <#${channelId}>.`;
    } else {
      console.error(`sendConsentConfirmation: Invalid consent type: ${userType}`);
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

    if (!connection) {
      console.error(`Not connected to a voice channel.`);
      return;
    }

    let resource;
    if (ytdl.validateURL(url)) {
      const stream = ytdl(url, { filter: 'audioonly' });
      resource = createAudioResource(stream);
    } else {
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
    return durationSeconds * 1000;
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
    brink = getRandomBrink(isThreat);
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
  try {
    if (!game.players[playerId].gear) {
      game.players[playerId].gear = [];
    }

    // Show the instructions if this is Step 7
    if (game.characterGenStep === 7) {
      await user.send(
        'Use the buttons in the embed below to manage your character\'s gear.  You can add, edit, or delete items. Click "Done with Step 7" when you are finished.'
      );
    }

    await displayInventory(user, game, playerId);
  } catch (error) {
    console.error(`Error handling gear command for ${user.tag}:`, error);
    await user.send('An error occurred while processing your gear command.');
  }
}

export async function displayInventory(user, game, playerId, isRejected = false) {
  const player = game.players[playerId];
  const characterName = player.name || user.username;
  let inventoryTitle;

  // Check if the user viewing the inventory is the same as the player whose inventory it is
  if (user.id === playerId) {
    inventoryTitle = `${characterName.endsWith('s') ? characterName + '\'' : characterName + '\'s'} Inventory`;
  } else {
    inventoryTitle = `(<@${playerId}>) ${characterName.endsWith('s') ? characterName + '\'' : characterName + '\'s'} Inventory`;
  }

  const gear = player.gear || [];

  let inventoryText = '';
  let components = []; // Initialize components array

  if (gear.length > 0) {
    const selectMenuOptions = gear.map((item, index) => {
      const truncatedItem = item.length > 100 ? item.substring(0, 97) + '...' : item; // Truncate item
      return {
        label: truncatedItem.substring(0, 25), // Truncate label to 25 characters
        value: `${index}`,
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`gearselect_${playerId}`)
      .setPlaceholder('Select an item to edit or delete')
      .addOptions(selectMenuOptions);

    const selectActionRow = new ActionRowBuilder().addComponents(selectMenu);
    components.push(selectActionRow); // Add actionRow to components
    inventoryText = gear.join(', ')
  } else {
    inventoryText = 'Your inventory is empty.';
  }

  // Create a single ActionRow for both buttons
  const buttonRow = new ActionRowBuilder();

  // Create and add the Add Gear button
  const addGearButton = new ButtonBuilder()
    .setCustomId(`addgear_${game.textChannelId}`)
    .setStyle(ButtonStyle.Primary)
    .setEmoji('➕');
  buttonRow.addComponents(addGearButton);

  // Create and add the Done button
  const doneButtonLabel = game.characterGenStep === 7 ? 'Send to GM' : 'Save';
  const doneButton = new ButtonBuilder()
    .setCustomId(`donestep7_${playerId}_${game.textChannelId}`)
    .setLabel(doneButtonLabel)
    .setStyle(ButtonStyle.Success);
  buttonRow.addComponents(doneButton);

  // Add the combined button row to the components array
  components.push(buttonRow);

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(inventoryTitle)
    .setDescription(inventoryText || 'Your inventory is empty.');

  let messageContent;
  if (isRejected) {
    messageContent = 'Your GM has rejected your inventory submission, please ask them for guidance and edit your inventory before clicking "Send to GM" again.';
  } else {
    messageContent = 'Use the buttons in the embed below to manage your character\'s gear.  You can add, edit, or delete items. Click "Send to GM" when you are finished.';
  }

  try {
    await user.send({
      content: messageContent,
      embeds: [embed],
      components: components,
    });
  } catch (error) {
    console.error('Error sending inventory message:', error);
  }
}

export async function handleDoneButton(interaction, game) {
  const customIdParts = interaction.customId.split('_');
  const playerId = customIdParts[1];
  const textChannelId = customIdParts[2]; // Get channelId from button

  // Double check game context, though index.js should have verified
  if (!game || game.textChannelId !== textChannelId) {
    console.error(`handleDoneButton: Game context mismatch for interaction ${interaction.id}`);
    // Avoid replying here if interaction might be invalid, let index.js handle deletion attempt
    return;
  }

  const player = game.players[playerId];
  if (!player) {
      console.error(`handleDoneButton: Player ${playerId} not found in game ${textChannelId}`);
      // Avoid replying here
      return;
  }

  const gearList = player.gear && player.gear.length > 0 ? player.gear.join(', ') : 'No gear added.';
  const characterName = player.name || player.playerUsername; // Use username as fallback

  try {
    if (game.characterGenStep === 7) {
      // Reply to the player
      await interaction.reply({ content: 'Your inventory has been recorded and sent to your GM for approval. Please wait for confirmation or rejection.' });

      // Send approval request to GM
      const gm = await client.users.fetch(game.gmId);
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        // Mention player in title for clarity in GM's DMs
        .setTitle(`Inventory Approval: ${characterName} (<@${playerId}>)`)
        .setDescription(gearList)
        .setFooter({ text: `Game Channel: #${client.channels.cache.get(textChannelId)?.name ?? textChannelId}` }); // Add context

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_${playerId}_${textChannelId}`) // Ensure channelId is included
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`tryagain_${playerId}_${textChannelId}`) // Ensure channelId is included
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger) // Changed to Danger for Reject
      );

      await gm.send({ embeds: [embed], components: [row] });

    } else {
      // Handle "Save" button outside of Step 7 (if applicable)
      await interaction.reply({ content: 'Your inventory changes have been recorded. Use `.gear` or the inventory display buttons to edit again.' });

      // Notify GM of the change (optional, but can be helpful)
      const gm = await client.users.fetch(game.gmId);
      const notificationMessage = `Player ${characterName} (<@${playerId}>) updated their inventory outside of Step 7.\n**Current Inventory:** ${gearList}`;
      await gm.send(notificationMessage).catch(console.error); // Send notification, catch errors
    }

    // Save game data after processing
    saveGameData();

  } catch (error) {
      console.error(`Error in handleDoneButton for interaction ${interaction.id}:`, error);
      // Attempt to inform the user if the initial reply failed
      if (!interaction.replied && !interaction.deferred) {
          try {
              await interaction.reply({ content: 'An error occurred while processing your request.' });
          } catch (replyError) {
              console.error(`Failed to send error reply for interaction ${interaction.id}:`, replyError);
          }
      } else if (interaction.replied || interaction.deferred) {
           try {
              await interaction.followUp({ content: 'An error occurred after the initial response.' });
           } catch (followUpError) {
               console.error(`Failed to send error follow-up for interaction ${interaction.id}:`, followUpError);
           }
      }
  }
}

export async function handleGMEditButton(interaction) {
  const textChannelId = interaction.component.data.textChannelId;
  const game = getGameData(textChannelId); // Use getGameData here
  if (!game) {
    await interaction.reply('An error occurred. The game data is missing.');
    return;
  }
  console.log('handleGMEditButton: game:', game);

  const modal = new ModalBuilder()
    .setCustomId(`gm_edit_${playerId}`)
    .setTitle('Edit Player Gear');

  const gearInput = new TextInputBuilder()
    .setCustomId('gear_list')
    .setLabel('Gear List (comma-separated)')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(gearList);

  const firstActionRow = new ActionRowBuilder().addComponents(gearInput);
  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

export async function handleGMEditModalSubmit(interaction) {
  const textChannelId = interaction.component.data.textChannelId;
  const game = getGameData(textChannelId); // Use getGameData here
  if (!game) {
    await interaction.reply('An error occurred. The game data is missing.');
    return;
  }
  console.log('handleGMEditModalSubmit: game:', game);
  const gearList = interaction.fields.getTextInputValue('gear_list');
  const gearArray = gearList.split(',').map(item => item.trim());

  game.players[playerId].gear = gearArray;
  saveGameData();
  await interaction.reply('Gear list updated!');

  const player = await client.users.fetch(playerId);
  await displayInventory(player, game, playerId);
}

export async function handleGearModal(interaction) {
  const customId = interaction.customId;
  const playerId = interaction.user.id;
  const game = findGameByUserId(playerId);

  if (!game) {
    await interaction.reply('You are not currently in a game.');
    return;
  }

  if (customId.startsWith('edit_')) {
    await handleEditGearModal(interaction, game, playerId);
  } else if (customId.startsWith('delete_')) {
    await handleDeleteGearModal(interaction, game, playerId);
  } else if (customId === 'addgear') {
    await handleAddGearModal(interaction, game, playerId);
  }
}

export async function handleEditGearModal(interaction, game, playerId, itemId) {
  const gear = game.players[playerId].gear;
  const index = parseInt(itemId);
  const item = gear[index] || '';

  const modal = new ModalBuilder()
    .setCustomId(`editgear_${itemId}`)
    .setTitle('Edit Gear Item');

  const nameInput = new TextInputBuilder()
    .setCustomId('gearname')
    .setLabel('Item Name')
    .setStyle(TextInputStyle.Short)
    .setValue(item);

  const firstActionRow = new ActionRowBuilder().addComponents(nameInput);

  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

export async function handleEditGearModalSubmit(interaction, game, playerId, itemId) {
  if (!game) {
    await interaction.reply({ content: 'An error occurred. The game data is missing.' });
    return;
  }
  const gear = game.players[playerId].gear;
  const index = parseInt(itemId);
  const name = interaction.fields.getTextInputValue('gearname');

  gear[index] = name;
  saveGameData();
  await interaction.reply({ content: 'Gear item updated!' });

  const player = await client.users.fetch(playerId);
  await displayInventory(player, game, playerId);
}

export async function handleDeleteGearModal(interaction, game, playerId, itemId) {
  const gear = game.players[playerId].gear;
  const index = parseInt(itemId);
  const item = gear[index];

  const modal = new ModalBuilder()
    .setCustomId(`deletegearconfirm_${itemId}`)
    .setTitle(`Delete Gear: ${item}`);

  const confirmationInput = new TextInputBuilder()
    .setCustomId('deleteconfirmation')
    .setLabel('Type "d" to confirm')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(1)
    .setRequired(true);

  const firstActionRow = new ActionRowBuilder().addComponents(confirmationInput);

  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

export async function handleDeleteGearModalSubmit(interaction, game, playerId, itemId) {
  if (interaction.customId.startsWith('deletegearconfirm')) {
    const gear = game.players[playerId].gear;
    const index = parseInt(itemId);
    const confirmation = interaction.fields.getTextInputValue('deleteconfirmation');

    if (confirmation.toLowerCase() === 'd') {
      gear.splice(index, 1);
      saveGameData();
      await interaction.reply({ content: 'Gear item deleted!' });

      const player = await client.users.fetch(playerId);
      await displayInventory(player, game, playerId);
    } else {
      await interaction.reply({ content: 'Gear item not deleted.' });
    }
  }
}

export async function handleAddGearModal(interaction) {
  console.log('handleAddGearModal: interaction object:', interaction);
  console.log('handleAddGearModal: interaction.customId:', interaction.customId);

  const customIdParts = interaction.customId.split('_');
  const textChannelId = customIdParts[customIdParts.length - 1];

  console.log('handleAddGearModal: textChannelId:', textChannelId);

  if (!textChannelId) {
    await interaction.reply({ content: 'An error occurred. Channel ID is missing.' });
    return;
  }

  const game = getGameData(textChannelId);
  console.log('handleAddGearModal: game:', game);
  if (!game) {
    await interaction.reply({ content: 'An error occurred. The game data is missing.' });
    return;
  }

  const playerId = interaction.user.id;
  console.log('handleAddGearModal: playerId:', playerId);

  // Check if the player exists in the game
  if (!game.players || !game.players[playerId]) {
    console.error('handleAddGearModal: Player not found in game data!');
    await interaction.reply({ content: 'You are not currently in this game.' });
    return;
  }

  // Initialize the player's gear array if it doesn't exist
  game.players[playerId].gear = game.players[playerId].gear || [];

  const modal = new ModalBuilder()
    .setCustomId('addgearmodal')
    .setTitle('Add Gear Item');

  const nameInput = new TextInputBuilder()
    .setCustomId('gearname')
    .setLabel('Item Name')
    .setStyle(TextInputStyle.Short);

  const firstActionRow = new ActionRowBuilder().addComponents(nameInput);

  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

export async function handleAddGearModalSubmit(interaction, game) {
  if (!game) {
    await interaction.reply({ content: 'An error occurred. The game data is missing.' });
    return;
  }
  const playerId = interaction.user.id;
  const gearInput = interaction.fields.getTextInputValue('gearname');
  const gearItems = gearInput.split(',').map(item => sanitizeString(item.trim()));

  // Robust error handling: Check if game and player exist
  if (!game || !game.players || !game.players[playerId]) {
    await interaction.reply('An error occurred. The game or player data is missing.');
    return;
  }

  // Ensure gear array exists before pushing
  game.players[playerId].gear = game.players[playerId].gear || [];
  game.players[playerId].gear.push(...gearItems); // Push multiple items
  saveGameData();
  await interaction.reply({ content: 'Gear item(s) added!' });

  const user = await client.users.fetch(playerId); // Fetch the user object
  await displayInventory(user, game, playerId); // Update inventory
}

export async function runMomentLottery(game, lotteryPlayers) {
  console.log(`runMomentLottery: Lottery started with players: ${lotteryPlayers.join(', ')}`);
  if (lotteryPlayers.length === 0) {
    console.log(`runMomentLottery: No players chose 'Moment'. Skipping lottery.`);
    return null; // Return null if no players chose 'Moment'
  }
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.floor(Math.random() * 5000))); // Simulate lottery time
  const winnerId = lotteryPlayers[Math.floor(Math.random() * lotteryPlayers.length)];
  console.log(`runMomentLottery: Winner is ${winnerId}`);

  // Send DMs to all players in the lottery - only send once
  const loserMessage = 'You did not win the Moment lottery. Please continue to build your stack.';
  const winnerMessage = 'Congratulations! You won the Moment lottery. Your Moment will be on top of your stack.';

  const sentMessages = new Set(); // Keep track of sent messages

  for (const playerId of lotteryPlayers) {
    if (!sentMessages.has(playerId)) { // Send message only once per player
      const message = playerId === winnerId ? winnerMessage : loserMessage;
      try {
        const playerUser = await client.users.fetch(playerId);
        if (playerUser) { // Check if playerUser is defined
          await playerUser.send(message);
          sentMessages.add(playerId); // Mark message as sent
        } else {
          console.error(`runMomentLottery: Error fetching user ${playerId}`);
        }
      } catch (error) {
        console.error(`runMomentLottery: Error sending DM to ${playerId}:`, error);
      }
    }
  }
  console.log(`runMomentLottery: Lottery complete.`);
  return winnerId;
}

export async function handleTraitStacking(game) {
  const gameChannel = client.channels.cache.get(game.textChannelId);
  const gm = await gameChannel.guild.members.fetch(game.gmId);
  const gmUser = gm.user;

  console.log(
    `handleTraitStacking: Starting trait stacking process for game in channel ${game.textChannelId}`
  );

  // 1. Initial Setup:
  const playerStates = {};
  for (const playerId of game.playerOrder) {
    playerStates[playerId] = {
      availableTraits: ['Virtue', 'Vice', 'Moment'],
      stackOrder: [],
    };
  }

  // Helper function to send choices to players
  async function sendChoice(user, choices, title, description, playerState) {
    const choiceEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(title)
      .setDescription(description);

    const choiceRow = new ActionRowBuilder().addComponents(
      choices.map((choice) =>
        new ButtonBuilder()
          .setCustomId(choice.toLowerCase())
          .setLabel(choice)
          .setStyle(ButtonStyle.Primary)
      )
    );

    const choiceMessage = await user.send({
      embeds: [choiceEmbed],
      components: [choiceRow],
    });

    return new Promise((resolve) => {
      const collector = choiceMessage.createMessageComponentCollector({
        filter: (i) =>
          i.user.id === user.id && i.message.id === choiceMessage.id,
        time: 60000,
        max: 1,
      });

      collector.on('collect', async (interaction) => {
        await interaction.deferUpdate(); // Added this line
        const chosenTrait = interaction.customId.charAt(0).toUpperCase() + interaction.customId.slice(1);
        await user.send(`You have chosen ${chosenTrait}.`); // Send a new message
        playerState.availableTraits = playerState.availableTraits.filter(trait => trait !== chosenTrait);
        // Update button styles
        const updatedRow = new ActionRowBuilder().addComponents(
          choiceRow.components.map((button) => {
            if (button.data.custom_id === interaction.customId) {
              return ButtonBuilder.from(button).setStyle(ButtonStyle.Success).setDisabled(true);
            } else {
              return ButtonBuilder.from(button).setStyle(ButtonStyle.Danger).setDisabled(true);
            }
          })
        );
        await interaction.editReply({ components: [updatedRow] });
        collector.stop();
        resolve(chosenTrait);
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          console.error(
            `sendChoice: Player ${user.id} timed out during choice`
          );
          resolve(null); // Resolve to null on timeout
        }
      });
    });
  }

  // 2. First Choice (Initial Trait Selection):
  const initialChoicePromises = game.playerOrder.map(async (playerId) => {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    return sendChoice(user, ['Virtue', 'Vice', 'Moment'], 'Arrange Your Trait Stack', 'Which Trait would you like on top of your stack?', playerStates[playerId]);
  });

  const initialChoices = await Promise.all(initialChoicePromises);

  // Store the initial choices
  game.playerOrder.forEach((playerId, index) => {
    game.players[playerId].initialChoice = initialChoices[index];
  });

  // 3. Moment Lottery:
  const lotteryPlayers = game.playerOrder.filter(
    (playerId) => game.players[playerId].initialChoice === 'Moment'
  );
  const winnerId = await runMomentLottery(game, lotteryPlayers);

  // 4. Loser's Choice:
  const loserPromises = game.playerOrder.map(async (playerId) => {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    if (playerId !== winnerId && game.players[playerId].initialChoice === 'Moment') {
      const loserChoice = await getLoserInitialChoice(user, playerStates[playerId]);
      playerStates[playerId].stackOrder.unshift(loserChoice);
    }
  });
  await Promise.all(loserPromises);

  // Handle Winner and Non-Moment Choices
  game.playerOrder.forEach((playerId) => {
    if (playerId === winnerId) {
      playerStates[playerId].stackOrder.unshift('Moment');
    } else if (game.players[playerId].initialChoice !== 'Moment') {
      playerStates[playerId].stackOrder.unshift(game.players[playerId].initialChoice);
    }
  });

  // Re-add "Moment" to availableTraits for losers before the second choice
  game.playerOrder.forEach((playerId) => {
    if (playerId !== winnerId && game.players[playerId].initialChoice === 'Moment') {
      if (!playerStates[playerId].availableTraits.includes('Moment')) {
        playerStates[playerId].availableTraits.push('Moment');
      }
    }
  });

  // 5. Subsequent Choices:
  const secondChoicePromises = game.playerOrder.map(async (playerId) => {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    const availableForSecond = playerStates[playerId].availableTraits;
    const secondChoice = await sendChoice(user, availableForSecond, 'Choose Your Second Trait', 'Which Trait would you like next in your stack?', playerStates[playerId]);
    if (secondChoice) {
      playerStates[playerId].stackOrder.unshift(secondChoice);
    }
  });
  await Promise.all(secondChoicePromises);

  // Third Choice (only one option left)
  game.playerOrder.forEach((playerId) => {
    playerStates[playerId].stackOrder.unshift(playerStates[playerId].availableTraits[0]);
  });

  // 6. Finalization:
  game.playerOrder.forEach((playerId) => {
    playerStates[playerId].stackOrder.unshift('Brink');
    game.players[playerId].stackOrder = playerStates[playerId].stackOrder.reverse();
  });

  const finalConfirmationPromises = game.playerOrder.map(async (playerId) => {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    await sendFinalConfirmation(user, game, playerId);
  });
  await Promise.all(finalConfirmationPromises);

  console.log(
    `handleTraitStacking: Trait stacking process completed for game in channel ${game.textChannelId}`
  );
}

async function sendFinalConfirmation(user, game, playerId) {
  // Ensure stackOrder is defined before sending the DM
  if (!game.players[playerId].stackOrder || game.players[playerId].stackOrder.length !== 4) {
    console.error(`sendFinalConfirmation: Player ${playerId} has an invalid stack order.`);
    game.players[playerId].stackOrder = ['Virtue', 'Vice', 'Moment', 'Brink'];
    await user.send('An error occurred. Your stack has been set to the default: **Virtue, Vice, Moment, Brink**.');
    return;
  }

  console.log(`sendFinalConfirmation: Player ${playerId} stack BEFORE confirmation:`, game.players[playerId].stackOrder); // Log before confirmation

  await user.send(`Your final stack order is: **${game.players[playerId].stackOrder.join(', ')}**`);

  const confirmation = await requestConsent(user, 'Are you happy with your Trait stack?\n(if "No", your Trait order will be set to: **Virtue, Vice, Moment, Brink**)', 'traitStackFinal_yes', 'traitStackFinal_no', 60000, 'Final Trait Stack Confirmation');

  if (confirmation) {
    console.log(`sendFinalConfirmation: Player ${playerId} confirmed stack:`, game.players[playerId].stackOrder); // Log after confirmation
  } else {
    game.players[playerId].stackOrder = ['Virtue', 'Vice', 'Moment', 'Brink'];
    await user.send('Your stack has been set to: **Virtue, Vice, Moment, Brink**.');
  }
}

async function getLoserInitialChoice(user, playerState) {
  console.log(`getLoserInitialChoice: Starting for player ${user.id}`); // Entry log

  const initialChoiceEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Moment Lottery Result')
    .setDescription('You did not win the Moment lottery. Choose between Virtue or Vice for the top of your stack.');

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
    );

  // Remove Moment from available traits for Losers
  playerState.availableTraits = playerState.availableTraits.filter(trait => trait !== 'Moment');

  const initialMessage = await user.send({ embeds: [initialChoiceEmbed], components: [initialChoiceRow] });

  return new Promise((resolve) => {
    const collector = initialMessage.createMessageComponentCollector({
      filter: (i) => i.user.id === user.id && i.message.id === initialMessage.id,
      time: 60000,
      max: 1,
    });

    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate(); // Added this line
      console.log(`getLoserInitialChoice: Player ${user.id} pressed button: ${interaction.customId}`);
      const chosenTrait = interaction.customId.charAt(0).toUpperCase() + interaction.customId.slice(1);
      await user.send(`You have chosen ${chosenTrait} as the top of your stack.`); // Send a new message
      playerState.availableTraits = playerState.availableTraits.filter(trait => trait !== chosenTrait); // Update availableTraits here
      // Update button styles
      const updatedRow = new ActionRowBuilder().addComponents(
        initialChoiceRow.components.map((button) => {
          if (button.data.custom_id === interaction.customId) {
            return ButtonBuilder.from(button).setStyle(ButtonStyle.Success).setDisabled(true);
          } else {
            return ButtonBuilder.from(button).setStyle(ButtonStyle.Danger).setDisabled(true);
          }
        })
      );
      await interaction.editReply({ components: [updatedRow] });
      collector.stop();
      resolve(chosenTrait);
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        console.error(`getLoserInitialChoice: Player ${user.id} timed out during initial choice`);
        resolve('Virtue'); // Default to Virtue if timeout
      }
    });
  });
}

function disableAllButtons(components) {
  return components.map(row => {
    if (row.components) {
      return new ActionRowBuilder().addComponents(
        row.components.map(component => {
          if (component.data.type === ComponentType.Button) {
            return ButtonBuilder.from(component).setDisabled(true);
          } else {
            return component;
          }
        })
      );
    } else {
      return row;
    }
  });
}

export function loadBlockUserList() {
  try {
    const data = fs.readFileSync('userBlocklist.json', 'utf8');
    const loadedBlocklist = JSON.parse(data);

    Object.keys(userBlocklist).forEach(key => delete userBlocklist[key]);

    Object.assign(userBlocklist, loadedBlocklist);
    console.log('User Blocklist loaded successfully.');
  } catch (err) {
    console.error(`Error loading user blocklist: ${err.message}`);
    Object.keys(userBlocklist).forEach(key => delete userBlocklist[key]);
    console.log('User Blocklist initialized.');
  }
}

export function saveBlockUserList() {
  try {
    fs.writeFileSync('userBlocklist.json', JSON.stringify(userBlocklist));
  } catch (err) {
    console.error(`Error saving user blocklist: ${err.message}`);
  }
}

export function isBlockedUser(userId) {
  return !!userBlocklist[userId];
}

export function loadChannelWhitelist() {
  try {
    const data = fs.readFileSync('channelWhitelist.json', 'utf8');
    const loadedChannelWhitelist = JSON.parse(data);

    Object.keys(channelWhitelist).forEach(key => delete channelWhitelist[key]);

    Object.assign(channelWhitelist, loadedChannelWhitelist);
    console.log('Channel Whitelist loaded successfully.');
  } catch (err) {
    console.error(`Error loading channel whitelist: ${err.message}`);
    Object.keys(channelWhitelist).forEach(key => delete channelWhitelist[key]);
    console.log('Channel Whitelist initialized.');
  }
}

export function saveChannelWhitelist() {
  try {
    fs.writeFileSync('channelWhitelist.json', JSON.stringify(channelWhitelist));
    console.log('Channel Whitelist saved successfully.');
  } catch (err) {
    console.error(`Error saving channel whitelist: ${err.message}`);
  }
}

export function isWhitelisted(channelId) {
  return !!channelWhitelist[channelId];
}

export function startReminderTimers(gameChannel, game) {
  game.reminderTimers = [];
  game.reminderTimers.push(setTimeout(() => sendReminder(gameChannel, game, 0), reminders[0]));
  game.reminderTimers.push(setTimeout(() => sendReminder(gameChannel, game, 1), reminders[1]));
  game.reminderTimers.push(setTimeout(() => sendReminder(gameChannel, game, 2), reminders[2]));
}

export function clearReminderTimers(game) {
  if (game.reminderTimers) {
    game.reminderTimers.forEach(timer => clearTimeout(timer));
    game.reminderTimers = [];
  }
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60 / 5) * 5; // round to nearest 5 seconds
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function sendReminder(gameChannel, game, reminderIndex, step) {
  const gm = await gameChannel.guild.members.fetch(game.gmId);
  const user = gm.user;
  const reminderTimes = reminders.map(time => formatDuration(time));
  const reminderMessage = `**${reminderTimes[reminderIndex]} Reminder**: Character Creation **Step ${step}** is taking longer than expected. Please check with your players to ensure they are responding to their DMs.`;
  await user.send(reminderMessage);
  if (reminderIndex === 2) {
    clearReminderTimers(game);
  }
}

export async function findGameByUserId(userId) {
  return Object.values(gameData).find(game => game.players[userId] || game.gmId === userId);
}
