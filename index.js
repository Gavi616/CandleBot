import 'dotenv/config';
import {
  Client,
  EmbedBuilder,
  ChannelType,
  GatewayIntentBits,
  VoiceChannel,
} from 'discord.js';
import {
  joinVoiceChannel,
  getVoiceConnection
} from '@discordjs/voice';
import ytdl from 'ytdl-core';
import fs from 'fs';
import { getHelpEmbed } from './embed.js';
import {
  sanitizeString,
  loadGameData,
  saveGameData,
  printActiveGames,
  sendCandleStatus,
  slowType,
  playAudioFromUrl
} from './utils.js';
import { sendCharacterGenStep, handleCharacterGenStep1DM, handleCharacterGenStep4DM, handleCharacterGenStep5DM, handleCharacterGenStep6DM, handleCharacterGenStep8DM } from './chargen.js';
import { startGame } from './commands/startgame.js';
import { conflict } from './commands/conflict.js';
import { nextStep } from './commands/nextstep.js';
import { gameStatus } from './commands/gamestatus.js';
import { removePlayer } from './commands/removeplayer.js';
import { leaveGame } from './commands/leavegame.js';
import { cancelGame } from './commands/cancelgame.js';
import { died } from './commands/died.js';
import { playRecordings } from './commands/playrecordings.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.GuildPresences
  ],
});

const prefix = '.';
const version = '0.9.666';
const isTesting = true;

export let gameData = {};
export let blocklist = {};

client.once('ready', () => {
  const startupTimestamp = new Date().toLocaleString();
  console.log(`Ten Candles Bot (v${version}) is ready @ ${startupTimestamp}`);
  try {
    loadGameData();
  } catch (loadError) {
    console.error('Error during loadGameData in ready event:', loadError);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // Find the gameData that this button press is associated with.
  let channelId = null;
  let game = null;
  for (let key in gameData) {
    const gameEntry = gameData[key];
    if (gameEntry.gmId === interaction.user.id) {
      channelId = key;
      game = gameEntry;
      break;
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const userId = message.author.id;
  const userName = message.author.username; // Get username

  if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      // Check if the command requires a game in progress
      const gameRequiredCommands = ['conflict', 'playrecordings', 'nextstep', 'gamestatus', 'removeplayer', 'leavegame', 'cancelgame', 'died', 'me', 'x'];

      if (gameRequiredCommands.includes(command)) {
        // Check if a game exists in the channel
        if (!gameData[channelId]) {
          message.author.send(`Message removed. There is no **Ten Candles** game in progress in #${message.channel.name}.`);
          try {
            await message.delete(); // Delete the command message
          } catch (deleteError) {
            console.error(`Failed to delete message in #${message.channel.name}:`, deleteError);
          }
          console.log(`${userName} (${userId}) tried to use .${command} in ${message.channel.name}, but there is no game in progress.`);
          return; // Stop processing the command
        }

        // Check if the user is a participant (player or GM)
        const game = gameData[channelId];
        if (!game.players[userId] && game.gmId !== userId) {
          message.author.send(`Message removed. You are not a participant in the **Ten Candles** game in #${message.channel.name}.`);
          try {
            await message.delete(); // Delete the command message
          } catch (deleteError) {
            console.error(`Failed to delete message in #${message.channel.name}:`, deleteError);
          }
          console.log(`${userName} (${userId}) tried to use .${command} in #${message.channel.name}, but is not a participant.`);
          return; // Stop processing the command
        }
      }
      // Command handling logic
      if (command === 'help') {
        const isAdmin = message.member.permissions.has('Administrator');
        const helpEmbed = getHelpEmbed(isAdmin);
        message.channel.send({ embeds: [helpEmbed.help] });
      } else if (command === 'startgame') {
        await startGame(message, gameData);
      } else if (command === 'conflict') {
        await conflict(message, args, gameData);
      } else if (command === 'playrecordings') {
        await playRecordings(message);
      } else if (command === 'nextstep') {
        nextStep(message);
      } else if (command === 'gamestatus') {
        gameStatus(message);
      } else if (command === 'removeplayer') {
        removePlayer(message, args);
      } else if (command === 'leavegame') {
        leaveGame(message, args);
      } else if (command === 'cancelgame') {
        await cancelGame(message);
      } else if (command === 'died') {
        await died(message, args);
      } else if (command === 'block') {
        blockUser(message, args);
      } else if (command === 'unblock') {
        unblockUser(message, args);
      }
    }
  }
    if (message.channel.type === ChannelType.DM) {
      const game = Object.values(gameData).find(game => {
        if (game.gmId === userId) return true;
        if (game.players && game.players[userId]) return true;
        return false;
      });

      // .x and .me command listener (for Direct Messaging)
      if (message.content.toLowerCase() === '.x') {
        const gameChannelId = Object.keys(gameData).find(key => gameData[key] === game);
        if (gameChannelId) {
          const gameChannel = client.channels.cache.get(gameChannelId);
          if (gameChannel) {
            gameChannel.send(`One or more players and/or the GM are ready to move on, please wrap up the scene quickly.`);
          }
        }
      } else if (message.content.toLowerCase() === '.me') {
        me(message);
      }

      //Check if there is a game and if that game is waiting for character generation info.
      if (game && game.characterGenStep === 1) {
        await handleCharacterGenStep1DM(message, game);
      } else if (game && game.characterGenStep === 4) {
        await handleCharacterGenStep4DM(message, game);
      } else if (game && game.characterGenStep === 5) {
        await handleCharacterGenStep5DM(message, game);
      } else if (game && game.characterGenStep === 6) {
        await handleCharacterGenStep6DM(message, game);
      } else if (game && game.characterGenStep === 8) {
        await handleCharacterGenStep8DM(message, game);
      }
    }
});

async function me(message) {
  const playerId = message.author.id;
  const playerNumericId = parseInt(playerId);
  let channelId = message.channel.id; // Initialize channelId

  if (message.channel.type !== 1) { // Check if it's a DM
    try {
      await message.author.send('This command can only be used in a direct message.');
    } catch (error) {
      console.error('Could not send DM to user:', error);
    }
    return;
  }

  let game;
  for (const channel in gameData) {
    if (gameData[channel].players && gameData[channel].players[playerNumericId]) {
      game = gameData[channel];
      channelId = channel;
      break;
    }
  }

  if (!game) {
    message.reply('You are not currently in a game.');
    return;
  }

  const player = game.players[playerNumericId];

  const characterEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Character Sheet: ${player.name || message.author.username}`)
    .addFields(
      { name: 'Virtue', value: player.virtue || 'Not set', inline: true },
      { name: 'Vice', value: player.vice || 'Not set', inline: true },
      { name: 'Moment', value: player.moment || 'Not set' },
      { name: 'Brink', value: player.brink || 'Not set' },
      { name: 'Hope Dice', value: player.hopeDice.toString() || '0' },
      { name: 'Recordings', value: player.recordings || 'Not set' },
      { name: 'Is Dead', value: player.isDead ? 'Yes' : 'No' },
      { name: 'Virtue Burned', value: player.virtueBurned ? 'Yes' : 'No', inline: true },
      { name: 'Vice Burned', value: player.viceBurned ? 'Yes' : 'No', inline: true },
      { name: 'Moment Burned', value: player.momentBurned ? 'Yes' : 'No' },
    )
    .setTimestamp();

  try {
    await message.author.send({ embeds: [characterEmbed] }); // Send DM
    if (message.channel.type !== 1) {
      await message.delete(); // Delete original message
    }

  } catch (error) {
    console.error('Could not send character sheet DM:', error);
    if (message.channel.type !== 1) {
      await message.reply('Could not send character sheet DM. Please enable DMs.'); // Inform in channel if DM fails.
    }
  }
}

export async function startTruthsSystem(message, channelId) {
  const game = gameData[channelId];
  const playerOrder = game.playerOrder;
  const gmId = game.gmId;
  const litCandles = 11 - game.scene;

  let truthSpeakerIndex = 0;
  if (game.diceLost > 0) {
    truthSpeakerIndex = playerOrder.indexOf(message.author.id);
  } else {
    truthSpeakerIndex = playerOrder.indexOf(gmId);
  }

  let truthOrderMessage = "";
  for (let i = 0; i < litCandles; i++) {
    const speakerId = playerOrder[truthSpeakerIndex];
    const player = game.players[speakerId];
    if (player) { //check if the player still exists.
      truthOrderMessage += `Truth ${i + 1}>: <@${speakerId}>${player.isDead ? " (Ghost)" : ""}\n`;
    }
    truthSpeakerIndex = (truthSpeakerIndex + 1) % playerOrder.length;
  }

  // Final Truth (Collective)
  const livingPlayers = playerOrder.filter(playerId => game.players[playerId] && !game.players[playerId].isDead);
  let finalTruthMessage = "";
  if (livingPlayers.length > 0) {
    finalTruthMessage = "All together: **And we are alive.**";
  }

  let fullMessage = `GM only: **These things are true. The world is dark.**\n\n`;

  if (truthOrderMessage) {
    fullMessage += `Establishing Truths order: ${truthOrderMessage}\n\n`;
  }

  fullMessage += `${finalTruthMessage}`;

  message.channel.send(fullMessage);

  // Reset dice lost.
  game.diceLost = 0;
  saveGameData();
}

async function validateGameSetup(message, args) {
  if (isTesting) {
    const gmId = args[0].replace(/<@!?(\d+)>/, '$1');
    const playerIds = args.slice(1).map(id => id.replace(/<@!?(\d+)>/, '$1'));

    // Basic checks (only if args were passed, to ensure gmID and playerIDs are available)
    if (args.length >= 1) {
      const gm = message.guild.members.cache.get(gmId);
      if (!gm) {
        return { valid: false, reason: 'Testing Mode: Invalid GM ID. Please mention a valid user in this server. No game was started.' };
      }
    }

    if (args.length >= 2) {
      if (playerIds.length < 1 || playerIds.length > 10) {
        return { valid: false, reason: 'Testing Mode: A **Ten Candles** game requires at least 1 player (max 10 players). No game was started.' };
      }
    }

    return { valid: true, gmId, playerIds };
  }

  const channelId = message.channel.id;
  const userId = message.author.id;

  if (blocklist[userId]) {
    return { valid: false, reason: `You are blocked from using the \`.startgame\` command. Reason: ${blocklist[userId]}` };
  }

  // Check if the user is a player or the GM of another game.
  let userIsParticipant = false;
  for (const gameChannelId in gameData) {
    const game = gameData[gameChannelId];
    if (game.gmId === userId || game.players[userId]) {
      userIsParticipant = true;
      break;
    }
  }

  //Allow users to use startgame if they are a participant in any game.
  if (!userIsParticipant && !message.member.permissions.has('Administrator')) {
    return { valid: false, reason: 'You must be a current player or GM or Admin to start a game.' };
  }

  if (gameData[channelId]) {
    return { valid: false, reason: 'A **Ten Candles** game is already in progress here.' };
  }

  if (args.length < 3) {
    return { valid: false, reason: 'A **Ten Candles** game requires a GM and at least 2 players. Usage: `.startgame <GM ID> <Player IDs (space-separated)>`' };
  }

  const gmId = args[0].replace(/<@!?(\d+)>/, '$1');
  const playerIds = args.slice(1).map(id => id.replace(/<@!?(\d+)>/, '$1'));

  if (playerIds.length < 2 || playerIds.length > 10) {
    return { valid: false, reason: 'A **Ten Candles** game requires a GM and at least 2 players (to a maximum of 10 players). No game was started.' };
  }

  const gm = message.guild.members.cache.get(gmId);
  if (!gm) {
    return { valid: false, reason: 'Invalid GM ID. Please mention a valid user in this server. No game was started.' };
  }

  if (new Set(playerIds).size !== playerIds.length) {
    return { valid: false, reason: 'Duplicate players found. Each player must be a unique user. No game was started.' };
  }

  if (playerIds.includes(gmId)) {
    return { valid: false, reason: 'The GM cannot also be a player. No game was started.' };
  }

  for (const playerId of playerIds) {
    const player = message.guild.members.cache.get(playerId);
    if (!player) {
      return { valid: false, reason: `Invalid Player ID: <@${playerId}>. Please mention a valid user in this server. No game was started.` };
    }
  }

  if (gm.presence?.status === 'offline') {
    return { valid: false, reason: 'The GM must be online to start a game. No game was started.' };
  }

  // Check if all players are in the server and online
  const playerFetchPromises = playerIds.map(async playerId => {
    try {
      const member = await message.guild.members.fetch(playerId);
      return { playerId, isOnline: member.presence?.status !== 'offline', isPresent: true };
    } catch (error) {
      // Handle the case where the member is not found in the guild
      console.error(`Failed to fetch member ${playerId}:`, error);
      return { playerId, isOnline: false, isPresent: false };
    }
  });

  const playerStatuses = await Promise.all(playerFetchPromises);
  const problemPlayers = playerStatuses.filter(status => !status.isPresent || !status.isOnline);

  if (problemPlayers.length > 0) {
    const problemPlayerMentions = problemPlayers.map(status => `<@${status.playerId}>`).join(', ');
    return { valid: false, reason: `Unable to start game due to issues with the following player(s): ${problemPlayerMentions}. Please ensure they are valid users in this server and are online.` };
  }

  return { valid: true, gmId, playerIds };
}

// Blocklist management

function loadBlocklist() {
  try {
    const data = fs.readFileSync('blocklist.json', 'utf8');
    blocklist = JSON.parse(data);
    console.log('Blocklist loaded successfully.');
  } catch (err) {
    console.error('Error loading blocklist:', err);
    blocklist = {}; // Initialize as an empty object
    console.log('Blocklist initialized.');
  }
}

function saveBlocklist() {
  try {
    fs.writeFileSync('blocklist.json', JSON.stringify(blocklist));
    console.log('Blocklist saved successfully.');
  } catch (err) {
    console.error('Error saving blocklist:', err);
  }
}

// Load blocklist on startup
loadBlocklist();

function blockUser(userId, message, reason = 'No reason provided.') {
  if (!blocklist[userId]) {
    blocklist[userId] = sanitizeString(reason); // Store the reason along with the user ID
    saveBlocklist();
    if (message) {
      message.channel.send(`<@${userId}> has been added to the blocklist. Reason: ${reason}`);
    }
  } else {
    if (message) {
      message.channel.send(`<@${userId}> is already on the blocklist. Reason: ${blocklist[userId]}`);
    }
  }
}

function unblockUser(userId, message) {
  if (blocklist[userId]) {
    delete blocklist[userId]; // Remove the user from the object
    saveBlocklist();
    if (message)
      message.channel.send(`<@${userId}> has been removed from the blocklist.`);
  } else {
    if (message)
      message.channel.send(`<@${userId}> is not on the blocklist.`);
  }
}

client.login(process.env.DISCORD_TOKEN);
